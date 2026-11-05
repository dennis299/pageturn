import { z } from "zod";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/supabase/server";

const Body = z.object({
  subscription: z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }),
});

/** Saves this device's push subscription for the daily reminder. */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { subscription } = Body.parse(await request.json());
    const { error } = await supabase
      .from("ab_settings")
      .upsert({ user_id: user.id, push_subscription: subscription, updated_at: new Date().toISOString() });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE() {
  try {
    const { supabase, user } = await requireUser();
    await supabase.from("ab_settings").update({ push_subscription: null }).eq("user_id", user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
