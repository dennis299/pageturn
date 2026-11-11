"use client";
import { History, Loader2, Play, X } from "lucide-react";
import { usePlayer, usePlayerStore } from "./player-provider";

/** "Previously on…": prepared on the first open of a new day and spoken on your first Play. */
export function RecapCard() {
  const store = usePlayerStore();
  const recap = usePlayer((s) => s.recap);
  const playing = usePlayer((s) => s.playing);
  if (!store || recap.status === "none" || recap.status === "done") return null;

  const label =
    recap.status === "preparing"
      ? "Writing today's recap…"
      : recap.status === "playing"
        ? playing
          ? "Playing your recap, then the book carries on"
          : "Recap paused"
        : "Press play: you'll hear this first";
  return (
    <aside className="glass-thin rounded-3xl p-4" aria-label="Previously on" aria-live="polite">
      <div className="flex items-start gap-3">
        <History className="mt-0.5 size-5 shrink-0 text-foil" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Previously…</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {recap.text ?? "A 20-second reminder of where you left off, then the book carries on."}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-foil">
            {recap.status === "preparing" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            {label}
          </p>
        </div>
        <button
          type="button"
          onClick={() => store.finishRecap(recap.status === "playing")}
          className="-m-2 flex size-11 items-center justify-center text-muted-foreground"
          aria-label="Skip the recap"
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
}
