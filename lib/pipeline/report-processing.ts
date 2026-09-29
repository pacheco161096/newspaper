import { put } from '@vercel/blob';
import { getCmsArticle, setCmsArticleHero, updateCmsArticle } from '../cms/repository';
import type { CategorySlug } from '../content';
import { downloadTelegramFile } from '../telegram/client';
import { draftReporterNote, facebookInvite, shouldRewriteReporterArticle } from './editorial';
import { draftFromReporterTexts } from './submissions';
import { getPostgresPool } from '../server/postgres';

const ASSET_ATTEMPTS = 4;
const EDITORIAL_ATTEMPTS = 4;

export type ClaimedReporterSubmission = {
  id: string;
  articleId: string;
  editorialStatus: string;
  attemptCount: number;
};

export function reporterErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  return message.split(':')[0]?.slice(0, 120) || 'UNKNOWN_ERROR';
}

export function reporterErrorRetries(code: string) {
  return !/JSON_INCOMPLETE|INSUFFICIENT|FILE_TYPE_UNSUPPORTED|FILE_PATH_INVALID|FILE_ID_INVALID|FILE_TOO_LARGE|ARTICLE_NOT_FOUND/.test(code);
}

function burnsAssetAttempt(code: string) {
  return reporterErrorRetries(code) && code !== 'BLOB_READ_WRITE_TOKEN_MISSING' && !code.startsWith('TELEGRAM_BOT_TOKEN');
}

export async function claimReporterSubmissions(workerId: string, limit = 1): Promise<ClaimedReporterSubmission[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 2);
  const result = await getPostgresPool().query<{
    id: string; article_id: string; editorial_status: string; attempt_count: number;
  }>(
    `with candidates as (
       select id from pipeline.report_submissions
        where status = 'drafted'
          and article_id is not null
          and next_attempt_at <= now()
          and (locked_at is null or locked_at < now() - interval '15 minutes')
          and (
            editorial_status in ('pending', 'processing')
            or exists (
              select 1 from pipeline.report_assets a
              join pipeline.reports r on r.id = a.report_id
              where r.submission_id = pipeline.report_submissions.id
                and a.status = 'pending'
            )
          )
        order by closed_at asc nulls last
        for update skip locked
        limit $2
     )
     update pipeline.report_submissions s
        set locked_at = now(), locked_by = $1, updated_at = now(),
            editorial_status = case
              when s.editorial_status in ('pending', 'processing') then 'processing'
              else s.editorial_status
            end
       from candidates
      where s.id = candidates.id
      returning s.id, s.article_id, s.editorial_status, s.attempt_count`,
    [workerId, safeLimit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    articleId: row.article_id,
    editorialStatus: row.editorial_status,
    attemptCount: row.attempt_count,
  }));
}

