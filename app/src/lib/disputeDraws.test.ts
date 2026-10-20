import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import {
  ensureCommunity,
  requestPanelDraw,
  processDrawRequests,
  declinePanelSeat,
  seatedPanelistIds,
  DISPUTE_PANEL_SIZE,
  DISPUTE_PANEL_POOL_MINIMUM,
} from "./community";
import { drandRoundAfter, verifyDraw, DRAND, type BeaconFetch } from "./panelDraw";
import { DAY_MS } from "./params";
import { members, disputePanels, disputePanelMembers, disputePanelDraws, disputeDrawRequests, record } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";

// Dispute Procedure Code 2.1, 3.1, 3.2 — queued, verifiable, replaceable draws.

const TS = 1_800_000_000_000;
const goodBeacon: BeaconFetch = async (url) => {
  const round = Number(url.split("/").pop());
  return { ok: true, json: async () => ({ round, randomness: (round.toString(16).padStart(8, "0") + "ab").repeat(8).slice(0, 64) }) };
};
const noBeacon: BeaconFetch = async () => ({ ok: false, json: async () => ({}) });

async function setup(volunteers: number) {
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
        lastActiveAt: TS,
        phone: `+1555${1000000 + i}`,
        disputePoolOptInAt: i >= 2 ? TS : null, // the first two are the parties, not volunteers
      })
      .returning();
    ids.push(m.id);
  }
  return { db, community, complainant: ids[0], accused: ids[1], volunteerIds: ids.slice(2) };
}

const spec = (complainant: number, accused: number, seq = 0, seats = DISPUTE_PANEL_SIZE, panelId: number | null = null) => ({
  subjectKind: "test-case",
  subjectId: 7,
  seq,
  seats,
  panelId,
  parties: [
    { memberId: complainant, role: "complainant" },
    { memberId: accused, role: "accused" },
  ],
});

describe("panel draw requests", () => {
  it("queues below the 2.1 minimum, says so on the record, and draws on its own once the pool is large enough", async () => {
    const { db, community, complainant, accused } = await setup(DISPUTE_PANEL_POOL_MINIMUM - 1);
    await requestPanelDraw(db, community.id, spec(complainant, accused), TS);
    await processDrawRequests(db, community, TS, { fetchFn: goodBeacon });
    expect(await db.select().from(disputePanels)).toHaveLength(0);
    const [queued] = await db.select().from(disputeDrawRequests);
    expect(queued.deferralReason).toBe("pool-below-minimum");
    expect(queued.completedAt).toBeNull();
    const log = await db.select().from(record);
    expect(log.some((r) => /below the Dispute Procedure Code 2\.1 minimum/.test(r.text))).toBe(true);

    // another volunteer joins -> the queued request is drawn on the next pass
    await db.insert(members).values({ communityId: community.id, name: "late", email: "late@t.test", passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: TS, phone: "+15559999999", disputePoolOptInAt: TS });
    await processDrawRequests(db, community, TS + 1000, { fetchFn: goodBeacon });
    const panels = await db.select().from(disputePanels);
    expect(panels).toHaveLength(1);
    expect(panels[0].decidesBy).toBe(TS + 1000 + 14 * DAY_MS);
    expect(panels[0].respondBy).toBe(TS + 1000 + 7 * DAY_MS);
    expect(await seatedPanelistIds(db, panels[0].id)).toHaveLength(DISPUTE_PANEL_SIZE);
  });

  it("never seats a party, publishes a draw that re-runs to the same panel, and completes only once", async () => {
    const { db, community, complainant, accused } = await setup(40);
    await requestPanelDraw(db, community.id, spec(complainant, accused), TS);
    await processDrawRequests(db, community, TS, { fetchFn: goodBeacon });
    await processDrawRequests(db, community, TS + 5000, { fetchFn: goodBeacon });
    const panels = await db.select().from(disputePanels);
    expect(panels).toHaveLength(1);
    const seated = await seatedPanelistIds(db, panels[0].id);
    expect(seated).toHaveLength(DISPUTE_PANEL_SIZE);
    expect(seated).not.toContain(complainant);
    expect(seated).not.toContain(accused);

    const draws = await db.select().from(disputePanelDraws);
    expect(draws).toHaveLength(1);
    const d = draws[0];
    expect(d.kind).toBe("initial");
    const published = {
      method: d.method,
      beaconChain: d.beaconChain,
      beaconRound: d.beaconRound,
      beaconRandomness: d.beaconRandomness,
      caseKey: d.caseKey,
      poolIds: JSON.parse(d.poolJson) as number[],
      size: DISPUTE_PANEL_SIZE,
      seed: d.seed,
      drawnIds: JSON.parse(d.drawnJson) as number[],
    };
    expect(await verifyDraw(published)).toBe(true);
    expect([...published.drawnIds].sort()).toEqual([...seated].sort());
    expect(d.beaconChain).toBe(DRAND.chainHash);
  });

  it("fixes the beacon round the first time the request is drawable and keeps it while the beacon is unavailable", async () => {
    const { db, community, complainant, accused } = await setup(40);
    await requestPanelDraw(db, community.id, spec(complainant, accused), TS);
    await processDrawRequests(db, community, TS, { fetchFn: noBeacon });
    const [req1] = await db.select().from(disputeDrawRequests);
    expect(req1.beaconRound).toBe(drandRoundAfter(TS));
    expect(req1.completedAt).toBeNull();
    expect(await db.select().from(disputePanels)).toHaveLength(0);

    // much later the beacon answers; the round used is still the one fixed earlier
    await processDrawRequests(db, community, TS + 3 * DAY_MS, { fetchFn: goodBeacon });
    const [draw] = await db.select().from(disputePanelDraws);
    expect(draw.beaconRound).toBe(drandRoundAfter(TS));
  });
});

