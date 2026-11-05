"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/** Lets anyone (especially a guest with a temporary password) set their own password. */
export function ChangePassword() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPw("");
    toast.success("Password changed");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="new-password">New password</Label>
      <div className="flex gap-2">
        <Input id="new-password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11 text-base" />
        <Button className="h-11 shrink-0" onClick={save} disabled={busy || pw.length < 8}>
          {busy && <Loader2 className="animate-spin" aria-hidden />} Change
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">At least 8 characters.</p>
    </div>
  );
}
