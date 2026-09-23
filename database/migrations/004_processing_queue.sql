alter table pipeline.source_documents
  drop constraint source_documents_pipeline_status_check;

alter table pipeline.source_documents
  add constraint source_documents_pipeline_status_check
  check (pipeline_status in ('discovered', 'processing', 'classified', 'rejected', 'resolved', 'failed'));

alter table pipeline.source_documents
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column next_attempt_at timestamptz not null default now(),
  add column locked_at timestamptz,
  add column locked_by text,
  add column last_error text;

drop index pipeline.source_documents_queue_idx;
create index source_documents_queue_idx
  on pipeline.source_documents (pipeline_status, next_attempt_at, discovered_at)
  where pipeline_status in ('discovered', 'processing');

comment on column pipeline.source_documents.locked_at is 'Bloqueo recuperable para impedir que dos ejecuciones procesen el mismo documento.';
comment on column pipeline.source_documents.next_attempt_at is 'Siguiente momento permitido para reintentar después de un fallo transitorio.';
