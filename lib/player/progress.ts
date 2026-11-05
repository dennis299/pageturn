export type Progress = { chunkIdx: number; offsetSec: number; updatedAt: string };

/** The newer of two positions (by `updatedAt`), so a stale device never drags you backwards. */
export function mergeProgress(local?: Progress, server?: Progress): Progress | undefined {
  if (!local) return server;
  if (!server) return local;
  return Date.parse(server.updatedAt) > Date.parse(local.updatedAt) ? server : local;
}

const KEY = (bookId: string) => `ab-progress:${bookId}`;

export function readLocalProgress(bookId: string): Progress | undefined {
  try {
    const raw = localStorage.getItem(KEY(bookId));
    return raw ? (JSON.parse(raw) as Progress) : undefined;
  } catch {
    return undefined;
  }
}

export function writeLocalProgress(bookId: string, p: Progress) {
  try {
    localStorage.setItem(KEY(bookId), JSON.stringify(p));
  } catch {}
}
