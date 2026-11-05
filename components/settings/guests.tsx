"use client";
import { useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type Limits = { freeVoicesOnly: boolean; monthlyAudioMinutes: number | null; maxBooks: number | null; note?: string };
type Guest = { id: string; email: string; lastSignIn: string | null; limits: Limits; books: number; minutesThisMonth: number };

const DEFAULTS: Limits = { freeVoicesOnly: true, monthlyAudioMinutes: 120, maxBooks: 3 };

function LimitFields({ value, onChange, idPrefix }: { value: Limits; onChange: (l: Limits) => void; idPrefix: string }) {
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-min`}>New audio a month (minutes)</Label>
        <Input
          id={`${idPrefix}-min`}
          inputMode="numeric"
          value={value.monthlyAudioMinutes ?? ""}
          placeholder="No limit"
          onChange={(e) => onChange({ ...value, monthlyAudioMinutes: num(e.target.value) })}
          className="h-11 text-base"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-books`}>Books at once</Label>
        <Input
          id={`${idPrefix}-books`}
          inputMode="numeric"
          value={value.maxBooks ?? ""}
          placeholder="No limit"
          onChange={(e) => onChange({ ...value, maxBooks: num(e.target.value) })}
          className="h-11 text-base"
        />
      </div>
      <label className="col-span-2 flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-[var(--foil)]"
          checked={value.freeVoicesOnly}
          onChange={(e) => onChange({ ...value, freeVoicesOnly: e.target.checked })}
        />
        Free voices only (never ElevenLabs or paid voices)
      </label>
    </div>
  );
}

function GuestRow({ guest, onChanged }: { guest: Guest; onChanged: () => void }) {
  const [limits, setLimits] = useState<Limits>(guest.limits);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(limits) !== JSON.stringify(guest.limits);

  async function save() {
    setBusy(true);
    try {
      await api(`/api/admin/guests/${guest.id}`, { method: "PATCH", json: limits });
      toast.success(`Saved limits for ${guest.email}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${guest.email}'s access to Pageturn? Their books stay stored but they can't log in here.`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/guests/${guest.id}`, { method: "DELETE" });
      toast.success(`Removed ${guest.email}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  const cap = guest.limits.monthlyAudioMinutes;
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{guest.email}</p>
          <p className="tabular font-mono text-xs text-muted-foreground">
            {guest.books} {guest.books === 1 ? "book" : "books"} · {guest.minutesThisMonth}
            {cap !== null ? ` / ${cap}` : ""} min this month · {guest.lastSignIn ? `last in ${new Date(guest.lastSignIn).toLocaleDateString()}` : "never logged in"}
          </p>
        </div>
        <Button variant="ghost" size="icon-lg" className="size-11 shrink-0" onClick={remove} disabled={busy} aria-label={`Remove ${guest.email}`}>
          <Trash2 />
        </Button>
      </div>
      <LimitFields value={limits} onChange={setLimits} idPrefix={guest.id} />
      {dirty && (
        <Button className="h-11 self-start" onClick={save} disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />} Save limits
        </Button>
      )}
    </li>
  );
}

/** Owner-only: invite people to try Pageturn and cap what they can use. */
export function GuestsSection() {
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [limits, setLimits] = useState<Limits>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<Guest[]>("/api/admin/guests")
      .then((g) => {
        setGuests(g);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [reload]);

  async function add() {
    setBusy(true);
    try {
      const r = await api<{ created: boolean }>("/api/admin/guests", { method: "POST", json: { email: email.trim(), password, ...limits } });
      toast.success(r.created ? `Added ${email}. Send them the email and password.` : `${email} already had an account. It now has guest access with its own password.`);
      setEmail("");
      setPassword("");
      setLimits(DEFAULTS);
      setAdding(false);
      setReload((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 className="font-medium">Guests</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Let someone try Pageturn with their own private shelf. You set their limits; they never see your books or use your paid voices unless you allow it.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>
      ) : guests === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {guests.length === 0 && <li className="py-3 text-sm text-muted-foreground">No guests yet.</li>}
          {guests.map((g) => (
            <GuestRow key={g.id} guest={g} onChanged={() => setReload((n) => n + 1)} />
          ))}
        </ul>
      )}

      {!error &&
        (adding ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-email">Their email</Label>
              <Input id="guest-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base" autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-pass">Temporary password (8+ characters)</Label>
              <Input id="guest-pass" type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 font-mono text-base" autoComplete="off" />
              <p className="text-xs text-muted-foreground">Send it to them yourself. They can change it in Settings after logging in.</p>
            </div>
            <LimitFields value={limits} onChange={setLimits} idPrefix="new" />
            <div className="flex gap-2">
              <Button variant="outline" className="h-11" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button className="h-11" onClick={add} disabled={busy || !email.includes("@") || password.length < 8}>
                {busy && <Loader2 className="animate-spin" aria-hidden />} Add guest
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="mt-4 h-11" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden /> Add a guest
          </Button>
        ))}
    </section>
  );
}
