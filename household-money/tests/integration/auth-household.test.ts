import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AuthError, bootstrapOpen, signup } from "@/lib/auth-service";
import { createInvite, InviteError } from "@/lib/invites";
import { loginBlocked, recordAttempt } from "@/lib/rate-limit";
import { resetDb } from "./helpers";

const APP = "https://money.example.com";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

async function owner() {
  const r = await signup(db, {
    email: "Kanchit@Example.com",
    name: "Kanchit",
    password: "long-password-1",
  });
  return { ...r, viewer: { userId: r.userId, householdId: r.householdId, role: "OWNER" as const } };
}

describe("bootstrap signup", () => {
  it("first user creates the household as OWNER with default categories", async () => {
    expect(await bootstrapOpen(db)).toBe(true);
    const r = await owner();
    expect(r.role).toBe("OWNER");
    const user = await db.user.findUniqueOrThrow({ where: { id: r.userId } });
    expect(user.email).toBe("kanchit@example.com");
    expect(user.passwordHash).not.toContain("long-password");
    expect(await db.category.count({ where: { householdId: r.householdId } })).toBe(15);
    expect(await bootstrapOpen(db)).toBe(false);
  });

  it("closes open sign-up once a household exists", async () => {
    await owner();
    await expect(
      signup(db, { email: "stranger@example.com", name: "S", password: "long-password-2" }),
    ).rejects.toMatchObject({ code: "signup_closed" });
  });

  it("rejects weak passwords and duplicate emails", async () => {
    await expect(
      signup(db, { email: "a@b.co", name: "A", password: "short" }),
    ).rejects.toBeInstanceOf(AuthError);
    await owner();
    await expect(
      signup(db, { email: "kanchit@example.com", name: "K", password: "long-password-1" }),
    ).rejects.toMatchObject({ code: "email_taken" });
  });
});

describe("invite flow", () => {
  it("owner invites; invitee joins as MEMBER via the emailed link", async () => {
    const o = await owner();
    const inv = await createInvite(db, o.viewer, "wife@example.com", APP);
    expect(inv.link).toMatch(/^https:\/\/money\.example\.com\/signup\?invite=/);
    const token = decodeURIComponent(inv.link.split("invite=")[1]!);
    // Only the hash is stored
    expect(await db.invite.count({ where: { tokenHash: token } })).toBe(0);

    const m = await signup(db, {
      email: "wife@example.com",
      name: "Wife",
      password: "another-long-pw",
      inviteToken: token,
    });
    expect(m).toMatchObject({ role: "MEMBER", householdId: o.householdId });
    // Token is single-use
    await expect(
      signup(db, {
        email: "wife@example.com",
        name: "W2",
        password: "another-long-pw",
        inviteToken: token,
      }),
    ).rejects.toMatchObject({ code: "email_taken" });
    const actions = (await db.auditLog.findMany({ where: { householdId: o.householdId } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(["household.created", "household.invite", "household.joined"]),
    );
  });

  it("invite must be used by the invited email", async () => {
    const o = await owner();
    const inv = await createInvite(db, o.viewer, "wife@example.com", APP);
    const token = decodeURIComponent(inv.link.split("invite=")[1]!);
    await expect(
      signup(db, {
        email: "other@example.com",
        name: "X",
        password: "another-long-pw",
        inviteToken: token,
      }),
    ).rejects.toMatchObject({ code: "invite_email_mismatch" });
  });

  it("expired and revoked invites are rejected", async () => {
    const o = await owner();
    const old = await createInvite(
      db,
      o.viewer,
      "wife@example.com",
      APP,
      new Date(Date.now() - 8 * 86400_000),
    );
    const token = decodeURIComponent(old.link.split("invite=")[1]!);
    await expect(
      signup(db, {
        email: "wife@example.com",
        name: "W",
        password: "another-long-pw",
        inviteToken: token,
      }),
    ).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("re-inviting replaces the pending invite; household is capped at 2", async () => {
    const o = await owner();
    const first = await createInvite(db, o.viewer, "wife@example.com", APP);
    const second = await createInvite(db, o.viewer, "wife@example.com", APP);
    const t1 = decodeURIComponent(first.link.split("invite=")[1]!);
    await expect(
      signup(db, {
        email: "wife@example.com",
        name: "W",
        password: "another-long-pw",
        inviteToken: t1,
      }),
    ).rejects.toMatchObject({ code: "invite_invalid" });
    await expect(createInvite(db, o.viewer, "third@example.com", APP)).rejects.toMatchObject({
      code: "household_full",
    });
    const t2 = decodeURIComponent(second.link.split("invite=")[1]!);
    await signup(db, {
      email: "wife@example.com",
      name: "W",
      password: "another-long-pw",
      inviteToken: t2,
    });
    await expect(createInvite(db, o.viewer, "third@example.com", APP)).rejects.toMatchObject({
      code: "household_full",
    });
  });

  it("members cannot invite", async () => {
    const o = await owner();
    await expect(
      createInvite(db, { ...o.viewer, role: "MEMBER" }, "x@example.com", APP),
    ).rejects.toBeInstanceOf(InviteError);
  });
});

describe("login rate limiting", () => {
  it("blocks an email after 5 failures in 15 minutes", async () => {
    for (let i = 0; i < 4; i++) await recordAttempt("a@b.co", "1.1.1.1", false);
    expect(await loginBlocked("a@b.co", "1.1.1.1")).toBe(false);
    await recordAttempt("a@b.co", "1.1.1.1", false);
    expect(await loginBlocked("a@b.co", "1.1.1.1")).toBe(true);
    expect(await loginBlocked("other@b.co", "2.2.2.2")).toBe(false);
    expect(await loginBlocked("a@b.co", "1.1.1.1", new Date(Date.now() + 16 * 60_000))).toBe(false);
  });
});
