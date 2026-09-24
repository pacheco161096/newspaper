alter table pipeline.ingestion_runs
  drop constraint ingestion_runs_source_key_check;

alter table pipeline.ingestion_runs
  add constraint ingestion_runs_source_key_check
  check (source_key in ('noticias_pv', 'tribuna_bahia', 'el_universal', 'record', 'notiespacio_pv'));

alter table pipeline.source_documents
  drop constraint source_documents_source_key_check;

alter table pipeline.source_documents
  add constraint source_documents_source_key_check
  check (source_key in ('noticias_pv', 'tribuna_bahia', 'el_universal', 'record', 'notiespacio_pv'));
