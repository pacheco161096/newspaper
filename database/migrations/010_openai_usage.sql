create table pipeline.openai_usage (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('classify', 'editorial')),
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index openai_usage_created_idx on pipeline.openai_usage (created_at desc);
create index openai_usage_purpose_idx on pipeline.openai_usage (purpose, created_at desc);

comment on table pipeline.openai_usage is 'Costo estimado de cada llamada a OpenAI del pipeline.';
