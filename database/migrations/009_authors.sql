create table cms.authors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  role text not null default 'Reportero',
  bio text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index authors_one_default_idx on cms.authors (is_default) where is_default;

insert into cms.authors (slug, name, role, bio, is_default)
values (
  'emilio-vargas',
  'Emilio Vargas',
  'Reportero',
  'Reportero de Hola Vallarta. Cubre Puerto Vallarta, Bahía de Banderas, Jalisco y la agenda nacional.',
  true
);

alter table cms.articles
  add column author_id uuid references cms.authors(id);

update cms.articles
   set author_id = (select id from cms.authors where is_default limit 1)
 where author_id is null;

alter table cms.articles
  alter column author_id set not null;

create index articles_author_idx on cms.articles (author_id);

comment on table cms.authors is 'Firmas públicas de las notas; distintas de la marca Hola Vallarta.';
comment on column cms.articles.author_id is 'Reportero o editor asignado a la nota.';
