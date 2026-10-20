import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity, computeSustainabilityProgress, loadSustainabilitySnapshot, participationRateOverWindow, computeFoundingProgress, activeMemberCount, maybeSetFounderOnRegistration, runScheduledMaintenance } from "./community";
import {
  sampleSustainabilityWindowDaily,
  renewalsFunctioningInWindow,
  disputePanelsResolvedInWindow,
  consecutiveOnTimeDividendRuns,
  proposalsPerMonthRate,
  founderProposalShareInWindow,
  sustainabilityCriteriaMet,
  type SustainabilityProgress,
  type RawMemberRow,
  type RawContributionRow,
  type RawDelegationRow,
} from "./mechanics";
import { DAY_MS, DEFAULT_PARAMS } from "./params";
import { members, contributions, contributionSectors, delegations, sectors, proposals, communities } from "../db/schema";
import { eq } from "drizzle-orm";

const C2 = DEFAULT_PARAMS.criteria.phase2;

// ---------- Pure daily sampling (decision 1, Amendment C's floor vs. non-declining distinction) ----------

describe("sampleSustainabilityWindowDaily — membership", () => {
  it("a normal daily wobble that nets UP across the window still passes (decision 1: net-with-floor, not strict every-day monotone)", () => {
    // activeWindowDays=0 gives exact per-day control: a contribution at
    // t=k*DAY_MS is active ONLY on day k. Day-by-day active counts:
    // 3, 2, 2, 2, 4 — a real dip mid-window, but end (4) >= start (3).
    const memberRows: RawMemberRow[] = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, joinedAt: 0 }));
    const schedule = [
      [1, 2, 3], // day 0 -> 3 active
      [4, 5], // day 1 -> 2 active
      [6, 7], // day 2 -> 2 active
      [8, 9], // day 3 -> 2 active
      [10, 11, 12, 13], // day 4 -> 4 active
    ];
    const contributionRows: RawContributionRow[] = schedule.flatMap((ids, day) => ids.map((id) => ({ memberId: id, verifiedAt: day * DAY_MS, sectorId: null })));
    const criteria = { ...C2, active: 2, members: 1 };
    const result = sampleSustainabilityWindowDaily(4 * DAY_MS, 4, memberRows, contributionRows, [], [], 0, 365, 365, criteria);
    expect(result.membershipNonDeclining).toBe(true);
    expect(result.membershipFloorHeldEveryDay).toBe(true);
    expect(result.currentActive).toBe(4);
  });

  it("a climb from 2 to 5 that only REACHES the floor at the window's end fails the every-day floor, even though it never declines (the '10 to 150' trap)", () => {
    // activeWindowDays=100 (bigger than the window) makes activity
    // cumulative: once a member contributes, they stay counted as active
    // for the rest of this short window — the realistic shape of
    // membership actually climbing, not resetting daily.
    const memberRows: RawMemberRow[] = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, joinedAt: 0 }));
    const contributionRows: RawContributionRow[] = [
      { memberId: 1, verifiedAt: 0, sectorId: null },
      { memberId: 2, verifiedAt: 0, sectorId: null },
      { memberId: 3, verifiedAt: 1 * DAY_MS, sectorId: null },
      { memberId: 4, verifiedAt: 1 * DAY_MS, sectorId: null },
      { memberId: 5, verifiedAt: 1 * DAY_MS, sectorId: null },
    ];
    const criteria = { ...C2, active: 5, members: 1 };
    const result = sampleSustainabilityWindowDaily(4 * DAY_MS, 4, memberRows, contributionRows, [], [], 100, 365, 365, criteria);
    expect(result.membershipNonDeclining).toBe(true); // 2 -> 5, never goes down
    expect(result.membershipFloorHeldEveryDay).toBe(false); // day 0 was only 2, below the target of 5
    expect(result.currentActive).toBe(5);
  });

  it("member-count floor is checked the same way as the active floor, even though members never decrease (decision 1)", () => {
    const memberRows: RawMemberRow[] = [
      { id: 1, joinedAt: 0 },
      { id: 2, joinedAt: 3 * DAY_MS }, // joins mid-window
    ];
    const criteria = { ...C2, active: 0, members: 2 };
    const result = sampleSustainabilityWindowDaily(4 * DAY_MS, 4, memberRows, [], [], [], 365, 365, 365, criteria);
    // Only 1 member exists until day 3 — the floor of 2 fails on days 0-2.
    expect(result.membershipFloorHeldEveryDay).toBe(false);
    expect(result.currentMembers).toBe(2);
  });
});

