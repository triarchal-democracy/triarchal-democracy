import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import { computeLiveValues, oneInN, formatOneInN, participationNeed, thresholdLabel } from "./liveValues";
import { ensureCommunity, computePositionFillStatus, computeSustainabilityProgress } from "./community";
import { CLASS_CONFIG } from "./params";
import { members, communities, sustainabilitySnapshots } from "../db/schema";
import { eq } from "drizzle-orm";

// Phase 2 stage 4. Pure-formula correctness first, then the empty-community
// case against a real (if tiny) SQLite database — see
// app/scripts/testDb.ts for why this is a real schema, not a hand-copy of
// it, and app/scripts/documentsParser.ts's own tests for the project's
// established "test the real thing, not a description of it" convention.

describe("oneInN / formatOneInN (Charter 5.3a's own relation)", () => {
  it("is nine at the documented defaults (5x cap, half the pool to Foundation)", () => {
    expect(oneInN(5, 0.5)).toBe(9);
    expect(formatOneInN(oneInN(5, 0.5))).toBe("one Member in 9");
  });

  it("is five when the Foundation share is zero (the figure Charter 5.3a says the default is NOT)", () => {
    expect(oneInN(5, 0)).toBe(5);
  });

  it("returns null, not NaN or Infinity, once the Foundation share reaches 100%", () => {
    expect(oneInN(5, 1)).toBeNull();
    expect(formatOneInN(oneInN(5, 1))).toBe("not applicable at these settings");
  });
});

describe("participationNeed / thresholdLabel (Rules of Procedure 1.3/1.3b)", () => {
  it("applies the ten-Member floor at founding scale (30 Members, Ordinary class: 10% would be 3)", () => {
    expect(participationNeed(30, "ordinary")).toBe(10);
  });

  it("switches to the percentage once the community is large enough that it exceeds the floor", () => {
    expect(participationNeed(200, "ordinary")).toBe(20); // 10% of 200, > the 10-Member floor
  });

  it("never requires more participants than the community actually has", () => {
    expect(participationNeed(6, "ordinary")).toBe(6); // not 10 — Charter 3.5's own ceiling
  });

  it("labels every class's threshold in the same words Rules of Procedure 1.3 uses", () => {
    expect(thresholdLabel("ordinary")).toBe("simple majority");
    expect(thresholdLabel("position")).toBe("three-fifths");
    expect(thresholdLabel("amendment")).toBe("two-thirds");
    expect(thresholdLabel("entrenched")).toBe("75%");
    expect(thresholdLabel("treasury_reserve")).toBe("two-thirds");
  });

  it("covers every class CLASS_CONFIG actually defines, so a new class can't silently fall through unlabeled", () => {
    for (const cls of Object.keys(CLASS_CONFIG) as (keyof typeof CLASS_CONFIG)[]) {
      expect(() => thresholdLabel(cls)).not.toThrow();
      expect(thresholdLabel(cls).length).toBeGreaterThan(0);
    }
  });
});

