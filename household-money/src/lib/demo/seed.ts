import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../password";
import { encrypt } from "../crypto";
import { createHouseholdFor } from "../household";
import { generateDemo, type DemoPerson } from "./generator";

/** Demo-only credentials. Never used outside DEMO_MODE. */
export const DEMO_PASSWORD = "demo-password-123";
export const DEMO_USERS: Record<
  DemoPerson,
  { email: string; name: string; totpSecret: string; color: string }
> = {
  kanchit: {
    email: "kanchit@demo.local",
    name: "Kanchit",
    totpSecret: "JBSWY3DPEHPK3PXP",
    color: "#2563eb",
  },
  wife: {
    email: "wife@demo.local",
    name: "Wife",
    totpSecret: "KRSXG5CTMVRXEZLU",
    color: "#db2777",
  },
};

export async function seedDemoHousehold(
  db: PrismaClient,
  opts: { endDate: string; months?: number },
) {
  const emails = Object.values(DEMO_USERS).map((u) => u.email);
  // Idempotent: wipe any previous demo household and its users.
  await db.household.deleteMany({ where: { isDemo: true } });
  await db.user.deleteMany({ where: { email: { in: emails } } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = {} as Record<DemoPerson, { id: string }>;
  for (const person of ["kanchit", "wife"] as const) {
    const u = DEMO_USERS[person];
    users[person] = await db.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        totpSecretEnc: encrypt(u.totpSecret),
        totpEnabled: true,
        avatarColor: u.color,
      },
      select: { id: true },
    });
  }

  const household = await createHouseholdFor(db, users.kanchit.id, "Modi Household");
  await db.household.update({ where: { id: household.id }, data: { isDemo: true } });
  await db.membership.create({
    data: { householdId: household.id, userId: users.wife.id, role: "MEMBER" },
  });

  const data = generateDemo({ endDate: opts.endDate, months: opts.months ?? 12 });
  const categories = await db.category.findMany({ where: { householdId: household.id } });
  const catId = new Map(categories.map((c) => [c.name, c.id]));
  const syncedAt = new Date();

  const accountId = new Map<string, string>();
  for (const a of data.accounts) {
    const created = await db.account.create({
      data: {
        householdId: household.id,
        configKey: a.key,
        name: a.name,
        institution: a.institution,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
        ownerType: a.owner === "joint" ? "JOINT" : "INDIVIDUAL",
        ownerUserId: a.owner === "joint" ? null : users[a.owner].id,
        visibility: a.visibility,
        privateMode: a.privateMode,
        connectionMode: a.connectionMode,
        syncTier: a.syncTier,
        balanceCents: data.balances[a.key] ?? 0,
        balanceUpdatedAt: syncedAt,
        lastSyncedAt: a.connectionMode === "MANUAL" ? null : syncedAt,
      },
    });
    accountId.set(a.key, created.id);
  }

  await db.transaction.createMany({
    data: data.txns.map((t) => ({
      householdId: household.id,
      accountId: accountId.get(t.accountKey) as string,
      date: new Date(`${t.date}T00:00:00Z`),
      amountCents: t.amountCents,
      merchantRaw: t.merchant.toUpperCase(),
      merchant: t.merchant,
      categoryId: catId.get(t.category) ?? null,
      spenderUserId: users[t.spender].id,
      isTransfer: t.isTransfer,
      source: "DEMO" as const,
      externalId: t.externalId,
    })),
  });

  await db.auditLog.create({
    data: {
      householdId: household.id,
      actorUserId: users.kanchit.id,
      action: "demo.seed",
      details: { endDate: opts.endDate, txns: data.txns.length },
    },
  });

  return { householdId: household.id, users, txnCount: data.txns.length };
}