async function storePhoto(assetId: string, file: { bytes: Uint8Array; contentType: string; extension: string }) {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN_MISSING');
  const stored = await put(`telegram/${assetId}.${file.extension}`, Buffer.from(file.bytes), {
    access: 'public',
    token,
    contentType: file.contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  if (!stored.url.startsWith('https://')) throw new Error('BLOB_URL_INVALID');
  return stored.url;
}

async function settle(id: string, values: { editorialStatus: string; error: string | null; attempts: number; imagesPending: boolean; retryEditorial: boolean }) {
  await getPostgresPool().query(
    `update pipeline.report_submissions
        set editorial_status = $2, last_error = $3, attempt_count = $4,
            locked_at = null, locked_by = null, updated_at = now(),
            next_attempt_at = case
              when $5 then now() + interval '10 minutes'
              when $6 then now() + (interval '1 minute' * least(60, power(2, greatest($4, 1))))
              else now()
            end
      where id = $1`,
    [id, values.editorialStatus, values.error, values.attempts, values.imagesPending, values.retryEditorial],
  );
}

export async function releaseReporterSubmission(id: string, error: string) {
  await getPostgresPool().query(
    `update pipeline.report_submissions
        set locked_at = null, locked_by = null, last_error = $2, updated_at = now(),
            next_attempt_at = now() + interval '10 minutes',
            editorial_status = case when editorial_status = 'processing' then 'pending' else editorial_status end
      where id = $1`,
    [id, error.slice(0, 120)],
  );
}

export async function processReporterSubmission(claimed: ClaimedReporterSubmission) {
  const article = await getCmsArticle(claimed.articleId);
  if (!article) {
    await settle(claimed.id, { editorialStatus: 'failed', error: 'ARTICLE_NOT_FOUND', attempts: claimed.attemptCount, imagesPending: false, retryEditorial: false });
    return { id: claimed.id, error: 'ARTICLE_NOT_FOUND' as const };
  }

  const assets = await getPostgresPool().query<{
    id: string; telegram_file_id: string; status: string; attempt_count: number; public_url: string | null;
  }>(
    `select a.id, a.telegram_file_id, a.status, a.attempt_count, a.public_url
       from pipeline.report_assets a
       join pipeline.reports r on r.id = a.report_id
      where r.submission_id = $1
      order by r.received_at asc, a.sort_order asc`,
    [claimed.id],
  );

  let storedUrl: string | undefined;
  let imagesPending = false;
  for (const asset of assets.rows) {
    if (asset.status === 'stored' && asset.public_url) {
      storedUrl ??= asset.public_url;
      continue;
    }
    if (asset.status !== 'pending') continue;
    try {
      const file = await downloadTelegramFile(asset.telegram_file_id);
      const url = await storePhoto(asset.id, file);
      await getPostgresPool().query(
        `update pipeline.report_assets
            set status = 'stored', public_url = $2, stored_at = now(), last_error = null
          where id = $1`,
        [asset.id, url],
      );
      storedUrl ??= url;
    } catch (error) {
      const code = reporterErrorCode(error);
      const attempts = asset.attempt_count + (burnsAssetAttempt(code) ? 1 : 0);
      const failed = attempts >= ASSET_ATTEMPTS && burnsAssetAttempt(code);
      await getPostgresPool().query(
        `update pipeline.report_assets
            set status = case when $4 then 'failed' else 'pending' end,
                attempt_count = $3, last_error = $2
          where id = $1`,
        [asset.id, code, attempts, failed],
      );
      if (!failed) imagesPending = true;
    }
  }

  const hero = article.heroImageUrl || storedUrl;
  const rewrite = shouldRewriteReporterArticle(article.status, claimed.editorialStatus);
  if (!rewrite) {
    const heroSet = Boolean(hero && !article.heroImageUrl);
    if (heroSet && hero) await setCmsArticleHero(article.id, hero, article.title.slice(0, 180));
    const editorialStatus = claimed.editorialStatus === 'processing' ? 'drafted' : claimed.editorialStatus;
    await settle(claimed.id, { editorialStatus, error: null, attempts: claimed.attemptCount, imagesPending, retryEditorial: false });
    return { id: claimed.id, articleId: article.id, slug: article.slug, category: article.category, rewritten: false, heroSet, published: article.status === 'published', pendingImages: imagesPending };
  }

  try {
    const texts = await getPostgresPool().query<{ raw_text: string }>(
      `select raw_text from pipeline.reports where submission_id = $1 order by received_at asc`,
      [claimed.id],
    );
    const draft = await draftReporterNote(draftFromReporterTexts(texts.rows.map((row) => row.raw_text)).body);
    const category: CategorySlug = draft.category === 'ultimo-minuto' || draft.category === 'nacional' || draft.category === 'jalisco'
      ? draft.category
      : article.category;
    const title = draft.title?.trim() || article.title;
    await updateCmsArticle(article.id, {
      slug: article.slug,
      category,
      title,
      summary: draft.summary?.trim() || article.summary,
      bodyText: draft.bodyText?.trim() || article.bodyText,
      heroImageUrl: hero,
      imageAlt: hero ? title.slice(0, 180) : article.imageAlt,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      facebookExcerpt: facebookInvite(draft.facebookExcerpt, draft.summary?.trim() || article.summary),
      sourceName: article.sourceName,
      sourceUrl: article.sourceUrl,
      authorId: article.authorId,
      status: 'unpublished',
    });
    await settle(claimed.id, { editorialStatus: 'drafted', error: null, attempts: claimed.attemptCount + 1, imagesPending, retryEditorial: false });
    return { id: claimed.id, articleId: article.id, slug: article.slug, category, rewritten: true, heroSet: Boolean(hero), published: false, pendingImages: imagesPending };
  } catch (error) {
    const code = reporterErrorCode(error);
    const attempts = claimed.attemptCount + 1;
    const retryEditorial = reporterErrorRetries(code) && attempts < EDITORIAL_ATTEMPTS;
    if (hero && !article.heroImageUrl) await setCmsArticleHero(article.id, hero, article.title.slice(0, 180));
    await settle(claimed.id, {
      editorialStatus: retryEditorial ? 'pending' : 'failed',
      error: code,
      attempts,
      imagesPending,
      retryEditorial,
    });
    return { id: claimed.id, articleId: article.id, error: code, heroSet: Boolean(hero && !article.heroImageUrl) };
  }
}
