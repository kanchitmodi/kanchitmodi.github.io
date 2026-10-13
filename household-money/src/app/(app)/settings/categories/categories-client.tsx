"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";

const PROTECTED = new Set(["Transfers", "Income", "Other"]);

export function CategoriesEditor({
  categories,
}: {
  categories: { id: string; name: string; color: string; kind: string; count: number }[];
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="card mb-4 p-4" aria-labelledby="cats-h">
      <h2 id="cats-h" className="mb-2 font-semibold">
        Categories
      </h2>
      <ul className="divide-y divide-border" data-testid="category-list">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
            <label className="sr-only" htmlFor={`color-${c.id}`}>
              {c.name} colour
            </label>
            <input
              id={`color-${c.id}`}
              type="color"
              defaultValue={c.color}
              className="h-9 w-11 cursor-pointer rounded border border-border bg-transparent"
              onBlur={async (e) => {
                if (e.target.value !== c.color)
                  await api(`/api/categories/${c.id}`, {
                    method: "PATCH",
                    body: { color: e.target.value },
                  });
              }}
            />
            <label className="sr-only" htmlFor={`name-${c.id}`}>
              Name
            </label>
            <input
              id={`name-${c.id}`}
              defaultValue={c.name}
              disabled={PROTECTED.has(c.name)}
              maxLength={40}
              className="input min-w-0 flex-1"
              onBlur={async (e) => {
                const name = e.target.value.trim();
                if (!name || name === c.name) return;
                try {
                  await api(`/api/categories/${c.id}`, { method: "PATCH", body: { name } });
                  router.refresh();
                } catch (x) {
                  setErr((x as Error).message);
                  e.target.value = c.name;
                }
              }}
            />
            <span className="w-24 text-right text-xs text-text-3">{c.count} txns</span>
            <button
              className="btn btn-danger"
              disabled={PROTECTED.has(c.name)}
              aria-label={`Delete ${c.name}`}
              onClick={async () => {
                if (!confirm(`Delete "${c.name}"? Its ${c.count} transactions move to Other.`))
                  return;
                await api(`/api/categories/${c.id}`, { method: "DELETE" });
                router.refresh();
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setErr(null);
          try {
            await api("/api/categories", { body: { name: new FormData(form).get("name") } });
            form.reset();
            router.refresh();
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      >
        <label htmlFor="new-cat" className="sr-only">
          New category
        </label>
        <input
          id="new-cat"
          name="name"
          required
          maxLength={40}
          placeholder="New category, e.g. Pets"
          className="input flex-1"
        />
        <button className="btn btn-secondary">Add</button>
      </form>
      {err && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {err}
        </p>
      )}
    </section>
  );
}

export function RulesList({
  rules,
}: {
  rules: {
    id: string;
    pattern: string;
    category: string;
    isPrivate: boolean;
    createdBy: string;
    hits: number;
  }[];
}) {
  const router = useRouter();
  return (
    <section className="card p-4" aria-labelledby="rules-h">
      <h2 id="rules-h" className="font-semibold">
        Learned rules
      </h2>
      <p className="mb-2 text-sm text-text-2">
        Created when you change a category with &ldquo;Always categorize&rdquo; on. They beat the
        built-in merchant rules. 🔒 rules come from a private account and are visible only to you.
      </p>
      <ul className="divide-y divide-border text-sm" data-testid="rules-list">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {r.isPrivate ? "🔒 " : ""}
              <code>{r.pattern}</code> → <strong>{r.category}</strong>
              <span className="block text-xs text-text-3">
                by {r.createdBy} · used {r.hits}×
              </span>
            </span>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await api(`/api/rules/${r.id}`, { method: "DELETE" });
                router.refresh();
              }}
            >
              Delete
            </button>
          </li>
        ))}
        {rules.length === 0 && <li className="py-2 text-text-2">No rules yet.</li>}
      </ul>
    </section>
  );
}
