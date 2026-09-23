alter table pipeline.source_documents
  add column classification jsonb,
  add column classification_label text
    check (classification_label in ('news', 'advertisement', 'irrelevant')),
  add column classified_at timestamptz;

create index source_documents_classified_idx
  on pipeline.source_documents (classification_label, classified_at desc)
  where classification_label is not null;

comment on column pipeline.source_documents.classification is 'Salida JSON del clasificador; no es la redacción editorial.';
comment on column pipeline.source_documents.classification_label is 'news se deja en classified; advertisement e irrelevant pasan a rejected.';
