import bcrypt from "bcryptjs";

export const PASSWORD_MIN_LENGTH = 10;

export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (pw.length > 200) return "Password is too long";
  return null;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, process.env.NODE_ENV === "test" ? 4 : 12);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

let dummy: Promise<string> | undefined;
/** A real bcrypt hash to compare against when the user doesn't exist (constant-time-ish login). */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("not-a-real-password-placeholder");
  return dummy;
}
