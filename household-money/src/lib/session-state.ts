/** Pure session lifecycle rules (unit-tested). */

export const IDLE_LOCK_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Only write lastActiveAt if it is older than this (avoids a DB write per request). */
export const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;

export type SessionState = "active" | "locked" | "mfa_pending" | "expired";

export interface SessionLike {
  mfaPassed: boolean;
  expiresAt: Date;
  lastActiveAt: Date;
}

export function sessionState(s: SessionLike, now: Date = new Date()): SessionState {
  if (now.getTime() >= s.expiresAt.getTime()) return "expired";
  if (!s.mfaPassed) return "mfa_pending";
  if (now.getTime() - s.lastActiveAt.getTime() > IDLE_LOCK_MS) return "locked";
  return "active";
}

export function shouldTouch(s: Pick<SessionLike, "lastActiveAt">, now: Date = new Date()): boolean {
  return now.getTime() - s.lastActiveAt.getTime() > ACTIVITY_WRITE_THROTTLE_MS;
}
