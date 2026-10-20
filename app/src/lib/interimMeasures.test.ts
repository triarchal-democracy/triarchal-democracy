import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import {
  ensureCommunity,
  appointModerator,
  removeModerator,
  isModerator,
  listModerators,
  takeInterimMeasure,
  approveInterimMeasure,
  processInterimMeasures,
  processDrawRequests,
  seatedPanelistIds,
  activeFreeze,
  hidingMeasureIds,
  phaseOneActive,
  INTERIM_MEASURE_HOURS,
  DISPUTE_PANEL_SIZE,
} from "./community";
import type { BeaconFetch } from "./panelDraw";
import { members, conductReports, interimMeasures, disputePanels, proposals, proposalComments, sectorPosts, sectors, delegateRecognitions, record } from "../db/schema";
import { eq } from "drizzle-orm";

// Code of Conduct 4.3, Dispute Procedure Code 5.1, Charter 9.2.

const NOW = Date.now();
const HOUR = 3600000;
const goodBeacon: BeaconFetch = async (url) => {
  const round = Number(url.split("/").pop());
  return { ok: true, json: async () => ({ round, randomness: (round.toString(16).padStart(8, "0") + "ab").repeat(8).slice(0, 64) }) };
};

async function setup(volunteers = 40) {
  const db = createTestDb();
  let community = await ensureCommunity(db);
  const ids: number[] = [];
  for (let i = 0; i < volunteers + 3; i++) {
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
        phone: `+1555${3000000 + i}`,
        disputePoolOptInAt: i >= 3 ? NOW : null,
      })
      .returning();
    ids.push(m.id);
  }
  // ids[0] is the founder, ids[1] a moderator-to-be, ids[2] the target.
  community = { ...community, founderId: ids[0] };
  return { db, community, founder: ids[0], mod: ids[1], target: ids[2] };
}
type S = Awaited<ReturnType<typeof setup>>;

async function modSetup() {
  const s = await setup();
  expect((await appointModerator(s.db, s.community, s.founder, s.mod, NOW)).ok).toBe(true);
  return s;
}

async function postComment(s: S, memberId: number) {
  const [pr] = await s.db
    .insert(proposals)
    .values({ communityId: s.community.id, by: s.founder, title: "p", why: "w", cls: "ordinary", submittedAt: NOW, voteFreezeAt: NOW, voteOpensAt: NOW, votingClosesAt: NOW })
    .returning();
  const [cm] = await s.db.insert(proposalComments).values({ proposalId: pr.id, memberId, body: "private address here", postedAt: NOW }).returning();
  return { proposalId: pr.id, commentId: cm.id };
}

