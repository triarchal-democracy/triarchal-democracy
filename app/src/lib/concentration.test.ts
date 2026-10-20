import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity, tick, concentrationHolders, concentrationBarred } from "./community";
import { concentrationTier, resolveVote, type VotingMember } from "./mechanics";
import { DAY_MS } from "./params";
import { members, sectors, delegations, proposals, votes, concentrationReviews, record } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";

// Founding Charter 3.6, Rules of Procedure 1.5b — delegation concentration.

const NOW = Date.now();

describe("concentrationTier (Charter 3.6)", () => {
  it("never applies below ten supporters, whatever the share", () => {
    expect(concentrationTier(1, 9, 0.1, 0.2)).toBe("none");
    expect(concentrationTier(0.5, 2, 0.1, 0.2)).toBe("none");
  });
  it("renewal at the renewal share, review at the review share", () => {
    expect(concentrationTier(0.09, 12, 0.1, 0.2)).toBe("none");
    expect(concentrationTier(0.1, 12, 0.1, 0.2)).toBe("renewal");
    expect(concentrationTier(0.199, 12, 0.1, 0.2)).toBe("renewal");
    expect(concentrationTier(0.2, 12, 0.1, 0.2)).toBe("review");
  });
});

describe("resolveVote with the shorter cycle for concentrated holders", () => {
  const holder = 99;
  const members_: VotingMember[] = [
    { id: 1, delegations: [{ toId: holder, grantedAt: NOW - 120 * DAY_MS, sectorId: null }] }, // past 90 days, within 365
    { id: 2, delegations: [{ toId: holder, grantedAt: NOW - 30 * DAY_MS, sectorId: null }] },
    { id: 3, delegations: [{ toId: 5, grantedAt: NOW - 120 * DAY_MS, sectorId: null }] }, // not a concentrated holder
    { id: holder, delegations: [] },
    { id: 5, delegations: [] },
  ];
  const votes_ = { [holder]: true, 5: true };

  it("without it, a 120-day-old delegation still counts on an ordinary vote", () => {
    expect(resolveVote(members_, votes_, NOW, 365, []).participating).toBe(5);
  });
  it("with it, only delegations to the concentrated holder are cut off at 90 days", () => {
    const t = resolveVote(members_, votes_, NOW, 365, [], { targets: new Set([holder]), days: 90 });
    expect(t.resolutions[1]).toBeUndefined(); // 120 days to the concentrated holder: lapsed
    expect(t.resolutions[2]?.val).toBe(true); // 30 days: counts
    expect(t.resolutions[3]?.val).toBe(true); // 120 days to an ordinary holder: still counts
  });
});

async function setup() {
  const db = createTestDb();
  const community = await ensureCommunity(db);
  const [sector] = await db.insert(sectors).values({ communityId: community.id, name: "Housing", createdAt: 0 }).returning();
  const ids: number[] = [];
  for (let i = 0; i < 40; i++) {
    const [m] = await db
      .insert(members)
      .values({ communityId: community.id, name: `c${i}`, email: `c${i}@t.test`, passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: NOW, phone: `+1555${5000000 + i}` })
      .returning();
    ids.push(m.id);
  }
  // 12 delegate to ids[0] (30% of 40), the other 28 spread over four holders at 7 each (no ten-supporter floor met).
  const holder = ids[0];
  for (let i = 1; i <= 12; i++) await db.insert(delegations).values({ memberId: ids[i], toMemberId: holder, sectorId: sector.id, grantedAt: NOW - 10 * DAY_MS, revokedAt: null });
  const others = [ids[1 + 12], ids[2 + 12], ids[3 + 12], ids[4 + 12]];
  for (let i = 13; i < 40; i++) {
    const to = others[i % 4];
    if (ids[i] === to) continue;
    await db.insert(delegations).values({ memberId: ids[i], toMemberId: to, sectorId: sector.id, grantedAt: NOW - 10 * DAY_MS, revokedAt: null });
  }
  return { db, community, sector, ids, holder };
}
type S = Awaited<ReturnType<typeof setup>>;

