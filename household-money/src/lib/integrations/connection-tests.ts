import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { env, isSet } from "../env";
import type { SetupTest } from "@config/setup-steps";
import { snaptradeSignature } from "./snaptrade-sign";
import { fetchLatestUsdCad } from "./fx";
import { generateDemo } from "../demo/generator";
import { spendByCategory, cashFlow } from "../finance";
import { DEFAULT_CATEGORIES } from "../demo/generator";

export type TestStatus = "ok" | "fail" | "not_configured" | "pending_stage";

export interface TestResult {
  test: SetupTest;
  status: TestStatus;
  message: string;
  details?: Record<string, unknown>;
}

type Fetch = typeof fetch;

const missing = (test: SetupTest, vars: string[]): TestResult => ({
  test,
  status: "not_configured",
  message: `Set ${vars.join(", ")} in your environment (Vercel Project Settings or .env).`,
});

export async function testDb(): Promise<TestResult> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { test: "db", status: "ok", message: "Database reachable." };
  } catch (e) {
    return { test: "db", status: "fail", message: `Database error: ${(e as Error).message}` };
  }
}

export async function testPlaid(fetchImpl: Fetch = fetch): Promise<TestResult> {
  const e = env();
  if (!isSet(e.PLAID_CLIENT_ID) || !isSet(e.PLAID_SECRET))
    return missing("plaid", ["PLAID_CLIENT_ID", "PLAID_SECRET"]);
  const base =
    e.PLAID_ENV === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
  try {
    const res = await fetchImpl(`${base}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        client_id: e.PLAID_CLIENT_ID,
        secret: e.PLAID_SECRET,
        client_name: "Household Money",
        user: { client_user_id: "setup-wizard-test" },
        products: ["transactions"],
        country_codes: ["CA"],
        language: "en",
      }),
    });
    const json = (await res.json()) as {
      link_token?: string;
      error_message?: string;
      error_code?: string;
    };
    if (!res.ok || !json.link_token) {
      return {
        test: "plaid",
        status: "fail",
        message: `Plaid: ${json.error_code ?? res.status} ${json.error_message ?? ""}`.trim(),
      };
    }
    return {
      test: "plaid",
      status: "ok",
      message: `Link token created in ${e.PLAID_ENV}.`,
      details: { env: e.PLAID_ENV },
    };
  } catch (err) {
    return {
      test: "plaid",
      status: "fail",
      message: `Plaid request failed: ${(err as Error).message}`,
    };
  }
}

const REQUIRED_BROKERS = [
  { label: "Wealthsimple", match: /wealthsimple/i },
  { label: "Questrade", match: /questrade/i },
  { label: "IBKR", match: /interactive\s*brokers|ibkr/i },
];

export async function testSnapTrade(
  fetchImpl: Fetch = fetch,
  now: Date = new Date(),
): Promise<TestResult> {
  const e = env();
  if (!isSet(e.SNAPTRADE_CLIENT_ID) || !isSet(e.SNAPTRADE_CONSUMER_KEY)) {
    return missing("snaptrade", ["SNAPTRADE_CLIENT_ID", "SNAPTRADE_CONSUMER_KEY"]);
  }
  const path = "/api/v1/brokerages";
  const query = `clientId=${encodeURIComponent(e.SNAPTRADE_CLIENT_ID)}&timestamp=${Math.floor(now.getTime() / 1000)}`;
  try {
    const res = await fetchImpl(`https://api.snaptrade.com${path}?${query}`, {
      headers: {
        Signature: snaptradeSignature(e.SNAPTRADE_CONSUMER_KEY, path, query),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok)
      return {
        test: "snaptrade",
        status: "fail",
        message: `SnapTrade HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      };
    const list = (await res.json()) as { name?: string; display_name?: string }[];
    const names = list.map((b) => `${b.name ?? ""} ${b.display_name ?? ""}`);
    const found = REQUIRED_BROKERS.map((b) => ({
      broker: b.label,
      supported: names.some((n) => b.match.test(n)),
    }));
    const ok = found.every((f) => f.supported);
    return {
      test: "snaptrade",
      status: ok ? "ok" : "fail",
      message: ok
        ? `${list.length} brokerages available; Wealthsimple, Questrade and IBKR all supported.`
        : `Missing: ${found
            .filter((f) => !f.supported)
            .map((f) => f.broker)
            .join(", ")}`,
      details: { found },
    };
  } catch (err) {
    return {
      test: "snaptrade",
      status: "fail",
      message: `SnapTrade request failed: ${(err as Error).message}`,
    };
  }
}

/** Aggregated, de-identified demo numbers — the same shape the AI advisor will receive. */
export function demoAggregates(endDate = "2026-09-30") {
  const demo = generateDemo({ endDate });
  const kind = new Map(DEFAULT_CATEGORIES.map((c) => [c.name, c.kind]));
  const flows = demo.txns.map((t) => ({
    date: t.date,
    amountCents: t.amountCents,
    isTransfer: t.isTransfer,
    categoryKind: kind.get(t.category) ?? null,
    categoryName: t.category,
  }));
  const from = "2026-09-01";
  const byCat = spendByCategory(flows, from, endDate);
  const flow = cashFlow(flows, from, endDate);
  return {
    month: "2026-09",
    incomeDollars: Math.round(flow.incomeCents / 100),
    spendDollars: Math.round(flow.spendCents / 100),
    spendByCategoryDollars: Object.fromEntries(
      Object.entries(byCat).map(([k, v]) => [k, Math.round(v / 100)]),
    ),
  };
}

export const CLAUDE_MODEL = "claude-opus-5-5";

export async function testClaude(client?: Pick<Anthropic, "messages">): Promise<TestResult> {
  const e = env();
  if (!client && !isSet(e.ANTHROPIC_API_KEY)) return missing("claude", ["ANTHROPIC_API_KEY"]);
  const anthropic = client ?? new Anthropic({ apiKey: e.ANTHROPIC_API_KEY });
  const data = demoAggregates();
  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system:
        "You write one short personal-finance insight for a Canadian household. Use ONLY numbers present in the JSON; never invent numbers. Educational, not professional advice.",
      messages: [
        {
          role: "user",
          content: `Demo month data (CAD):\n${JSON.stringify(data)}\n\nWrite one insight in at most 2 sentences.`,
        },
      ],
    });
    const text = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join(" ")
      .trim();
    if (res.stop_reason === "refusal" || !text)
      return { test: "claude", status: "fail", message: "Claude returned no text." };
    return {
      test: "claude",
      status: "ok",
      message: text,
      details: { model: res.model, usage: res.usage },
    };
  } catch (err) {
    return {
      test: "claude",
      status: "fail",
      message: `Claude API error: ${(err as Error).message}`,
    };
  }
}

export function testGmail(): TestResult {
  const e = env();
  if (!isSet(e.GOOGLE_CLIENT_ID) || !isSet(e.GOOGLE_CLIENT_SECRET))
    return missing("gmail", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  return {
    test: "gmail",
    status: "ok",
    message: `OAuth client configured. Redirect URI must be ${e.APP_URL.replace(/\/$/, "")}/api/gmail/callback. Reading the last 3 "rogers-alerts" emails arrives with Stage 4.`,
  };
}

export async function testFx(fetchImpl: Fetch = fetch): Promise<TestResult> {
  try {
    const r = await fetchLatestUsdCad(fetchImpl);
    return {
      test: "fx",
      status: "ok",
      message: `USD/CAD ${r.usdcad} (Bank of Canada, ${r.date}).`,
      details: { ...r },
    };
  } catch (err) {
    return {
      test: "fx",
      status: "fail",
      message: `Bank of Canada Valet failed: ${(err as Error).message}`,
    };
  }
}

export async function runTest(test: SetupTest): Promise<TestResult> {
  switch (test) {
    case "db":
      return testDb();
    case "plaid":
      return testPlaid();
    case "snaptrade":
      return testSnapTrade();
    case "claude":
      return testClaude();
    case "gmail":
      return testGmail();
    case "fx":
      return testFx();
    case "brokers":
      return {
        test,
        status: "pending_stage",
        message: "Questrade/IBKR fallback fetchers arrive in Stage 6.",
      };
    case "deploy": {
      // Claude is checked for configuration only here, to avoid spending tokens on every health check.
      const results = await Promise.all([testDb(), testPlaid(), testSnapTrade(), testFx()]);
      const claude: TestResult = isSet(env().ANTHROPIC_API_KEY)
        ? { test: "claude", status: "ok", message: "Key configured." }
        : missing("claude", ["ANTHROPIC_API_KEY"]);
      const all = [...results, claude, testGmail()];
      const failed = all.filter((r) => r.status !== "ok");
      return {
        test,
        status: failed.length === 0 ? "ok" : "fail",
        message:
          failed.length === 0
            ? "All services healthy."
            : `Not ready: ${failed.map((r) => r.test).join(", ")}`,
        details: { results: all },
      };
    }
  }
}
