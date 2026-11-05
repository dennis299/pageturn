import { describe, expect, it } from "vitest";
import { currentStreak, dayKey, lastNDays, minutesByDay } from "@/lib/stats/streak";

describe("minutesByDay", () => {
  it("groups sessions by local day in the given time zone", () => {
    const m = minutesByDay(
      [
        { started_at: "2026-11-05T23:30:00Z", seconds: 600 }, // Nov 6 in Lagos (UTC+1)
        { started_at: "2026-11-05T10:00:00Z", seconds: 1200 },
        { started_at: "2026-11-05T12:00:00Z", seconds: 300 },
      ],
      "Africa/Lagos",
    );
    expect(m.get("2026-11-05")).toBe(25);
    expect(m.get("2026-11-06")).toBe(10);
  });
});

describe("currentStreak", () => {
  const days = (entries: [string, number][]) => new Map(entries);

  it("counts consecutive days meeting the goal ending today", () => {
    expect(currentStreak(days([["2026-11-03", 25], ["2026-11-04", 20], ["2026-11-05", 30]]), 20, "2026-11-05")).toBe(3);
  });

  it("continues from yesterday when today isn't done yet", () => {
    expect(currentStreak(days([["2026-11-03", 25], ["2026-11-04", 20], ["2026-11-05", 5]]), 20, "2026-11-05")).toBe(2);
  });

  it("breaks on a missed day", () => {
    expect(currentStreak(days([["2026-11-02", 25], ["2026-11-04", 20], ["2026-11-05", 30]]), 20, "2026-11-05")).toBe(2);
    expect(currentStreak(days([["2026-11-01", 25]]), 20, "2026-11-05")).toBe(0);
  });

  it("works across month boundaries", () => {
    expect(currentStreak(days([["2026-10-31", 20], ["2026-11-01", 20]]), 20, "2026-11-01")).toBe(2);
  });
});

describe("day helpers", () => {
  it("formats a day key in a time zone", () => {
    expect(dayKey(new Date("2026-11-05T23:30:00Z"), "Africa/Lagos")).toBe("2026-11-06");
  });
  it("lists the last N days ending today, oldest first", () => {
    expect(lastNDays("2026-11-02", 3)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
