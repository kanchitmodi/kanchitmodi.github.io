import type { PrismaClient } from "@prisma/client";
import { hashPassword, passwordProblem } from "./password";
import { sha256 } from "./crypto";
import { AVATAR_COLORS, HOUSEHOLD_MAX_MEMBERS, createHouseholdFor } from "./household";

export class AuthError extends Error {
  constructor(
    public code:
      | "email_taken"
      | "weak_password"
      | "signup_closed"
      | "invite_invalid"
      | "invite_email_mismatch"
      | "household_full",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Bootstrap signup is open only until the first real (non-demo) household exists. */
export async function bootstrapOpen(db: PrismaClient): Promise<boolean> {
  return (await db.household.count({ where: { isDemo: false } })) === 0;
}

export async function findValidInvite(db: PrismaClient, token: string, now = new Date()) {
  const invite = await db.invite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { household: true },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) return null;
  return invite;
}

/**
 * Create a user. With an invite token they join that household as MEMBER; otherwise (first run only)
 * they become OWNER of a new household. The caller creates the session.
 */
export async function signup(
  db: PrismaClient,
  input: { email: string; name: string; password: string; inviteToken?: string },
): Promise<{ userId: string; householdId: string; role: "OWNER" | "MEMBER" }> {
  const email = normalizeEmail(input.email);
  const problem = passwordProblem(input.password);
  if (problem) throw new AuthError("weak_password", problem);
  if (await db.user.findUnique({ where: { email } })) throw new AuthError("email_taken");
  const passwordHash = await hashPassword(input.password);

  if (input.inviteToken) {
    const invite = await findValidInvite(db, input.inviteToken);
    if (!invite) throw new AuthError("invite_invalid");
    if (normalizeEmail(invite.email) !== email) throw new AuthError("invite_email_mismatch");
    const members = await db.membership.count({ where: { householdId: invite.householdId } });
    if (members >= HOUSEHOLD_MAX_MEMBERS) throw new AuthError("household_full");
    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash,
          avatarColor: AVATAR_COLORS[members] ?? "#64748b",
        },
      });
      await tx.membership.create({
        data: { householdId: invite.householdId, userId: user.id, role: "MEMBER" },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      await tx.auditLog.create({
        data: { householdId: invite.householdId, actorUserId: user.id, action: "household.joined" },
      });
      return { userId: user.id, householdId: invite.householdId, role: "MEMBER" as const };
    });
  }

  if (!(await bootstrapOpen(db))) throw new AuthError("signup_closed");
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash,
        avatarColor: AVATAR_COLORS[0] as string,
      },
    });
    const household = await createHouseholdFor(tx, user.id, `${input.name.trim()}'s Household`);
    await tx.auditLog.create({
      data: { householdId: household.id, actorUserId: user.id, action: "household.created" },
    });
    return { userId: user.id, householdId: household.id, role: "OWNER" as const };
  });
}