describe("moderators (Charter 9.2, Code of Conduct 4.3)", () => {
  it("only the founder appoints, only a real Member, and only once", async () => {
    const s = await setup();
    expect(await appointModerator(s.db, s.community, s.mod, s.target, NOW)).toEqual({ ok: false, reason: "not-founder" });
    expect(await appointModerator(s.db, s.community, s.founder, 99999, NOW)).toEqual({ ok: false, reason: "not-a-member" });
    expect((await appointModerator(s.db, s.community, s.founder, s.mod, NOW)).ok).toBe(true);
    expect(await appointModerator(s.db, s.community, s.founder, s.mod, NOW)).toEqual({ ok: false, reason: "already-moderator" });
    expect(await isModerator(s.db, s.community, s.mod, NOW)).toBe(true);
    expect(await isModerator(s.db, s.community, s.target, NOW)).toBe(false);
    expect((await listModerators(s.db, s.community, NOW)).map((m) => m.name)).toEqual(["m1"]);
    const log = await s.db.select().from(record);
    expect(log.some((r) => /m1 was appointed an interim moderator by the founder/.test(r.text))).toBe(true);
    // the founder's identity is not named in the record text
    expect(log.some((r) => /appointed .* by m0/.test(r.text))).toBe(false);
  });

  it("the founder can remove an interim moderator; nobody else can", async () => {
    const s = await modSetup();
    const [row] = await listModerators(s.db, s.community, NOW);
    expect(await removeModerator(s.db, s.community, s.mod, row.id, NOW)).toEqual({ ok: false, reason: "not-founder" });
    expect((await removeModerator(s.db, s.community, s.founder, row.id, NOW)).ok).toBe(true);
    expect(await isModerator(s.db, s.community, s.mod, NOW)).toBe(false);
    expect(await removeModerator(s.db, s.community, s.founder, row.id, NOW)).toEqual({ ok: false, reason: "not-found" });
  });

  it("a Member who leaves is no longer a moderator", async () => {
    const s = await modSetup();
    await s.db.update(members).set({ leftAt: NOW }).where(eq(members.id, s.mod));
    expect(await isModerator(s.db, s.community, s.mod, NOW)).toBe(false);
  });

  it("holding the Delegate Position for a sector named Moderation makes a moderator, by community vote", async () => {
    const s = await setup();
    expect(await isModerator(s.db, s.community, s.target, NOW)).toBe(false);
    const [sector] = await s.db.insert(sectors).values({ communityId: s.community.id, name: "Moderation", createdAt: NOW }).returning();
    const [pr] = await s.db
      .insert(proposals)
      .values({ communityId: s.community.id, by: s.founder, title: "position", why: "w", cls: "position", submittedAt: NOW, voteFreezeAt: NOW, voteOpensAt: NOW, votingClosesAt: NOW })
      .returning();
    const [rec] = await s.db.insert(delegateRecognitions).values({ communityId: s.community.id, memberId: s.target, sectorId: sector.id, positionDecisionProposalId: pr.id, recognizedAt: NOW }).returning();
    expect(await isModerator(s.db, s.community, s.target, NOW)).toBe(true);
    expect((await listModerators(s.db, s.community, NOW)).some((m) => m.name === "m2" && m.via === "position")).toBe(true);
    await s.db.update(delegateRecognitions).set({ revokedAt: NOW }).where(eq(delegateRecognitions.id, rec.id));
    expect(await isModerator(s.db, s.community, s.target, NOW)).toBe(false);
  });

  it("Phase I is active in a young community", async () => {
    const s = await setup();
    expect(await phaseOneActive(s.db, s.community, NOW)).toBe(true);
  });
});

