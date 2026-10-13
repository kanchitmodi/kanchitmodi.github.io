"use client";

export class ClientApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  invalid_credentials: "Email or password is incorrect.",
  rate_limited: "Too many attempts. Try again in 15 minutes.",
  email_taken: "An account with that email already exists.",
  signup_closed: "Sign-up is invite-only. Ask the household owner for an invite link.",
  invite_invalid: "This invite link is invalid or has expired.",
  invite_email_mismatch: "Use the email address the invite was sent to.",
  household_full: "This household already has two members.",
  already_member: "That person already belongs to a household.",
  invalid_email: "Enter a valid email address.",
  forbidden: "You don't have permission to do that.",
};

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "same-origin",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : "error";
    const message =
      (typeof json.message === "string" && json.message !== code ? json.message : undefined) ??
      FRIENDLY[code] ??
      "Something went wrong. Please try again.";
    if (res.status === 401 && code === "locked") window.location.href = "/lock";
    throw new ClientApiError(res.status, code, message);
  }
  return json as T;
}
