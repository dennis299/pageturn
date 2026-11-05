import { cn } from "@/lib/utils";

/** Today's listening against the daily goal, as a ring with the minutes in the middle. */
export function GoalRing({ minutes, goal, size = 56, className }: { minutes: number; goal: number; size?: number; className?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, goal ? minutes / goal : 0);
  const done = minutes >= goal;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} role="img" aria-label={`${Math.floor(minutes)} of ${goal} minutes today`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--chart-mark)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`}
        />
      </svg>
      <span className="tabular absolute inset-0 flex flex-col items-center justify-center font-mono leading-none">
        <span className={cn("text-sm", done && "text-foil")}>{Math.floor(minutes)}</span>
        <span className="mt-0.5 text-[9px] text-muted-foreground">/{goal}m</span>
      </span>
    </div>
  );
}
