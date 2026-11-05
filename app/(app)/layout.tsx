import { AppShell } from "@/components/app-shell";
import { PlayerProvider } from "@/components/player/player-provider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <PlayerProvider>
      <AppShell>{children}</AppShell>
    </PlayerProvider>
  );
}
