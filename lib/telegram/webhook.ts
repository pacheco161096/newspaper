import { createTelegramReport, findReporterByTelegramUserId } from '../pipeline/reports';
import type { CreateTelegramReportInput, CreateTelegramReportResult, TelegramReporter } from '../pipeline/reports';
import { isAuthorizedTelegramWebhook } from './auth';
import { sendMessage as deliverTelegramMessage } from './client';
import { parseTelegramUpdate } from './updates';

const MAX_BODY_BYTES = 256 * 1024;

export const TELEGRAM_COPY = {
  received: '✅ Recibí tu información.',
  duplicate: '✅ Esta información ya había sido recibida.',
  unauthorized: 'Este bot no está habilitado para esta cuenta.',
} as const;

export type TelegramWebhookDeps = {
  findReporterByTelegramUserId: (telegramUserId: string) => Promise<TelegramReporter | null>;
  createTelegramReport: (input: CreateTelegramReportInput) => Promise<CreateTelegramReportResult>;
  sendMessage: (input: { chatId: string; text: string }) => Promise<void>;
};

const defaultDeps: TelegramWebhookDeps = {
  findReporterByTelegramUserId,
  createTelegramReport,
  sendMessage: ({ chatId, text }) => deliverTelegramMessage({ chatId, text }),
};

function logTelegram(level: 'error' | 'warn', fields: Record<string, string | number | null>) {
  const line = JSON.stringify({ source: 'telegram_webhook', ...fields });
  if (level === 'error') console.error(line);
  else console.warn(line);
}

function safeErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) {
    return error.code;
  }
  if (error instanceof Error && /^TELEGRAM_[A-Z0-9_:]+$/.test(error.message)) return error.message;
  return 'unknown';
}

async function readLimitedBody(request: Request) {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isInteger(size) || size < 0 || size > MAX_BODY_BYTES) return 'too_large' as const;
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return 'too_large' as const;
    }
    chunks.push(value);
  }
  const body = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
  return body.charCodeAt(0) === 0xfeff ? body.slice(1) : body;
}

async function confirm(deps: TelegramWebhookDeps, chatId: string, text: string, fields: Record<string, string | number | null>) {
  try {
    await deps.sendMessage({ chatId, text });
  } catch (error) {
    logTelegram('error', { ...fields, result: 'confirmation_failed', error: safeErrorCode(error) });
  }
}

export async function handleTelegramWebhook(request: Request, deps: TelegramWebhookDeps = defaultDeps) {
  if (!isAuthorizedTelegramWebhook(request)) return Response.json({ ok: false }, { status: 401 });

  const body = await readLimitedBody(request);
  if (body === 'too_large') return Response.json({ ok: false }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const parsed = parseTelegramUpdate(json);
  if (parsed.kind === 'invalid') return Response.json({ ok: false }, { status: 400 });
  if (parsed.kind === 'ignore') {
    logTelegram('warn', { update_id: parsed.updateId, chat_id: null, reporter_id: null, result: 'ignored', reason: parsed.reason });
    return Response.json({ ok: true, result: 'ignored', reason: parsed.reason });
  }

  const { update } = parsed;
  const logBase = { update_id: update.updateId, chat_id: update.chatId, reporter_id: null as string | null };

  let reporter: TelegramReporter | null;
  try {
    reporter = await deps.findReporterByTelegramUserId(update.fromId);
  } catch (error) {
    logTelegram('error', { ...logBase, result: 'db_error', error: safeErrorCode(error) });
    return Response.json({ ok: false }, { status: 500 });
  }

  if (!reporter || reporter.status !== 'active') {
    logTelegram('warn', {
      ...logBase,
      reporter_id: reporter?.id ?? null,
      telegram_user_id: update.fromId,
      result: reporter ? 'suspended' : 'unknown',
    });
    await confirm(deps, update.chatId, TELEGRAM_COPY.unauthorized, logBase);
    return Response.json({ ok: true, result: 'unauthorized' });
  }

  let saved: CreateTelegramReportResult;
  try {
    saved = await deps.createTelegramReport({
      reporterId: reporter.id,
      chatId: update.chatId,
      messageId: update.messageId,
      rawText: update.text,
    });
  } catch (error) {
    logTelegram('error', { ...logBase, reporter_id: reporter.id, result: 'db_error', error: safeErrorCode(error) });
    return Response.json({ ok: false }, { status: 500 });
  }

  const created = saved.outcome === 'created';
  logTelegram('warn', { ...logBase, reporter_id: reporter.id, result: saved.outcome });
  await confirm(deps, update.chatId, created ? TELEGRAM_COPY.received : TELEGRAM_COPY.duplicate, { ...logBase, reporter_id: reporter.id });
  return Response.json({ ok: true, result: saved.outcome });
}
