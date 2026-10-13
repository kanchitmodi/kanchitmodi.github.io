import type { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORIES } from "./demo/generator";

export const HOUSEHOLD_MAX_MEMBERS = 2;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const AVATAR_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706"];

type Tx = PrismaClient | Prisma.TransactionClient;

export async function createHouseholdFor(tx: Tx, userId: string, name: string) {
  const household = await tx.household.create({
    data: {
      name,
      members: { create: { userId, role: "OWNER" } },
      categories: {
        create: DEFAULT_CATEGORIES.map((c, i) => ({
          name: c.name,
          kind: c.kind,
          color: c.color,
          sortOrder: i,
        })),
      },
    },
  });
  return household;
}
