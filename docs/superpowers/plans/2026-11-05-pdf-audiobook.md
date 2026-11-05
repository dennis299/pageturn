# Pageturn (PDF → Audiobook) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, iPhone-friendly web app that turns an uploaded PDF into a resumable audiobook (ElevenLabs / Gemini / OpenRouter-free voices), with listening stats, read-along, bookmarks, offline chapters, recaps, OCR and daily reminders.

**Architecture:** Next.js 16 App Router on Vercel. The browser does the heavy PDF work (pdf.js extraction, cleanup, chunking, page rendering for OCR) and posts a finished chapter/chunk list. Server route handlers only do short, per-chunk jobs: one TTS call → MP3 upload to Supabase Storage → row update. Audio is downloaded into the browser as Blobs, which makes iOS lock-screen playback, seeking and offline caching work the same way.

**Tech Stack:** Next.js 16.4 + React 19.3 + TypeScript, Tailwind 4 + shadcn/ui, `@supabase/ssr` + `@supabase/supabase-js`, `pdfjs-dist`, `@breezystack/lamejs` (PCM→MP3), `zod`, `web-push`, `vitest`, Playwright (via webapp-testing skill).

**Spec:** `../pdf-audiobook-plan.md` (the approved design doc in the projects folder, including "Approved changes 2026-11-05").

## Global Constraints

- Next.js 16: `proxy.ts`, not `middleware.ts`. `params`/`searchParams`/`cookies()` are async. Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- Supabase project **shared with mts-vsl-blog** (`swcrvosybhuujtbfigmv`): every table is `public.ab_*`, every table has RLS `user_id = auth.uid()`, and storage is a **private bucket `audiobooks`** with object paths `{uid}/{bookId}/…`. Never touch the blog's tables, buckets or auth settings.
- Login is email + password (no magic-link redirects, because the auth Site URL belongs to the blog). Access is limited to `ALLOWED_EMAILS` (comma-separated) and checked in `proxy.ts` and in every route handler.
- Secrets live only in `.env.local` and Vercel env: `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`. Never expose them to the client or commit them.
- Audio is MP3, mono, ~64 kbps. Chunks are ≤ 1200 chars, split on sentence boundaries, and never cross a chapter.
- Each chunk is generated at most once. Concurrent generate calls for one chunk must not double-charge.
- Paid voices (ElevenLabs, Gemini) show a cost estimate before a chapter's first chunk is generated. ElevenLabs asks for explicit confirmation when a chapter would use > 10% of the remaining credits (the credits are shared with YouTube; the account is on Starter, ~40k/month).
- Text AI order: OpenRouter `:free` models (from `OPENROUTER_TEXT_MODELS`), then Gemini (`GEMINI_TEXT_MODEL`). The LLM never rewrites book text: it only picks chapters, OCRs scanned pages and writes recaps.
- Mobile first: works at 375 px, respects iPhone safe areas, tap targets ≥ 44 px, accessibility score ≥ 90.
- Commits are made only when Dennis says so. The work stays uncommitted on `main` until then.

## Review Focus

1. **A mixed PDF where some pages are scans.** Those pages are OCR'd and read, not silently skipped. → Task 4 test `flags pages with < 20 chars as needing OCR`.
2. **A provider fails mid-book** (429, out of credits, model removed). The chunk goes to `failed` with a readable error, the player offers Retry / Switch voice, and there's no retry loop that keeps charging. → Task 6 test `marks chunk failed and does not retry automatically`.
3. **Two devices open at once.** The newest `updated_at` wins, and a stale tab never drags your position backwards. → Task 7 test `ignores server progress older than local`.
4. **Text with no sentence punctuation** (tables, code, run-on OCR). The chunker still splits at word boundaries ≤ 1200 chars. → Task 5 test `splits an unpunctuated 5000-char run at word boundaries`.
5. **A double-tapped Generate or two tabs** asking for the same chunk. Exactly one TTS call. → Task 6 test `second concurrent claim returns already-claimed`.

---

### Task 1: Project base, Supabase clients, login + allowlist

**Files:**
- Create: `lib/auth/allowlist.ts`, `lib/supabase/{client,server,proxy}.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/actions.ts`, `app/auth/signout/route.ts`, `.env.example`, `vitest.config.ts`
- Test: `tests/allowlist.test.ts`

