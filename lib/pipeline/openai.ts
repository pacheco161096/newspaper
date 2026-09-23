import { getPostgresPool } from '../server/postgres';

export function pipelineModel(preferred?: string, fallback = 'gpt-4o-mini') {
  return preferred?.trim() || fallback;
}

function isReasoningModel(model: string) {
  return /^(gpt-5|gpt-6|o[1-9])/i.test(model);
}

type Rates = { input: number; output: number; cached?: number };

const RATES_PER_MILLION: Record<string, Rates> = {
  'gpt-5.6-luna': { input: 0.20, output: 1.20, cached: 0.02 },
  'gpt-5.6-terra': { input: 2, output: 12, cached: 0.20 },
  'gpt-5.6-sol': { input: 4, output: 20, cached: 0.40 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, cached: 0.075 },
  'gpt-4o': { input: 2.50, output: 10, cached: 1.25 },
};

function ratesFor(model: string): Rates {
  return RATES_PER_MILLION[model] ?? { input: 0.20, output: 1.20 };
}

export function estimateOpenAiCostUsd(model: string, promptTokens: number, completionTokens: number, cachedTokens = 0) {
  const rates = ratesFor(model);
  const billedPrompt = Math.max(0, promptTokens - cachedTokens);
  const cachedRate = rates.cached ?? rates.input * 0.1;
  return (billedPrompt / 1_000_000) * rates.input
    + (cachedTokens / 1_000_000) * cachedRate
    + (completionTokens / 1_000_000) * rates.output;
}

export type OpenAiPurpose = 'classify' | 'editorial';

async function recordUsage(purpose: OpenAiPurpose, model: string, promptTokens: number, completionTokens: number, reasoningTokens: number, cachedTokens: number) {
  const cost = estimateOpenAiCostUsd(model, promptTokens, completionTokens, cachedTokens);
  try {
    await getPostgresPool().query(
      `insert into pipeline.openai_usage (purpose, model, prompt_tokens, completion_tokens, reasoning_tokens, cached_tokens, cost_usd)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [purpose, model, promptTokens, completionTokens, reasoningTokens, cachedTokens, cost],
    );
  } catch {
    // El gasto se muestra en el CMS; un fallo de log no debe tumbar clasificar/redactar.
  }
}

export async function openaiJsonCompletion(options: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature?: number;
  reasoningEffort?: 'none' | 'low' | 'medium';
  purpose: OpenAiPurpose;
  system: string;
  user: string;
}) {
  const body: Record<string, unknown> = {
    model: options.model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: options.user },
    ],
  };
  if (isReasoningModel(options.model)) {
    body.reasoning_effort = options.reasoningEffort ?? 'low';
  } else if (options.temperature != null) {
    body.temperature = options.temperature;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(options.timeoutMs),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`OPENAI_HTTP_${response.status}:${detail}`);
  }
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  const promptTokens = payload.usage?.prompt_tokens ?? 0;
  const completionTokens = payload.usage?.completion_tokens ?? 0;
  const reasoningTokens = payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  const cachedTokens = payload.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  await recordUsage(options.purpose, options.model, promptTokens, completionTokens, reasoningTokens, cachedTokens);
  return payload.choices?.[0]?.message?.content ?? '{}';
}

export async function getOpenAiSpendSummary() {
  const result = await getPostgresPool().query<{
    today_usd: string; month_usd: string; total_usd: string;
    today_calls: string; month_calls: string; classify_usd: string; editorial_usd: string;
  }>(
    `select
       coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'), 0)::text as today_usd,
       coalesce(sum(cost_usd) filter (where created_at >= date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'), 0)::text as month_usd,
       coalesce(sum(cost_usd), 0)::text as total_usd,
       count(*) filter (where created_at >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')::text as today_calls,
       count(*) filter (where created_at >= date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')::text as month_calls,
       coalesce(sum(cost_usd) filter (where purpose = 'classify'), 0)::text as classify_usd,
       coalesce(sum(cost_usd) filter (where purpose = 'editorial'), 0)::text as editorial_usd
     from pipeline.openai_usage`,
  );
  const row = result.rows[0];
  return {
    todayUsd: Number(row?.today_usd ?? 0),
    monthUsd: Number(row?.month_usd ?? 0),
    totalUsd: Number(row?.total_usd ?? 0),
    todayCalls: Number(row?.today_calls ?? 0),
    monthCalls: Number(row?.month_calls ?? 0),
    classifyUsd: Number(row?.classify_usd ?? 0),
    editorialUsd: Number(row?.editorial_usd ?? 0),
  };
}
