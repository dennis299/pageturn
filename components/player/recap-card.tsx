"use client";
import { useEffect, useRef, useState } from "react";
import { History, Loader2, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { shouldOfferRecap } from "@/lib/book/recap";
import { BUCKET } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { usePlayer, usePlayerStore } from "./player-provider";

/** "Previously on…": offered when you come back after more than a day. */
export function RecapCard() {
  const store = usePlayerStore();
  const book = usePlayer((s) => s.book);
  const posIdx = usePlayer((s) => s.pos.chunkIdx);
  const offline = usePlayer((s) => s.offline);
  const [lastAt] = useState(() => store?.getState().lastListenedAt ?? null);
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [text, setText] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audio.current?.pause(), []);
  if (!book || offline || dismissed || !shouldOfferRecap(posIdx, lastAt)) return null;

  async function play() {
    if (audio.current) {
      if (state === "playing") {
        audio.current.pause();
        return setState("paused");
      }
      store?.pause();
      await audio.current.play();
      return setState("playing");
    }
    setState("loading");
    store?.pause();
    try {
      const r = await api<{ text: string; audioPath: string }>(`/api/books/${book!.id}/recap`, { method: "POST", json: { posIdx } });
      setText(r.text);
      const { data } = await createClient().storage.from(BUCKET).download(r.audioPath);
      if (!data) throw new Error("Couldn't load the recap audio.");
      audio.current = new Audio(URL.createObjectURL(data));
      audio.current.onended = () => setState("paused");
      await audio.current.play();
      setState("playing");
    } catch (e) {
      toast.error((e as Error).message);
      setState("idle");
    }
  }

  return (
    <aside className="rounded-2xl border border-border bg-card p-4" aria-label="Recap">
      <div className="flex items-start gap-3">
        <History className="mt-0.5 size-5 shrink-0 text-foil" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Welcome back</p>
          <p className="mt-1 text-sm text-muted-foreground">{text ?? "Hear a 20-second recap of where you left off."}</p>
        </div>
        <button type="button" onClick={() => setDismissed(true)} className="-m-2 flex size-11 items-center justify-center text-muted-foreground" aria-label="Dismiss recap">
          <X className="size-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={play}
        disabled={state === "loading"}
        className="mt-3 flex h-11 items-center gap-2 rounded-full border border-foil/60 px-4 text-sm text-foreground hover:bg-accent/40"
      >
        {state === "loading" ? <Loader2 className="size-4 animate-spin" /> : state === "playing" ? <Pause className="size-4" /> : <Play className="size-4" />}
        {state === "loading" ? "Writing your recap…" : state === "playing" ? "Pause recap" : "Play recap"}
      </button>
    </aside>
  );
}
