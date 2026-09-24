import { getPostgresPool } from '../server/postgres';

export type TelegramReporter = {
  id: string;
  status: string;
};

export type CreateTelegramReportInput = {
  reporterId: string;
  chatId: string;
  messageId: number;
  rawText: string;
};

export type CreateTelegramReportResult =
  | { outcome: 'created'; id: string }
  | { outcome: 'duplicate' };

export function telegramExternalMessageId(chatId: string, messageId: number) {
  return `${chatId}:${messageId}`;
}

export async function findReporterByTelegramUserId(telegramUserId: string) {
  const result = await getPostgresPool().query<TelegramReporter>(
    `select id, status
     from pipeline.reporters
     where telegram_user_id = $1
     limit 1`,
    [telegramUserId],
  );
  return result.rows[0] ?? null;
}

export async function createTelegramReport(input: CreateTelegramReportInput): Promise<CreateTelegramReportResult> {
  if (!/^\d{1,20}$/.test(input.chatId) || !Number.isSafeInteger(input.messageId) || input.messageId < 1) {
    throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  }
  if (!input.rawText || input.rawText.length > 4096 || input.rawText.includes('\u0000')) {
    throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  }
  const externalMessageId = telegramExternalMessageId(input.chatId, input.messageId);
  const result = await getPostgresPool().query<{ id: string }>(
    `insert into pipeline.reports (
       reporter_id, channel, external_message_id, raw_text, received_at, status
     ) values ($1, 'telegram', $2, $3, now(), 'received')
     on conflict (channel, external_message_id) do nothing
     returning id`,
    [input.reporterId, externalMessageId, input.rawText],
  );
  const id = result.rows[0]?.id;
  if (!id) return { outcome: 'duplicate' };
  return { outcome: 'created', id };
}
