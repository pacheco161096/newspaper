create table pipeline.telegram_updates (
  update_id bigint primary key,
  result text,
  created_at timestamptz not null default now()
);

comment on table pipeline.telegram_updates is 'Updates de Telegram ya aceptados. Un reintento con el mismo update_id no vuelve a crear el reporte.';

alter table pipeline.reports
  add constraint reports_telegram_message_id_required
  check (channel <> 'telegram' or external_message_id is not null);
