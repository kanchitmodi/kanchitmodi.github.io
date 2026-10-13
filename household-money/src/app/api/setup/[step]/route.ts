import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { SETUP_STEPS } from "@config/setup-steps";
import { audit } from "@/lib/audit";

const Body = z.object({ checked: z.array(z.string().max(40)).max(20) });

/** Save checkbox state for a setup step (household-wide, either member). */
export const PATCH = apiHandler(
  async (req: Request, ctx: { params: Promise<{ step: string }> }) => {
    const { viewer } = await requireApiAuth();
    const { step } = await ctx.params;
    const def = SETUP_STEPS.find((s) => s.key === step);
    if (!def) throw new ApiError(404, "not_found");
    const valid = new Set(def.items.map((i) => i.key));
    const checked = (await parseBody(req, Body)).checked.filter((k) => valid.has(k));
    await db.setupStep.upsert({
      where: { householdId_stepKey: { householdId: viewer.householdId, stepKey: step } },
      create: { householdId: viewer.householdId, stepKey: step, checked },
      update: { checked },
    });
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "setup.check",
      entityType: "setup",
      entityId: step,
      details: { checked },
    });
    return NextResponse.json({ checked });
  },
);
