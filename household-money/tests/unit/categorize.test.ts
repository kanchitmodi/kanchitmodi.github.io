import { describe, expect, it, vi } from "vitest";
import {
  categorize,
  ruleApplies,
  systemMatch,
  wordContains,
  type UserRule,
} from "@/lib/categorize";
import { normalizeMerchant } from "@/lib/import/normalize";
import { llmCategorize, scrubMerchant } from "@/lib/ai/categorize-llm";
import { costMicros, monthlyCapMicros } from "@/lib/ai/claude";

const base = { amountCents: -1000, isTransfer: false, accountOwnerUserId: "k" };
const cat = (raw: string, amountCents = -1000) =>
  categorize({ ...base, merchantNorm: normalizeMerchant(raw), amountCents }, []).categoryName;

describe("built-in Canadian merchant rules", () => {
  it.each([
    ["COSTCO WHOLESALE W535 TORONTO ON", "Groceries"],
    ["COSTCO GAS W535", "Gas"],
    ["LOBLAWS #1234", "Groceries"],
    ["NO FRILLS 3412 TORONTO ON", "Groceries"],
    ["TIM HORTONS #2231", "Dining"],
    ["UBER EATS TORONTO", "Dining"],
    ["UBER TRIP HELP.UBER.COM", "Travel"],
    ["PETRO-CANADA 98231", "Gas"],
    ["ESSO 7781", "Gas"],
    ["HYDRO ONE NETWORKS", "Utilities"],
    ["ROGERS ******1234", "Utilities"],
    ["NETFLIX.COM", "Subscriptions"],
    ["AMAZON PRIME*2K4L19", "Subscriptions"],
    ["AMZN Mktp CA*2K4L19", "Shopping"],
    ["AMAZON.CA ORDER", "Shopping"],
    ["SHOPPERS DRUG MART #0882", "Health"],
    ["GUARDIAN PHARMACY 12", "Health"],
    ["AIR CANADA 0142199", "Travel"],
    ["ANNUAL FEE", "Fees"],
    ["MONTHLY ACCOUNT FEE", "Fees"],
    ["FOREIGN TRANSACTION FEE", "Fees"],
    ["MCDONALD'S #40211", "Dining"],
  ])("%s -> %s", (raw, expected) => expect(cat(raw)).toBe(expected));

  it("respects direction: payroll is income only when money comes in", () => {
    expect(cat("PAYROLL DEP ACME CORP", 320000)).toBe("Income");
    expect(cat("PAYROLL DEP ACME CORP", -320000)).toBeNull();
  });

  it("matches whole words only", () => {
    expect(wordContains("PUBLIC MOBILE", "PUB")).toBe(false);
    expect(wordContains("RENTAL CAR CO", "RENT")).toBe(false);
    expect(wordContains("MAY RENT", "RENT")).toBe(true);
    expect(wordContains("GUARDIAN PHARMACY", "PHARMA*")).toBe(true);
    expect(systemMatch("SINGAPORE AIRLINES", -1)?.pattern).not.toBe("GAP");
  });

  it("leaves unknown merchants uncategorized for the LLM/review", () => {
    expect(categorize({ ...base, merchantNorm: "ZZYZX HOLDINGS" }, [])).toEqual({
      categoryName: null,
      source: "NONE",
      confidence: 0,
    });
  });
});

