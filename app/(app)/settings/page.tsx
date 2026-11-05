import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";
import { loadSettings } from "@/lib/stats/load";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const s = await loadSettings(supabase);
  return (
    <div className="pt-safe mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 md:py-10">
      <h1 className="font-serif text-3xl sm:text-4xl">Settings</h1>
      <SettingsForm goal={s.goal} push={s.push} email={user.email ?? ""} />
    </div>
  );
}
