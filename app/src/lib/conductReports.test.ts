import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import {
  ensureCommunity,
  fileConductReport,
  processDrawRequests,
  seatedPanelistIds,
  tick,
  priorSanctionSteps,
  participationSuspendedUntil,
  activeSuspensions,
  computePeriodCredits,
  DISPUTE_PANEL_SIZE,
} from "./community";
import type { BeaconFetch } from "./panelDraw";
import { DAY_MS } from "./params";
import { ACCRUAL_SUSPENSION_DAYS, PARTICIPATION_SUSPENSION_DAYS } from "./conduct";
import { members, contributions, conductReports, disputePanels, disputePanelVotes, memberSanctions, record } from "../db/schema";
import { eq } from "drizzle-orm";

// Code of Conduct 2-4; Dispute Procedure Code 4, 7.1.

const NOW = Date.now(); // tick() reads the real clock; fixtures are built around it
const goodBeacon: BeaconFetch = async (url) => {
  const round = Number(url.split("/").pop());
  return { ok: true, json: async () => ({ round, randomness: (round.toString(16).padStart(8, "0") + "cd").repeat(8).slice(0, 64) }) };
};

async function setup(volunteers = 40) {
  const db = createTestDb();
  const community = await ensureCommunity(db);
  const ids: number[] = [];
  for (let i = 0; i < volunteers + 2; i++) {
    const [m] = await db
      .insert(members)
      .values({
        communityId: community.id,
        name: `m${i}`,
        email: `m${i}@t.test`,
        passwordHash: "x",
        salt: "x",
        joinedAt: 0,
        lastActiveAt: NOW,
        phone: `+1555${2000000 + i}`,
        disputePoolOptInAt: i >= 2 ? NOW : null,
      })
      .returning();
    ids.push(m.id);
  }
  return { db, community, reporter: ids[0], accused: ids[1] };
}

async function seatPanel(s: Awaited<ReturnType<typeof setup>>, provision = "2.1", extra: { contributionIds?: number[] } = {}) {
  const r = await fileConductReport(s.db, s.community, s.reporter, { accusedId: s.accused, provision, statement: "They did the thing.", contributionIds: extra.contributionIds }, NOW);
  if (!r.ok) throw new Error(r.reason);
  await processDrawRequests(s.db, s.community, NOW, { fetchFn: goodBeacon });
  const [report] = await s.db.select().from(conductReports).where(eq(conductReports.id, r.reportId));
  const panelId = report.panelId!;
  const seated = await seatedPanelistIds(s.db, panelId);
  return { reportId: r.reportId, panelId, seated };
}

async function castVotes(s: Awaited<ReturnType<typeof setup>>, panelId: number, seated: number[], steps: number[], badFaith = 0) {
  for (let i = 0; i < steps.length; i++) {
    await s.db.insert(disputePanelVotes).values({ panelId, memberId: seated[i], upheld: steps[i] > 0 ? 1 : 0, step: steps[i], reasoning: `reason ${i}`, badFaith: i < badFaith ? 1 : 0, votedAt: NOW });
  }
}

async function makeDueAndTick(s: Awaited<ReturnType<typeof setup>>, panelId: number) {
  await s.db.update(disputePanels).set({ decidesBy: NOW - 1000, respondBy: NOW - 1000 }).where(eq(disputePanels.id, panelId));
  await tick(s.db, s.community);
  const [panel] = await s.db.select().from(disputePanels).where(eq(disputePanels.id, panelId));
  return panel;
}

describe("fileConductReport", () => {
  it("files on the record, queues a panel for the report, and links them once drawn", async () => {
    const s = await setup();
    const { reportId, panelId, seated } = await seatPanel(s, "2.1");
    expect(panelId).toBeGreaterThan(0);
    expect(seated).toHaveLength(DISPUTE_PANEL_SIZE);
    expect(seated).not.toContain(s.reporter);
    expect(seated).not.toContain(s.accused);
    const log = await s.db.select().from(record);
    expect(log.some((r) => /reported m1 under Code of Conduct 2\.1 \(Bad-faith disruption\): They did the thing\./.test(r.text))).toBe(true);
    const [report] = await s.db.select().from(conductReports).where(eq(conductReports.id, reportId));
    expect(report.panelId).toBe(panelId);
  });

  it("refuses bad input, self-reports, strangers, a second open report, and entries that are not the accused's", async () => {
    const s = await setup();
    const file = (over: Partial<Parameters<typeof fileConductReport>[3]> = {}, by = s.reporter) =>
      fileConductReport(s.db, s.community, by, { accusedId: s.accused, provision: "2.1", statement: "x", ...over }, NOW);
    expect(await file({ provision: "9.9" })).toEqual({ ok: false, reason: "invalid-provision" });
    expect(await file({ statement: "   " })).toEqual({ ok: false, reason: "empty-statement" });
    expect(await file({ statement: "x".repeat(4001) })).toEqual({ ok: false, reason: "statement-too-long" });
    expect(await file({ evidenceLink: "javascript:alert(1)" })).toEqual({ ok: false, reason: "bad-evidence-link" });
    expect(await file({ accusedId: s.reporter })).toEqual({ ok: false, reason: "self-report" });
    expect(await file({ accusedId: 99999 })).toEqual({ ok: false, reason: "accused-not-member" });
    const [mine] = await s.db.insert(contributions).values({ communityId: s.community.id, memberId: s.reporter, domain: "Craft", description: "mine", loggedAt: 0, verifiedAt: 0, claimedAt: 0 }).returning();
    expect(await file({ provision: "2.2", contributionIds: [mine.id] })).toEqual({ ok: false, reason: "contributions-not-theirs" });
    expect((await file()).ok).toBe(true);
    expect(await file()).toEqual({ ok: false, reason: "already-open" });
  });
});

