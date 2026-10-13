import type { Prisma } from "@prisma/client";
import { db } from "./db";

export type AuditAction =
  | "auth.signup"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.unlock"
  | "auth.totp_enabled"
  | "auth.passkey_added"
  | "auth.passkey_removed"
  | "household.created"
  | "household.invite"
  | "household.invite_revoked"
  | "household.joined"
  | "household.left"
  | "household.settings"
  | "account.visibility"
  | "data.export"
  | "data.import"
  | "txn.edit"
  | "txn.comment"
  | "category.edit"
  | "rule.delete"
  | "account.create"
  | "account.balance"
  | "data.delete"
  | "setup.test"
  | "setup.check"
  | "demo.seed";

export async function audit(entry: {
  householdId: string;
  actorUserId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      householdId: entry.householdId,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      details: entry.details,
    },
  });
}
