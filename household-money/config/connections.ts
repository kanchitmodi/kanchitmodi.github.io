/**
 * Config-driven connection plan. Adding a new card or bank = add an entry here; no code changes.
 *
 * A "login" maps to at most one Plaid Item (one bank login). Accounts under the same login share
 * the Item. Joint accounts are listed once (under the login that will actually link them).
 */

export type Person = "kanchit" | "wife";
export type Provider = "plaid" | "email" | "csv" | "snaptrade";
export type Tier = "ACTIVE" | "LOW";
export type PlannedAccountType = "CHEQUING" | "SAVINGS" | "CREDIT_CARD" | "INVESTMENT";

export interface PlannedAccount {
  key: string;
  name: string;
  type: PlannedAccountType;
  owner: Person | "joint";
  subtype?: string;
}

export interface PlannedLogin {
  key: string;
  person: Person;
  institution: string;
  provider: Provider;
  /** Used when the primary provider fails or is unavailable */
  fallbacks: Provider[];
  tier: Tier;
  /** Plaid Items this login consumes (0 for email/CSV/SnapTrade) */
  plaidItems: 0 | 1;
  /** Known-flaky on Plaid: verify within 48h, auto-fallback to CSV, re-test monthly */
  flaky?: boolean;
  accounts: PlannedAccount[];
  note?: string;
}

export const PLAID_ITEM_LIMIT = 10;
/** Items to keep free for re-links */
export const PLAID_ITEM_RESERVE = 2;

export const CONNECTIONS: PlannedLogin[] = [
  {
    key: "kanchit-wealthsimple",
    person: "kanchit",
    institution: "Wealthsimple",
    provider: "plaid",
    fallbacks: ["csv"],
    tier: "ACTIVE",
    plaidItems: 1,
    flaky: true,
    accounts: [
      { key: "ws-cash-kanchit", name: "Wealthsimple Cash", type: "CHEQUING", owner: "kanchit" },
      {
        key: "ws-credit-kanchit",
        name: "Wealthsimple Credit Card",
        type: "CREDIT_CARD",
        owner: "kanchit",
      },
      { key: "ws-cash-joint", name: "Wealthsimple Joint Cash", type: "CHEQUING", owner: "joint" },
    ],
  },
  {
    key: "kanchit-rogers",
    person: "kanchit",
    institution: "Rogers Bank",
    provider: "email",
    fallbacks: ["csv"],
    tier: "ACTIVE",
    plaidItems: 0,
    accounts: [
      {
        key: "rogers-mc-kanchit",
        name: "Rogers Mastercard",
        type: "CREDIT_CARD",
        owner: "kanchit",
      },
    ],
    note: "Gmail alerts (label rogers-alerts) + monthly statement CSV/PDF reconcile",
  },
  {
    key: "kanchit-td",
    person: "kanchit",
    institution: "TD",
    provider: "plaid",
    fallbacks: ["csv"],
    tier: "LOW",
    plaidItems: 1,
    accounts: [
      { key: "td-chequing-joint", name: "TD Chequing (Joint)", type: "CHEQUING", owner: "joint" },
      { key: "td-credit-kanchit", name: "TD Credit Card", type: "CREDIT_CARD", owner: "kanchit" },
    ],
  },
  {
    key: "kanchit-cibc",
    person: "kanchit",
    institution: "CIBC",
    provider: "plaid",
    fallbacks: ["csv"],
    tier: "LOW",
    plaidItems: 1,
    accounts: [
      {
        key: "cibc-credit-kanchit",
        name: "CIBC Credit Card",
        type: "CREDIT_CARD",
        owner: "kanchit",
      },
    ],
    note: "Switch to CSV if Plaid Items are tight",
  },
  {
    key: "wife-scotiabank",
    person: "wife",
    institution: "Scotiabank",
    provider: "plaid",
    fallbacks: ["csv"],
    tier: "ACTIVE",
    plaidItems: 1,
    accounts: [
      { key: "scotia-chequing-wife", name: "Scotiabank Chequing", type: "CHEQUING", owner: "wife" },
      {
        key: "scotia-credit-wife",
        name: "Scotiabank Credit Card",
        type: "CREDIT_CARD",
        owner: "wife",
      },
    ],
  },
  {
    key: "wife-pcfinancial",
    person: "wife",
    institution: "PC Financial",
    provider: "plaid",
    fallbacks: ["csv"],
    tier: "ACTIVE",
    plaidItems: 1,
    flaky: true,
    accounts: [
      { key: "pc-mc-wife", name: "PC Financial Mastercard", type: "CREDIT_CARD", owner: "wife" },
    ],
  },
  // ---- Investments via SnapTrade Personal (no Plaid Items) ----
  ...(["kanchit", "wife"] as const).flatMap((person): PlannedLogin[] =>
    (["Wealthsimple", "Questrade", "IBKR"] as const).map((broker) => ({
      key: `${person}-${broker.toLowerCase()}-invest`,
      person,
      institution: broker,
      provider: "snaptrade" as const,
      fallbacks: ["csv"] as Provider[],
      tier: "LOW" as const,
      plaidItems: 0 as const,
      accounts: [
        {
          key: `${broker.toLowerCase()}-invest-${person}`,
          name: `${broker} Investments`,
          type: "INVESTMENT" as const,
          owner: person,
        },
      ],
      note:
        broker === "Questrade"
          ? "Fallback: Questrade official API, then CSV"
          : broker === "IBKR"
            ? "Fallback: IBKR Flex Web Service, then CSV"
            : "Fallback: CSV",
    })),
  ),
];

export interface PlaidUsage {
  used: number;
  limit: number;
  reserve: number;
  available: number;
  byPerson: Record<Person, number>;
}

/** Plaid Items in use (or planned) — shown in Settings as "Plaid Items used X/10". */
export function plaidItemUsage(
  logins: Pick<PlannedLogin, "person" | "provider" | "plaidItems">[] = CONNECTIONS,
): PlaidUsage {
  const byPerson: Record<Person, number> = { kanchit: 0, wife: 0 };
  for (const l of logins) {
    if (l.provider === "plaid") byPerson[l.person] += l.plaidItems;
  }
  const used = byPerson.kanchit + byPerson.wife;
  return {
    used,
    limit: PLAID_ITEM_LIMIT,
    reserve: PLAID_ITEM_RESERVE,
    available: PLAID_ITEM_LIMIT - PLAID_ITEM_RESERVE - used,
    byPerson,
  };
}

/** True if linking `extra` more Items would eat into the re-link reserve. */
export function wouldExceedPlaidBudget(usage: PlaidUsage, extra = 1): boolean {
  return usage.used + extra > usage.limit - usage.reserve;
}