describe("sampleSustainabilityWindowDaily — delegation max-share (Charter 9.3 bullet 3)", () => {
  it("held every day when the largest recipient never exceeds the ceiling", () => {
    const delegationRows: RawDelegationRow[] = [
      { memberId: 1, toMemberId: 100, sectorId: null, grantedAt: 0, revokedAt: null },
      { memberId: 2, toMemberId: 101, sectorId: null, grantedAt: 0, revokedAt: null },
      { memberId: 3, toMemberId: 102, sectorId: null, grantedAt: 0, revokedAt: null },
    ];
    const criteria = { ...C2, active: 0, members: 0, maxDelegateShare: 0.5 };
    const result = sampleSustainabilityWindowDaily(2 * DAY_MS, 2, [], [], delegationRows, [], 365, 365, 365, criteria);
    expect(result.maxDelegateShareHeldEveryDay).toBe(true); // each of 3 recipients holds exactly 1/3
  });

  it("fails on even one day where a single recipient crosses the ceiling", () => {
    const delegationRows: RawDelegationRow[] = [
      { memberId: 1, toMemberId: 100, sectorId: null, grantedAt: 0, revokedAt: null },
      { memberId: 2, toMemberId: 100, sectorId: null, grantedAt: 0, revokedAt: null },
      { memberId: 3, toMemberId: 101, sectorId: null, grantedAt: 1 * DAY_MS, revokedAt: null }, // dilutes it from day 1 on
    ];
    const criteria = { ...C2, active: 0, members: 0, maxDelegateShare: 0.5 };
    const result = sampleSustainabilityWindowDaily(2 * DAY_MS, 2, [], [], delegationRows, [], 365, 365, 365, criteria);
    // Day 0: recipient 100 holds 2/2 = 100% > 50% ceiling.
    expect(result.maxDelegateShareHeldEveryDay).toBe(false);
  });
});

describe("sampleSustainabilityWindowDaily — leadership depth (Charter 9.3 bullet 6)", () => {
  it("a Civic Steward needs BOTH a live sector delegation AND standing in that sector (Charter 4.2) — neither alone counts", () => {
    const delegationRows: RawDelegationRow[] = [{ memberId: 1, toMemberId: 50, sectorId: 1, grantedAt: 0, revokedAt: null }];
    // Standing alone, no delegation: member 60 has contributed but nobody delegates to them in sector 1.
    const contributionRows: RawContributionRow[] = [
      { memberId: 50, verifiedAt: 0, sectorId: 1 }, // has both standing and delegation -> a real Steward
      { memberId: 60, verifiedAt: 0, sectorId: 1 }, // standing only, no delegation -> not a Steward
    ];
    const criteria = { ...C2, active: 0, members: 0, stewardsMin: 1, stewardSectorsMin: 1 };
    const result = sampleSustainabilityWindowDaily(0, 0, [], contributionRows, delegationRows, [1], 365, 365, 365, criteria);
    expect(result.currentStewardCount).toBe(1);
    expect(result.currentSectorsWithStewardship).toBe(1);
    expect(result.stewardDepthHeldEveryDay).toBe(true);
  });

  it("fails every-day depth when the second sector only gets covered partway through the window", () => {
    const delegationRows: RawDelegationRow[] = [
      { memberId: 1, toMemberId: 50, sectorId: 1, grantedAt: 0, revokedAt: null },
      { memberId: 2, toMemberId: 51, sectorId: 2, grantedAt: 2 * DAY_MS, revokedAt: null }, // sector 2 only from day 2
    ];
    const contributionRows: RawContributionRow[] = [
      { memberId: 50, verifiedAt: 0, sectorId: 1 },
      { memberId: 51, verifiedAt: 2 * DAY_MS, sectorId: 2 },
    ];
    const criteria = { ...C2, active: 0, members: 0, stewardsMin: 1, stewardSectorsMin: 2 };
    const result = sampleSustainabilityWindowDaily(4 * DAY_MS, 4, [], contributionRows, delegationRows, [1, 2], 365, 365, 365, criteria);
    expect(result.stewardDepthHeldEveryDay).toBe(false); // days 0-1 only had sector 1 covered
    expect(result.currentSectorsWithStewardship).toBe(2); // but it IS covered now
  });
});

