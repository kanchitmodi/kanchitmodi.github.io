import type { PrismaClient } from "@prisma/client";
import { randomToken, sha256 } from "./crypto";
import { HOUSEHOLD_MAX_MEMBERS, INVITE_TTL_MS } from "./household";
import { canManageHousehold, type Viewer } from "./permissions";
import { normalizeEmail } from "./auth-service";

export class InviteError extends Error {
  constructor(public code: "forbidden" | "household_full" | "already_member" | "invalid_email") {
    super(code);
  }
}

export async function createInvite(
  db: PrismaClient,
  viewer: Viewer,
  rawEmail: string,
  appUrl: string,
  now = new Date(),
): Promise<{ id: string; email: string; link: string; expiresAt: Date }> {
  if (!canManageHousehold(viewer)) throw new InviteError("forbidden");
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InviteError("invalid_email");
  const [members, pending, existing] = await Promise.all([
    db.membership.count({ where: { householdId: viewer.householdId } }),
    db.invite.count({
      where: {
        householdId: viewer.householdId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
    db.user.findUnique({ where: { email }, include: { membership: true } }),
  ]);
  if (existing?.membership) throw new InviteError("already_member");
  // Re-inviting replaces earlier pending invites rather than counting against the limit.
  await db.invite.updateMany({
    where: { householdId: viewer.householdId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  const stillPending =
    pending -
    (await db.invite.count({
      where: { householdId: viewer.householdId, email, revokedAt: now },
    }));
  if (members + stillPending >= HOUSEHOLD_MAX_MEMBERS) throw new InviteError("household_full");

  const token = randomToken();
  const invite = await db.invite.create({
    data: {
      householdId: viewer.householdId,
      email,
      tokenHash: sha256(token),
      invitedById: viewer.userId,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    },
  });
  await db.auditLog.create({
    data: {
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "household.invite",
      entityType: "invite",
      entityId: invite.id,
      details: { email },
    },
  });
  const link = `${appUrl.replace(/\/$/, "")}/signup?invite=${encodeURIComponent(token)}`;
  return { id: invite.id, email, link, expiresAt: invite.expiresAt };
}
