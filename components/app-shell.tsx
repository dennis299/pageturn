"use client";
import { useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesColumn, LibraryBig, Plus, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MiniPlayer } from "@/components/player/mini-player";
import { usePlayerStore } from "@/components/player/player-provider";
import { lastBookId } from "@/lib/player/store";
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
          : cn("nav-item flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors", active && "is-active text-foreground"),
      )}
    >
      {variant === "bar" ? (
        <span className="nav-indicator">
          <Icon className={cn("size-5", active && "text-foil")} aria-hidden />
        </span>
      ) : (
        <Icon className="size-[18px]" aria-hidden />
      )}
      <span className="nav-label">{label}</span>
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
  // The tab bar (and the mini player above it) stays put while you scroll, like a native app. Its
  // real height is measured, so the end of every page always scrolls clear of it.
  const chrome = useRef<HTMLDivElement>(null);
  const [chromeH, setChromeH] = useState<number | null>(null);
  useEffect(() => {
    const el = chrome.current;
    if (!el) return;
    const measure = () => setChromeH(Math.ceil(el.getBoundingClientRect().height));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [inPlayer]);

  // Each screen scrolls inside the frame, so a new screen has to start at its top.
  const scroller = useRef<HTMLElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [path]);

  // The book you had open last waits in the mini player from the moment the app starts, the way a
  // music app comes back with your last album. Nothing is played or made until you press play.
  const store = usePlayerStore();
  useEffect(() => {
    if (!store || store.getState().book || location.pathname.startsWith("/book/")) return;
    const id = lastBookId();
    if (id) void store.open(id, { quiet: true });
  }, [store]);
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
    <div className="app-frame">
      <TimezoneSync />
      <aside className="app-chrome hidden h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
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

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Behind the iPhone status bar: screens scroll under a frosted strip, not under the clock. */}
        <div className="status-scrim app-chrome" aria-hidden />
        <main
          ref={scroller}
          className={cn("app-main app-scroll min-h-0 flex-1", !inPlayer && "with-bottom-chrome")}
          style={chromeH ? ({ "--bottom-chrome": `${chromeH}px` } as React.CSSProperties) : undefined}
        >
          {children}
        </main>
        {!inPlayer && (
          <div ref={chrome} className="app-chrome bottom-chrome absolute inset-x-0 bottom-0 z-40 md:hidden">
            <MiniPlayer variant="bar" />
            <nav className="nav-bar pb-safe grid grid-cols-4 border-t border-border bg-background/92 backdrop-blur-md" aria-label="Main">
              {items("bar")}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