// ---------- Window-aggregate pure functions ----------

describe("renewalsFunctioningInWindow (decision 2 — windowed, causal, counts RENEWALS not mere revocations)", () => {
  const WINDOW = 180;
  const ts = 200 * DAY_MS;

  it("is false when a delegation was merely revoked and never renewed", () => {
    const rows: RawDelegationRow[] = [{ memberId: 1, toMemberId: 100, sectorId: null, grantedAt: 10 * DAY_MS, revokedAt: 150 * DAY_MS }];
    expect(renewalsFunctioningInWindow(rows, ts, WINDOW, 365)).toBe(false);
  });

  it("is true when a delegation was revoked and then genuinely re-granted (same delegator, same scope) within the window", () => {
    const rows: RawDelegationRow[] = [
      { memberId: 1, toMemberId: 100, sectorId: null, grantedAt: 10 * DAY_MS, revokedAt: 50 * DAY_MS },
      { memberId: 1, toMemberId: 101, sectorId: null, grantedAt: 60 * DAY_MS, revokedAt: null }, // re-granted, inside [20,200]
    ];
    expect(renewalsFunctioningInWindow(rows, ts, WINDOW, 365)).toBe(true);
  });

  it("is true when a delegation lapsed via expiry (never explicitly revoked) and was then re-granted inside the window", () => {
    const expiryDays = 30;
    const rows: RawDelegationRow[] = [
      { memberId: 1, toMemberId: 100, sectorId: null, grantedAt: 10 * DAY_MS, revokedAt: null }, // lapses at day 40
      { memberId: 1, toMemberId: 100, sectorId: null, grantedAt: 60 * DAY_MS, revokedAt: null }, // granted after it lapsed
    ];
    expect(renewalsFunctioningInWindow(rows, ts, WINDOW, expiryDays)).toBe(true);
  });

  it("is false when the same (delegator, scope) key was granted twice ever, but the second grant falls OUTSIDE the trailing window — unlike Phase I's all-time approximation, which would count this", () => {
    const rows: RawDelegationRow[] = [
      { memberId: 1, toMemberId: 100, sectorId: null, grantedAt: 1 * DAY_MS, revokedAt: 2 * DAY_MS },
      { memberId: 1, toMemberId: 100, sectorId: null, grantedAt: 3 * DAY_MS, revokedAt: null }, // renewal, but ages out of a 180-day window ending at day 200
    ];
    expect(renewalsFunctioningInWindow(rows, ts, WINDOW, 365)).toBe(false);
  });
});

describe("disputePanelsResolvedInWindow", () => {
  it("counts only panels decided within their own window AND inside the trailing window", () => {
    const ts = 200 * DAY_MS;
    const rows = [
      { decidesBy: 20 * DAY_MS, decidedAt: 15 * DAY_MS }, // in time, but outside the 180d trailing window
      { decidesBy: 190 * DAY_MS, decidedAt: 185 * DAY_MS }, // in time AND inside the window
      { decidesBy: 150 * DAY_MS, decidedAt: 160 * DAY_MS }, // decided AFTER its own deadline — not "resolved within its window"
      { decidesBy: 195 * DAY_MS, decidedAt: null }, // never decided
    ];
    expect(disputePanelsResolvedInWindow(rows, ts, 180)).toBe(1);
  });
});

