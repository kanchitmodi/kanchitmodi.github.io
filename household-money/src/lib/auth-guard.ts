import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAuth, type AuthContext } from "./session";

/** For server components/pages: redirect to the right auth step when not fully signed in. */
export async function requirePageAuth(): Promise<AuthContext> {
  const r = await getAuth();
  if (r.ok) return r.ctx;
  switch (r.reason) {
    case "mfa_pending":
      redirect("/login/2fa");
    case "locked":
      redirect("/lock");
    case "no_household":
      redirect("/login?error=no_household");
    default:
      redirect("/login");
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** For route handlers. Throws ApiError(401) with a machine-readable code. */
export async function requireApiAuth(): Promise<AuthContext> {
  const r = await getAuth();
  if (!r.ok) throw new ApiError(401, r.reason);
  return r.ctx;
}

export function apiHandler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
      }
      console.error(e);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  };
}
