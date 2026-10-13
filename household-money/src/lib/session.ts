import { secureCookies } from "@/lib/env";
import "server-only";
import { cookies, headers } from "next/headers";
import type { Membership, Session, User } from "@prisma/client";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { SESSION_TTL_MS, sessionState, shouldTouch, type SessionState } from "./session-state";
import type { Viewer } from "./permissions";

export const SESSION_COOKIE = "hm_session";

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, mfaPassed: boolean): Promise<Session> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  const session = await db.session.create({
    data: { tokenHash: sha256(token), userId, mfaPassed, expiresAt, userAgent: ua },
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  return session;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type SessionWithUser = Session & { user: User & { membership: Membership | null } };

export async function readSession(): Promise<{
  session: SessionWithUser;
  state: SessionState;
} | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { membership: true } } },
  });
  if (!session) return null;
  const state = sessionState(session);
  if (state === "expired") {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return { session, state };
}

/** Record user activity (keeps the session from auto-locking). Never unlocks a locked session. */
export async function touchSession(session: Session): Promise<void> {
  if (sessionState(session) !== "active" || !shouldTouch(session)) return;
  await db.session.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } });
}

export async function lockSession(sessionId: string): Promise<void> {
  await db.session.update({ where: { id: sessionId }, data: { lastActiveAt: new Date(0) } });
}

export interface AuthContext {
  user: User;
  session: Session;
  viewer: Viewer;
}

export function toViewer(user: User, membership: Membership): Viewer {
  return { userId: user.id, householdId: membership.householdId, role: membership.role };
}

/** Resolve the current authenticated, unlocked, household-member context or a reason it failed. */
export async function getAuth(): Promise<
  | { ok: true; ctx: AuthContext }
  | { ok: false; reason: "anonymous" | "mfa_pending" | "locked" | "no_household" }
> {
  const r = await readSession();
  if (!r) return { ok: false, reason: "anonymous" };
  if (r.state === "mfa_pending") return { ok: false, reason: "mfa_pending" };
  if (r.state === "locked") return { ok: false, reason: "locked" };
  const { session } = r;
  if (!session.user.membership) return { ok: false, reason: "no_household" };
  await touchSession(session);
  return {
    ok: true,
    ctx: { user: session.user, session, viewer: toViewer(session.user, session.user.membership) },
  };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
