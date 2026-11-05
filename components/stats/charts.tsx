"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
const mins = (m: number) => (m < 1 && m > 0 ? "<1 min" : `${Math.round(m)} min`);

/** Minutes per day for the last 14 days, with the daily goal as a dashed rule. */
export function MinutesBars({ data, goal }: { data: { day: string; minutes: number }[]; goal: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 380;
  const H = 180;
  const pad = { t: 18, r: 6, b: 24, l: 26 };
  const max = Math.max(goal * 1.25, ...data.map((d) => d.minutes), 10);
  const step = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(6, step - 4);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Minutes listened per day for the last 14 days. Goal ${goal} minutes.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * step + (step - bw) / 2;
          const top = y(d.minutes);
          const hgt = Math.max(0, y(0) - top);
          return (
            <g key={d.day} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" />
              {hgt > 0 && (
                <path
                  d={`M${x},${y(0)} V${top + Math.min(4, hgt)} q0,-${Math.min(4, hgt)} ${Math.min(4, bw / 2)},-${Math.min(4, hgt)} H${x + bw - Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, hgt)} V${y(0)} Z`}
                  fill="var(--chart-mark)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {(i === 0 || i === data.length - 1 || i === 7) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
                  {i === data.length - 1 ? "Today" : fmtDay(d.day, { day: "numeric", month: "short" })}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--foreground)" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 4" />
        <text x={W - pad.r} y={y(goal) - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">
          Goal {goal} min
        </text>
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${((pad.l + hover * step + step / 2) / W) * 100}%` }}
        >
          <span className="block text-muted-foreground">{fmtDay(h.day, { weekday: "short", day: "numeric", month: "short" })}</span>
          <span className="tabular font-mono">{mins(h.minutes)}</span>
        </div>
      )}
      <DataTable caption="Minutes per day" rows={data.map((d) => [fmtDay(d.day, { weekday: "short", day: "numeric", month: "short" }), mins(d.minutes)])} />
    </figure>
  );
}

/** 12 weeks of listening, one square per day; darker squares mean more minutes. */
export function StreakHeatmap({ weeks, goal, today }: { weeks: { day: string; minutes: number }[][]; goal: number; today: string }) {
  const [hover, setHover] = useState<{ day: string; minutes: number; x: number; y: number } | null>(null);
  const cell = 14;
  const gap = 3;
  const level = (m: number) => (m <= 0 ? 0 : m < goal * 0.5 ? 1 : m < goal ? 2 : m < goal * 2 ? 3 : 4);
  const opacity = [0, 0.3, 0.55, 0.8, 1];
  const labels = ["Mon", "", "Wed", "", "Fri", "", ""];
  const W = 28 + weeks.length * (cell + gap);
  const H = 7 * (cell + gap);
  return (
    <figure className="relative">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width={W * 1.4} className="max-w-full" role="img" aria-label="Listening per day for the last 12 weeks">
          {labels.map((l, i) => (
            <text key={i} x={0} y={i * (cell + gap) + cell - 3} className="fill-muted-foreground text-[9px]">
              {l}
            </text>
          ))}
          {weeks.map((w, wi) =>
            w.map((d, di) => {
              const x = 28 + wi * (cell + gap);
              const y = di * (cell + gap);
              const future = d.day > today;
              return (
                <g key={d.day} onPointerEnter={() => setHover({ ...d, x, y })} onPointerLeave={() => setHover(null)}>
                  <rect x={x} y={y} width={cell} height={cell} rx={3} fill="var(--muted)" opacity={future ? 0.35 : 1} />
                  {!future && level(d.minutes) > 0 && (
                    <rect x={x} y={y} width={cell} height={cell} rx={3} fill="var(--chart-mark)" opacity={opacity[level(d.minutes)]} />
                  )}
                  {d.day === today && <rect x={x - 1} y={y - 1} width={cell + 2} height={cell + 2} rx={4} fill="none" stroke="var(--foreground)" strokeWidth={1} />}
                </g>
              );
            }),
          )}
        </svg>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${((hover.x + cell / 2) / W) * 100}%`, top: hover.y * 1.4 - 4 }}
        >
          <span className="block text-muted-foreground">{fmtDay(hover.day, { weekday: "short", day: "numeric", month: "short" })}</span>
          <span className="tabular font-mono">{mins(hover.minutes)}</span>
          {hover.minutes >= goal && <span className="ml-1 text-foil">· goal met</span>}
        </div>
      )}
      <figcaption className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        Less
        {opacity.map((o, i) => (
          <span key={i} className="relative inline-block size-3 rounded-[3px] bg-muted">
            {o > 0 && <span className="absolute inset-0 rounded-[3px] bg-chart-mark" style={{ opacity: o }} />}
          </span>
        ))}
        More · a full square means you passed your goal
      </figcaption>
      <DataTable
        caption="Minutes per day, last 12 weeks"
        rows={weeks.flat().filter((d) => d.day <= today && d.minutes > 0).map((d) => [fmtDay(d.day, { day: "numeric", month: "short" }), mins(d.minutes)])}
      />
    </figure>
  );
}

function DataTable({ caption, rows }: { caption: string; rows: string[][] }) {
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="inline-flex min-h-9 cursor-pointer items-center">Show as a table</summary>
      <table className="mt-2 w-full max-w-sm text-left">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="py-1">No listening yet.</td>
            </tr>
          )}
          {rows.map(([a, b]) => (
            <tr key={a} className="border-b border-border">
              <th scope="row" className="py-1 font-normal">
                {a}
              </th>
              <td className={cn("tabular py-1 text-right font-mono text-foreground")}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