describe("precedence & learned rules", () => {
  const rules: UserRule[] = [
    {
      id: "r1",
      pattern: "COSTCO WHOLESALE W535",
      match: "EXACT",
      categoryName: "Shopping",
      isPrivate: false,
      createdById: "k",
    },
    {
      id: "r2",
      pattern: "ZZYZX",
      match: "CONTAINS",
      categoryName: "Kids",
      isPrivate: false,
      createdById: "w",
    },
    {
      id: "r3",
      pattern: "SECRET SHOP",
      match: "EXACT",
      categoryName: "Gifts",
      isPrivate: true,
      createdById: "w",
    },
  ];

  it("transfers always win", () => {
    expect(
      categorize({ ...base, merchantNorm: "COSTCO WHOLESALE W535", isTransfer: true }, rules)
        .categoryName,
    ).toBe("Transfers");
  });
  it("your corrections beat built-in rules", () => {
    expect(categorize({ ...base, merchantNorm: "COSTCO WHOLESALE W535" }, rules)).toMatchObject({
      categoryName: "Shopping",
      source: "USER",
      ruleId: "r1",
    });
  });
  it("contains-rules match on words", () => {
    expect(categorize({ ...base, merchantNorm: "ZZYZX HOLDINGS" }, rules).categoryName).toBe(
      "Kids",
    );
  });
  it("parser hints (e.g. dividends) beat built-in rules but not corrections", () => {
    expect(
      categorize(
        { ...base, merchantNorm: "XEQT DIST", amountCents: 837, categoryHint: "Income" },
        rules,
      ),
    ).toMatchObject({ categoryName: "Income", source: "IMPORT" });
  });
  it("private rules apply only to their creator's accounts", () => {
    expect(ruleApplies(rules[2]!, "w")).toBe(true);
    expect(ruleApplies(rules[2]!, "k")).toBe(false);
    expect(ruleApplies(rules[2]!, null)).toBe(false); // not even joint accounts
    expect(
      categorize({ ...base, merchantNorm: "SECRET SHOP", accountOwnerUserId: "k" }, rules)
        .categoryName,
    ).toBeNull();
    expect(
      categorize({ ...base, merchantNorm: "SECRET SHOP", accountOwnerUserId: "w" }, rules)
        .categoryName,
    ).toBe("Gifts");
  });
});

describe("Claude fallback (mocked)", () => {
  it("scrubs anything identifying before sending", () => {
    expect(scrubMerchant("ETRANSFER 12345678 JOHN@EXAMPLE.COM")).toBe("ETRANSFER");
  });

  it("sends only merchant + direction, keeps only allowed categories", async () => {
    const parse = vi.fn(async () => ({
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 400, output_tokens: 120 },
      parsed_output: {
        results: [
          { merchant: "ZZYZX HOLDINGS", category: "Shopping", confidence: 0.55 },
          { merchant: "BAKERY ABC", category: "Groceries", confidence: 0.92 },
          { merchant: "HACKER", category: "Crypto", confidence: 1 },
        ],
      },
    }));
    const r = await llmCategorize(
      { beta: { messages: { parse } } } as never,
      [
        { merchantNorm: "ZZYZX HOLDINGS", direction: "out" },
        { merchantNorm: "BAKERY ABC", direction: "out" },
      ],
      ["Groceries", "Shopping", "Transfers"],
    );
    expect(r.guesses).toEqual([
      { merchant: "ZZYZX HOLDINGS", category: "Shopping", confidence: 0.55 },
      { merchant: "BAKERY ABC", category: "Groceries", confidence: 0.92 },
    ]);
    const req = (
      parse.mock.calls[0] as unknown as [
        { model: string; messages: { content: string }[]; fallbacks: string },
      ]
    )[0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    const content = req.messages[0]!.content;
    expect(content).not.toMatch(/amount|cents|\d{4}-\d{2}-\d{2}/i);
    expect(content).not.toContain("Transfers");
  });

  it("returns nothing on refusal", async () => {
    const parse = vi.fn(async () => ({
      model: "m",
      stop_reason: "refusal",
      usage: { input_tokens: 1, output_tokens: 1 },
      parsed_output: null,
    }));
    const r = await llmCategorize(
      { beta: { messages: { parse } } } as never,
      [{ merchantNorm: "X", direction: "out" }],
      ["Other"],
    );
    expect(r.guesses).toEqual([]);
  });

  it("prices calls and caps the month", () => {
    expect(costMicros("claude-opus-5-5", 1_000_000, 0)).toBe(4_000_000);
    expect(costMicros("claude-opus-5-5", 400, 120)).toBe(1600 + 2400);
    expect(monthlyCapMicros()).toBe(10_000_000);
  });
});
