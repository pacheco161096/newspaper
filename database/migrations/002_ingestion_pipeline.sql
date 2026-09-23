create table pipeline.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check (source_key in ('noticias_pv', 'tribuna_bahia', 'el_universal')),
  status text not null check (status in ('running', 'completed', 'failed')),
  fetched integer not null default 0,
  accepted integer not null default 0,
  stored integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table pipeline.source_documents (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check (source_key in ('noticias_pv', 'tribuna_bahia', 'el_universal')),
  external_id text not null,
  source_url text not null,
  source_published_at timestamptz,
  source_modified_at timestamptz,
  raw_title text not null,
  raw_excerpt text not null default '',
  raw_content text not null default '',
  fingerprint text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  pipeline_status text not null default 'discovered' check (pipeline_status in ('discovered', 'classified', 'rejected', 'resolved', 'failed')),
  discovered_at timestamptz not null default now(),
  unique (source_key, external_id)
);

create index source_documents_queue_idx on pipeline.source_documents (pipeline_status, discovered_at);
create index source_documents_published_idx on pipeline.source_documents (source_key, source_published_at desc);

comment on table pipeline.source_documents is 'Documentos crudos de medios externos; no son noticias publicadas por Hola Vallarta.';
comment on column pipeline.source_documents.fingerprint is 'Llave idempotente para no procesar dos veces el mismo documento.';