describe("consecutiveOnTimeDividendRuns (decision 4)", () => {
  const periodDays = 30;

  it("is 0 before activation, or with no runs yet", () => {
    expect(consecutiveOnTimeDividendRuns([], null, periodDays)).toBe(0);
    expect(consecutiveOnTimeDividendRuns([{ periodEnd: 100 }], null, periodDays)).toBe(0);
  });

  it("the first run's baseline is dividendActivatedAt, and counts up across genuinely on-time runs", () => {
    const activatedAt = 0;
    const runs = [{ periodEnd: 30 * DAY_MS }, { periodEnd: 60 * DAY_MS }, { periodEnd: 91 * DAY_MS }]; // each within 10% tolerance of 30d
    expect(consecutiveOnTimeDividendRuns(runs, activatedAt, periodDays)).toBe(3);
  });

  it("a late run resets the streak to 0 (it doesn't count toward any streak), not 1", () => {
    const activatedAt = 0;
    const runs = [
      { periodEnd: 30 * DAY_MS },
      { periodEnd: 60 * DAY_MS },
      { periodEnd: 150 * DAY_MS }, // wildly late — breaks the streak
      { periodEnd: 180 * DAY_MS }, // on time relative to the (late) previous run
    ];
    expect(consecutiveOnTimeDividendRuns(runs, activatedAt, periodDays)).toBe(1);
  });
});

describe("proposalsPerMonthRate / founderProposalShareInWindow", () => {
  it("proposalsPerMonthRate scales a window count to a monthly average", () => {
    expect(proposalsPerMonthRate(36, 180)).toBe(6); // 36 proposals over 180 days = 6 months
  });

  it("founderProposalShareInWindow is null (not 0) when there's no founder on record", () => {
    expect(founderProposalShareInWindow([1, 1, 2], null)).toBeNull();
  });

  it("founderProposalShareInWindow is null (not 0) when nothing completed in the window — absence of evidence isn't evidence of independence", () => {
    expect(founderProposalShareInWindow([], 1)).toBeNull();
  });

  it("otherwise computes the real share", () => {
    expect(founderProposalShareInWindow([1, 1, 2, 3], 1)).toBe(0.5);
  });
});

describe("sustainabilityCriteriaMet", () => {
  function metProgress(overrides: Partial<SustainabilityProgress> = {}): SustainabilityProgress {
    return {
      computedAt: 0,
      windowDays: 180,
      historyDays: 200,
      hasFullWindowHistory: true,
      members: C2.members,
      active: C2.active,
      membershipNonDeclining: true,
      membershipFloorHeldEveryDay: true,
      proposalsCompletedInWindow: 100,
      proposalsPerMonth: C2.proposalsPerMonth,
      participationRate: C2.participationRate,
      participationSampleCount: 10,
      currentMaxDelegateShare: 0.01,
      maxDelegateShareHeldEveryDay: true,
      renewalsFunctioning: true,
      consecutiveOnTimeDividendRunsCount: C2.consecutiveDividendRuns,
      reserveComputed: false,
      reserveNonStandardLedgerEntries: 0,
      disputePanelsResolvedInWindow: C2.disputePanels,
      currentStewardCount: C2.stewardsMin,
      currentSectorsWithStewardship: C2.stewardSectorsMin,
      stewardDepthHeldEveryDay: true,
      founderId: 1,
      founderProposalShareInWindow: 0,
      ...overrides,
    };
  }

  it("can NEVER read true this round — reserveComputed is always false (decision 3), by construction, independent of every other field", () => {
    expect(sustainabilityCriteriaMet(metProgress(), C2)).toBe(false);
  });

  it("is false when the window doesn't have enough history yet, regardless of what the numbers say", () => {
    expect(sustainabilityCriteriaMet(metProgress({ hasFullWindowHistory: false }), C2)).toBe(false);
  });

  it("is false when there's no founder on record (founderProposalShareInWindow null), not vacuously true", () => {
    expect(sustainabilityCriteriaMet(metProgress({ founderProposalShareInWindow: null }), C2)).toBe(false);
  });
});

