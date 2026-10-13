"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/client-api";

export interface SwitcherOption {
  key: string;
  label: string;
}

/** Global Household / Kanchit / Wife switcher, shown on every screen. */
export function ScopeSwitcher({
  options,
  current,
}: {
  options: SwitcherOption[];
  current: string;
}) {
  const router = useRouter();
  const [active, setActive] = useState(current);
  const [pending, start] = useTransition();
  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="flex rounded-xl bg-surface-2 p-1"
      data-testid="scope-switcher"
    >
      {options.map((o) => {
        const on = o.key === active;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={pending}
            onClick={async () => {
              if (on) return;
              setActive(o.key);
              await api("/api/view", { body: { view: o.key } });
              start(() => router.refresh());
            }}
            className={`min-h-[36px] flex-1 rounded-lg px-3 text-sm font-semibold whitespace-nowrap ${
              on ? "bg-surface text-text shadow-sm" : "text-text-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
