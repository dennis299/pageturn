-- Pageturn (PDF → audiobook). Lives in the shared mts-vsl-blog project:
-- every object is prefixed ab_ and scoped to its owner via RLS.

create table public.ab_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  author text,
  page_count int not null,
  start_page int not null,
  end_page int not null,
  voice_provider text not null check (voice_provider in ('elevenlabs','gemini','openrouter')),
  voice_id text not null,
  voice_name text not null,
  voice_model text,
  total_chars int not null default 0,
  auto_continue boolean not null default true,
  approved_chapters int[] not null default '{}',
  source_path text,
  recap jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.ab_chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.ab_books on delete cascade,
  idx int not null,
  title text not null,
  first_chunk int not null,
  last_chunk int not null,
  char_count int not null,
  unique (book_id, idx)
);

create table public.ab_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.ab_books on delete cascade,
  idx int not null,
  chapter_idx int not null,
  page int not null,
  text text not null,
  char_count int not null,
  status text not null default 'pending' check (status in ('pending','generating','ready','failed')),
  audio_path text,
  duration_sec real,
  timings jsonb,
  provider text,
  error text,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (book_id, idx)
);

create table public.ab_progress (
  book_id uuid primary key references public.ab_books on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  chunk_idx int not null default 0,
  offset_sec real not null default 0,
  updated_at timestamptz not null default now()
);

create table public.ab_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.ab_books on delete cascade,
  started_at timestamptz not null default now(),
  seconds int not null default 0,
  last_beat timestamptz not null default now()
);
create index ab_sessions_user_started on public.ab_sessions (user_id, started_at desc);
create index ab_sessions_book on public.ab_sessions (book_id);

create table public.ab_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.ab_books on delete cascade,
  chunk_idx int not null,
  offset_sec real not null default 0,
  quote text,
  note text,
  created_at timestamptz not null default now()
);
create index ab_bookmarks_book on public.ab_bookmarks (book_id, chunk_idx);

create table public.ab_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  daily_goal_min int not null default 20 check (daily_goal_min between 1 and 600),
  timezone text not null default 'UTC',
  remind_hour int check (remind_hour between 0 and 23),
  push_subscription jsonb,
  updated_at timestamptz not null default now()
);

create index ab_books_user on public.ab_books (user_id, created_at desc);
create index ab_chapters_user on public.ab_chapters (user_id);
create index ab_chunks_user on public.ab_chunks (user_id);
create index ab_progress_user on public.ab_progress (user_id);
create index ab_bookmarks_user on public.ab_bookmarks (user_id);

-- Owner-only RLS on every table.
do $$
declare t text;
begin
  foreach t in array array['ab_books','ab_chapters','ab_chunks','ab_progress','ab_sessions','ab_bookmarks','ab_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_owner', t);
  end loop;
end $$;

-- Atomically claim a chunk for generation. Returns no row if someone else holds it or it's ready.
create or replace function public.ab_claim_chunk(p_chunk uuid)
returns setof public.ab_chunks
language sql
security invoker
set search_path = ''
as $$
  update public.ab_chunks
     set status = 'generating', claimed_at = now(), error = null, updated_at = now()
   where id = p_chunk
     and user_id = (select auth.uid())
     and (status in ('pending','failed')
          or (status = 'generating' and claimed_at < now() - interval '3 minutes'))
  returning *;
$$;

-- Private storage bucket; objects live under {uid}/{bookId}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audiobooks', 'audiobooks', false, 52428800, array['audio/mpeg','application/pdf','application/json'])
on conflict (id) do nothing;

create policy ab_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'audiobooks' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy ab_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audiobooks' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy ab_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'audiobooks' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy ab_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'audiobooks' and (storage.foldername(name))[1] = (select auth.uid())::text);
