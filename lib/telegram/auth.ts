import { timingSafeEqual } from 'node:crypto';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export function isAuthorizedTelegramWebhook(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  const received = request.headers.get(SECRET_HEADER) ?? '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
