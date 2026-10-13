import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { canonicalJson, snaptradeSignature } from "@/lib/integrations/snaptrade-sign";
import { parseValetUsdCad } from "@/lib/integrations/fx";

vi.mock("@/lib/db", () => ({ db: { $queryRaw: vi.fn() } }));

async function loadTests() {
  vi.resetModules();
  return import("@/lib/integrations/connection-tests");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SnapTrade signing", () => {
  it("canonicalizes with sorted keys and no whitespace", () => {
    expect(canonicalJson({ path: "/p", content: null, query: "a=1" })).toBe(
      '{"content":null,"path":"/p","query":"a=1"}',
    );
    expect(canonicalJson({ b: [1, { d: 1, c: 2 }], a: "x" })).toBe(
      '{"a":"x","b":[1,{"c":2,"d":1}]}',
    );
  });
  it("signs HMAC-SHA256 base64 over {content,path,query}", () => {
    const expected = createHmac("sha256", "secret")
      .update('{"content":null,"path":"/api/v1/brokerages","query":"clientId=C&timestamp=1"}')
      .digest("base64");
    expect(snaptradeSignature("secret", "/api/v1/brokerages", "clientId=C&timestamp=1")).toBe(
      expected,
    );
  });
});

describe("Bank of Canada Valet parsing", () => {
  it("reads the latest USD/CAD observation", () => {
    expect(
      parseValetUsdCad({ observations: [{ d: "2026-10-09", FXUSDCAD: { v: "1.3712" } }] }),
    ).toEqual({ date: "2026-10-09", usdcad: 1.3712 });
  });
  it("rejects malformed responses", () => {
    expect(() => parseValetUsdCad({ observations: [] })).toThrow();
    expect(() =>
      parseValetUsdCad({ observations: [{ d: "x", FXUSDCAD: { v: "n/a" } }] }),
    ).toThrow();
  });
});

describe("setup connection tests (mocked providers)", () => {
  beforeEach(() => {
    for (const k of [
      "PLAID_CLIENT_ID",
      "PLAID_SECRET",
      "SNAPTRADE_CLIENT_ID",
      "SNAPTRADE_CONSUMER_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]) {
      delete process.env[k];
    }
    process.env.PLAID_ENV = "sandbox";
  });

  it("reports not_configured without keys", async () => {
    const t = await loadTests();
    expect((await t.testPlaid()).status).toBe("not_configured");
    expect((await t.testSnapTrade()).status).toBe("not_configured");
    expect((await t.testClaude()).status).toBe("not_configured");
    expect(t.testGmail().status).toBe("not_configured");
  });

  it("Plaid: creates a Sandbox link token for CA + transactions", async () => {
    process.env.PLAID_CLIENT_ID = "cid";
    process.env.PLAID_SECRET = "sec";
    const t = await loadTests();
    const fetchMock = vi.fn(async () => jsonResponse({ link_token: "link-sandbox-abc" }));
    const r = await t.testPlaid(fetchMock as unknown as typeof fetch);
    expect(r.status).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.plaid.com/link/token/create");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      country_codes: ["CA"],
      products: ["transactions"],
      client_id: "cid",
    });
  });

  it("Plaid: surfaces API errors", async () => {
    process.env.PLAID_CLIENT_ID = "cid";
    process.env.PLAID_SECRET = "bad";
    const t = await loadTests();
    const r = await t.testPlaid((async () =>
      jsonResponse(
        { error_code: "INVALID_API_KEYS", error_message: "invalid client_id or secret" },
        400,
      )) as unknown as typeof fetch);
    expect(r.status).toBe("fail");
    expect(r.message).toContain("INVALID_API_KEYS");
  });

  it("SnapTrade: confirms Wealthsimple, Questrade and IBKR", async () => {
    process.env.SNAPTRADE_CLIENT_ID = "PERS-1";
    process.env.SNAPTRADE_CONSUMER_KEY = "ck";
    const t = await loadTests();
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        { name: "Wealthsimple" },
        { name: "Questrade" },
        { name: "Interactive Brokers", display_name: "IBKR" },
        { name: "Robinhood" },
      ]),
    );
    const r = await t.testSnapTrade(
      fetchMock as unknown as typeof fetch,
      new Date(1_700_000_000_000),
    );
    expect(r.status).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.snaptrade.com/api/v1/brokerages?clientId=PERS-1&timestamp=1700000000",
    );
    expect((init.headers as Record<string, string>).Signature).toBe(
      snaptradeSignature("ck", "/api/v1/brokerages", "clientId=PERS-1&timestamp=1700000000"),
    );
  });

  it("SnapTrade: fails when a broker is missing", async () => {
    process.env.SNAPTRADE_CLIENT_ID = "PERS-1";
    process.env.SNAPTRADE_CONSUMER_KEY = "ck";
    const t = await loadTests();
    const r = await t.testSnapTrade((async () =>
      jsonResponse([{ name: "Wealthsimple" }])) as unknown as typeof fetch);
    expect(r.status).toBe("fail");
    expect(r.message).toContain("Questrade");
  });

  it("Claude: sends only aggregated demo numbers and returns the insight", async () => {
    const t = await loadTests();
    const create = vi.fn(async () => ({
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 20 },
      content: [{ type: "text", text: "Groceries were $903 in September." }],
    }));
    const r = await t.testClaude({ messages: { create } } as never);
    expect(r.status).toBe("ok");
    expect(r.message).toContain("Groceries");
    const req = (
      create.mock.calls[0] as unknown as [{ model: string; messages: { content: string }[] }]
    )[0];
    expect(req.model).toBe("claude-opus-5-5");
    const sent = req.messages[0]!.content;
    // Privacy: no account numbers, emails, names or merchants-with-ids in the payload.
    expect(sent).not.toMatch(/@|\d{4}-\d{4}|Kanchit|Wife|mask/i);
    expect(sent).toContain('"spendDollars":4805');
  });

  it("FX: parses the Valet response", async () => {
    const t = await loadTests();
    const r = await t.testFx((async () =>
      jsonResponse({
        observations: [{ d: "2026-10-09", FXUSDCAD: { v: "1.3712" } }],
      })) as unknown as typeof fetch);
    expect(r).toMatchObject({ status: "ok", details: { usdcad: 1.3712 } });
  });
});
