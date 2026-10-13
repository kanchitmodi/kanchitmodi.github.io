/**
 * Transfer & card-payment detection (pure). Money moving between our own accounts (including
 * joint) must never count as spending or income.
 *
 * A pair = outflow in account A and inflow of the exact same amount in account B (A != B) within
 * MAX_DAYS, where B is a credit card (card payment) or either side reads like a transfer.
 * One-sided detection covers the case where the other account isn't imported yet:
 *   - inflow on a credit card described as a payment
 *   - outflow described as a payment to a card / transfer to own account
 */

export interface TransferCandidate {
  id: string;
  accountId: string;
  accountType: "CHEQUING" | "SAVINGS" | "CREDIT_CARD" | "INVESTMENT" | "LOAN" | "OTHER";
  date: string;
  amountCents: number;
  merchantNorm: string;
  transferPairId: string | null;
}

export interface TransferUpdate {
  id: string;
  transferPairId: string | null;
}

export const MAX_DAYS = 4;

const TRANSFER_WORDS =
  /\b(TRANSFER|TFR|E-TRANSFER|ETRANSFER|INTERAC E|PAYMENT RECEIVED|PAYMENT - THANK YOU|PAYMENT THANK YOU|THANK YOU|PAIEMENT|AUTOPAY|PREAUTHORIZED PAYMENT|CONTRIBUTION|INTERNAL|BETWEEN ACCOUNTS|TO SAVINGS|FROM SAVINGS|WEALTHSIMPLE|QUESTRADE|INTERACTIVE BROKERS|IBKR|C\/C)\b/;
const CARD_PAYMENT_OUT =
  /\b(PAYMENT|PMT|BILL PAY|BILL PAYMENT)\b.*\b(VISA|MASTERCARD|MC|AMEX|CREDIT CARD|CARD)\b|\b(VISA|MASTERCARD|MC|AMEX|CREDIT CARD)\b.*\b(PAYMENT|PMT)\b|^TFR-TO C\/C/;
const CARD_PAYMENT_IN = /\b(PAYMENT|PAIEMENT|THANK YOU|AUTOPAY)\b/;

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

export function looksLikeTransfer(merchantNorm: string): boolean {
  return TRANSFER_WORDS.test(merchantNorm) || CARD_PAYMENT_OUT.test(merchantNorm);
}

export function detectTransfers(
  txns: TransferCandidate[],
  newPairId: () => string,
): TransferUpdate[] {
  const updates: TransferUpdate[] = [];
  const used = new Set(txns.filter((t) => t.transferPairId).map((t) => t.id));
  const outs = txns
    .filter((t) => t.amountCents < 0 && !used.has(t.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  const ins = txns.filter((t) => t.amountCents > 0 && !used.has(t.id));

  for (const o of outs) {
    const candidates = ins
      .filter(
        (i) =>
          !used.has(i.id) &&
          i.accountId !== o.accountId &&
          i.amountCents === -o.amountCents &&
          days(i.date, o.date) <= MAX_DAYS &&
          (i.accountType === "CREDIT_CARD" ||
            looksLikeTransfer(i.merchantNorm) ||
            looksLikeTransfer(o.merchantNorm)),
      )
      .sort((a, b) => {
        const score = (i: TransferCandidate) =>
          days(i.date, o.date) - (looksLikeTransfer(i.merchantNorm) ? 0.5 : 0);
        return score(a) - score(b);
      });
    const match = candidates[0];
    if (!match) continue;
    const pairId = newPairId();
    used.add(o.id);
    used.add(match.id);
    updates.push({ id: o.id, transferPairId: pairId }, { id: match.id, transferPairId: pairId });
  }

  // One-sided: the other leg isn't in the app yet.
  for (const t of txns) {
    if (used.has(t.id)) continue;
    const cardPaymentIn =
      t.accountType === "CREDIT_CARD" && t.amountCents > 0 && CARD_PAYMENT_IN.test(t.merchantNorm);
    const paymentOut =
      t.amountCents < 0 &&
      t.accountType !== "CREDIT_CARD" &&
      (CARD_PAYMENT_OUT.test(t.merchantNorm) || TRANSFER_WORDS.test(t.merchantNorm));
    if (cardPaymentIn || paymentOut) updates.push({ id: t.id, transferPairId: null });
  }
  return updates;
}
