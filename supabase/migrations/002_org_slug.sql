-- Run once if organisations are missing the slug column

alter table organisations add column if not exists slug text;
create unique index if not exists organisations_slug_key on organisations (slug) where slug is not null;