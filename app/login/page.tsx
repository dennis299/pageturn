import type { Metadata } from "next";
import { Wordmark } from "@/components/app-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="pt-safe flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Wordmark className="text-4xl" />
        <p className="mt-3 mb-10 text-muted-foreground">Your PDFs, read aloud. Pick up where you left off.</p>
        <LoginForm />
      </div>
    </main>
  );
}
