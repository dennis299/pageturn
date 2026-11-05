"use server";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { ALLOWED_EMAILS } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function logIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  if (!isAllowedEmail(email, ALLOWED_EMAILS)) return { error: "This app is private. That email isn't on the list." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match." };
  redirect("/");
}
