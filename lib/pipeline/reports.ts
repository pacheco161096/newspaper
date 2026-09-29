import { getPostgresPool } from '../server/postgres';
import { receiveTelegramMessage } from './submissions';

export { telegramExternalMessageId } from './submissions';

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

export type CreateTelegramPhotoReportInput = {
  reporterId: string;
  chatId: string;
  messageId: number;
  rawText: string;
  fileId: string;
  mediaGroupId: string | null;
};

export type CreateTelegramReportResult =
  | { outcome: 'created'; id: string }
  | { outcome: 'duplicate' };

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
  const result = await receiveTelegramMessage({ ...input, fileId: null, mediaGroupId: null });
  if (result.outcome === 'duplicate') return { outcome: 'duplicate' };
  return { outcome: 'created', id: result.reportId };
}

export async function createTelegramPhotoReport(input: CreateTelegramPhotoReportInput): Promise<CreateTelegramReportResult> {
  const result = await receiveTelegramMessage({
    reporterId: input.reporterId,
    chatId: input.chatId,
    messageId: input.messageId,
    rawText: input.rawText,
    fileId: input.fileId,
    mediaGroupId: input.mediaGroupId,
  });
  if (result.outcome === 'duplicate') return { outcome: 'duplicate' };
  return { outcome: 'created', id: result.reportId };
}
