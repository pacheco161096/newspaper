import { getPostgresPool } from '../server/postgres';
import type { ClassificationResult } from './classify';
import type { DiscoveredDocument, SourceKey } from './types';

export async function startIngestionRun(sourceKey: SourceKey) {
  const result = await getPostgresPool().query<{ id: string }>(
    `insert into pipeline.ingestion_runs (source_key, status)
     values ($1, 'running') returning id`,
    [sourceKey],
  );
  return result.rows[0].id;
}

export async function storeDocuments(documents: DiscoveredDocument[]) {
  if (!documents.length) return { stored: 0, inserted: 0, updated: 0 };
  const client = await getPostgresPool().connect();
  let stored = 0;
  let inserted = 0;
  let updated = 0;

  try {
    await client.query('begin');
    for (const item of documents) {
      const result = await client.query<{ inserted: boolean }>(
        `insert into pipeline.source_documents (
          source_key, external_id, source_url, source_published_at, source_modified_at,
          raw_title, raw_excerpt, raw_content, fingerprint, metadata
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
        on conflict (source_key, external_id) do update set
          source_url = excluded.source_url,
          source_published_at = excluded.source_published_at,
          source_modified_at = excluded.source_modified_at,
          raw_title = excluded.raw_title,
          raw_excerpt = excluded.raw_excerpt,
          raw_content = excluded.raw_content,
          fingerprint = excluded.fingerprint,
          metadata = excluded.metadata
        where pipeline.source_documents.source_modified_at is distinct from excluded.source_modified_at
           or pipeline.source_documents.raw_title is distinct from excluded.raw_title
           or pipeline.source_documents.raw_content is distinct from excluded.raw_content
        returning (xmax = 0) as inserted`,
        [item.sourceKey, item.externalId, item.sourceUrl, item.sourcePublishedAt, item.sourceModifiedAt,
          item.rawTitle, item.rawExcerpt, item.rawContent, item.fingerprint, JSON.stringify(item.metadata)],
      );
      stored += result.rowCount ?? 0;
      if (result.rows[0]?.inserted) inserted += 1;
      else if (result.rowCount) updated += 1;
    }
    await client.query('commit');
    return { stored, inserted, updated };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function findExistingExternalIds(sourceKey: SourceKey, externalIds: string[]) {
  if (!externalIds.length) return new Set<string>();
  const result = await getPostgresPool().query<{ external_id: string }>(
    `select external_id from pipeline.source_documents where source_key = $1 and external_id = any($2::text[])`,
    [sourceKey, externalIds],
  );
  return new Set(result.rows.map((row) => row.external_id));
}

export type QueuedSourceDocument = {
  id: string;
  sourceKey: SourceKey;
  sourceUrl: string;
  rawTitle: string;
  rawExcerpt: string;
  rawContent: string;
  metadata: Record<string, unknown>;
  attemptCount: number;
};

export async function claimDocumentsForClassification(workerId: string, limit = 10): Promise<QueuedSourceDocument[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const result = await getPostgresPool().query<{
    id: string; source_key: SourceKey; source_url: string; raw_title: string; raw_excerpt: string;
    raw_content: string; metadata: Record<string, unknown>; attempt_count: number;
  }>(
    `with candidates as (
       select id from pipeline.source_documents
        where (pipeline_status = 'discovered' and next_attempt_at <= now())
           or (pipeline_status = 'processing' and locked_at < now() - interval '15 minutes')
        order by coalesce(source_published_at, discovered_at) desc nulls last
        for update skip locked
        limit $2
     )
     update pipeline.source_documents d set
       pipeline_status = 'processing', locked_at = now(), locked_by = $1,
       attempt_count = attempt_count + 1, last_error = null
     from candidates where d.id = candidates.id
     returning d.id, d.source_key, d.source_url, d.raw_title, d.raw_excerpt,
       d.raw_content, d.metadata, d.attempt_count`,
    [workerId, safeLimit],
  );
  return result.rows.map((row) => ({
    id: row.id, sourceKey: row.source_key, sourceUrl: row.source_url, rawTitle: row.raw_title,
    rawExcerpt: row.raw_excerpt, rawContent: row.raw_content, metadata: row.metadata,
    attemptCount: row.attempt_count,
  }));
}

export async function finishClassification(id: string, result: ClassificationResult) {
  const status = result.label === 'news' ? 'classified' : 'rejected';
  await getPostgresPool().query(
    `update pipeline.source_documents set
       pipeline_status=$2, classification=$3::jsonb, classification_label=$4,
       classified_at=now(), locked_at=null, locked_by=null, last_error=null
     where id=$1`,
    [id, status, JSON.stringify(result), result.label],
  );
}

export async function failClassification(id: string, error: string, retry = true) {
  await getPostgresPool().query(
    `update pipeline.source_documents set pipeline_status=$2, locked_at=null, locked_by=null,
      last_error=$3, next_attempt_at=case when $2='discovered' then now() + (interval '1 minute' * least(60, power(2, attempt_count))) else next_attempt_at end
      where id=$1`, [id, retry ? 'discovered' : 'failed', error.slice(0, 2000)],
  );
}

export async function countDocumentsToday(sourceKey: SourceKey) {
  const result = await getPostgresPool().query<{ count: string }>(
    `select count(*)::text as count
       from pipeline.source_documents
      where source_key = $1
        and discovered_at >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'`,
    [sourceKey],
  );
  return Number(result.rows[0].count);
}

export type ResolutionKind = 'new' | 'duplicate' | 'update';

export async function claimDocumentsForResolution(workerId: string, limit = 8): Promise<QueuedSourceDocument[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const result = await getPostgresPool().query<{
    id: string; source_key: SourceKey; source_url: string; raw_title: string; raw_excerpt: string;
    raw_content: string; metadata: Record<string, unknown>; attempt_count: number;
  }>(
    `with candidates as (
       select id from pipeline.source_documents
        where pipeline_status = 'classified'
          and classification_label = 'news'
          and next_attempt_at <= now()
          and (locked_at is null or locked_at < now() - interval '15 minutes')
        order by coalesce(source_published_at, discovered_at) desc nulls last, classified_at desc nulls last
        for update skip locked
        limit $2
     )
     update pipeline.source_documents d set
       locked_at = now(), locked_by = $1, attempt_count = attempt_count + 1, last_error = null
     from candidates where d.id = candidates.id
     returning d.id, d.source_key, d.source_url, d.raw_title, d.raw_excerpt,
       d.raw_content, d.metadata, d.attempt_count`,
    [workerId, safeLimit],
  );
  return result.rows.map((row) => ({
    id: row.id, sourceKey: row.source_key, sourceUrl: row.source_url, rawTitle: row.raw_title,
    rawExcerpt: row.raw_excerpt, rawContent: row.raw_content, metadata: row.metadata,
    attemptCount: row.attempt_count,
  }));
}

export async function findOpenEventCandidates(title: string) {
  const result = await getPostgresPool().query<{
    event_id: string; canonical_title: string; origin_source_key: SourceKey | null; title_similarity: number;
  }>(
    `select e.id as event_id, e.canonical_title, origin.source_key as origin_source_key,
            similarity(lower(e.canonical_title), lower($1)) as title_similarity
       from pipeline.news_events e
       left join pipeline.event_documents ed
         on ed.event_id = e.id and ed.relation = 'origin'
       left join pipeline.source_documents origin
         on origin.id = ed.source_document_id
      where e.status = 'developing'
        and e.last_seen_at >= now() - interval '5 days'
        and similarity(lower(e.canonical_title), lower($1)) > 0.12
      order by title_similarity desc
      limit 8`,
    [title],
  );
  return result.rows.map((row) => ({
    eventId: row.event_id,
    canonicalTitle: row.canonical_title,
    originSourceKey: row.origin_source_key,
    titleSimilarity: Number(row.title_similarity),
  }));
}

export async function failResolution(id: string, error: string, retry = true) {
  await getPostgresPool().query(
    `update pipeline.source_documents set locked_at=null, locked_by=null, last_error=$3,
       pipeline_status = case when $2 then 'classified' else 'failed' end,
       next_attempt_at = case when $2 then now() + (interval '1 minute' * least(60, power(2, attempt_count))) else next_attempt_at end
     where id=$1`,
    [id, retry, error.slice(0, 2000)],
  );
}

export async function applyResolution(documentId: string, title: string, result: {
  kind: ResolutionKind; eventId: string | null; score: number; reasons: string[]; method: string;
}) {
  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    let eventId = result.eventId;
    let relation: 'origin' | 'duplicate' | 'update' = 'origin';
    if (result.kind === 'new' || !eventId) {
      const created = await client.query<{ id: string }>(
        `insert into pipeline.news_events (canonical_title, status) values ($1, 'developing') returning id`,
        [title],
      );
      eventId = created.rows[0].id;
      relation = 'origin';
    } else {
      relation = result.kind === 'duplicate' ? 'duplicate' : 'update';
      await client.query(
        `update pipeline.news_events set last_seen_at = now() where id = $1`,
        [eventId],
      );
    }
    await client.query(
      `insert into pipeline.event_documents (event_id, source_document_id, relation)
       values ($1, $2, $3)
       on conflict (source_document_id) do update set event_id = excluded.event_id, relation = excluded.relation`,
      [eventId, documentId, relation],
    );
    await client.query(
      `update pipeline.source_documents set
         pipeline_status = 'resolved', event_id = $2, resolution_kind = $3,
         resolution = $4::jsonb, editorial_status = $5,
         locked_at = null, locked_by = null, last_error = null
       where id = $1`,
      [documentId, eventId, result.kind === 'new' ? 'new' : result.kind, JSON.stringify({ ...result, eventId }),
        result.kind === 'duplicate' ? 'skipped' : 'pending'],
    );
    await client.query('commit');
    return { eventId, relation };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function finishIngestionRun(
  runId: string,
  values: { status: 'completed' | 'failed'; fetched: number; accepted: number; stored: number; error?: string },
) {
  await getPostgresPool().query(
    `update pipeline.ingestion_runs
        set status = $2, fetched = $3, accepted = $4, stored = $5, error = $6, finished_at = now()
      where id = $1`,
    [runId, values.status, values.fetched, values.accepted, values.stored, values.error ?? null],
  );
}

export type EditorialDocument = QueuedSourceDocument & {
  eventId: string;
  resolutionKind: ResolutionKind;
};

export async function claimDocumentsForEditorial(workerId: string, limit = 1): Promise<EditorialDocument[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 8);
  const result = await getPostgresPool().query<{
    id: string; source_key: SourceKey; source_url: string; raw_title: string; raw_excerpt: string;
    raw_content: string; metadata: Record<string, unknown>; attempt_count: number;
    event_id: string; resolution_kind: ResolutionKind;
  }>(
    `with candidates as (
       select id from pipeline.source_documents
        where editorial_status = 'pending'
          and pipeline_status = 'resolved'
          and resolution_kind in ('new', 'update')
          and event_id is not null
          and next_attempt_at <= now()
          and (locked_at is null or locked_at < now() - interval '15 minutes')
          and length(trim(raw_content)) >= 180
        order by coalesce(source_published_at, discovered_at) desc nulls last
        for update skip locked
        limit $2
     )
     update pipeline.source_documents d set
       editorial_status = 'processing', locked_at = now(), locked_by = $1,
       attempt_count = attempt_count + 1, last_error = null
     from candidates where d.id = candidates.id
     returning d.id, d.source_key, d.source_url, d.raw_title, d.raw_excerpt,
       d.raw_content, d.metadata, d.attempt_count, d.event_id, d.resolution_kind`,
    [workerId, safeLimit],
  );
  return result.rows.map((row) => ({
    id: row.id, sourceKey: row.source_key, sourceUrl: row.source_url, rawTitle: row.raw_title,
    rawExcerpt: row.raw_excerpt, rawContent: row.raw_content, metadata: row.metadata,
    attemptCount: row.attempt_count, eventId: row.event_id, resolutionKind: row.resolution_kind,
  }));
}

export async function listEventSourceDocuments(eventId: string) {
  const result = await getPostgresPool().query<{
    id: string; source_key: SourceKey; source_url: string; raw_title: string; raw_excerpt: string; raw_content: string;
  }>(
    `select id, source_key, source_url, raw_title, raw_excerpt, raw_content
       from pipeline.source_documents where event_id = $1 order by discovered_at asc`,
    [eventId],
  );
  return result.rows;
}

export async function failEditorial(id: string, error: string, retry = true) {
  await getPostgresPool().query(
    `update pipeline.source_documents set locked_at=null, locked_by=null, last_error=$3,
       editorial_status = case when $2 then 'pending' else 'failed' end,
       next_attempt_at = case when $2 then now() + (interval '1 minute' * least(60, power(2, attempt_count))) else next_attempt_at end
     where id=$1`,
    [id, retry, error.slice(0, 2000)],
  );
}

export async function finishEditorial(id: string, articleId: string, payload: unknown, published: boolean) {
  await getPostgresPool().query(
    `update pipeline.source_documents set
       editorial_status = $3, editorial = $4::jsonb, editorial_article_id = $2,
       locked_at = null, locked_by = null, last_error = null
     where id = $1`,
    [id, articleId, published ? 'published' : 'drafted', JSON.stringify(payload)],
  );
}