// ---------- DB-backed: the real bulk-fetch computation ----------

async function insertCommunityMember(db: ReturnType<typeof createTestDb>, communityId: number, joinedAt: number, lastActiveAt: number) {
  const [m] = await db.insert(members).values({ communityId, name: `m${Math.random().toString(36).slice(2)}`, email: `${Math.random()}@t.test`, passwordHash: "x", salt: "x", joinedAt, lastActiveAt }).returning();
  return m.id as number;
}

describe("computeSustainabilityProgress — real D1-shaped bulk fetch (Amendment A: query budget)", () => {
  it("runs a fixed, small number of D1 queries, independent of window length", async () => {
    let queryCount = 0;
    const db = createTestDb(() => queryCount++);
    const community = await ensureCommunity(db);
    // A little real activity so every code path (members, contributions,
    // delegations, sectors, proposals, panels, runs, ledger) actually runs.
    const a = await insertCommunityMember(db, community.id, 0, 0);
    const b = await insertCommunityMember(db, community.id, 0, 0);
    const ts = community.createdAt + 200 * DAY_MS;
    await db.insert(contributions).values({ communityId: community.id, memberId: a, domain: "Deliberation", description: "x", loggedAt: 0, verifiedAt: 0, claimedAt: 0 });
    await db.insert(delegations).values({ memberId: a, toMemberId: b, sectorId: null, grantedAt: 0, revokedAt: null });

    queryCount = 0; // fixture setup done — only count the computation itself
    await computeSustainabilityProgress(db, community, ts);
    const countAt180 = queryCount;

    expect(countAt180).toBeGreaterThan(0);
    expect(countAt180).toBeLessThanOrEqual(12); // fixed, small — see this test's own title

    // Prove it's independent of window length: a much longer window must
    // not multiply the query count (the daily sampling is in-memory).
    const longCriteria = { ...community.params.criteria, phase2: { ...community.params.criteria.phase2, nonDecliningWindowDays: 720 } };
    await db.update(communities).set({ params: JSON.stringify({ ...community.params, criteria: longCriteria }) }).where(eq(communities.id, community.id));
    const community2 = await ensureCommunity(db);
    queryCount = 0;
    await computeSustainabilityProgress(db, community2, ts);
    expect(queryCount).toBe(countAt180);
  });
});

describe("computeSustainabilityProgress — consistency with the live, ts-parameterized functions (Amendment B)", () => {
  it("the contribution-reconstructed active/member counts agree with activeMemberCount/direct count at ts=now, on a fixture where contributions are the only activity signal", async () => {
    // activeMemberCount reads members.lastActiveAt, which has no history —
    // it can only ever be compared at ts=now, and only on a fixture built so
    // lastActiveAt coincides with each member's verified-contribution time
    // (see mechanics.ts's own comment on activeMemberIdsAt for why these two
    // sources can otherwise diverge — a login with no contribution counts
    // toward lastActiveAt but not toward this reconstruction).
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const ts = community.createdAt + 200 * DAY_MS;
    const recentlyActive = await insertCommunityMember(db, community.id, 0, ts - 10 * DAY_MS);
    await db.insert(contributions).values({ communityId: community.id, memberId: recentlyActive, domain: "Deliberation", description: "x", loggedAt: ts - 10 * DAY_MS, verifiedAt: ts - 10 * DAY_MS, claimedAt: ts - 10 * DAY_MS });
    const longInactive = await insertCommunityMember(db, community.id, 0, ts - 400 * DAY_MS);
    await db.insert(contributions).values({ communityId: community.id, memberId: longInactive, domain: "Deliberation", description: "x", loggedAt: ts - 400 * DAY_MS, verifiedAt: ts - 400 * DAY_MS, claimedAt: ts - 400 * DAY_MS });

    const progress = await computeSustainabilityProgress(db, community, ts);
    const liveActive = await activeMemberCount(db, community.id, ts, community.params.activeWindowDays);
    const liveMemberCount = (await db.select({ id: members.id }).from(members).where(eq(members.communityId, community.id))).length;

    expect(progress.active).toBe(liveActive);
    expect(progress.members).toBe(liveMemberCount);
  });
});

