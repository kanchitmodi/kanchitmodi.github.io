import type { AccountStatus } from "@/lib/account-status";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { Avatar } from "./avatar";
import type { TxnView } from "@/lib/data";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-text-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** KPI stat tile: values in text ink (never series color); optional caption gives context. */
export function StatTile({
  label,
  value,
  caption,
  testId,
}: {
  label: string;
  value: string;
  caption?: string;
  testId?: string;
}) {
  return (
    <div className="card p-4" data-testid={testId}>
      <div className="text-xs font-semibold tracking-wide text-text-2 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {caption && <div className="mt-0.5 text-xs text-text-3">{caption}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<AccountStatus, { icon: string; cls: string }> = {
  Live: { icon: "●", cls: "text-good" },
  Email: { icon: "✉", cls: "text-accent" },
  Manual: { icon: "✎", cls: "text-text-2" },
  Stale: { icon: "▲", cls: "text-warn" },
};

/** Status always ships icon + label (never color alone). */
export function StatusBadge({ status }: { status: AccountStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-2">
      <span aria-hidden="true" className={s.cls}>
        {s.icon}
      </span>
      {status}
    </span>
  );
}

export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return (
    <span className={`tabular-nums ${cents > 0 ? "text-good" : ""} ${className}`}>
      {cents > 0 ? "+" : ""}
      {formatCents(cents)}
    </span>
  );
}

export function TxnRow({ t }: { t: TxnView }) {
  return (
    <li data-testid="txn-row">
      <Link
        href={`/transactions/${t.id}`}
        className="flex min-h-[56px] items-center gap-3 px-4 py-2 hover:bg-surface-2"
      >
        {t.spender ? (
          <Avatar name={t.spender.name} color={t.spender.avatarColor} />
        ) : (
          <span className="w-7" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {t.merchant}
            {t.needsReview && (
              <span
                className="ml-2 rounded border border-border px-1 text-[11px] font-semibold text-warn"
                title="Needs review"
              >
                ▲ Review
              </span>
            )}
          </div>
          <div className="truncate text-xs text-text-3">
            {t.date} · {t.account.name}
            {t.spender ? ` · ${t.spender.name}` : ""}
            {t.commentCount ? ` · 💬 ${t.commentCount}` : ""}
          </div>
        </div>
        <div className="text-right">
          <Money cents={t.amountCents} className="font-semibold" />
          <div className="flex items-center justify-end gap-1 text-xs text-text-3">
            {t.splits.length ? (
              <span>Split · {t.splits.length} parts</span>
            ) : t.category ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: t.category.color }}
                />
                {t.category.name}
              </>
            ) : (
              <span>Uncategorized</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function StageNote({ stage, children }: { stage: number; children: React.ReactNode }) {
  return (
    <div className="card border-dashed p-4 text-sm text-text-2">
      <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">
        Stage {stage}
      </span>
      {children}
    </div>
  );
}
