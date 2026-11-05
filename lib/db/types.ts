export type ProviderId = "elevenlabs" | "gemini" | "openrouter";
export type ChunkStatus = "pending" | "generating" | "ready" | "failed";

export type SentenceTiming = { s: number; e: number; t0: number; t1: number };

export type BookRow = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  page_count: number;
  start_page: number;
  end_page: number;
  voice_provider: ProviderId;
  voice_id: string;
  voice_name: string;
  voice_model: string | null;
  total_chars: number;
  auto_continue: boolean;
  approved_chapters: number[];
  source_path: string | null;
  recap: { posIdx: number; text: string; audioPath: string; at: string } | null;
  created_at: string;
  finished_at: string | null;
};

export type ChapterDbRow = {
  id: string;
  book_id: string;
  idx: number;
  title: string;
  first_chunk: number;
  last_chunk: number;
  char_count: number;
};

export type ChunkRow = {
  id: string;
  user_id: string;
  book_id: string;
  idx: number;
  chapter_idx: number;
  page: number;
  text: string;
  char_count: number;
  status: ChunkStatus;
  audio_path: string | null;
  duration_sec: number | null;
  timings: SentenceTiming[] | null;
  provider: string | null;
  error: string | null;
  claimed_at: string | null;
  updated_at: string;
};

export type ProgressRow = { book_id: string; chunk_idx: number; offset_sec: number; updated_at: string };
export type SessionRow = { id: string; book_id: string; started_at: string; seconds: number; last_beat: string };
export type BookmarkRow = {
  id: string;
  book_id: string;
  chunk_idx: number;
  offset_sec: number;
  quote: string | null;
  note: string | null;
  created_at: string;
};
export type SettingsRow = {
  user_id: string;
  daily_goal_min: number;
  timezone: string;
  remind_hour: number | null;
  push_subscription: unknown;
};
