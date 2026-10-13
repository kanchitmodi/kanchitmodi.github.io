/**
 * Deterministic demo-data generator (pure). Same inputs -> byte-identical output, which lets the
 * golden-dataset tests pin known totals. Amounts are integer cents; dates are UTC "YYYY-MM-DD".
 */

export type DemoPerson = "kanchit" | "wife";

export interface DemoAccount {
  key: string;
  name: string;
  institution: string;
  type: "CHEQUING" | "SAVINGS" | "CREDIT_CARD" | "INVESTMENT";
  subtype?: string;
  mask: string;
  owner: DemoPerson | "joint";
  visibility: "SHARED" | "PRIVATE";
  privateMode: "BALANCE_ONLY" | "HIDDEN";
  connectionMode: "LIVE" | "EMAIL" | "MANUAL";
  syncTier: "ACTIVE" | "LOW";
  openingCents: number;
}

export interface DemoTxn {
  externalId: string;
  accountKey: string;
  date: string;
  amountCents: number;
  merchant: string;
  category: string;
  spender: DemoPerson;
  isTransfer: boolean;
}

export interface DemoData {
  accounts: DemoAccount[];
  txns: DemoTxn[];
  /** Final balance per account key (opening + transactions; investments are fixed values) */
  balances: Record<string, number>;
}

export const DEFAULT_CATEGORIES: {
  name: string;
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  color: string;
}[] = [
  { name: "Groceries", kind: "EXPENSE", color: "#16a34a" },
  { name: "Dining", kind: "EXPENSE", color: "#ea580c" },
  { name: "Gas", kind: "EXPENSE", color: "#ca8a04" },
  { name: "Utilities", kind: "EXPENSE", color: "#0891b2" },
  { name: "Rent/Mortgage", kind: "EXPENSE", color: "#7c3aed" },
  { name: "Shopping", kind: "EXPENSE", color: "#db2777" },
  { name: "Travel", kind: "EXPENSE", color: "#2563eb" },
  { name: "Subscriptions", kind: "EXPENSE", color: "#9333ea" },
  { name: "Health", kind: "EXPENSE", color: "#dc2626" },
  { name: "Kids", kind: "EXPENSE", color: "#f59e0b" },
  { name: "Gifts", kind: "EXPENSE", color: "#e11d48" },
  { name: "Fees", kind: "EXPENSE", color: "#64748b" },
  { name: "Income", kind: "INCOME", color: "#059669" },
  { name: "Transfers", kind: "TRANSFER", color: "#94a3b8" },
  { name: "Other", kind: "EXPENSE", color: "#78716c" },
];

const ACCOUNTS: DemoAccount[] = [
  acct(
    "ws-cash-kanchit",
    "Wealthsimple Cash",
    "Wealthsimple",
    "CHEQUING",
    "1101",
    "kanchit",
    "LIVE",
    "ACTIVE",
    850000,
  ),
  acct(
    "ws-credit-kanchit",
    "Wealthsimple Credit Card",
    "Wealthsimple",
    "CREDIT_CARD",
    "1102",
    "kanchit",
    "LIVE",
    "ACTIVE",
    0,
  ),
  acct(
    "ws-cash-joint",
    "Wealthsimple Joint Cash",
    "Wealthsimple",
    "CHEQUING",
    "1103",
    "joint",
    "LIVE",
    "ACTIVE",
    1200000,
  ),
  acct(
    "rogers-mc-kanchit",
    "Rogers Mastercard",
    "Rogers Bank",
    "CREDIT_CARD",
    "2201",
    "kanchit",
    "EMAIL",
    "ACTIVE",
    0,
  ),
  acct(
    "td-chequing-joint",
    "TD Chequing (Joint)",
    "TD",
    "CHEQUING",
    "3301",
    "joint",
    "LIVE",
    "LOW",
    600000,
  ),
  acct(
    "td-credit-kanchit",
    "TD Credit Card",
    "TD",
    "CREDIT_CARD",
    "3302",
    "kanchit",
    "LIVE",
    "LOW",
    0,
  ),
  {
    ...acct(
      "cibc-credit-kanchit",
      "CIBC Credit Card",
      "CIBC",
      "CREDIT_CARD",
      "4401",
      "kanchit",
      "MANUAL",
      "LOW",
      0,
    ),
    visibility: "PRIVATE",
    privateMode: "HIDDEN",
  },
  acct(
    "scotia-chequing-wife",
    "Scotiabank Chequing",
    "Scotiabank",
    "CHEQUING",
    "5501",
    "wife",
    "LIVE",
    "ACTIVE",
    700000,
  ),
  acct(
    "scotia-credit-wife",
    "Scotiabank Credit Card",
    "Scotiabank",
    "CREDIT_CARD",
    "5502",
    "wife",
    "LIVE",
    "ACTIVE",
    0,
  ),
  {
    ...acct(
      "pc-mc-wife",
      "PC Financial Mastercard",
      "PC Financial",
      "CREDIT_CARD",
      "6601",
      "wife",
      "LIVE",
      "ACTIVE",
      0,
    ),
    visibility: "PRIVATE",
    privateMode: "BALANCE_ONLY",
  },
  inv(
    "wealthsimple-invest-kanchit",
    "Wealthsimple TFSA",
    "Wealthsimple",
    "TFSA",
    "7701",
    "kanchit",
    4825000,
  ),
  inv(
    "questrade-invest-kanchit",
    "Questrade RRSP",
    "Questrade",
    "RRSP",
    "7702",
    "kanchit",
    6210000,
  ),
  inv("ibkr-invest-kanchit", "IBKR Non-registered", "IBKR", "NON_REG", "7703", "kanchit", 1840000),
  inv(
    "wealthsimple-invest-wife",
    "Wealthsimple TFSA",
    "Wealthsimple",
    "TFSA",
    "8801",
    "wife",
    3975000,
  ),
  inv("questrade-invest-wife", "Questrade FHSA", "Questrade", "FHSA", "8802", "wife", 1600000),
  inv("ibkr-invest-wife", "IBKR RRSP", "IBKR", "RRSP", "8803", "wife", 2330000),
];

