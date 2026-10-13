import { db } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth-guard";
import { PageHeader } from "@/components/ui";
import { PasskeyManager, SignOutButton } from "./security-client";

export const metadata = { title: "Security" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { user } = await requirePageAuth();
  const { welcome } = await searchParams;
  const passkeys = await db.passkey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <PageHeader title="Security" />
      {welcome && (
        <p role="status" className="card mb-4 p-4 text-sm">
          ✅ 2-factor is on. Add a passkey below so you can sign in and unlock with Face ID.
        </p>
      )}
      <section className="card mb-4 p-4">
        <h2 className="font-semibold">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-text-2">
          {user.totpEnabled ? "✓ On (authenticator app)" : "Off"} — required at every password
          sign-in.
        </p>
      </section>
      <PasskeyManager
        passkeys={passkeys.map((p) => ({
          id: p.id,
          deviceName: p.deviceName,
          createdAt: p.createdAt.toISOString().slice(0, 10),
          lastUsedAt: p.lastUsedAt?.toISOString().slice(0, 10) ?? null,
        }))}
      />
      <section className="card mt-4 p-4">
        <h2 className="font-semibold">Auto-lock</h2>
        <p className="mt-1 text-sm text-text-2">
          The app locks after 5 minutes without activity. Unlock with Face ID or your password.
        </p>
      </section>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </>
  );
}
