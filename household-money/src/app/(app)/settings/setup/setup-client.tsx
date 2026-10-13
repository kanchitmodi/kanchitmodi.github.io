"use client";

import { useState } from "react";
import type { SetupStepDef } from "@config/setup-steps";
import { api } from "@/lib/client-api";

interface TestResult {
  status: "ok" | "fail" | "not_configured" | "pending_stage";
  message: string;
}

const STATUS_TEXT = {
  ok: "✓ Passed",
  fail: "✕ Failed",
  not_configured: "○ Not configured",
  pending_stage: "… Later stage",
} as const;

export function SetupStepCard({
  step,
  checked: initial,
  lastTest,
}: {
  step: SetupStepDef;
  checked: string[];
  lastTest: { at: string; ok: boolean; msg: string } | null;
}) {
  const [checked, setChecked] = useState(new Set(initial));
  const [result, setResult] = useState<TestResult | null>(
    lastTest ? { status: lastTest.ok ? "ok" : "fail", message: lastTest.msg } : null,
  );
  const [testing, setTesting] = useState(false);
  const complete = checked.size === step.items.length;

  return (
    <section
      className="card p-4"
      aria-labelledby={`step-${step.key}`}
      data-testid={`setup-step-${step.key}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`step-${step.key}`} className="font-semibold">
            Step {step.number} — {step.title}
          </h2>
          <p className="text-xs text-text-3">
            {step.who} · needed by {step.neededBy}
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-2">
          {complete ? "✓ Done" : `${checked.size}/${step.items.length}`}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {step.items.map((item) => (
          <li key={item.key}>
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
                checked={checked.has(item.key)}
                onChange={async (e) => {
                  const next = new Set(checked);
                  if (e.target.checked) next.add(item.key);
                  else next.delete(item.key);
                  setChecked(next);
                  await api(`/api/setup/${step.key}`, {
                    method: "PATCH",
                    body: { checked: [...next] },
                  });
                }}
              />
              <span>
                {item.label}
                {item.href && (
                  <>
                    {" "}
                    <a
                      href={item.href}
                      target={item.href.startsWith("/") ? undefined : "_blank"}
                      rel="noopener noreferrer"
                      className="font-semibold text-accent underline"
                    >
                      Open
                    </a>
                  </>
                )}
                {item.env && (
                  <span className="block text-xs text-text-3">Env: {item.env.join(", ")}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {step.docs && (
        <a
          href={step.docs}
          target="_blank"
          rel="noopener noreferrer"
          className="tap inline-flex items-center text-sm text-accent underline"
        >
          Docs
        </a>
      )}
      {step.test && (
        <div className="mt-2 border-t border-border pt-3">
          <button
            className="btn btn-secondary"
            disabled={testing}
            onClick={async () => {
              setTesting(true);
              try {
                setResult(await api<TestResult>(`/api/setup/${step.key}/test`, { body: {} }));
              } catch (e) {
                setResult({
                  status: "fail",
                  message: e instanceof Error ? e.message : "Test failed",
                });
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? "Testing…" : `Test: ${step.testLabel}`}
          </button>
          {result && (
            <p role="status" className="mt-2 text-sm" data-testid="setup-test-result">
              <strong>{STATUS_TEXT[result.status]}</strong> — {result.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
