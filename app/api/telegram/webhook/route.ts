import { handleTelegramWebhook } from '../../../../lib/telegram/webhook';

export const runtime = 'nodejs';
export const maxDuration = 15;

const EXPECTED_WEBHOOK_URL = 'https://hola-vallarta.vercel.app/api/telegram/webhook';

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const secretConfigured = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim());
  if (!token) {
    return Response.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN_MISSING', secretConfigured }, { status: 503 });
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json() as {
    ok?: boolean;
    description?: string;
    result?: {
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
      last_error_date?: number;
      allowed_updates?: string[];
    };
  };
  const info = payload.result ?? {};
  return Response.json({
    ok: payload.ok === true,
    telegramOk: response.ok,
    secretConfigured,
    url: info.url ?? '',
    urlMatches: info.url === EXPECTED_WEBHOOK_URL,
    pendingUpdateCount: info.pending_update_count ?? 0,
    lastErrorMessage: info.last_error_message ?? null,
    lastErrorDate: info.last_error_date ?? null,
    allowedUpdates: info.allowed_updates ?? null,
    telegramError: payload.ok === true ? null : (payload.description ?? `HTTP_${response.status}`),
  });
}

export async function POST(request: Request) {
  return handleTelegramWebhook(request);
}
