import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiHandler, ApiError } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { AuthError, signup } from "@/lib/auth-service";
import { createSession } from "@/lib/session";

const Body = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
  inviteToken: z.string().max(200).optional(),
});

export const POST = apiHandler(async (req: Request) => {
  const body = await parseBody(req, Body);
  try {
    const r = await signup(db, body);
    await createSession(r.userId, false);
    return NextResponse.json({ ok: true, next: "/enroll" });
  } catch (e) {
    if (e instanceof AuthError) throw new ApiError(400, e.code, e.message);
    throw e;
  }
});