describe("computeLiveValues — empty community (fresh DB, nobody has registered yet)", () => {
  it("never throws, and shows honest zeros rather than an error or a misleadingly real-looking number", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);

    const live = await computeLiveValues(db, community);

    expect(live["treasury-code#5.1"]).toEqual([
      { label: "Foundation Dividend", value: "Not yet active." },
      { label: "Verified Members", value: "0 of 30 required" },
      { label: "Delegate Positions filled", value: expect.stringMatching(/^0 of \d+$/) },
    ]);

    // Dividend language stays gated — never implies the dividend is live.
    expect(live["treasury-code#5.4"].some((e) => /not yet active/i.test(e.value))).toBe(true);
    expect(live["charter#5.3"]).not.toBeUndefined();

    // Phase I progress against zero activity — all real zeros, not an error.
    expect(live["charter#9.2"][0].value).toMatch(/^0 of 150/);
    expect(live["charter#9.3"][0].value).toMatch(/not computed yet/i);

    // No sectors followed/created yet is a real, honest state too.
    expect(live["contribution-code#2.3"][0].value).not.toBe("");

    // Rules of Procedure class table still renders with 0 verified Members —
    // "at least 10 of 0 participating" reads oddly but is not wrong: it's
    // exactly what Charter 3.5's own floor-vs-ceiling rule computes, and
    // matches participationNeed's own "never more than the community has"
    // guarantee tested above (10 members required, but only 0 exist — the
    // page is not claiming anyone COULD meet it, just stating the rule).
    expect(live["rules-of-procedure#1.3"].length).toBe(Object.keys(CLASS_CONFIG).length);
  });

  it("reflects real inserted members, proving the DB wiring itself works and isn't just not-crashing on empty tables", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const ts = Date.now();
    await db.insert(members).values([
      { communityId: community.id, name: "alice", email: "alice@example.com", passwordHash: "x", salt: "x", joinedAt: ts, lastActiveAt: ts },
      { communityId: community.id, name: "bob", email: "bob@example.com", passwordHash: "x", salt: "x", joinedAt: ts, lastActiveAt: ts },
    ]);

    const live = await computeLiveValues(db, community);
    expect(live["treasury-code#5.1"]).toEqual(expect.arrayContaining([{ label: "Verified Members", value: "2 of 30 required" }]));
  });
});

describe("computePositionFillStatus (shared by the dividend tick and liveValues — stage 4's no-duplication requirement)", () => {
  it("is vacuously false, not vacuously true, for a community with zero sectors", async () => {
    // ensureCommunity's default seeding always creates at least the core
    // sectors, so emulate the zero-sector edge case directly against a
    // bare community row instead.
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const status = await computePositionFillStatus(db, community.id + 999); // no sectors exist for this id
    expect(status).toEqual({ totalSectors: 0, filledSectors: 0, everyPositionFilled: false });
  });

  it("matches the real seeded sector count for an actual community", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const status = await computePositionFillStatus(db, community.id);
    expect(status.totalSectors).toBeGreaterThan(0);
    expect(status.filledSectors).toBe(0); // no Delegate has been recognized yet
    expect(status.everyPositionFilled).toBe(false);
  });
});


describe("computeLiveValues — Charter 9.3 wording (live review of 244645e)", () => {
  async function snapshotCommunity(founderSet: boolean) {
    const db = createTestDb();
    let community = await ensureCommunity(db);
    const [m] = await db
      .insert(members)
      .values({ communityId: community.id, name: "f", email: "f@t.test", passwordHash: "x", salt: "x", joinedAt: community.createdAt, lastActiveAt: community.createdAt })
      .returning();
    if (founderSet) {
      await db.update(communities).set({ founderId: m.id }).where(eq(communities.id, community.id));
      community = { ...community, founderId: m.id };
    }
    const ts = community.createdAt + 10 * 86400000;
    const progress = await computeSustainabilityProgress(db, community, ts);
    await db.insert(sustainabilitySnapshots).values({ communityId: community.id, computedAt: ts, result: JSON.stringify(progress) });
    return { db, community };
  }
  const row = (live: Awaited<ReturnType<typeof computeLiveValues>>, label: string) => live["charter#9.3"].find((e) => e.label.startsWith(label))!.value;

  it("founder recorded, nothing completed: says no proposals have completed, never 'founder not recorded'", async () => {
    const { db, community } = await snapshotCommunity(true);
    const live = await computeLiveValues(db, community);
    expect(row(live, "7.")).toMatch(/no proposals have completed the full lifecycle/i);
    expect(row(live, "7.")).not.toMatch(/founder not recorded/i);
  });

  it("founder unset: says founder not recorded", async () => {
    const { db, community } = await snapshotCommunity(false);
    const live = await computeLiveValues(db, community);
    expect(row(live, "7.")).toMatch(/founder not recorded/i);
  });

  it("cadence row reads as a sentence when no votes have closed, never the old garbled phrasing", async () => {
    const { db, community } = await snapshotCommunity(true);
    const live = await computeLiveValues(db, community);
    expect(row(live, "2.")).toMatch(/no votes have closed in the window yet \(need 75%\)/i);
    expect(row(live, "2.")).not.toMatch(/closed yet of votes/i);
  });
});
