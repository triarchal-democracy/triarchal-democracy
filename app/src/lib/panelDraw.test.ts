import { describe, it, expect } from "vitest";
import {
  PANEL_DRAW_METHOD,
  DRAND,
  drandRoundAfter,
  drandRoundPublishedAt,
  fetchDrandBeacon,
  drawSeed,
  selectPanel,
  verifyDraw,
  canonicalPool,
  type Beacon,
} from "./panelDraw";

const beacon: Beacon = { chainHash: DRAND.chainHash, round: 1234567, randomness: "ab".repeat(32) };
const pool = Array.from({ length: 40 }, (_, i) => 100 + i);

describe("drand round arithmetic", () => {
  it("picks the first round published strictly after a moment", () => {
    const t = (DRAND.genesisSec + 300) * 1000; // exactly on round 101's boundary
    const r = drandRoundAfter(t);
    expect(drandRoundPublishedAt(r)).toBeGreaterThan(t);
    expect(drandRoundPublishedAt(r - 1)).toBeLessThanOrEqual(t);
  });
  it("is round 1 before genesis", () => {
    expect(drandRoundAfter(0)).toBe(1);
  });
});

describe("fetchDrandBeacon", () => {
  const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });
  it("accepts a response naming the round with 64 hex characters", async () => {
    const b = await fetchDrandBeacon(99, ok({ round: 99, randomness: "0f".repeat(32) }));
    expect(b).toEqual({ chainHash: DRAND.chainHash, round: 99, randomness: "0f".repeat(32) });
  });
  it("rejects a response for a different round, malformed randomness, or a failing relay", async () => {
    expect(await fetchDrandBeacon(99, ok({ round: 98, randomness: "0f".repeat(32) }))).toBeNull();
    expect(await fetchDrandBeacon(99, ok({ round: 99, randomness: "xyz" }))).toBeNull();
    expect(await fetchDrandBeacon(99, async () => { throw new Error("down"); })).toBeNull();
    expect(await fetchDrandBeacon(99, async () => ({ ok: false, json: async () => ({}) }))).toBeNull();
  });
  it("falls through to the next relay", async () => {
    let calls = 0;
    const b = await fetchDrandBeacon(5, async () => {
      calls++;
      if (calls === 1) throw new Error("first relay down");
      return { ok: true, json: async () => ({ round: 5, randomness: "1".repeat(64) }) };
    });
    expect(b?.round).toBe(5);
    expect(calls).toBe(2);
  });
});

describe("the draw", () => {
  it("is deterministic: the same seed and pool give the same panel, in any input order", async () => {
    const seed = await drawSeed({ beacon, caseKey: "c:1:initial", poolIds: pool, size: 11 });
    const a = await selectPanel(pool, seed, 11);
    const b = await selectPanel([...pool].reverse(), seed, 11);
    expect(a).toEqual(b);
    expect(a).toHaveLength(11);
    expect(new Set(a).size).toBe(11);
    for (const id of a) expect(pool).toContain(id);
  });

  it("changes with the beacon, the case, and the pool", async () => {
    const base = await drawSeed({ beacon, caseKey: "c:1:initial", poolIds: pool, size: 11 });
    expect(await drawSeed({ beacon: { ...beacon, round: beacon.round + 1 }, caseKey: "c:1:initial", poolIds: pool, size: 11 })).not.toBe(base);
    expect(await drawSeed({ beacon, caseKey: "c:2:initial", poolIds: pool, size: 11 })).not.toBe(base);
    expect(await drawSeed({ beacon, caseKey: "c:1:initial", poolIds: pool.slice(1), size: 11 })).not.toBe(base);
  });

  it("is not visibly biased: over many seeds every pool member is drawn about equally often", async () => {
    const small = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const counts = new Map<number, number>();
    const trials = 400;
    for (let t = 0; t < trials; t++) {
      const seed = await drawSeed({ beacon: { ...beacon, round: t }, caseKey: "stat", poolIds: small, size: 5 });
      for (const id of await selectPanel(small, seed, 5)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const expected = (trials * 5) / small.length; // 100
    for (const id of small) {
      const n = counts.get(id) ?? 0;
      expect(n).toBeGreaterThan(expected * 0.6);
      expect(n).toBeLessThan(expected * 1.4);
    }
  });

  it("verifyDraw reproduces an honest draw and rejects any tampering", async () => {
    const seed = await drawSeed({ beacon, caseKey: "c:1:initial", poolIds: pool, size: 11 });
    const drawnIds = await selectPanel(pool, seed, 11);
    const published = {
      method: PANEL_DRAW_METHOD,
      beaconChain: beacon.chainHash,
      beaconRound: beacon.round,
      beaconRandomness: beacon.randomness,
      caseKey: "c:1:initial",
      poolIds: canonicalPool(pool),
      size: 11,
      seed,
      drawnIds,
    };
    expect(await verifyDraw(published)).toBe(true);
    expect(await verifyDraw({ ...published, drawnIds: [...drawnIds.slice(1), 999] })).toBe(false);
    expect(await verifyDraw({ ...published, poolIds: published.poolIds.slice(1) })).toBe(false);
    expect(await verifyDraw({ ...published, beaconRandomness: "cd".repeat(32) })).toBe(false);
    expect(await verifyDraw({ ...published, method: "other" })).toBe(false);
  });
});