describe("declining a seat (Dispute Procedure Code 3.2)", () => {
  async function seated() {
    const s = await setup(40);
    await requestPanelDraw(s.db, s.community.id, spec(s.complainant, s.accused), TS);
    await processDrawRequests(s.db, s.community, TS, { fetchFn: goodBeacon });
    const [panel] = await s.db.select().from(disputePanels);
    const ids = await seatedPanelistIds(s.db, panel.id);
    return { ...s, panel, ids };
  }

  it("a panelist may decline within 48 hours and a replacement, never the decliner, is drawn the same way", async () => {
    const { db, community, panel, ids } = await seated();
    const leaver = ids[0];
    expect(await declinePanelSeat(db, community, panel.id, leaver, TS + 60 * 60 * 1000)).toEqual({ ok: true });
    expect(await seatedPanelistIds(db, panel.id)).toHaveLength(DISPUTE_PANEL_SIZE - 1);

    await processDrawRequests(db, community, TS + 2 * 60 * 60 * 1000, { fetchFn: goodBeacon });
    const after = await seatedPanelistIds(db, panel.id);
    expect(after).toHaveLength(DISPUTE_PANEL_SIZE);
    expect(after).not.toContain(leaver);
    // the replacement is a different Member from everyone who was ever on the panel
    const everyone = await db.select().from(disputePanelMembers).where(eq(disputePanelMembers.panelId, panel.id));
    expect(new Set(everyone.map((r) => r.memberId)).size).toBe(everyone.length);

    const draws = await db.select().from(disputePanelDraws).where(eq(disputePanelDraws.panelId, panel.id));
    expect(draws.map((d) => d.kind)).toEqual(["initial", "replacement"]);
    const rep = draws[1];
    expect(
      await verifyDraw({
        method: rep.method,
        beaconChain: rep.beaconChain,
        beaconRound: rep.beaconRound,
        beaconRandomness: rep.beaconRandomness,
        caseKey: rep.caseKey,
        poolIds: JSON.parse(rep.poolJson),
        size: 1,
        seed: rep.seed,
        drawnIds: JSON.parse(rep.drawnJson),
      })
    ).toBe(true);
  });

  it("refuses a decline after the 48 hours, from a non-panelist, or after a decision", async () => {
    const { db, community, panel, ids, complainant } = await seated();
    expect(await declinePanelSeat(db, community, panel.id, ids[1], TS + 49 * 60 * 60 * 1000)).toEqual({ ok: false, reason: "window-closed" });
    expect(await declinePanelSeat(db, community, panel.id, complainant, TS + 1000)).toEqual({ ok: false, reason: "not-seated" });
    await db.update(disputePanels).set({ decision: "dismissed", decidedAt: TS + 5000 }).where(eq(disputePanels.id, panel.id));
    expect(await declinePanelSeat(db, community, panel.id, ids[2], TS + 6000)).toEqual({ ok: false, reason: "decided" });
    expect(await seatedPanelistIds(db, panel.id)).toHaveLength(DISPUTE_PANEL_SIZE);
  });

  it("leaves the seat vacant and the request queued if nobody eligible remains", async () => {
    const { db, community, complainant, accused } = await setup(DISPUTE_PANEL_SIZE); // exactly 11 volunteers; pool minimum is lowered by hand below
    // seat the panel directly from all 11 so no replacement candidate exists
    const [panel] = await db.insert(disputePanels).values({ communityId: community.id, subjectKind: "test-case", subjectId: 7, filedBy: complainant, filedAt: TS, decidesBy: TS + 14 * DAY_MS, respondBy: TS + 7 * DAY_MS }).returning();
    const vols = await db.select({ id: members.id }).from(members).where(and(eq(members.communityId, community.id)));
    for (const v of vols.filter((x) => x.id !== complainant && x.id !== accused)) {
      await db.insert(disputePanelMembers).values({ panelId: panel.id, memberId: v.id, drawnAt: TS });
    }
    await db.insert((await import("../db/schema")).disputePanelParties).values([
      { panelId: panel.id, memberId: complainant, role: "complainant" },
      { panelId: panel.id, memberId: accused, role: "accused" },
    ]);
    const first = (await seatedPanelistIds(db, panel.id))[0];
    expect(await declinePanelSeat(db, community, panel.id, first, TS + 1000)).toEqual({ ok: true });
    await processDrawRequests(db, community, TS + 2000, { fetchFn: goodBeacon });
    const [req] = await db.select().from(disputeDrawRequests).where(and(eq(disputeDrawRequests.panelId, panel.id), isNull(disputeDrawRequests.completedAt)));
    expect(req).toBeDefined();
    expect(req.deferralReason).toBe("too-many-exclusions");
    expect(await seatedPanelistIds(db, panel.id)).toHaveLength(DISPUTE_PANEL_SIZE - 1);
  });
});
