import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { SUPABASE_URL } from "@/lib/env";
import { currentStreak, dayKey, minutesByDay } from "@/lib/stats/streak";

/**
 * Daily (Vercel cron): nudges you if you haven't met today's goal. Runs without a user session,
 * so it needs SUPABASE_SECRET_KEY to read the reminder settings.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const secret = process.env.SUPABASE_SECRET_KEY;
  const vapidPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPriv = process.env.VAPID_PRIVATE_KEY;
  if (!secret || !vapidPub || !vapidPriv) return Response.json({ skipped: "Reminders aren't configured." }, { status: 501 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:reminders@example.com", vapidPub, vapidPriv);
  const admin = createClient(SUPABASE_URL, secret, { auth: { persistSession: false } });
  const { data: settings } = await admin.from("ab_settings").select("user_id,daily_goal_min,timezone,push_subscription").not("push_subscription", "is", null);

  let sent = 0;
  for (const s of settings ?? []) {
    const since = new Date(Date.now() - 40 * 86400_000).toISOString();
    const { data: sessions } = await admin.from("ab_sessions").select("started_at,seconds").eq("user_id", s.user_id).gte("started_at", since);
    const byDay = minutesByDay(sessions ?? [], s.timezone);
    const today = dayKey(new Date(), s.timezone);
    const done = byDay.get(today) ?? 0;
    if (done >= s.daily_goal_min) continue;
    const streak = currentStreak(byDay, s.daily_goal_min, today);
    const left = Math.ceil(s.daily_goal_min - done);
    const body = streak > 0 ? `${left} minutes keeps your ${streak}-day streak going.` : `${left} minutes of listening today?`;
    try {
      await webpush.sendNotification(s.push_subscription, JSON.stringify({ title: "Pageturn", body, url: "/" }));
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("ab_settings").update({ push_subscription: null }).eq("user_id", s.user_id);
    }
  }
  return Response.json({ sent });
}