describe("interim measures (Code of Conduct 4.3)", () => {
  it("a non-moderator cannot take one", async () => {
    const s = await setup();
    const r = await takeInterimMeasure(s.db, s.community, s.target, { targetMemberId: s.mod, kind: "freeze-account", provision: "2.3", reason: "sybil" }, NOW);
    expect(r).toEqual({ ok: false, reason: "not-moderator" });
  });

  it("refuses an empty reason, a bad kind, itself as target and a provision that does not exist", async () => {
    const s = await modSetup();
    const take = (over: Record<string, unknown>) =>
      takeInterimMeasure(s.db, s.community, s.mod, { targetMemberId: s.target, kind: "freeze-account", provision: "2.3", reason: "sybil", ...over } as any, NOW);
    expect(await take({ reason: "   " })).toEqual({ ok: false, reason: "empty-reason" });
    expect(await take({ kind: "delete-everything" })).toEqual({ ok: false, reason: "invalid-kind" });
    expect(await take({ targetMemberId: s.mod })).toEqual({ ok: false, reason: "invalid-target" });
    expect(await take({ provision: "9.9" })).toEqual({ ok: false, reason: "invalid-provision" });
  });

  it("a freeze is logged on the record at once, files a report for a reviewing panel, and lapses after 72 hours", async () => {
    const s = await modSetup();
    const r = await takeInterimMeasure(s.db, s.community, s.mod, { targetMemberId: s.target, kind: "freeze-account", provision: "2.3", reason: "Looks like a sybil" }, NOW);
    if (!r.ok) throw new Error(r.reason);
    const log = await s.db.select().from(record);
    expect(log.some((x) => /Interim measure .* moderator m1 froze m2's posting, proposing and contribution logging\. Reason: Looks like a sybil/.test(x.text))).toBe(true);
    const [report] = await s.db.select().from(conductReports).where(eq(conductReports.id, r.reportId));
    expect(report.accusedId).toBe(s.target);
    expect(report.reportedBy).toBe(s.mod);

    expect(await activeFreeze(s.db, s.target, NOW + 1000)).toEqual({ until: NOW + INTERIM_MEASURE_HOURS * HOUR });
    expect(await activeFreeze(s.db, s.mod, NOW + 1000)).toBeNull();
    expect(await activeFreeze(s.db, s.target, NOW + (INTERIM_MEASURE_HOURS + 1) * HOUR)).toBeNull();

    await processInterimMeasures(s.db, s.community, NOW + (INTERIM_MEASURE_HOURS + 1) * HOUR);
    const [m] = await s.db.select().from(interimMeasures).where(eq(interimMeasures.id, r.measureId));
    expect(m.endedAt).toBe(NOW + INTERIM_MEASURE_HOURS * HOUR);
    const log2 = await s.db.select().from(record);
    expect(log2.some((x) => /account freeze\) lapsed automatically after 72 hours without the reviewing panel keeping it/.test(x.text))).toBe(true);
  });

  it("cannot freeze the same account twice at once", async () => {
    const s = await modSetup();
    const input = { targetMemberId: s.target, kind: "freeze-account", provision: "2.3", reason: "sybil" };
    expect((await takeInterimMeasure(s.db, s.community, s.mod, input, NOW)).ok).toBe(true);
    expect(await takeInterimMeasure(s.db, s.community, s.mod, input, NOW)).toEqual({ ok: false, reason: "already-frozen" });
  });

  it("more than half of the reviewing panel's seats keep a measure in force until the panel decides", async () => {
    const s = await modSetup();
    const r = await takeInterimMeasure(s.db, s.community, s.mod, { targetMemberId: s.target, kind: "freeze-account", provision: "2.3", reason: "sybil" }, NOW);
    if (!r.ok) throw new Error(r.reason);
    await processDrawRequests(s.db, s.community, NOW, { fetchFn: goodBeacon });
    const [report] = await s.db.select().from(conductReports).where(eq(conductReports.id, r.reportId));
    const panelId = report.panelId!;
    const seated = await seatedPanelistIds(s.db, panelId);
    expect(seated).toHaveLength(DISPUTE_PANEL_SIZE);

    // someone who is not seated cannot approve
    const outsider = [s.founder, s.mod, s.target].find((id) => !seated.includes(id))!;
    expect(await approveInterimMeasure(s.db, s.community, outsider, r.measureId, NOW + HOUR)).toEqual({ ok: false, reason: "not-reviewing-panelist" });

    // five of eleven is not more than half
    for (let i = 0; i < 5; i++) {
      const res = await approveInterimMeasure(s.db, s.community, seated[i], r.measureId, NOW + HOUR);
      expect(res).toEqual({ ok: true, extended: false });
    }
    // approving twice does not count twice
    await approveInterimMeasure(s.db, s.community, seated[0], r.measureId, NOW + HOUR);
    let [m] = await s.db.select().from(interimMeasures).where(eq(interimMeasures.id, r.measureId));
    expect(m.extendedAt).toBeNull();

    // the sixth tips it
    expect(await approveInterimMeasure(s.db, s.community, seated[5], r.measureId, NOW + 2 * HOUR)).toEqual({ ok: true, extended: true });
    [m] = await s.db.select().from(interimMeasures).where(eq(interimMeasures.id, r.measureId));
    expect(m.extendedAt).toBe(NOW + 2 * HOUR);

    // it is no longer subject to the 72-hour lapse
    const later = NOW + 10 * 24 * HOUR;
    await processInterimMeasures(s.db, s.community, later);
    [m] = await s.db.select().from(interimMeasures).where(eq(interimMeasures.id, r.measureId));
    expect(m.endedAt).toBeNull();
    const freeze = await activeFreeze(s.db, s.target, NOW + 5 * 24 * HOUR);
    expect(freeze).not.toBeNull();

    // until the panel decides
    await s.db.update(disputePanels).set({ decision: "dismissed", decidedAt: NOW + 11 * 24 * HOUR }).where(eq(disputePanels.id, panelId));
    await processInterimMeasures(s.db, s.community, NOW + 12 * 24 * HOUR);
    [m] = await s.db.select().from(interimMeasures).where(eq(interimMeasures.id, r.measureId));
    expect(m.endedAt).toBe(NOW + 11 * 24 * HOUR);
  });

  it("removing content hides it while the measure is in force and returns it when it lapses", async () => {
    const s = await modSetup();
    const { commentId } = await postComment(s, s.target);
    // not the target's content
    const { commentId: other } = await postComment(s, s.founder);
    expect(
      await takeInterimMeasure(s.db, s.community, s.mod, { targetMemberId: s.target, kind: "remove-content", contentKind: "proposal-comment", contentId: other, provision: "2.3", reason: "doxxing" }, NOW)
    ).toEqual({ ok: false, reason: "content-not-theirs" });
    expect(
      await takeInterimMeasure(s.db, s.community, s.mod, { targetMemberId: s.target, kind: "remove-content", contentKind: "nope", contentId: commentId, provision: "2.3", reason: "doxxing" }, NOW)
    ).toEqual({ ok: false, reason: "content-not-theirs" });

    const r = await takeInterimMeasure(s.db, s.community, s.mod, { targetMemberId: s.target, kind: "remove-content", contentKind: "proposal-comment", contentId: commentId, provision: "2.3", reason: "Posts a home address" }, NOW);
    if (!r.ok) throw new Error(r.reason);
    const [cm] = await s.db.select().from(proposalComments).where(eq(proposalComments.id, commentId));
    expect(cm.hiddenMeasureId).toBe(r.measureId);
    expect((await hidingMeasureIds(s.db, s.community.id, NOW + HOUR)).has(r.measureId)).toBe(true);
    // a content removal does not freeze the account
    expect(await activeFreeze(s.db, s.target, NOW + HOUR)).toBeNull();

    // past 72 hours it no longer hides, even before the tick runs
    expect((await hidingMeasureIds(s.db, s.community.id, NOW + 73 * HOUR)).has(r.measureId)).toBe(false);
    await processInterimMeasures(s.db, s.community, NOW + 73 * HOUR);
    const [cm2] = await s.db.select().from(proposalComments).where(eq(proposalComments.id, commentId));
    expect(cm2.hiddenMeasureId).toBeNull();
    expect(cm2.body).toBe("private address here");
  });

  it("a sector post can be removed too", async () => {
    const s = await modSetup();
    const [sector] = await s.db.insert(sectors).values({ communityId: s.community.id, name: "Housing", createdAt: NOW }).returning();
    const [post] = await s.db.insert(sectorPosts).values({ communityId: s.community.id, sectorId: sector.id, memberId: s.target, title: "t", body: "b", postedAt: NOW }).returning();
    const r = await takeInterimMeasure(s.db, s.community, s.mod, { targetMemberId: s.target, kind: "remove-content", contentKind: "sector-post", contentId: post.id, provision: "2.3", reason: "doxxing" }, NOW);
    expect(r.ok).toBe(true);
    const [row] = await s.db.select().from(sectorPosts).where(eq(sectorPosts.id, post.id));
    expect(row.hiddenMeasureId).not.toBeNull();
  });
});
