import { CreateGuestBody } from "@/lib/admin/schemas";
import { HttpError, jsonError } from "@/lib/http";
import { allUsers, createAdminClient, isGuest } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";


async function requireOwner() {
  const { user } = await requireUser();
  if (user.role !== "owner") throw new HttpError(403, "Only the owner can manage guests.");
}

/** Guests with their limits, books and audio used this month. */
export async function GET() {
  try {
    await requireOwner();
    const admin = createAdminClient();
    const guests = (await allUsers(admin)).filter(isGuest);
    const ids = guests.map((g) => g.id);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [{ data: limits }, { data: books }, { data: chunks }] = await Promise.all([
      admin.from("ab_user_limits").select("*").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      admin.from("ab_books").select("user_id").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      admin
        .from("ab_chunks")
        .select("user_id,duration_sec")
        .eq("status", "ready")
        .gte("updated_at", monthStart.toISOString())
        .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    return Response.json(
      guests.map((g) => {
        const l = limits?.find((x) => x.user_id === g.id);
        return {
          id: g.id,
          email: g.email,
          lastSignIn: g.last_sign_in_at ?? null,
          limits: {
            freeVoicesOnly: l?.free_voices_only ?? true,
            monthlyAudioMinutes: l ? l.monthly_audio_minutes : 120,
            maxBooks: l ? l.max_books : 3,
            note: l?.note ?? "",
          },
          books: (books ?? []).filter((b) => b.user_id === g.id).length,
          minutesThisMonth: Math.round(((chunks ?? []).filter((c) => c.user_id === g.id).reduce((s, c) => s + (c.duration_sec ?? 0), 0) / 60) * 10) / 10,
        };
      }),
    );
  } catch (e) {
    return jsonError(e);
  }
}

/**
 * Adds a guest: creates their account with the temporary password (or, if the email already has an
 * account in this shared project, gives it guest access without touching its password), then saves limits.
 */
export async function POST(request: Request) {
  try {
    await requireOwner();
    const b = CreateGuestBody.parse(await request.json());
    const admin = createAdminClient();
    const existing = (await allUsers(admin)).find((u) => u.email?.toLowerCase() === b.email.toLowerCase());
    let id: string;
    let created = false;
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        app_metadata: { ...existing.app_metadata, pageturn: { role: "guest" } },
      });
      if (error) throw error;
      id = existing.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: b.email,
        password: b.password,
        email_confirm: true,
        app_metadata: { pageturn: { role: "guest" } },
      });
      if (error) throw error;
      id = data.user.id;
      created = true;
    }
    const { error } = await admin.from("ab_user_limits").upsert({
      user_id: id,
      free_voices_only: b.freeVoicesOnly,
      monthly_audio_minutes: b.monthlyAudioMinutes,
      max_books: b.maxBooks,
      note: b.note ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return Response.json({ id, created });
  } catch (e) {
    return jsonError(e);
  }
}
