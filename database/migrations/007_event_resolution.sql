create extension if not exists pg_trgm;

create table pipeline.event_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references pipeline.news_events(id),
  source_document_id uuid not null unique references pipeline.source_documents(id),
  relation text not null check (relation in ('origin', 'duplicate', 'update')),
  created_at timestamptz not null default now()
);

create index event_documents_event_idx on pipeline.event_documents (event_id, created_at);
create index news_events_open_idx on pipeline.news_events (status, last_seen_at desc);

alter table pipeline.source_documents
  add column event_id uuid references pipeline.news_events(id),
  add column resolution jsonb,
  add column resolution_kind text check (resolution_kind in ('new', 'duplicate', 'update'));

create index source_documents_resolve_idx
  on pipeline.source_documents (next_attempt_at, classified_at)
  where pipeline_status = 'classified';

comment on table pipeline.event_documents is 'Vínculo de documentos fuente a un hecho vivo; no publica la noticia.';
comment on column pipeline.source_documents.resolution_kind is 'new abre evento; duplicate no aporta hecho nuevo; update complementa un evento existente.';
