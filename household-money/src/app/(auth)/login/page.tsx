import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="mb-6 text-center text-2xl font-bold">Sign in</h1>
      {error === "no_household" && (
        <p role="alert" className="mb-4 rounded-lg bg-surface-2 p-3 text-sm">
          Your account isn&apos;t part of a household. Ask the owner for a new invite.
        </p>
      )}
      <LoginForm demo={process.env.DEMO_MODE === "true"} />
    </>
  );
}
