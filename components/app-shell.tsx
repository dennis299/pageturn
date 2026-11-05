"use client";
import Link from "next/link";
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const inPlayer = path.startsWith("/book/");
  return (
    <div className="flex min-h-dvh">
      <TimezoneSync />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
        <Link href="/" className="px-3">
          <Wordmark />
        </Link>
        <nav className="mt-10 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(path, href) ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                isActive(path, href) && "bg-sidebar-accent font-medium text-sidebar-foreground",
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <MiniPlayer variant="rail" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className={cn("flex-1", !inPlayer && "pb-36 md:pb-10")}>{children}</main>
        {!inPlayer && (
          <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
            <MiniPlayer variant="bar" />
            <nav
              className="pb-safe grid grid-cols-4 border-t border-border bg-background/92 backdrop-blur-md"
              aria-label="Main"
            >
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(path, href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors",
                    isActive(path, href) && "text-foreground",
                  )}
                >
                  <Icon className={cn("size-5", isActive(path, href) && "text-foil")} aria-hidden />
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
