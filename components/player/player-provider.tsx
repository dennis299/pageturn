"use client";
import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { initialPlayerState, PlayerStore, type PlayerState } from "@/lib/player/store";

const Ctx = createContext<PlayerStore | null>(null);

/** One player for the whole app, so audio keeps playing while you browse your shelf. */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState<PlayerStore | null>(() => (typeof window !== "undefined" ? new PlayerStore() : null));
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function usePlayerStore(): PlayerStore | null {
  return useContext(Ctx);
}

const empty: PlayerState = initialPlayerState;

/** Subscribe to a slice of the player state. */
export function usePlayer<T>(select: (s: PlayerState) => T): T {
  const store = useContext(Ctx);
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    () => select(store ? store.getState() : empty),
    () => select(empty),
  );
}
