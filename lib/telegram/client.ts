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

const TELEGRAM_FILE_PATH = /^[A-Za-z0-9_./-]{1,256}$/;
const MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;

export function telegramPhotoMeta(filePath: string) {
  const clean = filePath.trim();
  if (!TELEGRAM_FILE_PATH.test(clean) || clean.includes('..')) throw new Error('TELEGRAM_FILE_PATH_INVALID');
  const extension = clean.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'jpg' || extension === 'jpeg') return { extension: 'jpg', contentType: 'image/jpeg' };
  if (extension === 'png') return { extension: 'png', contentType: 'image/png' };
  if (extension === 'webp') return { extension: 'webp', contentType: 'image/webp' };
  throw new Error('TELEGRAM_FILE_TYPE_UNSUPPORTED');
}

export async function downloadTelegramFile(fileId: string) {
  if (!/^[\x21-\x7E]{16,512}$/.test(fileId)) throw new Error('TELEGRAM_FILE_ID_INVALID');
  const token = readBotToken();
  let info: Response;
  try {
    info = await fetch(`${TELEGRAM_API_ORIGIN}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('TELEGRAM_GET_FILE_FAILED');
  }
  let payload: { ok?: boolean; result?: { file_path?: string; file_size?: number } };
  try {
    payload = await info.json() as { ok?: boolean; result?: { file_path?: string; file_size?: number } };
  } catch {
    throw new Error('TELEGRAM_GET_FILE_FAILED');
  }
  if (!info.ok || payload.ok !== true || !payload.result?.file_path) throw new Error('TELEGRAM_GET_FILE_FAILED');
  if ((payload.result.file_size ?? 0) > MAX_TELEGRAM_FILE_BYTES) throw new Error('TELEGRAM_FILE_TOO_LARGE');
  const meta = telegramPhotoMeta(payload.result.file_path);
  let file: Response;
  try {
    file = await fetch(`${TELEGRAM_API_ORIGIN}/file/bot${token}/${payload.result.file_path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('TELEGRAM_DOWNLOAD_FAILED');
  }
  if (!file.ok) throw new Error('TELEGRAM_DOWNLOAD_FAILED');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_TELEGRAM_FILE_BYTES) throw new Error('TELEGRAM_FILE_TOO_LARGE');
  return { bytes, ...meta };
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
