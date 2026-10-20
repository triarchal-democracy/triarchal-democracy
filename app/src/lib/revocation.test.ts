import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity, fileConductReport, processDrawRequests, seatedPanelistIds, tick, fileOverturnProposal, overturnPanelDecision, DISPUTE_PANEL_SIZE } from "./community";
import type { BeaconFetch } from "./panelDraw";
import { DAY_MS } from "./params";
import { REVOCATION_HOLD_DAYS } from "./conduct";
import { members, contributions, conductReports, disputePanels, disputePanelVotes, memberSanctions, proposals, votes, delegations } from "../db/schema";
import { eq } from "drizzle-orm";

// Code of Conduct 3.5; Dispute Procedure Code 6.1, 6.2; Charter 6.3.

const NOW = Date.now();
const goodBeacon: BeaconFetch = async (url) => {
  const round = Number(url.split("/").pop());
  return { ok: true, json: async () => ({ round, randomness: (round.toString(16).padStart(8, "0") + "ef").repeat(8).slice(0, 64) }) };
};

async function setup() {
  const db = createTestDb();
  const community = await ensureCommunity(db);
  const ids: number[] = [];
  for (let i = 0; i < 42; i++) {
    const [m] = await db
      .insert(members)
      .values({ communityId: community.id, name: `m${i}`, email: `m${i}@t.test`, passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: NOW, phone: `+1555${3000000 + i}`, disputePoolOptInAt: i >= 2 ? NOW : null })
      .returning();
    ids.push(m.id);
  }
  return { db, community, reporter: ids[0], accused: ids[1], all: ids };
}
type S = Awaited<ReturnType<typeof setup>>;

async function decided(s: S, provision: string, steps: number[], opts: { contributionIds?: number[] } = {}) {
  const r = await fileConductReport(s.db, s.community, s.reporter, { accusedId: s.accused, provision, statement: "x", contributionIds: opts.contributionIds }, NOW);
  if (!r.ok) throw new Error(r.reason);
  await processDrawRequests(s.db, s.community, NOW, { fetchFn: goodBeacon });
  const [report] = await s.db.select().from(conductReports).where(eq(conductReports.id, r.reportId));
  const panelId = report.panelId!;
  const seated = await seatedPanelistIds(s.db, panelId);
  expect(seated).toHaveLength(DISPUTE_PANEL_SIZE);
  for (let i = 0; i < steps.length; i++) {
    await s.db.insert(disputePanelVotes).values({ panelId, memberId: seated[i], upheld: steps[i] > 0 ? 1 : 0, step: steps[i], reasoning: "r", badFaith: 0, votedAt: NOW });
  }
  await s.db.update(disputePanels).set({ decidesBy: NOW - 1000, respondBy: NOW - 1000 }).where(eq(disputePanels.id, panelId));
  await tick(s.db, s.community);
  const [panel] = await s.db.select().from(disputePanels).where(eq(disputePanels.id, panelId));
  return { panel, panelId, title: "T" };
}

const revokeVotes = [5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0];

