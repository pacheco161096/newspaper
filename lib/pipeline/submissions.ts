import type { PoolClient } from 'pg';
import { createCmsArticle, getDefaultCmsAuthor } from '../cms/repository';
import { uniqueSlug } from './editorial';
import { getPostgresPool } from '../server/postgres';

export function telegramExternalMessageId(chatId: string, messageId: number) {
  return `${chatId}:${messageId}`;
}

const REPORTER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReceiveTelegramMessageInput = {
  reporterId: string;
  chatId: string;
  messageId: number;
  rawText: string;
  fileId: string | null;
  mediaGroupId: string | null;
};

export type ReceiveTelegramMessageResult =
  | { outcome: 'created'; placement: 'opened' | 'appended'; reportId: string }
  | { outcome: 'duplicate' };

export type FinishTelegramSubmissionResult = 'ready' | 'needs_text' | 'expired' | 'none';

export function draftFromReporterTexts(texts: string[]) {
  const body = texts.map((item) => item.trim()).filter(Boolean).join('\n\n');
  const firstLine = body.split('\n').map((line) => line.trim()).find(Boolean) ?? 'Reporte';
  const title = firstLine.slice(0, 140);
  const summary = body.replace(/\s+/g, ' ').trim().slice(0, 240);
  return { title, summary, body: body.slice(0, 20_000) };
}
export type CancelTelegramSubmissionResult = 'cancelled' | 'none';

type ActiveSubmission = { id: string; expired: boolean };

function assertReporterId(reporterId: string) {
  if (!REPORTER_UUID.test(reporterId)) throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
}

function assertMessage(input: ReceiveTelegramMessageInput) {
  assertReporterId(input.reporterId);
  if (!/^\d{1,20}$/.test(input.chatId) || !Number.isSafeInteger(input.messageId) || input.messageId < 1) {
    throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  }
  const maxLength = input.fileId ? 1024 : 4096;
  if (input.rawText.length > maxLength || input.rawText.includes('\u0000')) throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  if (!input.fileId && !input.rawText) throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  if (input.fileId && !/^[\x21-\x7E]{16,512}$/.test(input.fileId)) throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  if (input.mediaGroupId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(input.mediaGroupId)) {
    throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  }
}

async function withReporterLock<T>(reporterId: string, run: (client: PoolClient) => Promise<T>) {
  assertReporterId(reporterId);
  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1::text)::bigint)', [reporterId]);
    const value = await run(client);
    await client.query('commit');
    return value;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function submissionHasText(client: PoolClient, submissionId: string) {
  const result = await client.query<{ has_text: boolean }>(
    `select exists (
       select 1 from pipeline.reports
       where submission_id = $1 and length(btrim(raw_text)) > 0
     ) as has_text`,
    [submissionId],
  );
  return result.rows[0]?.has_text === true;
}

async function closeSubmission(client: PoolClient, submissionId: string, status: 'ready' | 'incomplete' | 'cancelled') {
  await client.query(
    `update pipeline.report_submissions
     set status = $2, closed_at = now(), updated_at = now()
     where id = $1`,
    [submissionId, status],
  );
}

async function closeIfExpired(client: PoolClient, reporterId: string) {
  const result = await client.query<{ id: string }>(
    `select id
     from pipeline.report_submissions
     where reporter_id = $1
       and status in ('open', 'incomplete')
       and closed_at is null
       and expires_at <= now()
     for update`,
    [reporterId],
  );
  const submissionId = result.rows[0]?.id;
  if (!submissionId) return;
  const hasText = await submissionHasText(client, submissionId);
  await closeSubmission(client, submissionId, hasText ? 'ready' : 'incomplete');
}

async function lockActiveSubmission(client: PoolClient, reporterId: string) {
  const result = await client.query<ActiveSubmission>(
    `select id, expires_at <= now() as expired
     from pipeline.report_submissions
     where reporter_id = $1
       and status in ('open', 'incomplete')
       and closed_at is null
     for update`,
    [reporterId],
  );
  return result.rows[0] ?? null;
}