describe("participationRateOverWindow (Amendment E) — Phase I's own behaviour, unchanged by the extraction", () => {
  it("computeFoundingProgress's majorityMinParticipationOver90d still requires a true MAJORITY (>50%), not merely >=50%, after the extraction", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const ts = community.createdAt + 200 * DAY_MS;
    const [sector] = await db.select().from(sectors).where(eq(sectors.communityId, community.id)).limit(1);
    const by = await insertCommunityMember(db, community.id, 0, 0);

    // Exactly 50/50 (not a majority) -> must read false.
    for (let i = 0; i < 2; i++) {
      await db.insert(proposals).values({
        communityId: community.id, by, title: `p${i}`, why: "x", cls: "ordinary", submittedAt: 0, voteOpensAt: 0,
        votingClosesAt: ts - 10 * DAY_MS, voteFreezeAt: ts - 11 * DAY_MS, stage: "record", metMinParticipation: i === 0 ? 1 : 0,
      });
    }
    const half = await participationRateOverWindow(db, community.id, ts, 90);
    expect(half.rate).toBe(0.5);
    const progressAtHalf = await computeFoundingProgress(db, community, ts);
    expect(progressAtHalf.majorityMinParticipationOver90d).toBe(false);

    // Tip it to a real majority (2 of 3) -> must flip to true.
    await db.insert(proposals).values({
      communityId: community.id, by, title: "p2", why: "x", cls: "ordinary", submittedAt: 0, voteOpensAt: 0,
      votingClosesAt: ts - 5 * DAY_MS, voteFreezeAt: ts - 6 * DAY_MS, stage: "record", metMinParticipation: 1,
    });
    const progressAtMajority = await computeFoundingProgress(db, community, ts);
    expect(progressAtMajority.majorityMinParticipationOver90d).toBe(true);
  });
});

describe("computeSustainabilityProgress — young deployment and founder-unset wording inputs (Amendment C)", () => {
  it("a freshly seeded community has insufficient window history, and reports real history days rather than a fabricated 'not met'", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const ts = community.createdAt + 10 * DAY_MS; // far short of the 180-day window
    const progress = await computeSustainabilityProgress(db, community, ts);
    expect(progress.hasFullWindowHistory).toBe(false);
    expect(progress.historyDays).toBe(10);
    expect(progress.windowDays).toBe(180);
  });

  it("founder is null on a fresh community until /register sets it — founderProposalShareInWindow is null, not a fabricated share", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    expect(community.founderId).toBeNull();
    const ts = community.createdAt + 200 * DAY_MS;
    const progress = await computeSustainabilityProgress(db, community, ts);
    expect(progress.founderId).toBeNull();
    expect(progress.founderProposalShareInWindow).toBeNull();
  });

  it("the reserve-at-current-rate sub-row is always literally not computed — treasuryLedger has never recorded an operating-expenditure kind", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const progress = await computeSustainabilityProgress(db, community, community.createdAt + 200 * DAY_MS);
    expect(progress.reserveComputed).toBe(false);
    expect(progress.reserveNonStandardLedgerEntries).toBe(0);
  });
});

// ---------- maybeSetFounderOnRegistration (post-review fix) ----------
// Review of 0794079 flagged the original unconditional "first registrant
// becomes founder whenever founder_id is null" rule: on the LIVE community
// (existing members, founder_id null right after the migration), the first
// NEW registrant — not the actual founder — would have been permanently
// recorded as one. Fixed to require the registrant be the community's only
// real Member (a freshly seeded community), and to make the write itself
// race-safe (conditioned on founder_id IS NULL at UPDATE time, not just the
// in-memory value this function was handed).