describe("revocation (Code of Conduct 3.5) and its 14-day hold (Dispute Procedure Code 6.2)", () => {
  it("a first offence under 2.1 cannot be revoked — the votes clamp to the highest allowed step", async () => {
    const s = await setup();
    const { panel } = await decided(s, "2.1", revokeVotes);
    expect(panel.sanctionStep).toBe(3);
    expect(panel.revocationEffectiveAt).toBeNull();
  });

  it("a Sybil violation (2.4) can be revoked; nothing happens at once, and the date is 14 days out", async () => {
    const s = await setup();
    const { panel } = await decided(s, "2.4", revokeVotes);
    expect(panel.decision).toBe("upheld");
    expect(panel.sanctionStep).toBe(5);
    expect(panel.revocationEffectiveAt).toBe(panel.decidedAt! + REVOCATION_HOLD_DAYS * DAY_MS);
    const [m] = await s.db.select().from(members).where(eq(members.id, s.accused));
    expect(m.leftAt).toBeNull();
    // no sanction row for revocation: it ends the membership instead
    expect(await s.db.select().from(memberSanctions)).toHaveLength(0);
  });

  it("takes effect once the hold has run out: the Member leaves the count, keeps their email, and cannot sign in", async () => {
    const s = await setup();
    const { panelId } = await decided(s, "2.4", revokeVotes);
    await s.db.insert(delegations).values({ memberId: s.accused, toMemberId: s.reporter, sectorId: null, grantedAt: NOW, revokedAt: null });
    await s.db.update(disputePanels).set({ revocationEffectiveAt: NOW - 1000 }).where(eq(disputePanels.id, panelId));
    await tick(s.db, s.community);
    const [m] = await s.db.select().from(members).where(eq(members.id, s.accused));
    expect(m.leftAt).not.toBeNull();
    expect(m.revokedAt).not.toBeNull();
    expect(m.email).toBe(`m1@t.test`); // kept, so the same person cannot register again with it
    expect(m.passwordHash).toBe("x"); // untouched, so an overturn can restore the account
    const [panel] = await s.db.select().from(disputePanels).where(eq(disputePanels.id, panelId));
    expect(panel.revocationCompletedAt).not.toBeNull();
    const live = await s.db.select().from(delegations).where(eq(delegations.memberId, s.accused));
    expect(live[0].revokedAt).not.toBeNull();
  });

  it("stays paused while an overturn proposal is unresolved, however long, then goes ahead if it fails", async () => {
    const s = await setup();
    const { panelId, title } = await decided(s, "2.4", revokeVotes);
    const filed = await fileOverturnProposal(s.db, s.community, s.reporter, panelId, "I think this was wrong.", title, NOW);
    expect(filed.ok).toBe(true);
    await s.db.update(disputePanels).set({ revocationEffectiveAt: NOW - 30 * DAY_MS }).where(eq(disputePanels.id, panelId));
    await tick(s.db, s.community);
    let [m] = await s.db.select().from(members).where(eq(members.id, s.accused));
    expect(m.leftAt).toBeNull();

    // the proposal ends without ratifying
    await s.db.update(proposals).set({ stage: "record", outcome: "Rejected" }).where(eq(proposals.overturnsPanelId, panelId));
    await tick(s.db, s.community);
    [m] = await s.db.select().from(members).where(eq(members.id, s.accused));
    expect(m.leftAt).not.toBeNull();
  });
});

