-- Guest accounts with limits, and a shared usage counter for rate-limited voices.

-- Limits for guest accounts (owners listed in ALLOWED_EMAILS have none).
-- Only the server (secret key) writes this table; a guest can read their own row.
create table public.ab_user_limits (
  user_id uuid primary key references auth.users on delete cascade,
  free_voices_only boolean not null default true,
  monthly_audio_minutes int check (monthly_audio_minutes is null or monthly_audio_minutes >= 0) default 120,
  max_books int check (max_books is null or max_books >= 0) default 3,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ab_user_limits enable row level security;
create policy ab_user_limits_read_own on public.ab_user_limits for select to authenticated
  using (user_id = (select auth.uid()));

-- How many audio parts were made with a provider since a time, across all accounts.
-- Used to stay inside a shared key's rate limit (the free Gemini key). Returns only a number.
create or replace function public.ab_provider_usage(p_provider text, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.ab_chunks
   where provider = p_provider and status = 'ready' and updated_at >= p_since;
$$;
revoke execute on function public.ab_provider_usage(text, timestamptz) from public, anon;
grant execute on function public.ab_provider_usage(text, timestamptz) to authenticated;

create index if not exists ab_chunks_provider_updated on public.ab_chunks (provider, updated_at) where status = 'ready';
