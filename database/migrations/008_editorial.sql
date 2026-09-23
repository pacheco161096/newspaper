alter table pipeline.source_documents
  add column editorial_status text
    check (editorial_status in ('pending', 'processing', 'drafted', 'published', 'skipped', 'failed')),
  add column editorial jsonb,
  add column editorial_article_id uuid references cms.articles(id);

update pipeline.source_documents
   set editorial_status = 'skipped'
 where resolution_kind = 'duplicate';

update pipeline.source_documents
   set editorial_status = 'pending'
 where pipeline_status = 'resolved' and resolution_kind in ('new', 'update') and editorial_status is null;

create unique index articles_event_unique
  on cms.articles (event_id)
  where event_id is not null;

create index source_documents_editorial_idx
  on pipeline.source_documents (editorial_status, next_attempt_at)
  where editorial_status in ('pending', 'processing');

comment on column pipeline.source_documents.editorial_status is 'Redacción sobre eventos resueltos; duplicate queda skipped.';