function acct(
  key: string,
  name: string,
  institution: string,
  type: DemoAccount["type"],
  mask: string,
  owner: DemoAccount["owner"],
  connectionMode: DemoAccount["connectionMode"],
  syncTier: DemoAccount["syncTier"],
  openingCents: number,
): DemoAccount {
  return {
    key,
    name,
    institution,
    type,
    mask,
    owner,
    visibility: "SHARED",
    privateMode: "BALANCE_ONLY",
    connectionMode,
    syncTier,
    openingCents,
  };
}

function inv(
  key: string,
  name: string,
  institution: string,
  subtype: string,
  mask: string,
  owner: DemoPerson,
  openingCents: number,
): DemoAccount {
  return {
    ...acct(key, name, institution, "INVESTMENT", mask, owner, "LIVE", "LOW", openingCents),
    subtype,
  };
}

/** mulberry32 — tiny, fast, deterministic PRNG. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ymd(y: number, m0: number, d: number): string {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
}

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

const ACCOUNT_NAME: Record<string, string> = Object.fromEntries(
  ACCOUNTS.map((a) => [a.key, a.name]),
);

const CARD_PAYER: Record<string, string> = {
  "ws-credit-kanchit": "ws-cash-kanchit",
  "rogers-mc-kanchit": "ws-cash-kanchit",
  "td-credit-kanchit": "td-chequing-joint",
  "cibc-credit-kanchit": "ws-cash-kanchit",
  "scotia-credit-wife": "scotia-chequing-wife",
  "pc-mc-wife": "scotia-chequing-wife",
};

const CARD_OWNER: Record<string, DemoPerson> = {
  "ws-credit-kanchit": "kanchit",
  "rogers-mc-kanchit": "kanchit",
  "td-credit-kanchit": "kanchit",
  "cibc-credit-kanchit": "kanchit",
  "scotia-credit-wife": "wife",
  "pc-mc-wife": "wife",
};

export interface GenerateOptions {
  /** Last day to include (inclusive), "YYYY-MM-DD" */
  endDate: string;
  months?: number;
  seed?: number;
}

