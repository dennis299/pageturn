export type ChapterDraft = { title: string; page: number };
export type ChapterRow = { idx: number; title: string; firstChunk: number; lastChunk: number; charCount: number };
export type ChunkDraft = { idx: number; chapterIdx: number; page: number; text: string };