**Interfaces:**
- Produces: `isAllowedEmail(email: string | null | undefined, allowlist: string): boolean`; `createClient()` (browser) and `createServerSupabase(): Promise<SupabaseClient>` (server, cookie-bound); `requireUser(): Promise<{ supabase: SupabaseClient; user: User }>`, which throws `HttpError(401|403)`; `HttpError` class + `jsonError(e: unknown): Response` in `lib/http.ts`.

- [ ] Install `@supabase/ssr @supabase/supabase-js zod` and dev `vitest`. Add `"test": "vitest run"`.
- [ ] Test `isAllowedEmail`: case-insensitive, trims spaces, `("a@x.com", "")` → false, `(null, "a@x.com")` → false, `("B@x.com", " a@x.com , b@x.com")` → true.
- [ ] Implement it. `proxy.ts` refreshes the session (the `@supabase/ssr` pattern) and redirects to `/login` when there's no user or the email isn't allowed. The matcher excludes `_next`, static files, `/login`, `/manifest.webmanifest`, `/sw.js`, `/icons/*`, `/api/cron/*`.
- [ ] The login page posts a server action (`signInWithPassword`). A disallowed email signs out immediately and shows "This app is private."
- [ ] Verify: `npm test` passes, `npm run build` passes.

### Task 2: Database schema, storage bucket, RLS

**Files:**
- Create: `supabase/migrations/0001_audiobook.sql`, `lib/db/types.ts` (hand-written row types)

**Interfaces:**
- Produces tables (all have `user_id uuid not null default auth.uid() references auth.users on delete cascade` plus RLS select/insert/update/delete where `user_id = auth.uid()`):
  - `ab_books(id uuid pk, title, author, page_count int, start_page int, end_page int, voice_provider text check in ('elevenlabs','gemini','openrouter'), voice_id text, voice_name text, voice_model text, total_chars int, auto_continue bool default true, approved_chapters int[] default '{}', source_path text, recap jsonb, created_at, finished_at)`
  - `ab_chapters(id, book_id fk cascade, idx int, title, first_chunk int, last_chunk int, char_count int, unique(book_id, idx))`
  - `ab_chunks(id, book_id fk cascade, idx int, chapter_idx int, page int, text, char_count int, status text default 'pending' check in ('pending','generating','ready','failed'), audio_path text, duration_sec real, timings jsonb, provider text, error text, claimed_at timestamptz, updated_at, unique(book_id, idx))`
  - `ab_progress(book_id pk fk cascade, chunk_idx int, offset_sec real, updated_at timestamptz)`
  - `ab_sessions(id, book_id fk cascade, started_at timestamptz, seconds int default 0, last_beat timestamptz)`
  - `ab_bookmarks(id, book_id fk cascade, chunk_idx int, offset_sec real, quote text, note text, created_at)`
  - `ab_settings(user_id pk, daily_goal_min int default 20, timezone text default 'UTC', remind_hour int, push_subscription jsonb)`
  - SQL function `ab_claim_chunk(p_chunk uuid) returns ab_chunks`: atomically sets `status='generating', claimed_at=now()` where status in ('pending','failed') or (status='generating' and claimed_at < now() - interval '3 minutes'). Returns the row, or null if it wasn't claimable. `security invoker`.
- Bucket `audiobooks` (private, 50 MB file limit). Storage policies: all ops where `(storage.foldername(name))[1] = auth.uid()::text`.

- [ ] Apply via Supabase MCP `apply_migration` to `swcrvosybhuujtbfigmv`, and keep the same SQL in the repo.
- [ ] Verify: `get_advisors(security)` shows no new warnings for `ab_*`. Indexes on `(book_id, idx)` exist through the unique constraints.

### Task 3: Design system + app shell + PWA

Run **ui-ux-pro-max** (palette, font pairing, layout) and **frontend-design** (direction) first, then **vercel:shadcn** for components.

