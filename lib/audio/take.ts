/**
 * A part's audio can be made more than once (a new voice, or corrected text). Each making is a
 * "take" with its own file, so the file path says which take a recording is. Everything that
 * keeps audio around (the player, the in-memory cache, downloads for offline) has to be tied to
 * the take, not just to the part, or a remade part keeps playing its old recording.
 */
type Part = { id: string; status?: string; audio_path: string | null };

/** Cache key for one take of one part. */
export function takeKey(part: Part): string {
  return `${part.id}|${part.audio_path ?? ""}`;
}

/** Whether the recording loaded in the player (identified by its file path) is still this part's current audio. */
export function isCurrentTake(part: Part | undefined, loadedPath: string | null): boolean {
  return Boolean(part && part.status === "ready" && part.audio_path && part.audio_path === loadedPath);
}

/**
 * Whether a recording saved for offline can be used for this part. Copies saved by this version
 * carry the path of the take they hold. Older copies don't say, so they're trusted only when
 * there's no way to check (no connection); with a connection the current take is fetched instead.
 */
export function offlineCopyUsable(savedPath: string | null, part: Part, online: boolean): boolean {
  if (savedPath) return !part.audio_path || savedPath === part.audio_path;
  return !online || !part.audio_path;
}
