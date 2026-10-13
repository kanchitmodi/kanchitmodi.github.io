import { describe, expect, it } from "vitest";
import { detectTransfers, type TransferCandidate } from "@/lib/transfers";
import { expandSplits, validateSplits } from "@/lib/splits";

let n = 0;
const id = () => `p${++n}`;
const t = (
  o: Partial<TransferCandidate> &
    Pick<TransferCandidate, "id" | "accountId" | "amountCents" | "merchantNorm">,
): TransferCandidate => ({
  accountType: "CHEQUING",
  date: "2026-09-10",
  transferPairId: null,
  ...o,
});

describe("transfer detection", () => {
  it("pairs a card payment: chequing outflow <-> card inflow", () => {
    const u = detectTransfers(
      [
        t({ id: "a", accountId: "chq", amountCents: -27353, merchantNorm: "TD VISA PREAUTH PYMT" }),
        t({
          id: "b",
          accountId: "visa",
          accountType: "CREDIT_CARD",
          amountCents: 27353,
          merchantNorm: "PAYMENT - THANK YOU",
          date: "2026-09-11",
        }),
      ],
      id,
    );
    expect(u).toHaveLength(2);
    expect(u[0]!.transferPairId).toBe(u[1]!.transferPairId);
    expect(u[0]!.transferPairId).not.toBeNull();
  });

  it("pairs transfers between own accounts incl. joint", () => {
    const u = detectTransfers(
      [
        t({ id: "a", accountId: "ws", amountCents: -200000, merchantNorm: "TRANSFER TO JOINT" }),
        t({
          id: "b",
          accountId: "joint",
          amountCents: 200000,
          merchantNorm: "E-TRANSFER RECEIVED",
          date: "2026-09-12",
        }),
      ],
      id,
    );
    expect(u.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("does not pair coincidental equal amounts without transfer signals", () => {
    const u = detectTransfers(
      [
        t({ id: "a", accountId: "chq", amountCents: -5000, merchantNorm: "LOBLAWS" }),
        t({ id: "b", accountId: "chq2", amountCents: 5000, merchantNorm: "REFUND BEST BUY" }),
      ],
      id,
    );
    expect(u).toEqual([]);
  });

  it("respects the date window and never pairs within one account", () => {
    expect(
      detectTransfers(
        [
          t({
            id: "a",
            accountId: "chq",
            amountCents: -100,
            merchantNorm: "TRANSFER",
            date: "2026-09-01",
          }),
          t({
            id: "b",
            accountId: "sav",
            amountCents: 100,
            merchantNorm: "TRANSFER",
            date: "2026-09-09",
          }),
          t({
            id: "c",
            accountId: "chq",
            amountCents: 100,
            merchantNorm: "TRANSFER",
            date: "2026-09-01",
          }),
        ],
        id,
      ).filter((x) => x.transferPairId),
    ).toEqual([]);
  });

  it("each inflow pairs at most once and prefers the closest date", () => {
    const u = detectTransfers(
      [
        t({
          id: "o1",
          accountId: "chq",
          amountCents: -1000,
          merchantNorm: "TRANSFER",
          date: "2026-09-01",
        }),
        t({
          id: "o2",
          accountId: "chq",
          amountCents: -1000,
          merchantNorm: "TRANSFER",
          date: "2026-09-05",
        }),
        t({
          id: "i1",
          accountId: "sav",
          amountCents: 1000,
          merchantNorm: "TRANSFER",
          date: "2026-09-02",
        }),
        t({
          id: "i2",
          accountId: "sav",
          amountCents: 1000,
          merchantNorm: "TRANSFER",
          date: "2026-09-05",
        }),
      ],
      id,
    );
    const pair = (x: string) => u.find((p) => p.id === x)!.transferPairId;
    expect(pair("o1")).toBe(pair("i1"));
    expect(pair("o2")).toBe(pair("i2"));
  });

  it("flags one-sided card payments when the other account isn't imported yet", () => {
    const u = detectTransfers(
      [
        t({
          id: "card",
          accountId: "rogers",
          accountType: "CREDIT_CARD",
          amountCents: 26264,
          merchantNorm: "PAYMENT RECEIVED",
        }),
        t({
          id: "chq",
          accountId: "td",
          amountCents: -41208,
          merchantNorm: "PC MASTERCARD PAYMENT",
        }),
        t({
          id: "refund",
          accountId: "rogers",
          accountType: "CREDIT_CARD",
          amountCents: 1200,
          merchantNorm: "AMAZON REFUND",
        }),
        t({
          id: "mortgage",
          accountId: "td",
          amountCents: -245000,
          merchantNorm: "MORTGAGE PAYMENT",
        }),
      ],
      id,
    );
    expect(u.map((x) => x.id).sort()).toEqual(["card", "chq"]);
    expect(u.every((x) => x.transferPairId === null)).toBe(true);
  });

  it("skips already-paired rows", () => {
    expect(
      detectTransfers(
        [
          t({
            id: "a",
            accountId: "x",
            amountCents: -1,
            merchantNorm: "TRANSFER",
            transferPairId: "old",
          }),
        ],
        id,
      ),
    ).toEqual([]);
  });
});

describe("splits", () => {
  it("validates", () => {
    expect(validateSplits(-10000, [])).toBeNull();
    expect(validateSplits(-10000, [{ categoryId: "a", amountCents: -10000 }])).toMatch(
      /at least two/,
    );
    expect(
      validateSplits(-10000, [
        { categoryId: "a", amountCents: -6000 },
        { categoryId: "b", amountCents: -4000 },
      ]),
    ).toBeNull();
    expect(
      validateSplits(-10000, [
        { categoryId: "a", amountCents: -6000 },
        { categoryId: "b", amountCents: -3000 },
      ]),
    ).toMatch(/add up/);
    expect(
      validateSplits(-10000, [
        { categoryId: "a", amountCents: -11000 },
        { categoryId: "b", amountCents: 1000 },
      ]),
    ).toMatch(/same sign/);
    expect(
      validateSplits(-10000, [
        { categoryId: "a", amountCents: -10000 },
        { categoryId: "b", amountCents: 0 },
      ]),
    ).toMatch(/non-zero/);
  });
  it("expands into per-category flows", () => {
    expect(expandSplits({ amountCents: -100, categoryId: "x" }, [])).toEqual([
      { amountCents: -100, categoryId: "x" },
    ]);
    expect(
      expandSplits({ amountCents: -100, categoryId: "x" }, [
        { amountCents: -60, categoryId: "a" },
        { amountCents: -40, categoryId: "b" },
      ]),
    ).toHaveLength(2);
  });
});
