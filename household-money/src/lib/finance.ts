/** Deterministic money math (pure). The AI layer will only ever explain numbers computed here. */

import { attributedCents, type OwnerType, type Scope } from "./permissions";

export interface NetWorthAccount {
  ownerType: OwnerType;
  ownerUserId: string | null;
  balanceCents: number;
}

export interface NetWorth {
  assetsCents: number;
  liabilitiesCents: number;
  netCents: number;
}

export function netWorth(
  accounts: NetWorthAccount[],
  scope: Scope,
  household: { ownerUserId: string; jointSplitPct: number },
): NetWorth {
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    const v = attributedCents(scope, a, household);
    if (v >= 0) assets += v;
    else liabilities += -v;
  }
  return { assetsCents: assets, liabilitiesCents: liabilities, netCents: assets - liabilities };
}

export type CategoryKind = "EXPENSE" | "INCOME" | "TRANSFER";

export interface FlowTxn {
  date: string; // YYYY-MM-DD
  amountCents: number;
  isTransfer: boolean;
  categoryKind: CategoryKind | null;
  categoryName?: string | null;
}

/** Spending = outflows in expense categories, net of refunds. Transfers never count. */
export function isSpend(t: FlowTxn): boolean {
  return !t.isTransfer && t.categoryKind !== "TRANSFER" && t.categoryKind !== "INCOME";
}

export function isIncome(t: FlowTxn): boolean {
  return !t.isTransfer && t.categoryKind === "INCOME" && t.amountCents > 0;
}

export interface CashFlow {
  incomeCents: number;
  spendCents: number;
  /** (income - spend) / income in basis points; null when there is no income */
  savingsRateBp: number | null;
}

export function cashFlow(txns: FlowTxn[], from: string, to: string): CashFlow {
  let income = 0;
  let spend = 0;
  for (const t of txns) {
    if (t.date < from || t.date > to) continue;
    if (isIncome(t)) income += t.amountCents;
    else if (isSpend(t)) spend += -t.amountCents;
  }
  return {
    incomeCents: income,
    spendCents: spend,
    savingsRateBp: income > 0 ? Math.round(((income - spend) / income) * 10000) : null,
  };
}

export function spendByCategory(txns: FlowTxn[], from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (t.date < from || t.date > to || !isSpend(t)) continue;
    const k = t.categoryName ?? "Uncategorized";
    out[k] = (out[k] ?? 0) + -t.amountCents;
  }
  return out;
}

/** First and last day ("YYYY-MM-DD") of the month containing `date`. */
export function monthBounds(date: string): { from: string; to: string } {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Today's date in Ontario (America/Toronto) as YYYY-MM-DD. */
export function todayInToronto(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