**Files:**
- Create: `app/layout.tsx` (fonts, theme, safe-area), `app/globals.css` (tokens), `components/app-shell.tsx` (bottom tab bar on mobile: Library · Add · Stats · Settings; side rail on desktop), `components/mini-player.tsx` (placeholder until Task 7), `app/manifest.ts`, `public/icons/*`, `public/sw.js` (app-shell cache only; extended in Task 11), `components/sw-register.tsx`, `app/page.tsx` (library: continue card + book grid + today's goal ring)

- [ ] Direction: a warm "reading room" (paper/ink tones, a serif for book titles, a clean sans for UI), dark mode by default at night (follows the system setting).
- [ ] Verify at 375×812 and 1440×900 in the preview: no horizontal scroll, the tab bar clears the home indicator.

### Task 4: PDF extraction, cleanup, OCR

**Files:**
- Create: `lib/pdf/extract.ts` (browser), `lib/pdf/clean.ts` (pure), `lib/pdf/render.ts` (browser page → JPEG), `lib/ai/text.ts`, `app/api/ai/ocr/route.ts`
- Test: `tests/clean.test.ts`, `tests/ai-text.test.ts`

**Interfaces:**
- Produces:
  - `extractPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<ExtractedPdf>`
  - `type ExtractedPdf = { pageCount: number; pages: PageText[]; outline: OutlineEntry[]; meta: { title?: string; author?: string } }`
  - `type PageText = { page: number; lines: Line[] }`; `type Line = { text: string; y: number /*0 top..1 bottom*/; fontSize: number }`; `type OutlineEntry = { title: string; page: number; depth: number }`
  - `cleanPages(pages: PageText[]): { pages: CleanPage[]; bodyFontSize: number; needsOcr: number[] }`
  - `type CleanPage = { page: number; paragraphs: string[]; headings: HeadingCandidate[] }`; `type HeadingCandidate = { page: number; text: string; fontSize: number }`
  - `renderPageJpeg(pdf: PDFDocumentProxy, page: number, maxWidth = 1400): Promise<string /*base64*/>`
  - `generateText(opts: { system: string; prompt: string; json?: boolean; imageBase64?: string }): Promise<{ text: string; provider: 'openrouter' | 'gemini'; model: string }>`
  - `POST /api/ai/ocr` body `{ imageBase64: string }` → `{ text: string }`
- Cleanup rules (exact): body font = median line fontSize. Drop page-number lines (`/^\s*(page\s*)?\d{1,4}\s*$/i` or roman `/^[ivxlcdm]{1,7}$/i`) when `y < 0.1 || y > 0.9`. Drop running headers/footers: a line in the top or bottom 10% whose text, lowercased with digits removed, appears on ≥ 30% of pages (min 3). Drop footnote lines: `y > 0.75 && fontSize < 0.85 × body`. De-hyphenate `word-` + lowercase start of the next line. Join lines into paragraphs; a new paragraph starts when the vertical gap > 1.6 × the median gap. A heading candidate is a line with `fontSize ≥ 1.25 × body` and < 120 chars. Pages with < 20 non-space chars go into `needsOcr`.

- [ ] Tests: removes "Page 12" and "12" footers; removes a header repeated on 5/10 pages; keeps a body sentence that happens to start with a number; joins "exam-" + "ple" → "example"; keeps "well-" + "Known" unjoined; drops small bottom footnotes; `flags pages with < 20 chars as needing OCR`.
- [ ] Tests for `generateText` (mocked `fetch`): uses the first OpenRouter model; on 429/5xx it tries the next model and then Gemini; throws `HttpError(502)` with every provider's error when all fail; sends `response_format: {type:'json_object'}` when `json`.
- [ ] Implement. pdf.js worker via `pdfjs-dist/build/pdf.worker.min.mjs` URL import. OCR route: vision prompt "Transcribe the page's body text exactly. Omit page numbers, running headers and footnotes. Output plain text only."

### Task 5: Chapters, chunking, import wizard, create book

**Files:**
- Create: `lib/book/chapters.ts`, `lib/book/chunk.ts`, `app/api/ai/chapters/route.ts`, `app/api/books/route.ts`, `app/import/page.tsx` + `components/import/*` (steps: File → Pages → Chapters → Voice → Create)
- Test: `tests/chapters.test.ts`, `tests/chunk.test.ts`

**Interfaces:**
- Consumes: Task 4 types, `generateText`.
- Produces:
  - `detectChapters(i: { outline: OutlineEntry[]; candidates: HeadingCandidate[]; bodyFontSize: number; startPage: number; endPage: number }): ChapterDraft[] | null`. Uses outline entries at depth 0 inside the range when there are ≥ 2. Otherwise, candidates matching `/^(chapter|part|book)\b|^\d+\.?\s+\S|^[IVXLC]+\.?\s/i` or fontSize ≥ 1.5 × body when there are ≥ 2. Otherwise null.
  - `fallbackChapters(startPage: number, endPage: number, every = 25): ChapterDraft[]` ("Part 1", "Part 2", …)
  - `type ChapterDraft = { title: string; page: number }`
  - `buildChunks(pages: CleanPage[], chapters: ChapterDraft[], maxChars = 1200): { chapters: ChapterRow[]; chunks: ChunkDraft[] }`
  - `type ChapterRow = { idx: number; title: string; firstChunk: number; lastChunk: number; charCount: number }`; `type ChunkDraft = { idx: number; chapterIdx: number; page: number; text: string }`
  - `POST /api/ai/chapters` `{ candidates, startPage, endPage }` → `ChapterDraft[]` (LLM in JSON mode, validated with zod, clamped to the range)
  - `POST /api/books` (zod-validated) `{ title, author?, pageCount, startPage, endPage, voice: { provider, voiceId, voiceName, model? }, chapters: ChapterRow[], chunks: ChunkDraft[], sourcePath? }` → `{ id }`. Inserts book, chapters and chunks in batches of 500.
- Sentence splitting uses `Intl.Segmenter('en', { granularity: 'sentence' })`. A chapter's first chunk starts with the chapter title as its own sentence.

- [ ] Tests: outline wins over candidates; "Chapter 3" candidates detected; null when nothing qualifies; `fallbackChapters(1, 60)` → 3 parts at pages 1/26/51; chunks never exceed 1200 chars; chunks never span chapters; no sentence is split when it's < 1200; `splits an unpunctuated 5000-char run at word boundaries`; chunk idx is contiguous from 0.
- [ ] Wizard: the PDF uploads to `audiobooks/{uid}/{bookId}/source.pdf` in the background. Page picker with lazy thumbnails, defaulting to the start = first page with ≥ 400 chars after any "contents" page. Editable chapter list (rename / delete / merge with previous). Voice step with a ▶ sample button and a whole-book cost estimate. OCR pages are processed with a visible progress bar before chunking.

### Task 6: TTS providers, MP3, timings, cost, generation API

**Files:**
- Create: `lib/tts/types.ts`, `lib/tts/elevenlabs.ts`, `lib/tts/gemini.ts`, `lib/tts/openrouter.ts`, `lib/tts/index.ts`, `lib/tts/timings.ts`, `lib/tts/cost.ts`, `lib/audio/mp3.ts`, `app/api/chunks/[id]/generate/route.ts`, `app/api/voices/route.ts`, `app/api/voices/sample/route.ts`, `app/api/elevenlabs/credits/route.ts`, `lib/generate.ts`
- Test: `tests/timings.test.ts`, `tests/cost.test.ts`, `tests/mp3.test.ts`, `tests/generate.test.ts`

**Interfaces:**
- Produces:
  - `type ProviderId = 'elevenlabs' | 'gemini' | 'openrouter'`
  - `interface TtsProvider { id: ProviderId; listVoices(): Promise<Voice[]>; synthesize(r: { text: string; voiceId: string; model?: string }): Promise<TtsResult> }`
  - `type Voice = { id: string; name: string; provider: ProviderId; model?: string; description?: string; free: boolean }`
  - `type TtsResult = { audio: Uint8Array; durationSec: number; alignment?: { chars: string[]; start: number[]; end: number[] } }`
  - `getProvider(id: ProviderId): TtsProvider`
  - `sentenceTimings(text: string, durationSec: number, alignment?: TtsResult['alignment']): SentenceTiming[]`; `type SentenceTiming = { s: number; e: number /*char offsets*/; t0: number; t1: number /*seconds*/ }`
  - `estimateCost(chars: number, provider: ProviderId, model?: string): { unit: 'credits' | 'usd' | 'free'; amount: number; label: string }`. ElevenLabs: `eleven_flash_v2_5` / `eleven_turbo_v2_5` = 0.5 credit/char, other models 1.0. Gemini: `chars × (25/15) × $20/1e6` (about 15 chars/s of speech, 25 audio tokens/s). OpenRouter `:free` / price 0 = free.
  - `pcmToMp3(pcm: Int16Array, sampleRate: number, kbps = 64): Uint8Array`; `mp3DurationSec(bytes: Uint8Array): number` (frame walk; skips ID3v2)
  - `generateChunk(supabase, chunkId: string): Promise<ChunkRow>` (claim → synthesize → upload `{uid}/{bookId}/{idx}.mp3` → update ready). On error: status `failed`, `error` = a short human message. No automatic retry.
  - `POST /api/chunks/[id]/generate` (maxDuration 60) → `ChunkRow`; `GET /api/voices?provider=` → `Voice[]`; `POST /api/voices/sample` `{provider, voiceId, model?, text?}` → `audio/mpeg`; `GET /api/elevenlabs/credits` → `{ used, limit, remaining }`
- Provider details: ElevenLabs `POST /v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_64`, default voice Jon `MFZUKuGQUsGJPQjTS4wC` (library voice; the key may lack `voices_read`, so the built-in list includes Jon even when `/v1/voices` fails), default model `eleven_flash_v2_5`. Gemini: `models/{GEMINI_TTS_MODEL}:generateContent` with `responseModalities:['AUDIO']`, `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`; the PCM is 24 kHz s16le mono, encoded to MP3. OpenRouter: `POST /api/v1/audio/speech` `{model, input, voice, response_format:'mp3'}`, with free TTS models discovered from `/api/v1/models` (audio output, prompt + completion price 0). Check every endpoint against current docs on build day.

- [ ] Tests: proportional timings cover `[0, duration]` and are monotonic; alignment-based timings match the char times; cost table values (450k chars on flash = 225,000 credits; gemini ≈ $15.00; free = 0); `mp3DurationSec(pcmToMp3(2 s of silence @24k))` ≈ 2.0 ± 0.1; `second concurrent claim returns already-claimed` (mock supabase rpc returns null → no synth call); `marks chunk failed and does not retry automatically`.

### Task 7: Player, resume and sync, generate-ahead, cost gate

**Files:**
- Create: `lib/player/engine.ts`, `lib/player/queue.ts`, `lib/player/progress.ts`, `lib/audio/blob-cache.ts`, `app/book/[id]/page.tsx`, `components/player/*` (cover, transport, scrubber, speed sheet, chapter sheet, sleep timer, cost-approval dialog), `app/api/progress/route.ts`; update `components/mini-player.tsx`
- Test: `tests/queue.test.ts`, `tests/progress.test.ts`

**Interfaces:**
- Consumes: `ChunkRow`, `/api/chunks/[id]/generate`, `estimateCost`, `/api/elevenlabs/credits`.
- Produces:
  - `class AudioEngine { constructor(el: HTMLAudioElement); load(chunk: ChunkRow, offsetSec: number): Promise<void>; play(); pause(); seekBy(sec: number); setRate(r: number); on(event: 'time'|'ended'|'state', cb) }`. The source is a Blob URL from `getChunkAudio(chunk): Promise<Blob>` (cache → `supabase.storage.download`). The next chunk is preloaded. Media Session metadata + handlers: play, pause, seekbackward/forward (15 s/30 s), previoustrack/nexttrack (chapter).
  - `chunksToGenerate(chunks: Pick<ChunkRow,'idx'|'chapter_idx'|'status'>[], chapters: ChapterRow[], posIdx: number): number[]`: returns not-ready idxs from `posIdx` to the end of the current chapter, plus the next chapter once ≥ 50% of the current chapter is ready-or-played. Excludes `failed`.
  - `needsApproval(book: { voice_provider; approved_chapters: number[]; auto_continue: boolean }, chapterIdx: number, chapterCost: { unit; amount }, remainingCredits?: number): boolean`: false for free providers. True when the chapter isn't approved and either it's the first chapter generated, `auto_continue` is false, or it's ElevenLabs with `amount > 0.1 × remaining`.
  - `mergeProgress(local?: Progress, server?: Progress): Progress | undefined` (the newer `updatedAt` wins); `type Progress = { chunkIdx: number; offsetSec: number; updatedAt: string }`
  - `POST /api/progress` `{ bookId, chunkIdx, offsetSec, updatedAt, sessionId?, addSeconds? }`, so `navigator.sendBeacon` works on pagehide. It upserts `ab_progress` only if newer, then bumps `ab_sessions.seconds`.
- The client generates at most 2 chunks at a time. Speeds 0.75–2.5×. Sleep timer 15/30/45/60 min/end of chapter. Progress is saved every 10 s, on pause and on pagehide.

- [ ] Tests: queue stays within the current chapter, adds the next chapter at 50%, skips ready and failed chunks; approval rules (free → false; first chapter → true; 10% rule); `ignores server progress older than local`.
- [ ] Manual check in the preview at the iPhone size: it plays, the chunk changes without a gap longer than ~0.5 s, and resume after reload lands within 10 s.

### Task 8: Read-along + bookmarks and notes

**Files:**
- Create: `components/player/read-along.tsx`, `components/player/bookmarks-sheet.tsx`, `lib/player/sentence-at.ts`
- Test: `tests/sentence-at.test.ts`

**Interfaces:**
- Produces: `sentenceAt(timings: SentenceTiming[], t: number): number` (index, binary search; −1 before the first). Bookmarks use the `ab_bookmarks` table directly through the browser client. The quote is the current sentence. A note is optional text.
- The read-along view shows the current chunk's text with the active sentence highlighted, auto-scrolls it into view, and seeks there when a sentence is tapped.

- [ ] Tests: boundaries (t = t0 → that sentence), gaps, past the end → last.

### Task 9: Tracking, stats, daily goal, reminders

**Files:**
- Create: `lib/stats/streak.ts`, `app/stats/page.tsx`, `components/stats/*`, `app/settings/page.tsx`, `app/api/push/subscribe/route.ts`, `app/api/cron/reminder/route.ts`, `vercel.json` (cron `0 * * * *` is not allowed on Hobby, so use `0 18 * * *` with a note)
- Test: `tests/streak.test.ts`

**Interfaces:**
- Produces: `minutesByDay(sessions: { started_at: string; seconds: number }[], timeZone: string): Map<string /*YYYY-MM-DD*/, number>`; `currentStreak(byDay: Map<string, number>, goalMin: number, today: string): number` (consecutive days ≥ goal ending today, or ending yesterday when today isn't met yet); `bookPercent(chunks: {idx:number; char_count:number}[], posIdx: number): number`.
- Stats page (use the **dataviz** skill): minutes/day bars for the last 14 days, a 12-week streak heatmap, a per-book % list, and totals. The goal ring is shared with the library.
- Reminder: web-push with VAPID. The cron route checks `Authorization: Bearer ${CRON_SECRET}` and sends to users below their goal today. On iOS this only works when the app is installed to the Home Screen (the settings page explains that).

- [ ] Tests: timezone day boundaries; streak continues from yesterday; streak breaks on a missed day; percent is weighted by chars.

### Task 10: "Previously on…" recap

**Files:**
- Create: `app/api/books/[id]/recap/route.ts`, `components/player/recap-card.tsx`
- Test: `tests/recap.test.ts`

**Interfaces:**
- Produces: `recapSource(chunks: {idx:number; text:string}[], posIdx: number, maxChars = 4000): string` (text before the position, newest last). `POST /api/books/[id]/recap` → `{ text: string; audioPath: string }`. It generates ~60 words with `generateText`, speaks it with the book's voice (or the OpenRouter free voice when the book is on ElevenLabs and credits are < 2000), and stores `{uid}/{bookId}/recap.mp3` + `ab_books.recap = { posIdx, text, audioPath, at }`.
- The player offers the recap card when the last progress `updatedAt` is > 24 h old and `posIdx > 0`. It's cached per `posIdx`.

- [ ] Tests: `recapSource` takes text only before the position and caps at maxChars from the end.

### Task 11: Offline chapters

**Files:**
- Modify: `lib/audio/blob-cache.ts`, `public/sw.js`
- Create: `lib/offline/books.ts`, `components/player/download-button.tsx`, the downloads section in `app/settings/page.tsx`

**Interfaces:**
- Produces: `downloadChapters(bookId: string, chapterIdxs: number[], onProgress): Promise<void>` (generates any missing chunks first, after approval rules, then stores MP3s in Cache Storage `ab-audio-v1` under `/offline-audio/{chunkId}`, plus a JSON snapshot of the book/chapters/chunks under `/offline-book/{bookId}`); `removeDownload(bookId)`; `getChunkAudio` checks the cache first. The SW serves the app shell offline (network-first navigations with a cache fallback). Progress posts made offline are queued in `localStorage` and flushed on `online`.

- [ ] Manual check: download the next 2 chapters, turn on DevTools offline, reload `/book/[id]`, and it plays.

### Task 12: Audit, device testing, README, deploy prep

- [ ] Run **web-design-guidelines** on all pages and fix the findings.
- [ ] **webapp-testing**/Playwright: log in → import a small fixture PDF (`tests/fixtures/sample.pdf`, generated with pdf-lib: 6 pages, header/footer, 2 chapters, 1 image-only page) → generate with the OpenRouter free voice → play → reload → resume. Run at 375×812 and 1440×900.
- [ ] `npm test`, `npm run lint`, `npm run build` are all clean. Supabase security advisors are clean for `ab_*`.
- [ ] README: setup, env vars, how to create your login user in Supabase (Auth → Add user → auto-confirm), costs, Vercel deploy steps. Deploying and adding a domain wait for Dennis's go-ahead.
