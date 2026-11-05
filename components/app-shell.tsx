"use client";
import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesColumn, LibraryBig, Plus, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MiniPlayer } from "@/components/player/mini-player";
import { TimezoneSync } from "@/components/timezone-sync";
import { LogoMark } from "@/components/logo-mark";

const NAV = [
  { href: "/", label: "Shelf", icon: LibraryBig },
  { href: "/import", label: "Add book", icon: Plus },
  { href: "/stats", label: "Stats", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-serif text-2xl italic tracking-tight", className)}>
      <LogoMark className="h-[1.15em]" />
      Pageturn
    </span>
  );
}

/** One tab: lights up the moment it's pressed, before the next page has arrived. */
function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onPress,
  variant,
}: (typeof NAV)[number] & { active: boolean; onPress: () => void; variant: "rail" | "bar" }) {
  return (
    <Link
      href={href}
      onClick={onPress}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press",
        variant === "rail"
          ? cn(
              "flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-foreground",
            )
          : cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors", active && "text-foreground"),
      )}
    >
      <Icon className={cn(variant === "rail" ? "size-[18px]" : "size-5", variant === "bar" && active && "text-foil")} aria-hidden />
      {label}
      <PendingDot />
    </Link>
  );
}

/** A tiny gold bar under the tab while its page is loading. */
function PendingDot() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={cn("pending-bar", pending && "is-pending")} />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const inPlayer = path.startsWith("/book/");
  // The tab you just tapped, remembered against the page you tapped it on, so it shows as active at once.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const activeHref = tapped && tapped.from === path ? tapped.href : NAV.find((n) => isActive(path, n.href))?.href;
  const items = (variant: "rail" | "bar") =>
    NAV.map((n) => (
      <NavItem
        key={n.href}
        {...n}
        variant={variant}
        active={activeHref === n.href}
        onPress={() => !isActive(path, n.href) && setTapped({ href: n.href, from: path })}
      />
    ));

  return (
    <div className="flex min-h-dvh">
      <TimezoneSync />
      <aside className="app-chrome sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
        <Link href="/" className="px-3">
          <Wordmark />
        </Link>
        <nav className="mt-10 flex flex-col gap-1" aria-label="Main">
          {items("rail")}
        </nav>
        <div className="mt-auto">
          <MiniPlayer variant="rail" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className={cn("flex-1", !inPlayer && "pb-36 md:pb-10")}>{children}</main>
        {!inPlayer && (
          <div className="app-chrome fixed inset-x-0 bottom-0 z-40 md:hidden">
            <MiniPlayer variant="bar" />
            <nav className="pb-safe grid grid-cols-4 border-t border-border bg-background/92 backdrop-blur-md" aria-label="Main">
              {items("bar")}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
