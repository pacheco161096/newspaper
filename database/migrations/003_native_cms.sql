create schema if not exists cms;

create table cms.articles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references pipeline.news_events(id),
  source_document_id uuid references pipeline.source_documents(id),
  slug text not null unique,
  category text not null check (category in ('ultimo-minuto', 'jalisco', 'nacional')),
  title text not null,
  summary text not null,
  body_text text not null,
  hero_image_url text,
  image_alt text,
  seo_title text,
  seo_description text,
  facebook_excerpt text,
  source_name text,
  source_url text,
  status text not null default 'unpublished' check (status in ('published', 'unpublished')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_article_has_date check (status <> 'published' or published_at is not null)
);

create index articles_publication_idx on cms.articles (status, published_at desc);
create index articles_category_idx on cms.articles (category, published_at desc);

create table cms.article_revisions (
  id bigint generated always as identity primary key,
  article_id uuid not null references cms.articles(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'published', 'unpublished')),
  actor text not null default 'Hola Vallarta',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index article_revisions_article_idx on cms.article_revisions (article_id, created_at desc);

comment on table cms.articles is 'Noticias editoriales publicadas por Hola Vallarta; separadas de reportes y documentos fuente.';
comment on table cms.article_revisions is 'Historial auditable de cambios editoriales y publicación.';
