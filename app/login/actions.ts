"use server";
import { redirect } from "next/navigation";
import { accessRole } from "@/lib/auth/claims";
import { ALLOWED_EMAILS } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function logIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match." };
  // Owners are allow-listed; guests are accounts the owner created inside the app.
  const { data: claims } = await supabase.auth.getClaims();
  if (!accessRole(claims?.claims, ALLOWED_EMAILS)) {
    await supabase.auth.signOut();
    return { error: "This app is private. Ask the owner for an invite." };
  }
  void data;
  redirect("/");
}
