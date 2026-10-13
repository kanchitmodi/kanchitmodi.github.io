/**
 * Categorization engine (pure). Precedence:
 *   1. Transfers (detected card payments / own-account moves) -> "Transfers"
 *   2. Your corrections (USER rules): exact merchant, then "contains"
 *   3. Built-in Canadian merchant rules (longest pattern first)
 *   4. Parser hint (e.g. brokerage dividends)
 *   5. Nothing -> left for the LLM fallback / review queue
 * Private rules (learned from a private account) only apply to their creator's own accounts.
 */
import { SYSTEM_RULES, type SystemRule } from "@config/category-rules";

export interface UserRule {
  id: string;
  pattern: string;
  match: "EXACT" | "CONTAINS";
  categoryName: string;
  isPrivate: boolean;
  createdById: string | null;
}

export interface CategorizeInput {
  merchantNorm: string;
  amountCents: number;
  isTransfer: boolean;
  /** Owner of the transaction's account (null for joint) */
  accountOwnerUserId: string | null;
  categoryHint?: string;
}

export type CategorySourceT = "RULE" | "USER" | "IMPORT" | "NONE";

export interface CategorizeResult {
  categoryName: string | null;
  source: CategorySourceT;
  confidence: number;
  ruleId?: string;
}

const SORTED_SYSTEM = [...SYSTEM_RULES].sort((a, b) => b.pattern.length - a.pattern.length);

const compiled = new Map<string, RegExp>();

/**
 * Whole-word match so "PUB" doesn't hit "PUBLIC MOBILE" and "RENT" doesn't hit "RENTAL".
 * A trailing "*" makes the last word a prefix: "PHARMA*" matches "PHARMACY".
 */
export function wordContains(haystack: string, pattern: string): boolean {
  let re = compiled.get(pattern);
  if (!re) {
    const prefix = pattern.endsWith("*");
    const body = (prefix ? pattern.slice(0, -1) : pattern)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(^|[^A-Z0-9])${body}${prefix ? "" : "($|[^A-Z0-9])"}`);
    compiled.set(pattern, re);
  }
  return re.test(haystack);
}

export function ruleApplies(
  rule: Pick<UserRule, "isPrivate" | "createdById">,
  accountOwnerUserId: string | null,
): boolean {
  return !rule.isPrivate || (rule.createdById !== null && rule.createdById === accountOwnerUserId);
}

export function systemMatch(
  merchantNorm: string,
  amountCents: number,
  rules: SystemRule[] = SORTED_SYSTEM,
): SystemRule | undefined {
  const dir = amountCents < 0 ? "out" : "in";
  return rules.find(
    (r) => (!r.direction || r.direction === dir) && wordContains(merchantNorm, r.pattern),
  );
}

export function categorize(input: CategorizeInput, userRules: UserRule[]): CategorizeResult {
  if (input.isTransfer) return { categoryName: "Transfers", source: "RULE", confidence: 1 };
  const applicable = userRules.filter((r) => ruleApplies(r, input.accountOwnerUserId));
  const exact = applicable.find((r) => r.match === "EXACT" && r.pattern === input.merchantNorm);
  if (exact)
    return { categoryName: exact.categoryName, source: "USER", confidence: 1, ruleId: exact.id };
  const contains = applicable
    .filter((r) => r.match === "CONTAINS" && wordContains(input.merchantNorm, r.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (contains)
    return {
      categoryName: contains.categoryName,
      source: "USER",
      confidence: 0.95,
      ruleId: contains.id,
    };
  if (input.categoryHint)
    return { categoryName: input.categoryHint, source: "IMPORT", confidence: 0.95 };
  const sys = systemMatch(input.merchantNorm, input.amountCents);
  if (sys) return { categoryName: sys.category, source: "RULE", confidence: 0.9 };
  return { categoryName: null, source: "NONE", confidence: 0 };
}

/** Below this, a category guess goes to the review queue. */
export const REVIEW_THRESHOLD = 0.7;
