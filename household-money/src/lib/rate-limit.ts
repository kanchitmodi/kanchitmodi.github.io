import { db } from "./db";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 30;

/** Pure decision: block when failures in the window reach the limit. */
export function isLimited(failuresInWindow: number, limit: number): boolean {
  return failuresInWindow >= limit;
}

async function failures(key: string, now: Date): Promise<number> {
  return db.loginAttempt.count({
    where: { key, success: false, createdAt: { gt: new Date(now.getTime() - LOGIN_WINDOW_MS) } },
  });
}

export async function loginBlocked(email: string, ip: string, now = new Date()): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    failures(`email:${email}`, now),
    failures(`ip:${ip}`, now),
  ]);
  return isLimited(byEmail, MAX_FAILURES_PER_EMAIL) || isLimited(byIp, MAX_FAILURES_PER_IP);
}

export async function recordAttempt(email: string, ip: string, success: boolean): Promise<void> {
  await db.loginAttempt.createMany({
    data: [
      { key: `email:${email}`, success },
      { key: `ip:${ip}`, success },
    ],
  });
}
