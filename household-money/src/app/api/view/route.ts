import { secureCookies } from "@/lib/env";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { apiHandler, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { householdMembers } from "@/lib/data";
import { parseScope, scopeKey } from "@/lib/permissions";
import { VIEW_COOKIE } from "@/lib/scope-server";

const Body = z.object({ view: z.string().max(64) });

/** Global Household / person switcher. */
export const POST = apiHandler(async (req: Request) => {
  const { viewer } = await requireApiAuth();
  const { view } = await parseBody(req, Body);
  const members = await householdMembers(viewer.householdId);
  const key = scopeKey(
    parseScope(
      view,
      members.map((m) => m.id),
    ),
  );
  (await cookies()).set(VIEW_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ view: key });
});
