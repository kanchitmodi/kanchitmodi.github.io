import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { listAccounts, toAccountView } from "@/lib/data";
import { scopeForRequest } from "@/lib/scope-server";
import { CONNECTIONS } from "@config/connections";
import { audit } from "@/lib/audit";

export const GET = apiHandler(async (req: Request) => {
  const { viewer } = await requireApiAuth();
  const { scope } = await scopeForRequest(req, viewer);
  return NextResponse.json({ accounts: await listAccounts(viewer, scope) });
});

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  institution: z.string().trim().min(1).max(60),
  type: z.enum(["CHEQUING", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "LOAN", "OTHER"]),
  subtype: z.enum(["TFSA", "RRSP", "FHSA", "RESP", "NON_REG", "CASH"]).optional(),
  mask: z
    .string()
    .regex(/^\d{4}$/, "Last 4 digits only")
    .optional(),
  joint: z.boolean().default(false),
  currency: z.enum(["CAD", "USD"]).default("CAD"),
  configKey: z.string().max(60).optional(),
});

/** Create a manual (CSV-fed) account. Each person adds their own; joint accounts are added once. */
export const POST = apiHandler(async (req: Request) => {
  const { viewer } = await requireApiAuth();
  const b = await parseBody(req, Body);
  const planned = b.configKey
    ? CONNECTIONS.flatMap((c) => c.accounts.map((a) => ({ ...a, tier: c.tier }))).find(
        (a) => a.key === b.configKey,
      )
    : undefined;
  try {
    const a = await db.account.create({
      data: {
        householdId: viewer.householdId,
        configKey: planned?.key,
        name: b.name,
        institution: b.institution,
        type: b.type,
        subtype: b.type === "INVESTMENT" ? (b.subtype ?? null) : null,
        mask: b.mask ?? null,
        currency: b.currency,
        ownerType: b.joint ? "JOINT" : "INDIVIDUAL",
        ownerUserId: b.joint ? null : viewer.userId,
        connectionMode: "MANUAL",
        syncTier: planned?.tier ?? "LOW",
      },
    });
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "account.create",
      entityType: "account",
      entityId: a.id,
      details: { joint: b.joint, type: b.type },
    });
    return NextResponse.json({ account: toAccountView(viewer, a, "full") }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(
        409,
        "duplicate_account",
        "This account already exists (same institution, type and last 4) — joint accounts are only added once.",
      );
    }
    throw e;
  }
});
