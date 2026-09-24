import { getWebhookInfo, setWebhook } from '../../../../lib/telegram/client';
import { handleTelegramWebhook } from '../../../../lib/telegram/webhook';

export const runtime = 'nodejs';
export const maxDuration = 15;

const EXPECTED_WEBHOOK_URL = 'https://hola-vallarta.vercel.app/api/telegram/webhook';

function webhookSnapshot(info: Awaited<ReturnType<typeof getWebhookInfo>>, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    secretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
    url: info.url ?? '',
    urlMatches: info.url === EXPECTED_WEBHOOK_URL,
    pendingUpdateCount: info.pending_update_count ?? 0,
    lastErrorMessage: info.last_error_message ?? null,
    lastErrorDate: info.last_error_date ?? null,
    allowedUpdates: info.allowed_updates ?? null,
    ...extra,
  };
}

export async function GET(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  if (!token) {
    return Response.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN_MISSING', secretConfigured: Boolean(secret) }, { status: 503 });
  }
  try {
    const register = new URL(request.url).searchParams.get('register') === '1';
    if (register) {
      if (!secret) return Response.json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET_MISSING' }, { status: 503 });
      await setWebhook({ url: EXPECTED_WEBHOOK_URL, secretToken: secret, dropPendingUpdates: false });
      const info = await getWebhookInfo();
      return Response.json(webhookSnapshot(info, { registered: true }));
    }
    const info = await getWebhookInfo();
    return Response.json(webhookSnapshot(info, { registered: false }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TELEGRAM_WEBHOOK_INFO_FAILED';
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  return handleTelegramWebhook(request);
}
