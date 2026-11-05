import Link from "next/link";
import { Flame } from "lucide-react";
import { GoalRing } from "@/components/stats/goal-ring";
import { loadToday } from "@/lib/stats/load";
import { requireUser } from "@/lib/supabase/server";

/** Today's minutes and the current streak, linking to the stats page. */
export async function TodayGoal() {
  const { supabase } = await requireUser();
  const t = await loadToday(supabase);
  return (
    <Link href="/stats" className="flex items-center gap-3 rounded-full py-1 pr-1 pl-3 hover:bg-muted" aria-label="Today's listening and streak">
      {t.streak > 0 && (
        <span className="tabular flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Flame className="size-4 text-ribbon" aria-hidden />
          {t.streak}
        </span>
      )}
      <GoalRing minutes={t.minutes} goal={t.goal} size={48} />
    </Link>
  );
}
