-- Your voice preferences: default voice for new books, auto-route order, and whether to ask before paid chapters.
alter table public.ab_settings
  add column if not exists default_voice jsonb,
  add column if not exists route_order text[],
  add column if not exists ask_before_paid boolean not null default true;
