import "server-only";
import { cookies } from "next/headers";
import { parseScope, type Scope } from "./permissions";
import { householdMembers, type Member } from "./data";
import type { Viewer } from "./permissions";

export const VIEW_COOKIE = "hm_view";

export async function currentScope(viewer: Viewer): Promise<{ scope: Scope; members: Member[] }> {
  const members = await householdMembers(viewer.householdId);
  const raw = (await cookies()).get(VIEW_COOKIE)?.value;
  return {
    scope: parseScope(
      raw,
      members.map((m) => m.id),
    ),
    members,
  };
}

/** API routes: `?view=household|<userId>` overrides the cookie. */
export async function scopeForRequest(
  req: Request,
  viewer: Viewer,
): Promise<{ scope: Scope; members: Member[] }> {
  const view = new URL(req.url).searchParams.get("view");
  if (!view) return currentScope(viewer);
  const members = await householdMembers(viewer.householdId);
  return {
    scope: parseScope(
      view,
      members.map((m) => m.id),
    ),
    members,
  };
}
