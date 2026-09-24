alter table cms.articles
  add column facebook_status text not null default 'skipped'
    check (facebook_status in ('skipped', 'pending', 'sent', 'failed')),
  add column zernio_post_id text,
  add column facebook_error text,
  add column facebook_sent_at timestamptz,
  add column facebook_attempts integer not null default 0 check (facebook_attempts >= 0),
  add column facebook_next_attempt_at timestamptz not null default now();

create index articles_facebook_queue_idx
  on cms.articles (facebook_status, facebook_next_attempt_at)
  where facebook_status in ('pending', 'failed');

update cms.articles
   set facebook_status = 'pending', facebook_next_attempt_at = now()
 where status = 'published' and coalesce(trim(facebook_excerpt), '') <> '';

comment on column cms.articles.facebook_status is 'Cola Zernio: el enlace de la nota va en el primer comentario, no en el texto del post.';
