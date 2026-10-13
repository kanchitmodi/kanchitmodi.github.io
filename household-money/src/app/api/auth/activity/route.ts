import { NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { readSession, touchSession } from "@/lib/session";

/** Heartbeat from the client while the user is interacting. Does not unlock a locked session. */
export const POST = apiHandler(async () => {
  const r = await readSession();
  if (!r) throw new ApiError(401, "anonymous");
  if (r.state !== "active") return NextResponse.json({ state: r.state }, { status: 401 });
  await touchSession(r.session);
  return NextResponse.json({ state: "active" });
});
