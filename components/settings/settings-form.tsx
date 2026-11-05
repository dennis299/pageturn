"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Bell, BellOff, Loader2, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { listOfflineBooks, offlineUsage, removeDownload, type OfflineSnapshot } from "@/lib/offline/books";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const GOALS = [10, 15, 20, 30, 45, 60, 90];

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function Section({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 className="font-medium">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsForm({ goal: initialGoal, push: initialPush, email }: { goal: number; push: boolean; email: string }) {
  const [goal, setGoal] = useState(initialGoal);
  const [push, setPush] = useState(initialPush);
  const [pushBusy, setPushBusy] = useState(false);
  const [credits, setCredits] = useState<{ remaining: number; limit: number; resetsAt: string | null } | null>(null);
  const [downloads, setDownloads] = useState<OfflineSnapshot[] | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser, so mark the choice after mounting.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    api<{ remaining: number; limit: number; resetsAt: string | null }>("/api/elevenlabs/credits").then(setCredits).catch(() => {});
    listOfflineBooks().then(setDownloads).catch(() => setDownloads([]));
    offlineUsage().then(setUsage);
  }, []);

  async function saveGoal(g: number) {
    setGoal(g);
    const { data: u } = await createClient().auth.getUser();
    const { error } = await createClient().from("ab_settings").upsert({ user_id: u.user!.id, daily_goal_min: g, updated_at: new Date().toISOString() });
    if (error) toast.error("Couldn't save your goal.");
    else toast.success(`Daily goal set to ${g} minutes`);
  }

  async function togglePush() {
    setPushBusy(true);
    try {
      if (push) {
        const reg = await navigator.serviceWorker.ready;
        await (await reg.pushManager.getSubscription())?.unsubscribe();
        await api("/api/push/subscribe", { method: "DELETE" });
        setPush(false);
        toast.success("Reminders off");
        return;
      }
      if (!vapid) throw new Error("Reminders need VAPID keys in the app's environment.");
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error("This browser can't show reminders. On iPhone, add Pageturn to your Home Screen first.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are blocked for this site.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
      await api("/api/push/subscribe", { method: "POST", json: { subscription: sub.toJSON() } });
      setPush(true);
      toast.success("Reminders on");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Section title="Daily goal" description="Minutes of listening a day. Meeting it keeps your streak going.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Daily goal in minutes">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={g === goal}
              onClick={() => saveGoal(g)}
              className={cn("tabular h-11 min-w-14 rounded-lg border px-3 font-mono text-sm", g === goal ? "border-foil bg-accent/50" : "border-border")}
            >
              {g}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Daily reminder"
        description="One nudge in the evening if you haven't reached your goal yet. On iPhone this works once Pageturn is added to your Home Screen (Share → Add to Home Screen)."
      >
        <Button variant="outline" className="h-11" onClick={togglePush} disabled={pushBusy}>
          {pushBusy ? <Loader2 className="animate-spin" aria-hidden /> : push ? <BellOff aria-hidden /> : <Bell aria-hidden />}
          {push ? "Turn reminders off" : "Turn reminders on"}
        </Button>
      </Section>

      <Section title="ElevenLabs credits" description="Shared with your YouTube narration.">
        {credits ? (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={credits.remaining} aria-valuemax={credits.limit} aria-label="Credits left">
              <div className="h-full bg-chart-mark" style={{ width: `${(credits.remaining / Math.max(1, credits.limit)) * 100}%` }} />
            </div>
            <p className="tabular mt-2 font-mono text-sm">
              {credits.remaining.toLocaleString("en-US")} of {credits.limit.toLocaleString("en-US")} left
              {credits.resetsAt && <span className="text-muted-foreground"> · resets {new Date(credits.resetsAt).toLocaleDateString()}</span>}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Checking…</p>
        )}
      </Section>

      <Section title="Downloads" description={usage !== null ? `About ${(usage / 1e6).toFixed(0)} MB stored on this device.` : undefined}>
        {downloads === null ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : downloads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing downloaded. Use “Download” in a book&apos;s menu before a flight.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {downloads.map((d) => (
              <li key={d.book.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.book.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.chapterIdxs.length} {d.chapterIdxs.length === 1 ? "chapter" : "chapters"}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={`Remove downloads for ${d.book.title}`}
                  onClick={async () => {
                    await removeDownload(d.book.id);
                    setDownloads((xs) => xs?.filter((x) => x.book.id !== d.book.id) ?? null);
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {(["system", "dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={mounted && theme === t}
              onClick={() => setTheme(t)}
              className={cn("h-11 rounded-lg border text-sm capitalize", mounted && theme === t ? "border-foil bg-accent/50" : "border-border")}
            >
              {t === "system" ? "Automatic" : t === "dark" ? "Night" : "Day"}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Account" description={email}>
        <form action="/auth/signout" method="post">
          <Button variant="outline" type="submit" className="h-11">
            <LogOut aria-hidden /> Log out
          </Button>
        </form>
      </Section>
    </div>
  );
}
