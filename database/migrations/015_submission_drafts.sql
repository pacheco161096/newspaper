alter table pipeline.report_submissions
  add column close_external_message_id text,
  add column event_id uuid references pipeline.news_events(id),
  add column article_id uuid references cms.articles(id);

create unique index report_submissions_close_message_idx
  on pipeline.report_submissions (close_external_message_id)
  where close_external_message_id is not null;

comment on column pipeline.report_submissions.article_id is 'Borrador CMS creado al cerrar el envío. No implica publicación.';
