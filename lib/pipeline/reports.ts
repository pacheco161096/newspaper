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
  assertTelegramIdentity(input.chatId, input.messageId);
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

function assertTelegramIdentity(chatId: string, messageId: number) {
  if (!/^\d{1,20}$/.test(chatId) || !Number.isSafeInteger(messageId) || messageId < 1) {
    throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  }
}

export async function createTelegramPhotoReport(input: CreateTelegramPhotoReportInput): Promise<CreateTelegramReportResult> {
  assertTelegramIdentity(input.chatId, input.messageId);
  if (input.rawText.length > 1024 || input.rawText.includes('\u0000')) throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  if (!/^[\x21-\x7E]{16,512}$/.test(input.fileId)) throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  if (input.mediaGroupId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(input.mediaGroupId)) {
    throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  }

  const externalMessageId = telegramExternalMessageId(input.chatId, input.messageId);
  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    const inserted = await client.query<{ id: string }>(
      `insert into pipeline.reports (
         reporter_id, channel, external_message_id, raw_text, received_at, status
       ) values ($1, 'telegram', $2, $3, now(), 'received')
       on conflict (channel, external_message_id) do nothing
       returning id`,
      [input.reporterId, externalMessageId, input.rawText],
    );
    let reportId = inserted.rows[0]?.id;
    const created = Boolean(reportId);
    if (!reportId) {
      const existing = await client.query<{ id: string }>(
        `select id from pipeline.reports where channel = 'telegram' and external_message_id = $1`,
        [externalMessageId],
      );
      reportId = existing.rows[0]?.id;
      if (!reportId) throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
    }
    await client.query(
      `insert into pipeline.report_assets (
         report_id, telegram_file_id, kind, sort_order, status, media_group_id
       ) values ($1, $2, 'photo', 0, 'pending', $3)
       on conflict (report_id, telegram_file_id) do nothing`,
      [reportId, input.fileId, input.mediaGroupId],
    );
    await client.query('commit');
    return created ? { outcome: 'created', id: reportId } : { outcome: 'duplicate' };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