export async function receiveTelegramMessage(input: ReceiveTelegramMessageInput): Promise<ReceiveTelegramMessageResult> {
  assertMessage(input);
  return withReporterLock(input.reporterId, async (client) => {
    await closeIfExpired(client, input.reporterId);
    let active = await lockActiveSubmission(client, input.reporterId);
    let placement: 'opened' | 'appended' = 'appended';
    if (!active) {
      const opened = await client.query<{ id: string }>(
        `insert into pipeline.report_submissions (reporter_id, status, expires_at)
         values ($1, 'open', now() + make_interval(mins => 15))
         returning id`,
        [input.reporterId],
      );
      active = { id: opened.rows[0].id, expired: false };
      placement = 'opened';
    }

    const externalMessageId = telegramExternalMessageId(input.chatId, input.messageId);
    const inserted = await client.query<{ id: string }>(
      `insert into pipeline.reports (
         reporter_id, channel, external_message_id, raw_text, received_at, status, submission_id
       ) values ($1, 'telegram', $2, $3, now(), 'received', $4)
       on conflict (channel, external_message_id) do nothing
       returning id`,
      [input.reporterId, externalMessageId, input.rawText, active.id],
    );
    const reportId = inserted.rows[0]?.id;
    if (!reportId) {
      if (placement === 'opened') await client.query('delete from pipeline.report_submissions where id = $1', [active.id]);
      return { outcome: 'duplicate' };
    }

    if (input.fileId) {
      await client.query(
        `insert into pipeline.report_assets (
           report_id, telegram_file_id, kind, sort_order, status, media_group_id
         ) values ($1, $2, 'photo', 0, 'pending', $3)
         on conflict (report_id, telegram_file_id) do nothing`,
        [reportId, input.fileId, input.mediaGroupId],
      );
    }

    await client.query(
      `update pipeline.report_submissions
       set status = 'open', expires_at = now() + make_interval(mins => 15), updated_at = now()
       where id = $1`,
      [active.id],
    );
    return { outcome: 'created', placement, reportId };
  });
}

async function replayedFinish(client: PoolClient, closeExternalMessageId: string) {
  const existing = await client.query<{ status: string }>(
    `select status from pipeline.report_submissions where close_external_message_id = $1`,
    [closeExternalMessageId],
  );
  return existing.rows[0]?.status === 'drafted';
}

async function draftClosedSubmission(client: PoolClient, submissionId: string, closeExternalMessageId: string | null) {
  const reports = await client.query<{ id: string; reporter_id: string; raw_text: string; has_photo: boolean }>(
    `select id, reporter_id, raw_text,
            exists (
              select 1 from pipeline.report_assets a
              where a.report_id = pipeline.reports.id and a.kind = 'photo'
            ) as has_photo
     from pipeline.reports
     where submission_id = $1
     order by received_at asc`,
    [submissionId],
  );
  const draft = draftFromReporterTexts(reports.rows.map((row) => row.raw_text));
  const slug = await uniqueSlug(draft.title);
  const authorId = (await getDefaultCmsAuthor()).id;
  const event = await client.query<{ id: string }>(
    `insert into pipeline.news_events (status, canonical_title) values ('developing', $1) returning id`,
    [draft.title],
  );
  const eventId = event.rows[0].id;
  for (const report of reports.rows) {
    if (report.raw_text.trim()) {
      await client.query(
        `insert into pipeline.report_contributions (event_id, report_id, reporter_id, kind)
         values ($1, $2, $3, 'tip')
         on conflict (event_id, report_id, kind) do nothing`,
        [eventId, report.id, report.reporter_id],
      );
    }
    if (report.has_photo) {
      await client.query(
        `insert into pipeline.report_contributions (event_id, report_id, reporter_id, kind)
         values ($1, $2, $3, 'photo')
         on conflict (event_id, report_id, kind) do nothing`,
        [eventId, report.id, report.reporter_id],
      );
    }
  }
  const articleId = await createCmsArticle({
    slug,
    category: 'jalisco',
    title: draft.title,
    summary: draft.summary,
    bodyText: draft.body,
    status: 'unpublished',
    authorId,
    eventId,
  }, client);
  await client.query(
    `update pipeline.reports set status = 'merged' where submission_id = $1`,
    [submissionId],
  );
  await client.query(
    `update pipeline.report_submissions
     set status = 'drafted', closed_at = now(), updated_at = now(),
         close_external_message_id = $2, event_id = $3, article_id = $4
     where id = $1`,
    [submissionId, closeExternalMessageId, eventId, articleId],
  );
}

export async function finishTelegramSubmission(reporterId: string, closeExternalMessageId?: string): Promise<FinishTelegramSubmissionResult> {
  if (closeExternalMessageId && !/^\d{1,20}:\d{1,20}$/.test(closeExternalMessageId)) {
    throw new Error('TELEGRAM_REPORT_INPUT_INVALID');
  }
  return withReporterLock(reporterId, async (client) => {
    if (closeExternalMessageId && await replayedFinish(client, closeExternalMessageId)) return 'ready';
    const active = await lockActiveSubmission(client, reporterId);
    if (!active) return 'none';
    const hasText = await submissionHasText(client, active.id);
    if (!hasText) {
      if (active.expired) {
        await closeSubmission(client, active.id, 'incomplete');
        return 'expired';
      }
      await client.query(
        `update pipeline.report_submissions
         set status = 'incomplete', expires_at = now() + make_interval(mins => 15), updated_at = now()
         where id = $1`,
        [active.id],
      );
      return 'needs_text';
    }
    await draftClosedSubmission(client, active.id, closeExternalMessageId ?? null);
    return 'ready';
  });
}

export async function cancelTelegramSubmission(reporterId: string): Promise<CancelTelegramSubmissionResult> {
  return withReporterLock(reporterId, async (client) => {
    const active = await lockActiveSubmission(client, reporterId);
    if (!active) return 'none';
    await closeSubmission(client, active.id, 'cancelled');
    return 'cancelled';
  });
}
