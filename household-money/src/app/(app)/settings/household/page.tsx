import { db } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth-guard";
import { householdMembers } from "@/lib/data";
import { canManageHousehold } from "@/lib/permissions";
import { HOUSEHOLD_MAX_MEMBERS } from "@/lib/household";
import { Avatar } from "@/components/avatar";
import { PageHeader } from "@/components/ui";
import { InviteForm, JointSplitForm, RevokeInvite } from "./household-client";

export const metadata = { title: "Household" };

export default async function HouseholdPage() {
  const { viewer } = await requirePageAuth();
  const [household, members, invites] = await Promise.all([
    db.household.findUniqueOrThrow({ where: { id: viewer.householdId } }),
    householdMembers(viewer.householdId),
    db.invite.findMany({
      where: {
        householdId: viewer.householdId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const owner = canManageHousehold(viewer);
  return (
    <>
      <PageHeader title={household.name} subtitle="Household members" />
      <ul className="card mb-4 divide-y divide-border" data-testid="members">
        {members.map((m) => (
          <li key={m.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
            <Avatar name={m.name} color={m.avatarColor} size={32} />
            <div className="flex-1">
              <div className="font-medium">
                {m.name}
                {m.id === viewer.userId ? " (you)" : ""}
              </div>
              <div className="text-xs text-text-3">{m.email}</div>
            </div>
            <span className="text-xs font-semibold text-text-2">
              {m.role === "OWNER" ? "Owner" : "Member"}
            </span>
          </li>
        ))}
      </ul>
      {owner ? (
        <>
          <InviteForm canInvite={members.length + invites.length < HOUSEHOLD_MAX_MEMBERS} />
          {invites.length > 0 && (
            <section className="card mb-4 p-4">
              <h2 className="mb-2 font-semibold">Pending invites</h2>
              <ul className="divide-y divide-border text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex min-h-[48px] items-center justify-between">
                    <span>
                      {i.email} · expires {i.expiresAt.toISOString().slice(0, 10)}
                    </span>
                    <RevokeInvite id={i.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <JointSplitForm
            initial={household.jointSplitPct}
            ownerName={members.find((m) => m.role === "OWNER")?.name ?? "Owner"}
          />
        </>
      ) : (
        <p className="card p-4 text-sm text-text-2">
          Only the household owner can invite members or change household settings.
        </p>
      )}
    </>
  );
}
