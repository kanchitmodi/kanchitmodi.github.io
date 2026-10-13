import { db } from "@/lib/db";
import { bootstrapOpen, findValidInvite } from "@/lib/auth-service";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite: token } = await searchParams;
  if (token) {
    const invite = await findValidInvite(db, token);
    if (!invite) {
      return (
        <p role="alert" className="card p-5 text-center">
          This invite link is invalid or has expired. Ask for a new one.
        </p>
      );
    }
    return (
      <>
        <h1 className="mb-2 text-center text-2xl font-bold">Join {invite.household.name}</h1>
        <p className="mb-6 text-center text-sm text-text-2">
          Create your own login. You&apos;ll connect your own accounts — never share bank passwords.
        </p>
        <SignupForm inviteToken={token} email={invite.email} />
      </>
    );
  }
  if (!(await bootstrapOpen(db))) {
    return (
      <p className="card p-5 text-center">
        Sign-up is invite-only. Ask the household owner to send you an invite from Settings ›
        Household.
      </p>
    );
  }
  return (
    <>
      <h1 className="mb-2 text-center text-2xl font-bold">Create your household</h1>
      <p className="mb-6 text-center text-sm text-text-2">
        You&apos;ll be the household owner and can invite one member.
      </p>
      <SignupForm />
    </>
  );
}
