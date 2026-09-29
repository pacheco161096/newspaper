alter table pipeline.report_assets
  add column public_url text,
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column last_error text,
  add column stored_at timestamptz;

alter table pipeline.report_submissions
  add column editorial_status text not null default 'pending'
    check (editorial_status in ('pending', 'processing', 'drafted', 'failed')),
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column next_attempt_at timestamptz not null default now(),
  add column locked_at timestamptz,
  add column locked_by text,
  add column last_error text;

create index report_submissions_editorial_idx
  on pipeline.report_submissions (next_attempt_at)
  where status = 'drafted' and editorial_status in ('pending', 'processing');

comment on column pipeline.report_assets.public_url is 'URL pública del archivo ya copiado. Vacía mientras status es pending.';
comment on column pipeline.report_submissions.editorial_status is 'pending: el cron aún no redacta. drafted: ya reescribió o la nota ya estaba publicada. failed: el texto no se pudo redactar.';
