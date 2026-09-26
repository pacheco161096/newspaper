create table pipeline.report_assets (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references pipeline.reports(id),
  telegram_file_id text not null,
  kind text not null check (kind in ('photo')),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'pending' check (status in ('pending', 'stored', 'failed')),
  media_group_id text,
  created_at timestamptz not null default now(),
  unique (report_id, telegram_file_id)
);

create index report_assets_report_idx on pipeline.report_assets (report_id);

comment on table pipeline.report_assets is 'file_id de Telegram. pending significa que el archivo todavía no se descarga.';
comment on column pipeline.report_assets.telegram_file_id is 'Identificador de Bot API. No es una URL ni el archivo.';
