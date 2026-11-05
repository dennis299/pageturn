import { HttpError, jsonError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { LimitsBody } from "@/lib/admin/schemas";

async function requireOwner() {
  const { user } = await requireUser();
  if (user.role !== "owner") throw new HttpError(403, "Only the owner can manage guests.");
}

/** Changes a guest's limits. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/guests/[id]">) {
  try {
    await requireOwner();
    const { id } = await ctx.params;
    const b = LimitsBody.parse(await request.json());
    const { error } = await createAdminClient().from("ab_user_limits").upsert({
      user_id: id,
      free_voices_only: b.freeVoicesOnly,
      monthly_audio_minutes: b.monthlyAudioMinutes,
      max_books: b.maxBooks,
      note: b.note ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

/** Removes a guest's access (their account itself stays, because it may be used by another app in this project). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/guests/[id]">) {
  try {
    await requireOwner();
    const { id } = await ctx.params;
    const admin = createAdminClient();
    const { data, error: getErr } = await admin.auth.admin.getUserById(id);
    if (getErr) throw getErr;
    const meta = { ...(data.user.app_metadata ?? {}) } as Record<string, unknown>;
    delete meta.pageturn;
    const { error } = await admin.auth.admin.updateUserById(id, { app_metadata: { ...meta, pageturn: null } });
    if (error) throw error;
    await admin.from("ab_user_limits").delete().eq("user_id", id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
