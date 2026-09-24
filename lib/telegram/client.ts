const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';
const TOKEN_PATTERN = /^\d{6,}:[A-Za-z0-9_-]{20,}$/;

export type SendMessageInput = {
  chatId: string | number;
  text: string;
  /** Campos extra de sendMessage. chat_id y text siempre prevalecen. */
  options?: Record<string, unknown>;
};

function readBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');
  if (!TOKEN_PATTERN.test(token)) throw new Error('TELEGRAM_BOT_TOKEN_INVALID');
  return token;
}

function normalizeChatId(chatId: string | number) {
  if (typeof chatId === 'number') {
    if (!Number.isSafeInteger(chatId)) throw new Error('TELEGRAM_CHAT_ID_INVALID');
    return String(chatId);
  }
  if (!/^-?\d{1,20}$/.test(chatId)) throw new Error('TELEGRAM_CHAT_ID_INVALID');
  return chatId;
}

function telegramApiUrl(method: string) {
  return `${TELEGRAM_API_ORIGIN}/bot${readBotToken()}/${method}`;
}

export async function setWebhook(input: {
  url: string;
  secretToken: string;
  allowedUpdates?: string[];
  dropPendingUpdates?: boolean;
}) {
  const response = await fetch(telegramApiUrl('setWebhook'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: input.allowedUpdates ?? ['message'],
      drop_pending_updates: input.dropPendingUpdates ?? false,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json() as { ok?: boolean; description?: string };
  if (!response.ok || payload.ok !== true) {
    throw new Error(`TELEGRAM_SET_WEBHOOK_FAILED:${payload.description ?? response.status}`);
  }
}

export async function getWebhookInfo() {
  const response = await fetch(telegramApiUrl('getWebhookInfo'), {
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
  if (!response.ok || payload.ok !== true) {
    throw new Error(`TELEGRAM_GET_WEBHOOK_FAILED:${payload.description ?? response.status}`);
  }
  return payload.result ?? {};
}

export async function sendMessage({ chatId, text, options }: SendMessageInput) {
  if (typeof text !== 'string' || !text || text.length > 4096) throw new Error('TELEGRAM_SEND_FAILED');
  const token = readBotToken();
  const url = `${TELEGRAM_API_ORIGIN}/bot${token}/sendMessage`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...options, chat_id: normalizeChatId(chatId), text }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error('TELEGRAM_SEND_FAILED');
  }

  let errorCode = response.status;
  let ok = false;
  try {
    const payload = await response.json() as { ok?: boolean; error_code?: number };
    ok = payload.ok === true;
    if (typeof payload.error_code === 'number') errorCode = payload.error_code;
  } catch {
    ok = false;
  }
  if (!response.ok || !ok) throw new Error(`TELEGRAM_SEND_FAILED:${errorCode}`);
}
