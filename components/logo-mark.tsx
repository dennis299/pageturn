import { cn } from "@/lib/utils";

/** The Pageturn mark: a gold P whose stem becomes a red bookmark ribbon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="58 28 140 204" className={cn("h-7 w-auto shrink-0", className)} aria-hidden focusable="false">
      <path fill="var(--logo-gold)" fillRule="evenodd" d="M64 33 H130 A62 62 0 0 1 130 157 H64 Z M112 75 H130 A20 20 0 0 1 130 115 H112 Z" />
      <path fill="var(--logo-ribbon)" d="M64 157 H112 V227 L88 203 L64 227 Z" />
    </svg>
  );
}