export function generateDemo({ endDate, months = 12, seed = 42 }: GenerateOptions): DemoData {
  const rand = prng(seed);
  const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

  const end = new Date(`${endDate}T00:00:00Z`);
  const txns: DemoTxn[] = [];
  let n = 0;
  const add = (t: Omit<DemoTxn, "externalId" | "isTransfer"> & { isTransfer?: boolean }) => {
    if (t.date > endDate) return;
    n += 1;
    txns.push({ externalId: `demo-${String(n).padStart(5, "0")}`, isTransfer: false, ...t });
  };
  const transfer = (
    from: string,
    to: string | null,
    date: string,
    cents: number,
    label: string,
    spender: DemoPerson,
  ) => {
    add({
      accountKey: from,
      date,
      amountCents: -cents,
      merchant: label,
      category: "Transfers",
      spender,
      isTransfer: true,
    });
    if (to)
      add({
        accountKey: to,
        date,
        amountCents: cents,
        merchant: label,
        category: "Transfers",
        spender,
        isTransfer: true,
      });
  };

  // Track card charges per (card, month) to generate next-month payments.
  const cardCharges = new Map<string, number>();
  const charge = (
    card: string,
    y: number,
    m0: number,
    day: number,
    cents: number,
    merchant: string,
    category: string,
  ) => {
    const date = ymd(y, m0, day);
    add({
      accountKey: card,
      date,
      amountCents: -cents,
      merchant,
      category,
      spender: CARD_OWNER[card] as DemoPerson,
    });
    if (date <= endDate) {
      const k = `${card}|${y}-${m0}`;
      cardCharges.set(k, (cardCharges.get(k) ?? 0) + cents);
    }
  };

  for (let i = months - 1; i >= 0; i -= 1) {
    const base = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    const y = base.getUTCFullYear();
    const m0 = base.getUTCMonth();
    const dim = daysInMonth(y, m0);
    const d = (day: number) => ymd(y, m0, Math.min(day, dim));
    const winter = m0 <= 2 || m0 >= 10;

    // Pay last month's card statements on the 5th.
    const prev = new Date(Date.UTC(y, m0 - 1, 1));
    for (const card of Object.keys(CARD_PAYER)) {
      const owed = cardCharges.get(`${card}|${prev.getUTCFullYear()}-${prev.getUTCMonth()}`) ?? 0;
      if (owed > 0)
        transfer(
          CARD_PAYER[card] as string,
          card,
          d(5),
          owed,
          `Payment — ${ACCOUNT_NAME[card]}`,
          CARD_OWNER[card] as DemoPerson,
        );
    }

    // Income (bi-monthly payroll)
    for (const day of [15, dim]) {
      add({
        accountKey: "ws-cash-kanchit",
        date: d(day),
        amountCents: 320000,
        merchant: "Employer Payroll",
        category: "Income",
        spender: "kanchit",
      });
      add({
        accountKey: "scotia-chequing-wife",
        date: d(day),
        amountCents: 260000,
        merchant: "Employer Payroll",
        category: "Income",
        spender: "wife",
      });
    }

    // Contributions to the joint account and investments
    transfer("ws-cash-kanchit", "td-chequing-joint", d(2), 200000, "Transfer to joint", "kanchit");
    transfer(
      "scotia-chequing-wife",
      "td-chequing-joint",
      d(2),
      200000,
      "Transfer to joint",
      "wife",
    );
    transfer("ws-cash-kanchit", null, d(16), 50000, "TFSA contribution", "kanchit");
    transfer("scotia-chequing-wife", null, d(16), 40000, "FHSA contribution", "wife");
    transfer("td-chequing-joint", "ws-cash-joint", d(20), 30000, "Joint savings", "kanchit");

    // Fixed bills from the joint account
    add({
      accountKey: "td-chequing-joint",
      date: d(1),
      amountCents: -245000,
      merchant: "Mortgage Payment",
      category: "Rent/Mortgage",
      spender: "kanchit",
    });
    add({
      accountKey: "td-chequing-joint",
      date: d(12),
      amountCents: -between(7500, 12500),
      merchant: "Hydro One",
      category: "Utilities",
      spender: "wife",
    });
    add({
      accountKey: "td-chequing-joint",
      date: d(14),
      amountCents: winter ? -between(13000, 19000) : -between(4000, 6500),
      merchant: "Enbridge Gas",
      category: "Utilities",
      spender: "wife",
    });
    add({
      accountKey: "td-chequing-joint",
      date: d(18),
      amountCents: -8500,
      merchant: "Rogers Internet",
      category: "Utilities",
      spender: "kanchit",
    });
    add({
      accountKey: "td-chequing-joint",
      date: d(3),
      amountCents: -2400,
      merchant: "TD Monthly Account Fee",
      category: "Fees",
      spender: "kanchit",
    });

    // Phones & subscriptions
    charge("ws-credit-kanchit", y, m0, 8, 4500, "Freedom Mobile", "Utilities");
    charge("scotia-credit-wife", y, m0, 9, 4000, "Koodo Mobile", "Utilities");
    charge("ws-credit-kanchit", y, m0, 11, 2099, "Netflix", "Subscriptions");
    charge("ws-credit-kanchit", y, m0, 21, 399, "Apple iCloud", "Subscriptions");
    charge("scotia-credit-wife", y, m0, 13, 1199, "Spotify", "Subscriptions");
    charge("scotia-credit-wife", y, m0, 24, 1499, "Disney Plus", "Subscriptions");
    if (m0 === 1)
      charge("rogers-mc-kanchit", y, m0, 6, 9900, "Amazon Prime Annual", "Subscriptions");
    if (m0 === 2) charge("td-credit-kanchit", y, m0, 10, 13900, "TD Annual Card Fee", "Fees");

    // Groceries: Costco (Mastercard only) bi-weekly; Loblaw-family weekly on PC MC
    for (const day of [6, 20])
      charge(
        "rogers-mc-kanchit",
        y,
        m0,
        day,
        between(17000, 26000),
        "Costco Wholesale",
        "Groceries",
      );
    for (const day of [3, 10, 17, 24]) {
      charge(
        "pc-mc-wife",
        y,
        m0,
        day,
        between(6000, 14000),
        pick(["Loblaws", "No Frills", "Real Canadian Superstore"]),
        "Groceries",
      );
    }
    if (rand() < 0.6)
      charge(
        "scotia-credit-wife",
        y,
        m0,
        between(1, 28),
        between(3000, 7000),
        "Farm Boy",
        "Groceries",
      );

    // Dining & delivery
    const dining = between(6, 11);
    for (let k = 0; k < dining; k += 1) {
      const kanchit = rand() < 0.5;
      charge(
        kanchit ? "ws-credit-kanchit" : "scotia-credit-wife",
        y,
        m0,
        between(1, dim),
        between(800, 7500),
        pick([
          "Tim Hortons",
          "Starbucks",
          "Uber Eats",
          "DoorDash",
          "Pai Northern Thai",
          "The Keg",
          "Chipotle",
          "Sushi Shop",
        ]),
        "Dining",
      );
    }

    // Gas
    for (let k = 0; k < 3; k += 1) {
      if (rand() < 0.55)
        charge(
          "td-credit-kanchit",
          y,
          m0,
          between(1, dim),
          between(5500, 8000),
          pick(["Petro-Canada", "Shell"]),
          "Gas",
        );
      else charge("pc-mc-wife", y, m0, between(1, dim), between(5000, 7500), "Esso", "Gas");
    }

    // Shopping & health
    const shopping = between(2, 5);
    for (let k = 0; k < shopping; k += 1) {
      charge(
        rand() < 0.5 ? "ws-credit-kanchit" : "scotia-credit-wife",
        y,
        m0,
        between(1, dim),
        between(2000, 18000),
        pick(["Amazon.ca", "Canadian Tire", "IKEA", "Best Buy", "Winners", "Indigo"]),
        "Shopping",
      );
    }
    charge(
      "scotia-credit-wife",
      y,
      m0,
      between(1, dim),
      between(1500, 6000),
      "Shoppers Drug Mart",
      "Health",
    );
    if (m0 === 11) {
      charge("ws-credit-kanchit", y, m0, 12, between(15000, 30000), "Hudson's Bay", "Gifts");
      charge("scotia-credit-wife", y, m0, 15, between(15000, 30000), "Indigo", "Gifts");
    }

    // Private CIBC card (Kanchit, HIDDEN): occasional shopping + a summer trip
    charge(
      "cibc-credit-kanchit",
      y,
      m0,
      between(1, dim),
      between(3000, 9000),
      pick(["Sport Chek", "Apple Store"]),
      "Shopping",
    );
    if (m0 === 6) charge("cibc-credit-kanchit", y, m0, 9, 92000, "Air Canada", "Travel");
  }

  txns.sort((a, b) =>
    a.date === b.date ? a.externalId.localeCompare(b.externalId) : a.date.localeCompare(b.date),
  );

  const balances: Record<string, number> = {};
  for (const a of ACCOUNTS) balances[a.key] = a.openingCents;
  for (const t of txns) balances[t.accountKey] = (balances[t.accountKey] ?? 0) + t.amountCents;

  return { accounts: ACCOUNTS.map((a) => ({ ...a })), txns, balances };
}
