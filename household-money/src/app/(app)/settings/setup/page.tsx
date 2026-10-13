import { db } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth-guard";
import { SETUP_STEPS } from "@config/setup-steps";
import { PageHeader } from "@/components/ui";
import { SetupStepCard } from "./setup-client";

export const metadata = { title: "Setup" };

export default async function SetupPage() {
  const { viewer } = await requirePageAuth();
  const saved = await db.setupStep.findMany({ where: { householdId: viewer.householdId } });
  const byKey = new Map(saved.map((s) => [s.stepKey, s]));
  const done = SETUP_STEPS.filter(
    (s) => (byKey.get(s.key)?.checked.length ?? 0) === s.items.length,
  ).length;
  return (
    <>
      <PageHeader
        title="Setup"
        subtitle={`${done} of ${SETUP_STEPS.length} steps complete · full guide in docs/SETUP.md`}
      />
      <p className="card mb-4 p-4 text-sm text-text-2">
        Do steps 0–4 before Stage 5 (Plaid). Never paste keys here or in chat — add them as
        environment variables in Vercel (or <code>.env</code> locally), then press{" "}
        <strong>Test</strong>.
      </p>
      <div className="space-y-4">
        {SETUP_STEPS.map((s) => {
          const st = byKey.get(s.key);
          return (
            <SetupStepCard
              key={s.key}
              step={s}
              checked={st?.checked ?? []}
              lastTest={
                st?.lastTestAt
                  ? {
                      at: st.lastTestAt.toISOString(),
                      ok: !!st.lastTestOk,
                      msg: st.lastTestMsg ?? "",
                    }
                  : null
              }
            />
          );
        })}
      </div>
    </>
  );
}
