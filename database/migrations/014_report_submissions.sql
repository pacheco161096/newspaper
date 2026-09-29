create table pipeline.report_submissions (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references pipeline.reporters(id),
  status text not null default 'open'
    check (status in ('open', 'incomplete', 'ready', 'processing', 'drafted', 'cancelled', 'failed')),
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index report_submissions_one_active_idx
  on pipeline.report_submissions (reporter_id)
  where status in ('open', 'incomplete') and closed_at is null;

alter table pipeline.reports
  add column submission_id uuid references pipeline.report_submissions(id);

create index reports_submission_idx on pipeline.reports (submission_id);

comment on table pipeline.report_submissions is 'Envío abierto de un reportero. Varios reports de texto y foto cuelgan de aquí hasta /enviar.';
