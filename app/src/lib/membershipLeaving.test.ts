import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity, leaveMembership, computeFoundingProgress, loadVotingMembers, writeRecord } from "./community";
import { sampleSustainabilityWindowDaily, type RawMemberRow, type RawContributionRow } from "./mechanics";
import { isMinimumAgeDeclared } from "./auth";
import { DAY_MS, DEFAULT_PARAMS } from "./params";
import { members, delegations, sessions, contributions, record, memberSectorFollows, sectors } from "../db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { RegisterPage } from "../views/auth";
import { LeaveMembershipPage, LeftMembershipPage } from "../views/profile";

// Charter 1.3 — leaving — and Charter 1.1's age declaration.

const C2 = DEFAULT_PARAMS.criteria.phase2;

async function addMember(db: ReturnType<typeof createTestDb>, communityId: number, name: string) {
  const [m] = await db
    .insert(members)
    .values({ communityId, name, email: `${name}@t.test`, passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: 0, phone: `+1555${Math.floor(Math.random() * 1e7)}` })
    .returning();
  return m;
}

describe("leaveMembership (Charter 1.3)", () => {
  it("revokes delegations both ways, clears sessions/follows/contact details, keeps the record and contributions, and logs it", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const a = await addMember(db, community.id, "alice");
    const b = await addMember(db, community.id, "bob");
    const c = await addMember(db, community.id, "carol");
    const ts = 1_000_000;
    await db.insert(delegations).values([
      { memberId: a.id, toMemberId: b.id, sectorId: null, grantedAt: 0, revokedAt: null }, // alice delegates to bob
      { memberId: c.id, toMemberId: a.id, sectorId: null, grantedAt: 0, revokedAt: null }, // carol delegates to alice
      { memberId: b.id, toMemberId: c.id, sectorId: null, grantedAt: 0, revokedAt: null }, // unrelated
    ]);
    await db.insert(sessions).values({ token: "tok-a", memberId: a.id, expiresAt: ts + 1000 });
    const [sec] = await db.insert(sectors).values({ communityId: community.id, name: "S", createdAt: 0 }).returning();
    await db.insert(memberSectorFollows).values({ memberId: a.id, sectorId: sec.id, followedAt: 0 });
    await db.insert(contributions).values({ communityId: community.id, memberId: a.id, domain: "Craft", description: "kept", loggedAt: 0, verifiedAt: 0, claimedAt: 0 });

    const result = await leaveMembership(db, community, a.id, ts);
    expect(result).toEqual({ ok: true });

    const [after] = await db.select().from(members).where(eq(members.id, a.id));
    expect(after.leftAt).toBe(ts);
    expect(after.email).not.toContain("alice@");
    expect(after.email).toMatch(/@left\.triarc\.internal$/);
    expect(after.phone).toBeNull();
    expect(after.name).toBe("alice"); // the public handle stays, because the record carries it

    const live = await db.select().from(delegations).where(isNull(delegations.revokedAt));
    expect(live.map((d) => d.memberId)).toEqual([b.id]); // only the unrelated bob->carol one survives
    expect(await db.select().from(sessions).where(eq(sessions.memberId, a.id))).toHaveLength(0);
    expect(await db.select().from(memberSectorFollows).where(eq(memberSectorFollows.memberId, a.id))).toHaveLength(0);
    expect(await db.select().from(contributions).where(eq(contributions.memberId, a.id))).toHaveLength(1);

    const log = await db.select().from(record).where(and(eq(record.memberId, a.id), eq(record.kind, "member")));
    expect(log.some((r) => /left .*Charter 1\.3/.test(r.text))).toBe(true);
  });

  it("is final: a second call reports already-left, and a seat placeholder can't 'leave'", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const a = await addMember(db, community.id, "alice");
    await leaveMembership(db, community, a.id, 10);
    expect(await leaveMembership(db, community, a.id, 20)).toEqual({ ok: false, reason: "already-left" });
    const [seat] = await db.insert(members).values({ communityId: community.id, name: "seat1", email: "s@t.test", passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: 0, seatKind: "default_delegate_seat" }).returning();
    expect(await leaveMembership(db, community, seat.id, 20)).toEqual({ ok: false, reason: "not-a-member" });
  });

  it("a member who has left stops counting everywhere a Member is counted", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const a = await addMember(db, community.id, "alice");
    await addMember(db, community.id, "bob");
    const before = await computeFoundingProgress(db, community, 100);
    expect(before.members).toBe(2);
    expect((await loadVotingMembers(db, community.id)).length).toBe(2);

    await leaveMembership(db, community, a.id, 50);
    const after = await computeFoundingProgress(db, community, 100);
    expect(after.members).toBe(1);
    expect((await loadVotingMembers(db, community.id)).length).toBe(1);
  });
});

describe("Phase II history respects leaving", () => {
  it("a Member counts on the days before they left and not after, and a recent contribution doesn't keep them Active once they've left", () => {
    const memberRows: RawMemberRow[] = [
      { id: 1, joinedAt: 0 },
      { id: 2, joinedAt: 0, leftAt: 2 * DAY_MS },
    ];
    // Both contributed on day 0; a long active window keeps them "recent" for the whole short window.
    const contributionRows: RawContributionRow[] = [
      { memberId: 1, verifiedAt: 0, sectorId: null },
      { memberId: 2, verifiedAt: 0, sectorId: null },
    ];
    const criteria = { ...C2, members: 2, active: 2 };
    const r = sampleSustainabilityWindowDaily(4 * DAY_MS, 4, memberRows, contributionRows, [], [], 100, 365, 365, criteria);
    expect(r.currentMembers).toBe(1);
    expect(r.currentActive).toBe(1);
    // Day 0 and 1 had two; from day 2 on only one, so "2 Active every day" does not hold.
    expect(r.membershipFloorHeldEveryDay).toBe(false);
  });
});

describe("age declaration (Charter 1.1)", () => {
  it("only an explicit tick counts", () => {
    expect(isMinimumAgeDeclared("on")).toBe(true);
    expect(isMinimumAgeDeclared(undefined)).toBe(false);
    expect(isMinimumAgeDeclared("")).toBe(false);
    expect(isMinimumAgeDeclared("off")).toBe(false);
  });

  it("the minimum age is 18: the registration form carries one required 'at least 18' box and no second age box", () => {
    const html = String(RegisterPage({ communityName: "The Triarc", requirePhoneVerification: false }));
    const box = html.match(/<input[^>]*name="minimumAge"[^>]*>/)![0];
    expect(box).toMatch(/required/);
    expect(html).toMatch(/I am at least 18 years old\. Members must be 18 or older; an account found to belong to someone younger is closed and its personal data deleted\./);
    expect(html).toMatch(/aged 18 or older/i);
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    expect(html).not.toMatch(/name="adult"/);
    expect(html).not.toMatch(/age of majority/i);
  });
});

describe("leave pages", () => {
  it("the leave page states what happens, never pressures, and asks for the username", () => {
    const html = String(LeaveMembershipPage({ member: { id: 1, name: "alice" }, adminDebug: false, communityName: "The Triarc" }));
    expect(html).toMatch(/Contribution Record stays in the public history/);
    expect(html).toMatch(/final/i);
    expect(html).toMatch(/name="confirmName"/);
    expect(html).not.toMatch(/are you sure you want to abandon|come back|we.ll miss/i);
  });

  it("the goodbye page is plain", () => {
    expect(String(LeftMembershipPage({ communityName: "The Triarc" }))).toMatch(/You have left The Triarc/);
  });
});
