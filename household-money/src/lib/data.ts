import "server-only";
import type { Account, Prisma } from "@prisma/client";
import { db } from "./db";
import {
  accountAccess,
  accountInScope,
  txnInScope,
  type AccountAccess,
  type Scope,
  type Viewer,
} from "./permissions";
import { accountStatus, type AccountStatus } from "./account-status";
import {
  cashFlow,
  monthBounds,
  netWorth,
  todayInToronto,
  type CashFlow,
  type NetWorth,
} from "./finance";

/**
 * Data access layer. Every read of accounts/transactions goes through here so visibility rules
 * are enforced in exactly one place (see permissions.ts).
 */

export interface Member {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  role: "OWNER" | "MEMBER";
}

export async function householdMembers(householdId: string): Promise<Member[]> {
  const ms = await db.membership.findMany({
    where: { householdId },
    include: { user: true },
    orderBy: { joinedAt: "asc" },
  });
  return ms.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    avatarColor: m.user.avatarColor,
    role: m.role,
  }));
}

export interface AccountView {
  id: string;
  access: Exclude<AccountAccess, "none">;
  /** Redacted to "Private account" when access is "balance" */
  name: string;
  institution: string | null;
  mask: string | null;
  type: Account["type"];
  subtype: string | null;
  currency: string;
  ownerType: Account["ownerType"];
  ownerUserId: string | null;
  visibility: Account["visibility"];
  /** Only exposed to the owner */
  privateMode: Account["privateMode"] | null;
  connectionMode: Account["connectionMode"] | null;
  syncTier: Account["syncTier"] | null;
  status: AccountStatus | null;
  balanceCents: number;
  lastSyncedAt: string | null;
}

export function toAccountView(
  viewer: Viewer,
  a: Account,
  access: Exclude<AccountAccess, "none">,
): AccountView {
  const isOwner = a.ownerUserId === viewer.userId;
  if (access === "balance") {
    return {
      id: a.id,
      access,
      name: "Private account",
      institution: null,
      mask: null,
      type: a.type,
      subtype: null,
      currency: a.currency,
      ownerType: a.ownerType,
      ownerUserId: a.ownerUserId,
      visibility: a.visibility,
      privateMode: null,
      connectionMode: null,
      syncTier: null,
      status: null,
      balanceCents: a.balanceCents,
      lastSyncedAt: null,
    };
  }
  return {
    id: a.id,
    access,
    name: a.name,
    institution: a.institution,
    mask: a.mask,
    type: a.type,
    subtype: a.subtype,
    currency: a.currency,
    ownerType: a.ownerType,
    ownerUserId: a.ownerUserId,
    visibility: a.visibility,
    privateMode: isOwner ? a.privateMode : null,
    connectionMode: a.connectionMode,
    syncTier: a.syncTier,
    status: accountStatus(a),
    balanceCents: a.balanceCents,
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
  };
}

/** Accounts the viewer may see (any access), limited to the selected scope. */
export async function listAccounts(viewer: Viewer, scope: Scope): Promise<AccountView[]> {
  const rows = await db.account.findMany({
    where: { householdId: viewer.householdId, archived: false },
    orderBy: [{ type: "asc" }, { institution: "asc" }, { name: "asc" }],
  });
  const out: AccountView[] = [];
  for (const a of rows) {
    const access = accountAccess(viewer, a);
    if (access === "none" || !accountInScope(scope, a)) continue;
    out.push(toAccountView(viewer, a, access));
  }
  return out;
}

/** IDs of accounts whose transactions the viewer may read. */
export async function fullAccessAccounts(viewer: Viewer): Promise<Account[]> {
  const rows = await db.account.findMany({ where: { householdId: viewer.householdId } });
  return rows.filter((a) => accountAccess(viewer, a) === "full");
}

export interface TxnView {
  id: string;
  date: string;
  amountCents: number;
  currency: string;
  merchant: string;
  notes: string | null;
  isTransfer: boolean;
  pending: boolean;
  source: string;
  category: {
    id: string;
    name: string;
    color: string;
    kind: "EXPENSE" | "INCOME" | "TRANSFER";
  } | null;
  account: { id: string; name: string; institution: string };
  spender: { id: string; name: string; avatarColor: string } | null;
}

export interface TxnQuery {
  q?: string;
  accountId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export async function listTransactions(
  viewer: Viewer,
  scope: Scope,
  query: TxnQuery = {},
): Promise<TxnView[]> {
  const accounts = (await fullAccessAccounts(viewer)).filter((a) => accountInScope(scope, a));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let ids = accounts.map((a) => a.id);
  if (query.accountId) ids = ids.filter((id) => id === query.accountId);
  if (ids.length === 0) return [];

  const where: Prisma.TransactionWhereInput = {
    householdId: viewer.householdId,
    accountId: { in: ids },
    ...(scope.kind === "person"
      ? {
          OR: [
            { spenderUserId: scope.userId },
            {
              spenderUserId: null,
              account: { OR: [{ ownerType: "JOINT" }, { ownerUserId: scope.userId }] },
            },
          ],
        }
      : {}),
    ...(query.q ? { merchant: { contains: query.q, mode: "insensitive" as const } } : {}),
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
          },
        }
      : {}),
  };

  const rows = await db.transaction.findMany({
    where,
    include: { category: true, spender: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: Math.min(query.limit ?? 100, 500),
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });

  return rows
    .filter((t) => {
      const a = byId.get(t.accountId);
      return a !== undefined && txnInScope(scope, t, a);
    })
    .map((t) => {
      const a = byId.get(t.accountId) as Account;
      return {
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        amountCents: t.amountCents,
        currency: t.currency,
        merchant: t.merchant,
        notes: t.notes,
        isTransfer: t.isTransfer,
        pending: t.pending,
        source: t.source,
        category: t.category
          ? {
              id: t.category.id,
              name: t.category.name,
              color: t.category.color,
              kind: t.category.kind,
            }
          : null,
        account: { id: a.id, name: a.name, institution: a.institution },
        spender: t.spender
          ? { id: t.spender.id, name: t.spender.name, avatarColor: t.spender.avatarColor }
          : null,
      };
    });
}

export interface HomeSummary {
  netWorth: NetWorth;
  month: CashFlow & { from: string; to: string };
  accountCount: number;
}

export async function homeSummary(viewer: Viewer, scope: Scope): Promise<HomeSummary> {
  const today = todayInToronto();
  const { from, to } = monthBounds(today);
  const [accounts, owner, household] = await Promise.all([
    listAccounts(viewer, scope),
    db.membership.findFirst({ where: { householdId: viewer.householdId, role: "OWNER" } }),
    db.household.findUniqueOrThrow({ where: { id: viewer.householdId } }),
  ]);
  const txns = await listTransactions(viewer, scope, { from, to, limit: 500 });
  return {
    netWorth: netWorth(accounts, scope, {
      ownerUserId: owner?.userId ?? viewer.userId,
      jointSplitPct: household.jointSplitPct,
    }),
    month: {
      from,
      to,
      ...cashFlow(
        txns.map((t) => ({
          date: t.date,
          amountCents: t.amountCents,
          isTransfer: t.isTransfer,
          categoryKind: t.category?.kind ?? null,
        })),
        from,
        to,
      ),
    },
    accountCount: accounts.length,
  };
}
