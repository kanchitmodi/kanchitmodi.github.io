import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { SETUP_STEPS } from "@config/setup-steps";
import { runTest } from "@/lib/integrations/connection-tests";
import { audit } from "@/lib/audit";

export const POST = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ step: string }> }) => {
    const { viewer } = await requireApiAuth();
    const { step } = await ctx.params;
    const def = SETUP_STEPS.find((s) => s.key === step);
    if (!def?.test) throw new ApiError(404, "not_found");
    const result = await runTest(def.test);
    const ok = result.status === "ok";
    await db.setupStep.upsert({
      where: { householdId_stepKey: { householdId: viewer.householdId, stepKey: step } },
      create: {
        householdId: viewer.householdId,
        stepKey: step,
        checked: [],
        lastTestAt: new Date(),
        lastTestOk: ok,
        lastTestMsg: result.message.slice(0, 500),
      },
      update: { lastTestAt: new Date(), lastTestOk: ok, lastTestMsg: result.message.slice(0, 500) },
    });
    await audit({
      householdId: viewer.householdId,
      actorUserId: viewer.userId,
      action: "setup.test",
      entityType: "setup",
      entityId: step,
      details: { status: result.status },
    });
    return NextResponse.json(result);
  },
);