async function openReviewVoteNow(s: S, yesVoters: number[]) {
  const [review] = await s.db.select().from(concentrationReviews);
  await s.db.update(proposals).set({ stage: "voting", voteOpensAt: NOW - 3 * DAY_MS, votingClosesAt: NOW - 1000 }).where(eq(proposals.id, review.proposalId));
  for (const id of yesVoters) await s.db.insert(votes).values({ proposalId: review.proposalId, memberId: id, value: 1, castAt: NOW - 2 * DAY_MS });
  return review;
}

describe("concentration review (Charter 3.6, Rules of Procedure 1.5b)", () => {
  it("a holder at the review share is a concentrated holder and a review opens once, automatically", async () => {
    const s = await setup();
    expect((await concentrationHolders(s.db, s.community.id, s.community.params, NOW, [s.sector.id])).has(s.holder)).toBe(true);
    await tick(s.db, s.community);
    await tick(s.db, s.community);
    const reviews = await s.db.select().from(concentrationReviews);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].memberId).toBe(s.holder);
    expect(reviews[0].supporters).toBe(12);
    const [p] = await s.db.select().from(proposals).where(eq(proposals.id, reviews[0].proposalId));
    expect(p.positionAction).toBe("concentration");
    expect(p.cls).toBe("position");
    expect(p.targetSectorId).toBe(s.sector.id);
    const log = await s.db.select().from(record);
    expect(log.some((r) => /Concentration review opened automatically/.test(r.text))).toBe(true);
  });

  it("a holder with fewer than ten supporters is never reviewed", async () => {
    const s = await setup();
    await s.db.update(delegations).set({ revokedAt: NOW }).where(and(eq(delegations.toMemberId, s.holder), eq(delegations.memberId, s.ids[1])));
    await s.db.update(delegations).set({ revokedAt: NOW }).where(and(eq(delegations.toMemberId, s.holder), eq(delegations.memberId, s.ids[2])));
    await s.db.update(delegations).set({ revokedAt: NOW }).where(and(eq(delegations.toMemberId, s.holder), eq(delegations.memberId, s.ids[3])));
    await tick(s.db, s.community);
    expect(await s.db.select().from(concentrationReviews)).toHaveLength(0);
  });

  it("a failed review ends the delegations to the holder in that sector and bars new ones", async () => {
    const s = await setup();
    await tick(s.db, s.community);
    await openReviewVoteNow(s, []); // nobody votes: minimum participation fails
    await tick(s.db, s.community);
    const [r] = await s.db.select().from(concentrationReviews);
    expect(r.outcome).toBe("ended");
    const live = await s.db.select().from(delegations).where(and(eq(delegations.toMemberId, s.holder), isNull(delegations.revokedAt)));
    expect(live).toHaveLength(0);
    expect(await concentrationBarred(s.db, s.community.id, s.community.params, s.holder, s.sector.id, NOW + DAY_MS)).toBe(true);
    expect(await concentrationBarred(s.db, s.community.id, s.community.params, s.holder, null, NOW + DAY_MS)).toBe(true);
    expect(await concentrationBarred(s.db, s.community.id, s.community.params, s.holder, s.sector.id, NOW + 91 * DAY_MS)).toBe(false);
    expect(await concentrationBarred(s.db, s.community.id, s.community.params, s.ids[5], s.sector.id, NOW + DAY_MS)).toBe(false);
  });

  it("a ratified review keeps the delegations, and none reopens within the review interval", async () => {
    const s = await setup();
    await tick(s.db, s.community);
    await openReviewVoteNow(s, s.ids.slice(0, 38));
    await tick(s.db, s.community);
    const [r] = await s.db.select().from(concentrationReviews);
    expect(r.outcome).toBe("kept");
    const live = await s.db.select().from(delegations).where(and(eq(delegations.toMemberId, s.holder), isNull(delegations.revokedAt)));
    expect(live).toHaveLength(12);
    await tick(s.db, s.community);
    expect(await s.db.select().from(concentrationReviews)).toHaveLength(1);
  });
});
