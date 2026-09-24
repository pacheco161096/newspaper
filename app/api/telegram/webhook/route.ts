import { handleTelegramWebhook } from '../../../../lib/telegram/webhook';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(request: Request) {
  return handleTelegramWebhook(request);
}