describe("a conduct panel decides (Code of Conduct 3)", () => {
  it("imposes the lower-median step, publishes it, and starts the sanction", async () => {
    const s = await setup();
    const { panelId, seated } = await seatPanel(s, "2.1");
    // 5 dismiss, 6 accrual suspension -> the median (6th lowest) is step 2
    await castVotes(s, panelId, seated, [0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2]);
    const panel = await makeDueAndTick(s, panelId);
    expect(panel.decision).toBe("upheld");
    expect(panel.sanctionStep).toBe(2);
    const [sanction] = await s.db.select().from(memberSanctions).where(eq(memberSanctions.memberId, s.accused));
    expect(sanction.kind).toBe("accrual-suspension");
    expect(sanction.endsAt! - sanction.startsAt).toBe(ACCRUAL_SUSPENSION_DAYS * DAY_MS);
    const log = await s.db.select().from(record);
    expect(log.some((r) => /upheld the Code of Conduct 2\.1 report against m1: Accrual suspension/.test(r.text))).toBe(true);
  });

  it("dismisses when the panel does, with no sanction", async () => {
    const s = await setup();
    const { panelId, seated } = await seatPanel(s, "2.1");
    await castVotes(s, panelId, seated, [0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3]);
    const panel = await makeDueAndTick(s, panelId);
    expect(panel.decision).toBe("dismissed");
    expect(panel.sanctionStep).toBeNull();
    expect(await s.db.select().from(memberSanctions)).toHaveLength(0);
  });

  it("clamps a majority for voidance on a non-fraud report down to the step below", async () => {
    const s = await setup();
    const { panelId, seated } = await seatPanel(s, "2.1");
    await castVotes(s, panelId, seated, [4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0]);
    const panel = await makeDueAndTick(s, panelId);
    expect(panel.sanctionStep).toBe(3);
    const [sanction] = await s.db.select().from(memberSanctions);
    expect(sanction.kind).toBe("participation-suspension");
  });

  it("voids the named entries on a fraud finding so every verified-contribution query stops counting them", async () => {
    const s = await setup();
    const [c1] = await s.db.insert(contributions).values({ communityId: s.community.id, memberId: s.accused, domain: "Craft", description: "fake", loggedAt: NOW - DAY_MS, verifiedAt: NOW - DAY_MS, claimedAt: NOW - DAY_MS }).returning();
    const [c2] = await s.db.insert(contributions).values({ communityId: s.community.id, memberId: s.accused, domain: "Craft", description: "genuine", loggedAt: NOW - DAY_MS, verifiedAt: NOW - DAY_MS, claimedAt: NOW - DAY_MS }).returning();
    const { panelId, seated } = await seatPanel(s, "2.2", { contributionIds: [c1.id] });
    await castVotes(s, panelId, seated, [4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0]);
    await makeDueAndTick(s, panelId);
    const [after1] = await s.db.select().from(contributions).where(eq(contributions.id, c1.id));
    const [after2] = await s.db.select().from(contributions).where(eq(contributions.id, c2.id));
    expect(after1.voidedAt).not.toBeNull();
    expect(after1.verifiedAt).toBeNull();
    expect(after1.claimedAt).toBeNull();
    expect(after2.voidedAt).toBeNull();
    expect(after2.verifiedAt).not.toBeNull();
    const [sanction] = await s.db.select().from(memberSanctions);
    expect(sanction.kind).toBe("voidance");
  });

  it("finds a report brought in bad faith on a strict majority and enters a notice against the reporter", async () => {
    const s = await setup();
    const { panelId, seated } = await seatPanel(s, "2.1");
    await castVotes(s, panelId, seated, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 6);
    const panel = await makeDueAndTick(s, panelId);
    expect(panel.decision).toBe("dismissed");
    expect(panel.badFaithFinding).toBe(1);
    const rows = await s.db.select().from(memberSanctions);
    expect(rows).toHaveLength(1);
    expect(rows[0].memberId).toBe(s.reporter);
    expect(rows[0].kind).toBe("bad-faith-notice");
  });

  it("does not decide while the accused's response window is open", async () => {
    const s = await setup();
    const { panelId, seated } = await seatPanel(s, "2.1");
    await castVotes(s, panelId, seated, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    await s.db.update(disputePanels).set({ decidesBy: NOW - 1000, respondBy: NOW + 5 * DAY_MS }).where(eq(disputePanels.id, panelId));
    await tick(s.db, s.community);
    const [panel] = await s.db.select().from(disputePanels).where(eq(disputePanels.id, panelId));
    expect(panel.decision).toBeNull();
  });
});

async function dummyPanel(s: Awaited<ReturnType<typeof setup>>): Promise<number> {
  const [p] = await s.db
    .insert(disputePanels)
    .values({ communityId: s.community.id, subjectKind: "conduct-report", subjectId: 0, filedBy: s.reporter, filedAt: 0, decidesBy: 0, respondBy: 0 })
    .returning();
  return p.id;
}

describe("what a sanction does", () => {
  it("accrual suspension stops contributions verified (and attestations made) during it from earning, and only during it", async () => {
    const s = await setup(3);
    const panelId = await dummyPanel(s);
    const start = NOW - 10 * DAY_MS;
    await s.db.insert(memberSanctions).values({ communityId: s.community.id, memberId: s.accused, panelId, kind: "accrual-suspension", step: 2, startsAt: start, endsAt: start + 30 * DAY_MS, createdAt: start });
    // one verified inside the suspension, one before it began
    await s.db.insert(contributions).values({ communityId: s.community.id, memberId: s.accused, domain: "Craft", description: "during", loggedAt: NOW - 5 * DAY_MS, verifiedAt: NOW - 5 * DAY_MS, claimedAt: NOW - 5 * DAY_MS });
    await s.db.insert(contributions).values({ communityId: s.community.id, memberId: s.accused, domain: "Craft", description: "before", loggedAt: start - DAY_MS, verifiedAt: start - DAY_MS, claimedAt: start - DAY_MS });
    await s.db.insert(contributions).values({ communityId: s.community.id, memberId: s.reporter, domain: "Craft", description: "unsuspended member", loggedAt: NOW - 5 * DAY_MS, verifiedAt: NOW - 5 * DAY_MS, claimedAt: NOW - 5 * DAY_MS });
    const credits = await computePeriodCredits(s.db, s.community.id, NOW - 60 * DAY_MS, NOW);
    expect(credits.get(s.accused)!.Craft).toBe(10); // only "before" counts
    expect(credits.get(s.reporter)!.Craft).toBe(10);
  });

  it("participation suspension reports when it ends, then lapses", async () => {
    const s = await setup(3);
    const panelId = await dummyPanel(s);
    await s.db.insert(memberSanctions).values({ communityId: s.community.id, memberId: s.accused, panelId, kind: "participation-suspension", step: 3, startsAt: NOW - DAY_MS, endsAt: NOW + (PARTICIPATION_SUSPENSION_DAYS - 1) * DAY_MS, createdAt: NOW - DAY_MS });
    expect(await participationSuspendedUntil(s.db, s.accused, NOW)).toBe(NOW + (PARTICIPATION_SUSPENSION_DAYS - 1) * DAY_MS);
    expect(await participationSuspendedUntil(s.db, s.accused, NOW + PARTICIPATION_SUSPENSION_DAYS * DAY_MS)).toBeNull();
    expect(await participationSuspendedUntil(s.db, s.reporter, NOW)).toBeNull();
    expect(await activeSuspensions(s.db, s.accused, NOW)).toHaveLength(1);
  });

  it("remembers which ladder steps a Member has already been through", async () => {
    const s = await setup(3);
    const panelId = await dummyPanel(s);
    for (const [kind, step] of [["notice", 1], ["accrual-suspension", 2], ["bad-faith-notice", 1]] as const) {
      await s.db.insert(memberSanctions).values({ communityId: s.community.id, memberId: s.accused, panelId, kind, step, startsAt: 0, endsAt: null, createdAt: 0 });
    }
    expect((await priorSanctionSteps(s.db, s.community.id, s.accused)).sort()).toEqual([1, 2]);
  });
});
