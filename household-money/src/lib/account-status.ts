export type AccountStatus = "Live" | "Email" | "Manual" | "Stale";

const DAY = 24 * 60 * 60 * 1000;
/** Gaps beyond these mark a connected account stale (matches Data QA thresholds). */
export const STALE_AFTER_MS = { ACTIVE: 3 * DAY, LOW: 14 * DAY } as const;

export function accountStatus(
  a: {
    connectionMode: "LIVE" | "EMAIL" | "MANUAL";
    syncTier: "ACTIVE" | "LOW";
    lastSyncedAt: Date | null;
  },
  now: Date = new Date(),
): AccountStatus {
  if (a.connectionMode === "MANUAL") return "Manual";
  if (!a.lastSyncedAt || now.getTime() - a.lastSyncedAt.getTime() > STALE_AFTER_MS[a.syncTier])
    return "Stale";
  return a.connectionMode === "LIVE" ? "Live" : "Email";
}

/** Joint-account dedupe key: the same account seen via two logins collapses to one. */
export function accountDedupeKey(a: {
  institution: string;
  mask: string | null;
  type: string;
}): string {
  return `${a.institution.trim().toLowerCase()}|${(a.mask ?? "").trim()}|${a.type}`;
}
