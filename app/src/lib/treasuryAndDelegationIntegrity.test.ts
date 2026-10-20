import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity, addToTreasury, claimDividendRun, insertDelegationOnce, tick } from "./community";
import { members, delegations, sectors, treasuryState } from "../db/schema";
import { and, eq, isNull } from "drizzle-orm";

// Data-integrity guards (docs/reviews/2026-10-app-review.md M1, M2).

async function addMember(db: ReturnType<typeof createTestDb>, communityId: number, name: string) {
  const [m] = await db
    .insert(members)
    .values({ communityId, name, email: `${name}@t.test`, passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: 0, phone: `+1555${Math.floor(Math.random() * 1e7)}` })
    .returning();
  return m;
}

describe("delegations: one live delegation per scope (Charter 3.4)", () => {
  it("refuses a second live entire-scope delegation from the same Member", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const a = await addMember(db, community.id, "alice");
    const b = await addMember(db, community.id, "bob");
    const c = await addMember(db, community.id, "carol");
    expect(await insertDelegationOnce(db, { memberId: a.id, toMemberId: b.id, sectorId: null, grantedAt: 1, revokedAt: null })).toBe(true);
    expect(await insertDelegationOnce(db, { memberId: a.id, toMemberId: c.id, sectorId: null, grantedAt: 2, revokedAt: null })).toBe(false);
    const live = await db.select().from(delegations).where(and(eq(delegations.memberId, a.id), isNull(delegations.revokedAt)));
    expect(live).toHaveLength(1);
    expect(live[0].toMemberId).toBe(b.id);
  });

  it("refuses a second live delegation for the same sector, but allows other sectors and other Members", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const a = await addMember(db, community.id, "alice");
    const b = await addMember(db, community.id, "bob");
    const [s1] = await db.insert(sectors).values({ communityId: community.id, name: "S1", createdAt: 0 }).returning();
    const [s2] = await db.insert(sectors).values({ communityId: community.id, name: "S2", createdAt: 0 }).returning();
    expect(await insertDelegationOnce(db, { memberId: a.id, toMemberId: b.id, sectorId: s1.id, grantedAt: 1, revokedAt: null })).toBe(true);
    expect(await insertDelegationOnce(db, { memberId: a.id, toMemberId: b.id, sectorId: s1.id, grantedAt: 2, revokedAt: null })).toBe(false);
    expect(await insertDelegationOnce(db, { memberId: a.id, toMemberId: b.id, sectorId: s2.id, grantedAt: 3, revokedAt: null })).toBe(true);
    expect(await insertDelegationOnce(db, { memberId: b.id, toMemberId: a.id, sectorId: s1.id, grantedAt: 4, revokedAt: null })).toBe(true);
  });

  it("allows a new live delegation once the previous one is revoked (renewal, re-grant)", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const a = await addMember(db, community.id, "alice");
    const b = await addMember(db, community.id, "bob");
    expect(await insertDelegationOnce(db, { memberId: a.id, toMemberId: b.id, sectorId: null, grantedAt: 1, revokedAt: null })).toBe(true);
    await db.update(delegations).set({ revokedAt: 5 }).where(eq(delegations.memberId, a.id));
    expect(await insertDelegationOnce(db, { memberId: a.id, toMemberId: b.id, sectorId: null, grantedAt: 6, revokedAt: null })).toBe(true);
    expect(await db.select().from(delegations).where(eq(delegations.memberId, a.id))).toHaveLength(2);
  });
});

describe("treasury: atomic increments and the once-only dividend claim", () => {
  it("addToTreasury adds to the stored balance, so interleaved additions all count", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await Promise.all([
      addToTreasury(db, community.id, { ops: 40, dividend: 40, reserve: 20 }),
      addToTreasury(db, community.id, { ops: 4, dividend: 4, reserve: 2 }),
      addToTreasury(db, community.id, { ops: 400, dividend: 400, reserve: 200 }),
    ]);
    const [t] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));
    expect([t.opsBalance, t.dividendBalance, t.reserveBalance]).toEqual([444, 444, 222]);
  });

  it("claimDividendRun succeeds once per period: a second claim against the same previous run loses", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const [t] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));
    expect(await claimDividendRun(db, community.id, t.lastDividendAt, t.lastDividendAt + 1000)).toBe(true);
    expect(await claimDividendRun(db, community.id, t.lastDividendAt, t.lastDividendAt + 2000)).toBe(false);
    const [after] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));
    expect(after.lastDividendAt).toBe(t.lastDividendAt + 1000);
  });

  it("two overlapping ticks run an overdue dividend cycle exactly once, and keep a donation made meanwhile", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    await db.update(treasuryState).set({ lastDividendAt: 0, dividendBalance: 100 }).where(eq(treasuryState.communityId, community.id));
    await Promise.all([tick(db, community), tick(db, community), addToTreasury(db, community.id, { ops: 0, dividend: 7, reserve: 0 })]);
    const [t] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));
    expect(t.dividendsPaid).toBe(1);
    // nobody is a Member, so nothing is distributed: the pool (100) plus the 7 donated meanwhile is all still there
    expect(t.dividendBalance).toBe(107);
  });
});
