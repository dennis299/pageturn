"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Keeps the saved time zone in step with this device, so "today" in your stats is your today. */
export function TimezoneSync() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || localStorage.getItem("ab-tz") === tz) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { error } = await supabase.from("ab_settings").upsert({ user_id: data.user.id, timezone: tz, updated_at: new Date().toISOString() });
      if (!error) localStorage.setItem("ab-tz", tz);
    });
  }, []);
  return null;
}
