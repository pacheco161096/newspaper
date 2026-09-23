create extension if not exists pgcrypto;
create schema if not exists pipeline;
create schema if not exists strapi;

create table pipeline.reporters (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  telegram_user_id text unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table pipeline.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references pipeline.reporters(id),
  channel text not null check (channel in ('telegram', 'web', 'manual')),
  external_message_id text,
  raw_text text not null,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  status text not null default 'received' check (status in ('received', 'validated', 'rejected', 'merged')),
  unique (channel, external_message_id)
);

create table pipeline.news_events (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'developing' check (status in ('developing', 'closed')),
  canonical_title text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table pipeline.report_contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references pipeline.news_events(id),
  report_id uuid not null references pipeline.reports(id),
  reporter_id uuid not null references pipeline.reporters(id),
  kind text not null check (kind in ('tip', 'lead', 'update', 'photo', 'video')),
  weight numeric(6,3) not null default 1,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'approved', 'paid', 'void')),
  amount_minor integer check (amount_minor is null or amount_minor >= 0),
  unique (event_id, report_id, kind)
);

create index reports_reporter_received_idx on pipeline.reports (reporter_id, received_at desc);
create index contributions_payment_idx on pipeline.report_contributions (payment_status, reporter_id);

comment on table pipeline.reports is 'Aportaciones originales. Nunca se reemplazan por una noticia publicada.';
comment on table pipeline.report_contributions is 'Vínculo auditable para atribución y pago por cada aporte.';
