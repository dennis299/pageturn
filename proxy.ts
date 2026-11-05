import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|manifest.webmanifest|sw.js|icons/|api/cron/|.*\.(?:svg|png|jpg|jpeg|webp|ico|mjs)$).*)",
  ],
};
