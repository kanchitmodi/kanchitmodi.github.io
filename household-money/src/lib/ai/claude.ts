import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { env, isSet } from "../env";

/** One model for the whole household; server-side only. */
export const CLAUDE_MODEL = "claude-opus-5-5";

/** USD per million tokens (input, output) — used for cost tracking and the monthly cap. */
export const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** Cost in USD micro-dollars ($1 = 1,000,000). */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING_PER_MTOK[model] ?? PRICING_PER_MTOK[CLAUDE_MODEL]!;
  return Math.round(inputTokens * p.input + outputTokens * p.output);
}

export function monthlyCapMicros(): number {
  const cap = Number(process.env.AI_MONTHLY_CAP_USD ?? "10");
  return Math.round((Number.isFinite(cap) && cap > 0 ? cap : 10) * 1_000_000);
}

export function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface AiBudget {
  spentMicros: number;
  capMicros: number;
  /** >= 80% of the cap: show an alert */
  warning: boolean;
  /** >= 100%: stop calling the API this month */
  exhausted: boolean;
}

export async function aiBudget(
  db: PrismaClient,
  householdId: string,
  now = new Date(),
): Promise<AiBudget> {
  const agg = await db.aiUsage.aggregate({
    where: { householdId, createdAt: { gte: monthStartUtc(now) } },
    _sum: { costMicros: true },
  });
  const spent = agg._sum.costMicros ?? 0;
  const cap = monthlyCapMicros();
  return {
    spentMicros: spent,
    capMicros: cap,
    warning: spent >= cap * 0.8,
    exhausted: spent >= cap,
  };
}

export async function recordUsage(
  db: PrismaClient,
  householdId: string,
  feature: string,
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): Promise<void> {
  await db.aiUsage.create({
    data: {
      householdId,
      feature,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costMicros: costMicros(model, usage.input_tokens, usage.output_tokens),
    },
  });
}

export type ClaudeClient = Pick<Anthropic, "beta">;

export function claudeClient(): ClaudeClient | null {
  const key = env().ANTHROPIC_API_KEY;
  return isSet(key) ? new Anthropic({ apiKey: key }) : null;
}
