import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { apiHandler, ApiError, requireApiAuth } from "@/lib/auth-guard";
import { parseBody } from "@/lib/http";
import { createInvite, InviteError } from "@/lib/invites";
import { emailSender } from "@/lib/email";

const Body = z.object({ email: z.string().max(200) });

export const POST = apiHandler(async (req: Request) => {
  const { viewer, user } = await requireApiAuth();
  const { email } = await parseBody(req, Body);
  let invite;
  try {
    invite = await createInvite(db, viewer, email, env().APP_URL);
  } catch (e) {
    if (e instanceof InviteError) throw new ApiError(e.code === "forbidden" ? 403 : 400, e.code);
    throw e;
  }
  const sent = await emailSender().send({
    to: invite.email,
    subject: `${user.name} invited you to Household Money`,
    text: `${user.name} invited you to share a household dashboard.\n\nAccept (link expires in 7 days):\n${invite.link}\n\nYou'll create your own password and set up 2-factor authentication. Never share bank passwords.`,
  });
  // The link is returned once so the owner can share it directly if email isn't configured.
  return NextResponse.json({
    invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt },
    link: invite.link,
    emailed: sent.delivered,
  });
});