describe("maybeSetFounderOnRegistration", () => {
  it("(a) a fresh community's first registrant becomes founder", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const first = await insertCommunityMember(db, community.id, 0, 0);
    await maybeSetFounderOnRegistration(db, community, first);
    const after = await ensureCommunity(db);
    expect(after.founderId).toBe(first);
  });

  it("(b) a community that already had a real Member when founder_id was still null does NOT auto-set on the next registrant", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    // Simulates the live community: a pre-existing Member from before this
    // column existed, founder_id still null (never backfilled).
    const preExisting = await insertCommunityMember(db, community.id, 0, 0);
    const newRegistrant = await insertCommunityMember(db, community.id, 1, 1);
    await maybeSetFounderOnRegistration(db, community, newRegistrant);
    const after = await ensureCommunity(db);
    expect(after.founderId).toBeNull();
    expect(after.founderId).not.toBe(newRegistrant);
    void preExisting;
  });

  it("(c) a fresh community's SECOND registrant never overwrites the first registrant's founder status", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const first = await insertCommunityMember(db, community.id, 0, 0);
    await maybeSetFounderOnRegistration(db, community, first);
    const second = await insertCommunityMember(db, community.id, 1, 1);
    const communityAfterFirst = await ensureCommunity(db);
    await maybeSetFounderOnRegistration(db, communityAfterFirst, second);
    const after = await ensureCommunity(db);
    expect(after.founderId).toBe(first);
  });

  it("(d) founder_id already set (e.g. the founder set it by hand) is never changed by a later registration", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const handSetFounder = await insertCommunityMember(db, community.id, 0, 0);
    await db.update(communities).set({ founderId: handSetFounder }).where(eq(communities.id, community.id));
    const communityWithFounder = await ensureCommunity(db);
    expect(communityWithFounder.founderId).toBe(handSetFounder);
    const laterRegistrant = await insertCommunityMember(db, community.id, 1, 1);
    await maybeSetFounderOnRegistration(db, communityWithFounder, laterRegistrant);
    const after = await ensureCommunity(db);
    expect(after.founderId).toBe(handSetFounder);
  });
});


describe("Phase I Active count follows Charter 9.1 (live review of 244645e)", () => {
  it("a member who only logged in (lastActiveAt) is NOT Active; a verified contribution in the window is", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const ts = community.createdAt + 100 * DAY_MS;
    const loginOnly = await insertCommunityMember(db, community.id, 0, ts);
    const contributor = await insertCommunityMember(db, community.id, 0, 0);
    await db.insert(contributions).values({ communityId: community.id, memberId: contributor, domain: "Deliberation", description: "x", loggedAt: ts - DAY_MS, verifiedAt: ts - DAY_MS, claimedAt: ts - DAY_MS });
    // A contribution older than the Active window must not count.
    const stale = await insertCommunityMember(db, community.id, 0, 0);
    await db.insert(contributions).values({ communityId: community.id, memberId: stale, domain: "Craft", description: "x", loggedAt: 0, verifiedAt: 0, claimedAt: 0 });

    const founding = await computeFoundingProgress(db, community, ts);
    expect(founding.members).toBe(3);
    expect(founding.active).toBe(1);
    // The petition-threshold counter is deliberately unchanged (still lastActiveAt-based).
    expect(await activeMemberCount(db, community.id, ts, community.params.activeWindowDays)).toBe(1);
    expect(loginOnly).not.toBe(contributor);

    // And Phase II's Membership row agrees with Phase I's figure.
    const sustain = await computeSustainabilityProgress(db, community, ts);
    expect(sustain.active).toBe(founding.active);
  });
});

describe("runScheduledMaintenance — the daily cron does the page-load upkeep too", () => {
  it("refreshes the cached Phase II snapshot with no page load at all", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    expect(await loadSustainabilitySnapshot(db, community.id)).toBeNull();
    await runScheduledMaintenance(db, community, false, {});
    const snap = await loadSustainabilitySnapshot(db, community.id);
    expect(snap).not.toBeNull();
    expect(snap!.progress.windowDays).toBe(180);
  });
});
