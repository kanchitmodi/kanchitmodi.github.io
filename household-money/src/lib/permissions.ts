/**
 * Visibility & permission rules — the single source of truth. Every API route, page, report and
 * (later) AI prompt builder must go through these functions. Pure: no DB access, fully unit-tested.
 */

export type OwnerType = "INDIVIDUAL" | "JOINT";
export type Visibility = "SHARED" | "PRIVATE";
export type PrivateMode = "BALANCE_ONLY" | "HIDDEN";
export type Role = "OWNER" | "MEMBER";

export interface Viewer {
  userId: string;
  householdId: string;
  role: Role;
}

export interface AccountAcl {
  householdId: string;
  ownerType: OwnerType;
  ownerUserId: string | null;
  visibility: Visibility;
  privateMode: PrivateMode;
}

/** full = everything; balance = balance only (no name, number or transactions); none = invisible. */
export type AccountAccess = "full" | "balance" | "none";

export function accountAccess(viewer: Viewer, a: AccountAcl): AccountAccess {
  if (a.householdId !== viewer.householdId) return "none";
  if (a.ownerType === "JOINT") return "full";
  if (a.ownerUserId === viewer.userId) return "full";
  if (a.ownerUserId === null) return "full"; // orphaned (owner left): household data
  if (a.visibility === "SHARED") return "full";
  return a.privateMode === "BALANCE_ONLY" ? "balance" : "none";
}

export function canSeeTransactions(viewer: Viewer, a: AccountAcl): boolean {
  return accountAccess(viewer, a) === "full";
}

/** Only the account's owner may change its visibility. Joint accounts are always shared. */
export function canChangeVisibility(viewer: Viewer, a: AccountAcl): boolean {
  return (
    a.householdId === viewer.householdId &&
    a.ownerType === "INDIVIDUAL" &&
    a.ownerUserId === viewer.userId
  );
}

/** Editing transactions/notes/categories: anyone with full access. */
export function canEditTransactions(viewer: Viewer, a: AccountAcl): boolean {
  return canSeeTransactions(viewer, a);
}

export function canManageHousehold(viewer: Viewer): boolean {
  return viewer.role === "OWNER";
}

// ---------- Scope (global switcher: Household / Kanchit / Wife) ----------

export type Scope = { kind: "household" } | { kind: "person"; userId: string };

export function parseScope(raw: string | undefined | null, memberIds: string[]): Scope {
  if (raw && raw !== "household" && memberIds.includes(raw)) return { kind: "person", userId: raw };
  return { kind: "household" };
}

export function scopeKey(scope: Scope): string {
  return scope.kind === "household" ? "household" : scope.userId;
}

/** Is the account part of the selected scope? Joint accounts belong to both people. */
export function accountInScope(
  scope: Scope,
  a: Pick<AccountAcl, "ownerType" | "ownerUserId">,
): boolean {
  if (scope.kind === "household") return true;
  return a.ownerType === "JOINT" || a.ownerUserId === scope.userId;
}

/**
 * Is a transaction attributed to the person in scope? Spender wins; if no spender is recorded
 * we fall back to the account owner (joint accounts without a spender count for both).
 */
export function txnInScope(
  scope: Scope,
  t: { spenderUserId: string | null },
  a: Pick<AccountAcl, "ownerType" | "ownerUserId">,
): boolean {
  if (scope.kind === "household") return true;
  if (t.spenderUserId) return t.spenderUserId === scope.userId;
  return accountInScope(scope, a);
}

/** Share (0..1) of an account's balance attributed to the scope. */
export function balanceShare(
  scope: Scope,
  a: Pick<AccountAcl, "ownerType" | "ownerUserId">,
  household: { ownerUserId: string; jointSplitPct: number },
): number {
  if (scope.kind === "household") return 1;
  if (a.ownerType === "JOINT") {
    const ownerShare = household.jointSplitPct / 100;
    return scope.userId === household.ownerUserId ? ownerShare : 1 - ownerShare;
  }
  return a.ownerUserId === scope.userId ? 1 : 0;
}

/**
 * Cents of an account's balance attributed to the scope. Joint balances are split so the two
 * people's shares always sum exactly to the balance (owner share rounded, member gets the rest).
 */
export function attributedCents(
  scope: Scope,
  a: Pick<AccountAcl, "ownerType" | "ownerUserId"> & { balanceCents: number },
  household: { ownerUserId: string; jointSplitPct: number },
): number {
  if (scope.kind === "household") return a.balanceCents;
  if (a.ownerType === "JOINT") {
    const ownerPart = Math.round((a.balanceCents * household.jointSplitPct) / 100);
    return scope.userId === household.ownerUserId ? ownerPart : a.balanceCents - ownerPart;
  }
  return a.ownerUserId === scope.userId ? a.balanceCents : 0;
}
