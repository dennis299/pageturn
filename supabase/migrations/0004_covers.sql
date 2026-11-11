-- Cover photos and a colour per book (the player and shelf take their colour from the cover).
alter table public.ab_books
  add column if not exists cover_path text,
  add column if not exists cover_color text;

-- Covers live next to the book's audio, at {uid}/{bookId}/cover-*.jpg.
update storage.buckets
  set allowed_mime_types = array['audio/mpeg','application/pdf','application/json','image/jpeg','image/webp']
  where id = 'audiobooks';
