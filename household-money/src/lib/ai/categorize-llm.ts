import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CLAUDE_MODEL, type ClaudeClient } from "./claude";

/**
 * LLM fallback for merchants no rule recognizes. Privacy: only normalized merchant names and the
 * direction (in/out) are sent — never amounts, dates, account numbers, names or descriptions with
 * reference numbers (digit runs are already stripped by normalizeMerchant).
 */

export const LLM_BATCH = 60;

const Result = z.object({
  results: z.array(
    z.object({
      merchant: z.string(),
      category: z.string(),
      confidence: z.number(),
    }),
  ),
});

export interface LlmGuess {
  merchant: string;
  category: string;
  confidence: number;
}

/** Defensive scrub before anything leaves the server. */
export function scrubMerchant(m: string): string {
  return m
    .replace(/\b\d{4,}\b/g, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export async function llmCategorize(
  client: ClaudeClient,
  merchants: { merchantNorm: string; direction: "in" | "out" }[],
  categories: string[],
): Promise<{
  guesses: LlmGuess[];
  usage: { input_tokens: number; output_tokens: number } | null;
  model: string;
}> {
  const items = merchants
    .slice(0, LLM_BATCH)
    .map((m) => ({ merchant: scrubMerchant(m.merchantNorm), direction: m.direction }));
  if (items.length === 0) return { guesses: [], usage: null, model: CLAUDE_MODEL };
  const allowed = categories.filter((c) => c !== "Transfers");

  const res = await client.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Result) },
    system:
      "You categorize Canadian (Ontario) card and bank transaction merchants for a household budget. " +
      "Use ONLY the given category names. confidence is 0..1: below 0.7 if the merchant name is ambiguous " +
      "(e.g. a person's name, a generic payment processor, or could fit several categories). Return one result per merchant, " +
      "echoing the merchant string exactly.",
    messages: [
      {
        role: "user",
        content: `Categories: ${JSON.stringify(allowed)}\nMerchants: ${JSON.stringify(items)}`,
      },
    ],
  });

  const usage = res.usage
    ? { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }
    : null;
  if (res.stop_reason === "refusal" || !res.parsed_output)
    return { guesses: [], usage, model: res.model };
  const allowedSet = new Set(allowed);
  const asked = new Map(items.map((i, idx) => [i.merchant, merchants[idx]!.merchantNorm]));
  const guesses = res.parsed_output.results
    .filter((g) => allowedSet.has(g.category) && asked.has(g.merchant))
    .map((g) => ({
      merchant: asked.get(g.merchant)!,
      category: g.category,
      confidence: Math.max(0, Math.min(1, g.confidence)),
    }));
  return { guesses, usage, model: res.model };
}