describe("overturning a decision (Charter 6.3, Dispute Procedure Code 6.1)", () => {
  it("is filed at the charter-amendment threshold, by any Member, once, and only against an upheld decision", async () => {
    const s = await setup();
    const { panelId, title } = await decided(s, "2.4", revokeVotes);
    expect(await fileOverturnProposal(s.db, s.community, s.all[5], panelId, "  ", title, NOW)).toEqual({ ok: false, reason: "empty-reasons" });
    const ok = await fileOverturnProposal(s.db, s.community, s.all[5], panelId, "Because.", title, NOW);
    expect(ok.ok).toBe(true);
    const [p] = await s.db.select().from(proposals).where(eq(proposals.overturnsPanelId, panelId));
    expect(p.cls).toBe("amendment");
    expect(p.by).toBe(s.all[5]);
    expect(await fileOverturnProposal(s.db, s.community, s.all[6], panelId, "Again", title, NOW)).toEqual({ ok: false, reason: "already-open" });

    const s2 = await setup();
    const dismissed = await decided(s2, "2.1", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await fileOverturnProposal(s2.db, s2.community, s2.reporter, dismissed.panelId, "x", "T", NOW)).toEqual({ ok: false, reason: "nothing-to-overturn" });
    expect(await fileOverturnProposal(s2.db, s2.community, s2.reporter, 99999, "x", "T", NOW)).toEqual({ ok: false, reason: "no-such-decision" });
  });

  it("reinstates a revoked Member, ends the sanctions and restores voided entries — and a prior overturned step no longer counts", async () => {
    const s = await setup();
    const [c1] = await s.db.insert(contributions).values({ communityId: s.community.id, memberId: s.accused, domain: "Craft", description: "work", loggedAt: NOW - DAY_MS, verifiedAt: NOW - DAY_MS, claimedAt: NOW - DAY_MS }).returning();
    const { panelId } = await decided(s, "2.2", [4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0], { contributionIds: [c1.id] });
    let [row] = await s.db.select().from(contributions).where(eq(contributions.id, c1.id));
    expect(row.verifiedAt).toBeNull();

    await overturnPanelDecision(s.db, s.community.id, panelId, NOW);
    [row] = await s.db.select().from(contributions).where(eq(contributions.id, c1.id));
    expect(row.voidedAt).toBeNull();
    expect(row.verifiedAt).toBe(NOW - DAY_MS);
    expect(row.claimedAt).toBe(NOW - DAY_MS);
    const sanctions = await s.db.select().from(memberSanctions).where(eq(memberSanctions.panelId, panelId));
    expect(sanctions.every((x) => x.overturnedAt === NOW)).toBe(true);
    const [panel] = await s.db.select().from(disputePanels).where(eq(disputePanels.id, panelId));
    expect(panel.overturnedAt).toBe(NOW);
    expect(await fileOverturnProposal(s.db, s.community, s.reporter, panelId, "again", "T", NOW)).toEqual({ ok: false, reason: "already-overturned" });
  });

  it("reinstates the Member when a revocation that had already taken effect is overturned", async () => {
    const s = await setup();
    const { panelId } = await decided(s, "2.5", revokeVotes);
    await s.db.update(disputePanels).set({ revocationEffectiveAt: NOW - 1000 }).where(eq(disputePanels.id, panelId));
    await tick(s.db, s.community);
    let [m] = await s.db.select().from(members).where(eq(members.id, s.accused));
    expect(m.revokedAt).not.toBeNull();
    await overturnPanelDecision(s.db, s.community.id, panelId, NOW);
    [m] = await s.db.select().from(members).where(eq(members.id, s.accused));
    expect(m.leftAt).toBeNull();
    expect(m.revokedAt).toBeNull();
  });

  it("a ratified overturn proposal, closed by the ordinary vote machinery, overturns the decision", async () => {
    const s = await setup();
    const { panelId, title } = await decided(s, "2.4", revokeVotes);
    const filed = await fileOverturnProposal(s.db, s.community, s.all[5], panelId, "Because.", title, NOW);
    if (!filed.ok) throw new Error(filed.reason);
    await s.db.update(proposals).set({ stage: "voting", voteOpensAt: NOW - 2000, votingClosesAt: NOW - 1000 }).where(eq(proposals.id, filed.proposalId));
    // 14 of the 40 voting Members (the accused is not counted as a voter yet; all 42 are real Members) vote yes
    for (const id of s.all.slice(2, 18)) await s.db.insert(votes).values({ proposalId: filed.proposalId, memberId: id, value: 1, castAt: NOW - 3000 });
    await tick(s.db, s.community);
    const [p] = await s.db.select().from(proposals).where(eq(proposals.id, filed.proposalId));
    expect(p.stage).toBe("record");
    const [panel] = await s.db.select().from(disputePanels).where(eq(disputePanels.id, panelId));
    expect(panel.overturnedAt).not.toBeNull();
    // and the revocation never happens
    await s.db.update(disputePanels).set({ revocationEffectiveAt: NOW - 1000 }).where(eq(disputePanels.id, panelId));
    await tick(s.db, s.community);
    const [m] = await s.db.select().from(members).where(eq(members.id, s.accused));
    expect(m.leftAt).toBeNull();
  });
});
