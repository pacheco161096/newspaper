import { getPostgresPool } from '../server/postgres';
import type { ArticleInput, ArticleStatus, CmsArticle, CmsAuthor } from './types';
import { CRON_FACEBOOK_ORDER_SQL, FACEBOOK_CURRENT_DAY_SQL, LOCAL_ARTICLE_PRIORITY_SQL } from '../pipeline/sources';

type ArticleRow = {
  id: string; slug: string; category: CmsArticle['category']; title: string; summary: string;
  body_text: string; hero_image_url: string | null; image_alt: string | null;
  seo_title: string | null; seo_description: string | null; facebook_excerpt: string | null;
  source_name: string | null; source_url: string | null; status: ArticleStatus;
  facebook_status: 'skipped' | 'pending' | 'sent' | 'failed';
  published_at: Date | null; created_at: Date; updated_at: Date;
  author_id: string; author_slug: string; author_name: string; author_role: string;
};

function mapRow(row: ArticleRow): CmsArticle {
  return {
    id: row.id, slug: row.slug, category: row.category, title: row.title, summary: row.summary,
    bodyText: row.body_text, heroImageUrl: row.hero_image_url ?? undefined,
    imageAlt: row.image_alt ?? undefined, seoTitle: row.seo_title ?? undefined,
    seoDescription: row.seo_description ?? undefined, facebookExcerpt: row.facebook_excerpt ?? undefined,
    sourceName: row.source_name ?? undefined, sourceUrl: row.source_url ?? undefined,
    authorId: row.author_id, authorSlug: row.author_slug, authorName: row.author_name, authorRole: row.author_role,
    status: row.status, facebookStatus: row.facebook_status, publishedAt: row.published_at?.toISOString(),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

const selection = `a.id, a.slug, a.category, a.title, a.summary, a.body_text, a.hero_image_url, a.image_alt,
  a.seo_title, a.seo_description, a.facebook_excerpt, a.source_name, a.source_url, a.status,
  a.facebook_status, a.published_at, a.created_at, a.updated_at, a.author_id, au.slug as author_slug, au.name as author_name, au.role as author_role`;

const fromArticles = `cms.articles a join cms.authors au on au.id = a.author_id`;

export async function listCmsAuthors() {
  const result = await getPostgresPool().query<{
    id: string; slug: string; name: string; role: string; bio: string | null; is_default: boolean;
  }>(`select id, slug, name, role, bio, is_default from cms.authors order by is_default desc, name asc`);
  return result.rows.map((row): CmsAuthor => ({
    id: row.id, slug: row.slug, name: row.name, role: row.role,
    bio: row.bio ?? undefined, isDefault: row.is_default,
  }));
}

export async function getCmsAuthorBySlug(slug: string) {
  const result = await getPostgresPool().query<{
    id: string; slug: string; name: string; role: string; bio: string | null; is_default: boolean;
  }>(`select id, slug, name, role, bio, is_default from cms.authors where slug = $1`, [slug]);
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, slug: row.slug, name: row.name, role: row.role, bio: row.bio ?? undefined, isDefault: row.is_default };
}

export async function getDefaultCmsAuthor() {
  const result = await getPostgresPool().query<{ id: string; slug: string; name: string; role: string; bio: string | null; is_default: boolean }>(
    `select id, slug, name, role, bio, is_default from cms.authors where is_default limit 1`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('CMS_DEFAULT_AUTHOR_MISSING');
  return { id: row.id, slug: row.slug, name: row.name, role: row.role, bio: row.bio ?? undefined, isDefault: row.is_default };
}

async function resolveAuthorId(authorId?: string) {
  if (authorId) return authorId;
  return (await getDefaultCmsAuthor()).id;
}

export async function createCmsAuthor(input: { slug: string; name: string; role: string; bio?: string; isDefault?: boolean }) {
  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    if (input.isDefault) await client.query(`update cms.authors set is_default = false where is_default`);
    const result = await client.query<{ id: string }>(
      `insert into cms.authors (slug, name, role, bio, is_default) values ($1,$2,$3,$4,$5) returning id`,
      [input.slug, input.name, input.role, input.bio || null, Boolean(input.isDefault)],
    );
    await client.query('commit');
    return result.rows[0].id;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCmsAuthor(id: string, input: { slug: string; name: string; role: string; bio?: string; isDefault?: boolean }) {
  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    if (input.isDefault) await client.query(`update cms.authors set is_default = false where is_default and id <> $1`, [id]);
    await client.query(
      `update cms.authors set slug=$2, name=$3, role=$4, bio=$5, is_default=$6, updated_at=now() where id=$1`,
      [id, input.slug, input.name, input.role, input.bio || null, Boolean(input.isDefault)],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listCmsArticles() {
  const result = await getPostgresPool().query<ArticleRow>(
    `select ${selection} from ${fromArticles} order by coalesce(a.published_at, a.created_at) desc`,
  );
  return result.rows.map(mapRow);
}

export async function listPublishedCmsArticles() {
  const result = await getPostgresPool().query<ArticleRow>(
    `select ${selection} from ${fromArticles} where a.status = 'published' order by ${LOCAL_ARTICLE_PRIORITY_SQL}, a.published_at desc`,
  );
  return result.rows.map(mapRow);
}

export async function listPublishedCmsArticlesByAuthorSlug(slug: string) {
  const result = await getPostgresPool().query<ArticleRow>(
    `select ${selection} from ${fromArticles} where a.status = 'published' and au.slug = $1 order by a.published_at desc`,
    [slug],
  );
  return result.rows.map(mapRow);
}

export async function getCmsArticle(id: string) {
  const result = await getPostgresPool().query<ArticleRow>(`select ${selection} from ${fromArticles} where a.id = $1`, [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function getPublishedCmsArticleBySlug(slug: string) {
  const result = await getPostgresPool().query<ArticleRow>(
    `select ${selection} from ${fromArticles} where a.slug = $1 and a.status = 'published'`, [slug],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

function values(input: ArticleInput, authorId: string) {
  return [input.slug, input.category, input.title, input.summary, input.bodyText,
    input.heroImageUrl || null, input.imageAlt || null, input.seoTitle || null,
    input.seoDescription || null, input.facebookExcerpt || null, input.sourceName || null,
    input.sourceUrl || null, input.status, authorId];
}

async function recordRevision(articleId: string, action: 'created' | 'updated' | 'published' | 'unpublished') {
  await getPostgresPool().query(
    `insert into cms.article_revisions (article_id, action, snapshot)
     select id, $2, to_jsonb(a) from cms.articles a where id = $1`, [articleId, action],
  );
}

export async function getCmsArticleByEventId(eventId: string) {
  const result = await getPostgresPool().query<ArticleRow>(
    `select ${selection} from ${fromArticles} where a.event_id = $1 order by a.updated_at desc limit 1`, [eventId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function slugExists(slug: string, exceptId?: string) {
  const result = await getPostgresPool().query(
    exceptId
      ? `select 1 from cms.articles where slug = $1 and id <> $2 limit 1`
      : `select 1 from cms.articles where slug = $1 limit 1`,
    exceptId ? [slug, exceptId] : [slug],
  );
  return Boolean(result.rows[0]);
}

export async function createCmsArticle(input: ArticleInput) {
  const authorId = await resolveAuthorId(input.authorId);
  const result = await getPostgresPool().query<{ id: string }>(
    `insert into cms.articles (slug, category, title, summary, body_text, hero_image_url, image_alt,
      seo_title, seo_description, facebook_excerpt, source_name, source_url, status, author_id, published_at,
      event_id, source_document_id, facebook_status, facebook_next_attempt_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,case when $13 = 'published' then now() else null end,$15,$16,
       case when $13 = 'published' then 'pending' else 'skipped' end, now())
     returning id`,
    [...values(input, authorId), input.eventId ?? null, input.sourceDocumentId ?? null],
  );
  await recordRevision(result.rows[0].id, input.status === 'published' ? 'published' : 'created');
  return result.rows[0].id;
}

export async function updateCmsArticle(id: string, input: ArticleInput) {
  const previous = await getCmsArticle(id);
  if (!previous) throw new Error('ARTICLE_NOT_FOUND');
  const authorId = await resolveAuthorId(input.authorId ?? previous.authorId);
  await getPostgresPool().query(
    `update cms.articles set slug=$1, category=$2, title=$3, summary=$4, body_text=$5,
      hero_image_url=$6, image_alt=$7, seo_title=$8, seo_description=$9, facebook_excerpt=$10,
      source_name=$11, source_url=$12, status=$13, author_id=$14,
      published_at=case when $13 = 'published' then coalesce(published_at, now()) else published_at end,
      facebook_status=case
        when facebook_status = 'sent' then facebook_status
        when $13 = 'published' then 'pending'
        else 'skipped' end,
      facebook_next_attempt_at=case when $13 = 'published' and facebook_status <> 'sent' then now() else facebook_next_attempt_at end,
      facebook_error=case when $13 = 'published' and facebook_status <> 'sent' then null else facebook_error end,
      updated_at=now() where id=$15`, [...values(input, authorId), id],
  );
  const action = previous.status !== input.status ? input.status === 'published' ? 'published' : 'unpublished' : 'updated';
  await recordRevision(id, action);
}

export async function setCmsArticleStatus(id: string, status: ArticleStatus) {
  await getPostgresPool().query(
    `update cms.articles set status=$2,
      published_at=case when $2='published' then coalesce(published_at, now()) else published_at end,
      facebook_status=case
        when facebook_status = 'sent' then facebook_status
        when $2 = 'published' then 'pending'
        else 'skipped' end,
      facebook_next_attempt_at=case when $2 = 'published' and facebook_status <> 'sent' then now() else facebook_next_attempt_at end,
      updated_at=now() where id=$1`, [id, status],
  );
  await recordRevision(id, status === 'published' ? 'published' : 'unpublished');
}

export type FacebookQueueArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  facebookExcerpt: string;
  attempts: number;
};

export async function listFacebookQueue(limit = 4) {
  const result = await getPostgresPool().query<{
    id: string; slug: string; title: string; summary: string; facebook_excerpt: string | null; facebook_attempts: number;
  }>(
    `select id, slug, title, summary, facebook_excerpt, facebook_attempts from cms.articles
      where status = 'published'
        and facebook_status in ('pending', 'failed')
        and ${FACEBOOK_CURRENT_DAY_SQL}
        and facebook_next_attempt_at <= now()
        and coalesce(trim(facebook_excerpt), trim(summary), '') <> ''
      order by ${CRON_FACEBOOK_ORDER_SQL}
      limit $1`,
    [Math.min(Math.max(limit, 1), 8)],
  );
  return result.rows.map((row): FacebookQueueArticle => ({
    id: row.id, slug: row.slug, title: row.title, summary: row.summary,
    facebookExcerpt: row.facebook_excerpt ?? '', attempts: row.facebook_attempts,
  }));
}

export async function countFacebookSentToday() {
  const result = await getPostgresPool().query<{ count: string }>(
    `select count(*)::text as count from cms.articles
      where facebook_status = 'sent'
        and facebook_sent_at >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'`,
  );
  return Number(result.rows[0].count);
}

export async function skipStaleFacebookArticles() {
  const result = await getPostgresPool().query(
    `update cms.articles
        set facebook_status = 'skipped',
            facebook_error = 'STALE_NOT_CURRENT_DAY',
            updated_at = now()
      where facebook_status in ('pending', 'failed')
        and not (${FACEBOOK_CURRENT_DAY_SQL})`,
  );
  return result.rowCount ?? 0;
}

export async function claimArticlesForFacebook(limit = 4) {
  const safeLimit = Math.min(Math.max(limit, 1), 8);
  const result = await getPostgresPool().query<{
    id: string; slug: string; title: string; summary: string; facebook_excerpt: string | null; facebook_attempts: number;
  }>(
    `with candidates as (
       select id from cms.articles
        where status = 'published'
          and facebook_status in ('pending', 'failed')
          and ${FACEBOOK_CURRENT_DAY_SQL}
          and facebook_next_attempt_at <= now()
          and coalesce(trim(facebook_excerpt), trim(summary), '') <> ''
        order by ${CRON_FACEBOOK_ORDER_SQL}
        for update skip locked
        limit $1
     )
     update cms.articles a set
       facebook_attempts = facebook_attempts + 1,
       facebook_error = null
     from candidates where a.id = candidates.id
     returning a.id, a.slug, a.title, a.summary, a.facebook_excerpt, a.facebook_attempts`,
    [safeLimit],
  );
  return result.rows.map((row): FacebookQueueArticle => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    facebookExcerpt: row.facebook_excerpt ?? '',
    attempts: row.facebook_attempts,
  }));
}

export async function markFacebookSent(id: string, zernioPostId: string) {
  await getPostgresPool().query(
    `update cms.articles set facebook_status = 'sent', zernio_post_id = $2, facebook_sent_at = now(),
       facebook_error = null, updated_at = now() where id = $1`,
    [id, zernioPostId],
  );
}

export async function markFacebookRateLimited(id: string, error: string) {
  await getPostgresPool().query(
    `update cms.articles set
       facebook_status = 'pending',
       facebook_error = $2,
       facebook_next_attempt_at = (date_trunc('day', now() at time zone 'America/Mexico_City') + interval '1 day') at time zone 'America/Mexico_City',
       updated_at = now()
     where id = $1`,
    [id, error.slice(0, 2000)],
  );
}

export async function markFacebookFailed(id: string, error: string, retry = true) {
  await getPostgresPool().query(
    `update cms.articles set
       facebook_status = case when $2 then 'failed' else 'skipped' end,
       facebook_error = $3,
       facebook_next_attempt_at = case when $2 then now() + (interval '1 minute' * least(60, power(2, facebook_attempts))) else facebook_next_attempt_at end,
       updated_at = now()
     where id = $1`,
    [id, retry, error.slice(0, 2000)],
  );
}
