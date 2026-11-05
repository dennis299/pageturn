import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accessRole } from "@/lib/auth/claims";
import { ALLOWED_EMAILS, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/** Refreshes the Supabase session cookie and gates every page behind the allowlist. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Verifies the token locally (ES256 signing key) and refreshes it when it has expired.
  const { data } = await supabase.auth.getClaims();
  const allowed = accessRole(data?.claims, ALLOWED_EMAILS) !== null;
  if (!allowed) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
