/**
 * In-app Setup wizard (Settings > Setup) — mirrors docs/SETUP.md. Links verified 2026-10-13.
 * `test` names a connection test implemented in src/lib/integrations/connection-tests.ts.
 */

export type SetupTest =
  "db" | "plaid" | "snaptrade" | "claude" | "gmail" | "brokers" | "fx" | "deploy";

export interface SetupItem {
  key: string;
  label: string;
  href?: string;
  /** Env vars this item produces */
  env?: string[];
}

export interface SetupStepDef {
  key: string;
  number: number;
  title: string;
  who: string;
  /** Build stage that needs this step done first */
  neededBy: string;
  items: SetupItem[];
  docs?: string;
  test?: SetupTest;
  testLabel?: string;
}

export const SETUP_STEPS: SetupStepDef[] = [
  {
    key: "base-accounts",
    number: 0,
    title: "Base accounts",
    who: "Kanchit",
    neededBy: "Deploy",
    items: [
      {
        key: "github",
        label: "GitHub account with a PRIVATE repo for this app",
        href: "https://github.com/signup",
      },
      { key: "vercel", label: "Vercel account (hosting)", href: "https://vercel.com/signup" },
      {
        key: "supabase",
        label: "Supabase account (Postgres database)",
        href: "https://supabase.com/dashboard",
      },
      {
        key: "password-manager",
        label:
          "Password manager + 2FA turned on for GitHub, Vercel, Supabase, Plaid, Google, Anthropic",
      },
    ],
    test: "db",
    testLabel: "Check database connection",
  },
  {
    key: "plaid",
    number: 1,
    title: "Plaid (banks + cards)",
    who: "Kanchit",
    neededBy: "Stage 5",
    items: [
      {
        key: "signup",
        label: "Sign up and verify your email",
        href: "https://dashboard.plaid.com/signup",
      },
      {
        key: "trial",
        label:
          'Apply for the free Trial plan (use case: "personal finance app for my household") — don\'t apply for Production first; that disqualifies Trial',
        href: "https://dashboard.plaid.com/trial-plan",
      },
      {
        key: "keys",
        label: "Copy client_id + Sandbox secret (Dashboard > Developers > Keys)",
        href: "https://dashboard.plaid.com/developers/keys",
        env: ["PLAID_CLIENT_ID", "PLAID_SECRET"],
      },
      { key: "country", label: "Enable country Canada (CA) and product Transactions" },
      {
        key: "env",
        label: "Set PLAID_ENV=sandbox now; switch to production after Stage 5 passes",
        env: ["PLAID_ENV"],
      },
    ],
    docs: "https://plaid.com/docs/",
    test: "plaid",
    testLabel: "Create a Sandbox Link token",
  },
  {
    key: "snaptrade",
    number: 2,
    title: "SnapTrade Personal (brokerages)",
    who: "Kanchit",
    neededBy: "Stage 6",
    items: [
      {
        key: "signup",
        label: "Sign up for SnapTrade Personal (free)",
        href: "https://snaptrade.com/personal",
      },
      {
        key: "2fa",
        label: "Turn on 2FA in the SnapTrade dashboard (required for a Personal API key)",
        href: "https://dashboard.snaptrade.com",
      },
      {
        key: "keys",
        label: "Create the Personal client ID + consumer key (API Key page)",
        env: ["SNAPTRADE_CLIENT_ID", "SNAPTRADE_CONSUMER_KEY"],
      },
      {
        key: "brokers",
        label: "Confirm Wealthsimple, Questrade and IBKR are supported (the test below checks)",
      },
    ],
    docs: "https://docs.snaptrade.com",
    test: "snaptrade",
    testLabel: "List supported brokerages",
  },
  {
    key: "claude",
    number: 3,
    title: "Claude API (AI advisor)",
    who: "Kanchit",
    neededBy: "Stage 10",
    items: [
      {
        key: "key",
        label: "Create an API key (Claude Console > API keys)",
        href: "https://platform.claude.com/settings/keys",
        env: ["ANTHROPIC_API_KEY"],
      },
      {
        key: "limit",
        label:
          "Set a monthly spend limit in the Console (e.g. $15 USD) — the app also caps itself at $10/month",
        href: "https://platform.claude.com/settings/limits",
      },
    ],
    docs: "https://platform.claude.com/docs",
    test: "claude",
    testLabel: "Generate a sample insight from demo data",
  },
  {
    key: "gmail",
    number: 4,
    title: "Gmail API (Rogers alerts)",
    who: "Kanchit",
    neededBy: "Stage 4",
    items: [
      {
        key: "project",
        label: "Google Cloud: create a project and enable the Gmail API",
        href: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
      },
      {
        key: "consent",
        label: "OAuth consent screen (Google Auth Platform): External; add yourself as a Test user",
        href: "https://console.cloud.google.com/auth/overview",
      },
      {
        key: "client",
        label:
          "Create OAuth client ID (Web application) with redirect URI https://<app-domain>/api/gmail/callback",
        href: "https://console.cloud.google.com/auth/clients",
        env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      },
      {
        key: "scope",
        label: "Data access: add ONLY https://www.googleapis.com/auth/gmail.readonly",
      },
      {
        key: "filter",
        label:
          'Gmail filter: from the Rogers Bank alert address -> apply label "rogers-alerts" + Skip the Inbox',
        href: "https://mail.google.com/mail/u/0/#settings/filters",
      },
      { key: "alerts", label: "Rogers Bank app: turn on purchase alerts at the lowest threshold" },
    ],
    docs: "https://developers.google.com/gmail/api",
    test: "gmail",
    testLabel: "Check Gmail OAuth configuration",
  },
  {
    key: "brokers-backup",
    number: 5,
    title: "Backup broker connections (optional, each person)",
    who: "Each person",
    neededBy: "Stage 6",
    items: [
      {
        key: "questrade",
        label: "Questrade API: generate a personal token",
        href: "https://www.questrade.com/api/documentation/getting-started",
      },
      {
        key: "ibkr",
        label:
          "IBKR: Client Portal > Performance & Reports > Flex Queries > Activity query; enable Flex Web Service; note token + query ID",
      },
    ],
    test: "brokers",
    testLabel: "Fetch positions",
  },
  {
    key: "fx",
    number: 6,
    title: "FX rates (Bank of Canada Valet)",
    who: "Nothing to sign up for",
    neededBy: "Stage 6",
    items: [
      {
        key: "valet",
        label: "No key needed — the app fetches the daily USD/CAD rate",
        href: "https://www.bankofcanada.ca/valet/docs",
      },
    ],
    test: "fx",
    testLabel: "Fetch today's USD/CAD",
  },
  {
    key: "deploy",
    number: 7,
    title: "Deploy",
    who: "Kanchit",
    neededBy: "Going live",
    items: [
      {
        key: "supabase",
        label:
          "Supabase: create project (region: Canada Central) -> copy pooled DATABASE_URL and direct DIRECT_URL",
        env: ["DATABASE_URL", "DIRECT_URL"],
      },
      {
        key: "vercel",
        label:
          "Vercel: import repo (Root Directory: household-money) -> add all env vars in Project Settings",
      },
      {
        key: "key",
        label:
          "Generate ENCRYPTION_KEY (32 random bytes, base64) and store it in your password manager too",
        env: ["ENCRYPTION_KEY"],
      },
      { key: "migrate", label: "Deploy and run migrations (npm run db:migrate)" },
    ],
    test: "deploy",
    testLabel: "Health check: DB, Plaid, SnapTrade, Claude, Gmail, FX",
  },
  {
    key: "connect-kanchit",
    number: 8,
    title: "Connect Kanchit's accounts (on his phone)",
    who: "Kanchit",
    neededBy: "Stages 4–6",
    items: [
      {
        key: "ws",
        label: "Wealthsimple (incl. joint) via Plaid -> verify cards + transactions within 48h",
      },
      { key: "td", label: "TD (incl. joint) via Plaid" },
      { key: "cibc", label: "CIBC via Plaid (or CSV)" },
      { key: "rogers", label: "Rogers via Gmail alerts" },
      { key: "snaptrade", label: "Wealthsimple, Questrade, IBKR via SnapTrade" },
      { key: "history", label: "Import 6–12 months of CSV history" },
    ],
  },
  {
    key: "connect-wife",
    number: 9,
    title: "Invite and connect Wife",
    who: "Wife",
    neededBy: "Stages 5–6",
    items: [
      { key: "invite", label: "Settings > Household > Invite", href: "/settings/household" },
      { key: "signup", label: "She signs up; sets 2FA + Face ID (passkey) on her iPhone" },
      { key: "plaid", label: "She connects Scotiabank + PC Financial via Plaid" },
      { key: "snaptrade", label: "She connects her Wealthsimple, Questrade, IBKR via SnapTrade" },
      { key: "history", label: "She imports 6–12 months of CSV history" },
      { key: "joint", label: "Confirm joint accounts appear once" },
    ],
  },
  {
    key: "iphone",
    number: 10,
    title: "Install on iPhone (both)",
    who: "Both",
    neededBy: "—",
    items: [
      {
        key: "a2hs",
        label: "Safari -> app URL -> Share -> Add to Home Screen -> open it -> allow notifications",
      },
    ],
  },
  {
    key: "first-qa",
    number: 11,
    title: "First QA pass",
    who: "Both",
    neededBy: "—",
    items: [
      { key: "health", label: "Health: all accounts green or explained; Plaid Items = 5/10" },
      {
        key: "report",
        label: "First report on imported history; spot-check vs 1 statement per card",
      },
      { key: "insights", label: "Review first AI insights and card recommendations" },
    ],
  },
];
