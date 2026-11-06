"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VoicePicker, type VoiceChoice } from "@/components/voice/voice-picker";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_ROUTE_ORDER, ROUTE_KEYS, type RouteKey } from "@/lib/tts/route";
import { DEFAULT_PREFS, loadVoicePrefs, type VoicePrefs } from "@/lib/voice-prefs";
import { cn } from "@/lib/utils";

const ROUTE_LABELS: Record<RouteKey, { name: string; note: string }> = {
  openrouter_free: { name: "Free voice (Nadine, OpenRouter)", note: "Free · daily limit" },
  gemini: { name: "Gemini (Sulafat)", note: "Your free AI Studio key · 10 a day" },
  kokoro: { name: "Kokoro (Heart)", note: "≈ $0.28 a book" },
  elevenlabs: { name: "ElevenLabs", note: "Your credits · uses your default ElevenLabs voice, or Jon" },
};

async function saveSettings(patch: Record<string, unknown>) {
  const supabase = createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please log in again.");
  const { error } = await supabase.from("ab_settings").upsert({ user_id: u.user.id, ...patch, updated_at: new Date().toISOString() });
  if (error) throw new Error("Couldn't save. Try again.");
}

/** Settings → Voices: default voice for new books, your auto-route order, and whether paid voices ask first. */
export function VoicesSection({ isOwner }: { isOwner: boolean }) {
  const [prefs, setPrefs] = useState<VoicePrefs | null>(null);
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<VoiceChoice | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      setPrefs(data.user ? await loadVoicePrefs(supabase, data.user.id) : DEFAULT_PREFS);
    });
  }, []);

  if (!prefs) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <h2 className="font-medium">Voices</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const included = prefs.routeOrder ?? DEFAULT_ROUTE_ORDER;
  const excluded = ROUTE_KEYS.filter((k) => !included.includes(k) && (isOwner || k === "openrouter_free" || k === "gemini"));
  const rows: { key: RouteKey; on: boolean }[] = [...included.map((key) => ({ key, on: true })), ...excluded.map((key) => ({ key, on: false }))].filter(
    (r) => isOwner || r.key === "openrouter_free" || r.key === "gemini",
  );

  async function setOrder(next: RouteKey[]) {
    const old = prefs!;
    setPrefs({ ...old, routeOrder: next });
    try {
      await saveSettings({ route_order: next });
    } catch (e) {
      setPrefs(old);
      toast.error((e as Error).message);
    }
  }

  function move(key: RouteKey, dir: -1 | 1) {
    const list = [...included];
    const i = list.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void setOrder(list);
  }

  function toggle(key: RouteKey, on: boolean) {
    const next = on ? [...included, key] : included.filter((k) => k !== key);
    if (!next.length) return toast.error("Keep at least one voice to fall back to.");
    void setOrder(next);
  }

  async function saveDefault() {
    if (!choice) return;
    setSaving(true);
    try {
      const defaultVoice = { provider: choice.provider, voiceId: choice.voiceId, voiceName: choice.voiceName, model: choice.model };
      await saveSettings({ default_voice: defaultVoice });
      setPrefs({ ...prefs!, defaultVoice });
      setPicking(false);
      toast.success(`New books will use ${choice.voiceName}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setAsk(on: boolean) {
    const old = prefs!;
    setPrefs({ ...old, askBeforePaid: on });
    try {
      await saveSettings({ ask_before_paid: on });
    } catch (e) {
      setPrefs(old);
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 className="font-medium">Voices</h2>
      <p className="mt-1 text-sm text-muted-foreground">To change the voice of one book, tap the voice name on its player.</p>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border p-3">
        <Mic className="size-5 shrink-0 text-foil" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Default voice for new books</p>
          <p className="truncate font-medium">{prefs.defaultVoice ? prefs.defaultVoice.voiceName : "Not set (you choose each time)"}</p>
        </div>
        <Button variant="outline" className="h-11" onClick={() => setPicking(true)}>
          Change
        </Button>
      </div>

      <h3 className="mt-6 text-sm font-medium">When a voice runs out, try next</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        If the book&apos;s voice hits its limit or runs out of credit, the next part uses the first voice below that&apos;s switched on, and the rest of the book follows it.
      </p>
      <ol className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border">
        {rows.map((r) => {
          const idx = included.indexOf(r.key);
          return (
            <li key={r.key} className={cn("flex min-h-14 items-center gap-2 px-3 py-2", !r.on && "opacity-60")}>
              <span className="tabular w-5 shrink-0 font-mono text-xs text-muted-foreground">{r.on ? idx + 1 : "–"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{ROUTE_LABELS[r.key].name}</span>
                <span className="block truncate text-xs text-muted-foreground">{ROUTE_LABELS[r.key].note}</span>
              </span>
              {r.on && (
                <>
                  <Button variant="ghost" size="icon-lg" className="size-10" disabled={idx === 0} onClick={() => move(r.key, -1)} aria-label={`Move ${ROUTE_LABELS[r.key].name} up`}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-lg" className="size-10" disabled={idx === included.length - 1} onClick={() => move(r.key, 1)} aria-label={`Move ${ROUTE_LABELS[r.key].name} down`}>
                    <ArrowDown />
                  </Button>
                </>
              )}
              <label className="flex size-11 items-center justify-center">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--foil)]"
                  checked={r.on}
                  onChange={(e) => toggle(r.key, e.target.checked)}
                  aria-label={`Use ${ROUTE_LABELS[r.key].name} as a fallback`}
                />
              </label>
            </li>
          );
        })}
      </ol>

      {isOwner && (
        <label className="mt-5 flex min-h-12 items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--foil)]" checked={prefs.askBeforePaid} onChange={(e) => setAsk(e.target.checked)} />
          <span>
            <span className="block font-medium">Ask before paid chapters</span>
            <span className="block text-xs text-muted-foreground">
              Off: ElevenLabs and other paid voices just keep reading until their credit runs out, then the list above takes over.
            </span>
          </span>
        </label>
      )}

      <Sheet open={picking} onOpenChange={setPicking}>
        <SheetContent side="bottom" className="pb-safe mx-auto max-h-[92dvh] max-w-2xl rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl font-normal">Default voice</SheetTitle>
            <SheetDescription>New books start with this voice. You can still pick another one when you add a book.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            <VoicePicker value={choice} onChange={setChoice} bookChars={450_000} firstChapterChars={30_000} />
            <Button className="h-12 text-base" disabled={!choice || saving} onClick={saveDefault}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {choice ? `Use ${choice.voiceName} for new books` : "Pick a voice"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
