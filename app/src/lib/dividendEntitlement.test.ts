import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity, tick } from "./community";
import { DAY_MS } from "./params";
import { members, contributions, treasuryState, dividendRuns, communities, record } from "../db/schema";
import { eq } from "drizzle-orm";

// Treasury Code 9.1-9.2 — every verified Member is entitled, and the equal share
// divides across all of them. The legacy adult_attested_at column is ignored.

const NOW = Date.now();

describe("the dividend run (Treasury Code 9.2)", () => {
  it("counts every verified Member in the divisor, whatever the legacy adult_attested_at column holds", async () => {
    const db = createTestDb();
    let community = await ensureCommunity(db);
    const periodStart = NOW - community.params.periodDays * DAY_MS - DAY_MS;
    await db.update(communities).set({ dividendActivatedAt: NOW - 100 * DAY_MS }).where(eq(communities.id, community.id));
    community = { ...community, dividendActivatedAt: NOW - 100 * DAY_MS };
    await db.update(treasuryState).set({ lastDividendAt: periodStart, dividendBalance: 1000 }).where(eq(treasuryState.communityId, community.id));
    // legacy values: long before the cycle, never set, and after the cycle began
    const legacy = [periodStart - 10 * DAY_MS, null, periodStart + 2 * DAY_MS, null, periodStart - DAY_MS];
    const ids: number[] = [];
    for (let i = 0; i < legacy.length; i++) {
      const [m] = await db
        .insert(members)
        .values({ communityId: community.id, name: `m${i}`, email: `m${i}@t.test`, passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: NOW, phone: `+1555${5000000 + i}`, adultAttestedAt: legacy[i] })
        .returning();
      await db.insert(contributions).values({ communityId: community.id, memberId: m.id, domain: "Craft", description: "work", loggedAt: periodStart + DAY_MS, verifiedAt: periodStart + DAY_MS, claimedAt: periodStart + DAY_MS });
      ids.push(m.id);
    }
    await tick(db, community);
    const [run] = await db.select().from(dividendRuns);
    expect(run).toBeDefined();
    const per = JSON.parse(run.perMember) as { id: number; foundationAmount: number; totalAmount: number }[];
    expect(per.map((p) => p.id).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    // the Foundation tier is split five ways, equally
    const foundation = per.map((p) => p.foundationAmount);
    expect(new Set(foundation).size).toBe(1);
    expect(foundation[0]).toBe(Math.floor((1000 * community.params.foundationPoolShare) / legacy.length));
    // identical work, identical totals
    expect(new Set(per.map((p) => p.totalAmount)).size).toBe(1);
    const log = await db.select().from(record);
    expect(log.some((r) => /attested|age of majority/i.test(r.text))).toBe(false);
  });
});
