"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Play, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ProviderId } from "@/lib/db/types";
import { estimateCost } from "@/lib/tts/cost";
import type { Voice } from "@/lib/tts/types";
import { cn } from "@/lib/utils";

export type VoiceChoice = {
  provider: ProviderId;
  voiceId: string;
  voiceName: string;
  model?: string;
  pricing?: { prompt: number; completion: number };
};

type VoicesResponse = { voices: Voice[]; models?: readonly { id: string; name: string }[]; configured: boolean; allowed?: boolean };
type Credits = { remaining: number; limit: number; resetsAt: string | null };

const TABS: { id: ProviderId; label: string; hint: string }[] = [
  { id: "openrouter", label: "Free & cheap", hint: "OpenRouter" },
  { id: "elevenlabs", label: "ElevenLabs", hint: "Best quality" },
  { id: "gemini", label: "Gemini", hint: "Expressive" },
];

const KEY_NAME: Record<ProviderId, string> = {
  openrouter: "OPENROUTER_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  gemini: "GEMINI_API_KEY",
};

function priceTag(v: Voice): string {
  if (v.free) return "Free";
  const per = estimateCost(450_000, "openrouter", v.model, v.pricing);
  return `${per.label} a book`;
}

/** Choose a provider, model and voice, hear a sample, and see what the book will cost. */
export function VoicePicker({
  value,
  onChange,
  bookChars,
  firstChapterChars,
}: {
  value: VoiceChoice | null;
  onChange: (v: VoiceChoice) => void;
  bookChars: number;
  firstChapterChars: number;
}) {
  // The tab you tapped; until then, the tab of the preselected voice (e.g. your default voice).
  const [pickedTab, setTab] = useState<ProviderId | null>(null);
  const tab: ProviderId = pickedTab ?? value?.provider ?? "openrouter";
  const [data, setData] = useState<Partial<Record<ProviderId, VoicesResponse>>>({});
  const [model, setModel] = useState<Partial<Record<ProviderId, string>>>({});
  const [credits, setCredits] = useState<Credits | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [sampling, setSampling] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (data[tab]) return;
    api<VoicesResponse>(`/api/voices?provider=${tab}`)
      .then((r) => {
        setData((d) => ({ ...d, [tab]: r }));
        if (tab === "openrouter") {
          const firstFree = r.voices.find((v) => v.free) ?? r.voices[0];
          if (firstFree?.model) setModel((m) => ({ ...m, openrouter: m.openrouter ?? firstFree.model }));
        } else if (r.models?.[0]) setModel((m) => ({ ...m, [tab]: m[tab] ?? r.models![0].id }));
      })
      .catch((e) => toast.error(e.message));
    if (tab === "elevenlabs" && !credits) api<Credits>("/api/elevenlabs/credits").then(setCredits).catch(() => {});
  }, [tab, data, credits]);

  useEffect(() => () => audio.current?.pause(), []);

  const current = data[tab];
  const orModels = useMemo(() => {
    if (tab !== "openrouter" || !current) return [];
    const seen = new Map<string, Voice>();
    for (const v of current.voices) if (v.model && !seen.has(v.model)) seen.set(v.model, v);
    return [...seen.values()].sort((a, b) => Number(b.free) - Number(a.free) || (a.pricing?.prompt ?? 0) - (b.pricing?.prompt ?? 0));
  }, [tab, current]);

  const activeModel = model[tab];
  const voices = (current?.voices ?? []).filter((v) => tab !== "openrouter" || v.model === activeModel);
  const sampleModel = (v: Voice) => (tab === "openrouter" ? v.model : activeModel);

  const choose = (v: Voice) =>
    onChange({ provider: tab, voiceId: v.id, voiceName: v.name, model: sampleModel(v), pricing: v.pricing });

  async function sample(v: Voice) {
    const key = `${tab}:${sampleModel(v)}:${v.id}`;
    audio.current?.pause();
    if (playing === key) return setPlaying(null);
    setSampling(key);
    try {
      const res = await fetch("/api/voices/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: tab, voiceId: v.id, model: sampleModel(v) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Sample failed");
      const url = URL.createObjectURL(await res.blob());
      audio.current = new Audio(url);
      audio.current.onended = () => setPlaying(null);
      await audio.current.play();
      setPlaying(key);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSampling(null);
    }
  }

  const chosen = value?.provider === tab ? value : null;
  const costVoice = chosen ?? (voices[0] ? { provider: tab, model: sampleModel(voices[0]), pricing: voices[0].pricing } : null);
  const bookCost = costVoice ? estimateCost(bookChars, tab, costVoice.model, costVoice.pricing) : null;
  const chapterCost = costVoice ? estimateCost(firstChapterChars, tab, costVoice.model, costVoice.pricing) : null;

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Voice provider" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center rounded-lg px-2 text-sm transition-colors",
              tab === t.id ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="text-[10px] tracking-wide text-muted-foreground">{t.hint}</span>
          </button>
        ))}
      </div>

      {current && current.allowed === false && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          These voices aren&apos;t on your account. The free voices work great. Try the first tab.
        </p>
      )}

      {current && !current.configured && (
        <p className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <span>
            Add <code className="font-mono text-xs">{KEY_NAME[tab]}</code> to the app&apos;s environment to use these voices.
            {tab === "openrouter" && " A free key from openrouter.ai/keys works for the free voices."}
          </span>
        </p>
      )}

      {tab === "elevenlabs" && credits && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm">
          <span className="tabular font-mono">{credits.remaining.toLocaleString("en-US")}</span> credits left this month
          <span className="text-muted-foreground"> · shared with your YouTube narration</span>
        </p>
      )}

      {(tab === "openrouter" ? orModels.length > 0 : Boolean(current?.models?.length)) && (
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Model</span>
          <select
            value={activeModel ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              setModel((m) => ({ ...m, [tab]: next }));
              // Keep your picked voice, now with the new model, so "Use …" saves what you see selected.
              if (value?.provider === tab) {
                const same = (current?.voices ?? []).find((v) => v.id === value.voiceId && (tab !== "openrouter" || v.model === next));
                if (same) onChange({ ...value, model: next, pricing: same.pricing });
              }
            }}
            className="h-12 rounded-lg border border-input bg-card px-3 text-base"
          >
            {tab === "openrouter"
              ? orModels.map((v) => (
                  <option key={v.model} value={v.model}>
                    {v.modelName} · {priceTag(v)}
                  </option>
                ))
              : current?.models?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
          </select>
        </label>
      )}

      {!current ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading voices…
        </p>
      ) : (
        <ul className="grid max-h-[22rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="Voices">
          {voices.map((v) => {
            const key = `${tab}:${sampleModel(v)}:${v.id}`;
            const selected = value?.provider === tab && value.voiceId === v.id && value.model === sampleModel(v);
            return (
              <li key={key}>
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-1.5 pl-3 transition-colors",
                    selected ? "border-foil bg-accent/50" : "border-border bg-card hover:bg-accent/30",
                  )}
                >
                  <button type="button" onClick={() => choose(v)} className="flex min-h-11 flex-1 items-center gap-2 text-left" aria-pressed={selected}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{v.name}</span>
                      {v.description && <span className="block truncate text-xs text-muted-foreground">{v.description}</span>}
                    </span>
                    {selected && <Check className="size-4 text-foil" aria-label="Selected" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => sample(v)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
                    aria-label={playing === key ? `Stop ${v.name} sample` : `Play ${v.name} sample`}
                  >
                    {sampling === key ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : playing === key ? (
                      <Square className="size-3.5 fill-current" aria-hidden />
                    ) : (
                      <Play className="size-4 fill-current" aria-hidden />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {bookCost && chapterCost && (
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Whole book</dt>
            <dd className="tabular mt-1 font-mono">{bookCost.label}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">First chapter</dt>
            <dd className="tabular mt-1 font-mono">{chapterCost.label}</dd>
          </div>
          <p className="col-span-2 text-xs text-muted-foreground">
            Audio is made a chapter ahead of where you are, so you only pay for what you listen to.
          </p>
        </dl>
      )}
    </div>
  );
}
