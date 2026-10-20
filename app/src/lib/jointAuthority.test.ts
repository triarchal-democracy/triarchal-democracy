import { describe, it, expect } from "vitest";
import { createTestDb } from "../../scripts/testDb";
import {
  ensureCommunity,
  tick,
  proposeJointAction,
  respondJointAction,
  withdrawJointAction,
  referJointAction,
  currentSpokesperson,
  compensationSplitFor,
  activePairInSector,
  jointPositionOfMember,
  revokeRecognitions,
  endMembership,
  interimAuthority,
  takeInterimMeasure,
  computeStewardsAndDelegates,
  jointArrangementPreview,
  appointModerator,
} from "./community";
import { DAY_MS } from "./params";
import { members, sectors, proposals, delegateRecognitions, supportingNominees, contributions, contributionSectors, jointActions, delegations, votes, sectorPosts, record } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";

// Rules of Procedure 6.1-6.8, Charter 4.10.

const NOW = Date.now();

async function setup() {
  const db = createTestDb();
  let community = await ensureCommunity(db);
  const ids: number[] = [];
  for (let i = 0; i < 45; i++) {
    const [m] = await db
      .insert(members)
      .values({ communityId: community.id, name: `m${i}`, email: `m${i}@t.test`, passwordHash: "x", salt: "x", joinedAt: 0, lastActiveAt: NOW, phone: `+1555${4000000 + i}` })
      .returning();
    ids.push(m.id);
  }
  community = { ...community, founderId: ids[0] };
  const [sector] = await db.insert(sectors).values({ communityId: community.id, name: "Housing", createdAt: 0 }).returning();
  const [pr] = await db
    .insert(proposals)
    .values({ communityId: community.id, by: ids[0], title: "position", why: "w", cls: "position", submittedAt: NOW, voteFreezeAt: NOW, voteOpensAt: NOW, votingClosesAt: NOW, stage: "record" })
    .returning();
  // ids[10], ids[11] hold the Position jointly
  const [a] = await db.insert(delegateRecognitions).values({ communityId: community.id, memberId: ids[10], sectorId: sector.id, positionDecisionProposalId: pr.id, recognizedAt: NOW - 100 * DAY_MS }).returning();
  const [b] = await db.insert(delegateRecognitions).values({ communityId: community.id, memberId: ids[11], sectorId: sector.id, positionDecisionProposalId: pr.id, recognizedAt: NOW - 50 * DAY_MS, coDelegateOfId: a.id }).returning();
  await db.update(delegateRecognitions).set({ coDelegateOfId: b.id }).where(eq(delegateRecognitions.id, a.id));
  // ids[20], ids[21] have earned standing in the sector; ids[22] has none
  for (const id of [ids[20], ids[21]]) {
    const [ct] = await db.insert(contributions).values({ communityId: community.id, memberId: id, domain: "Craft", description: "work", loggedAt: NOW - DAY_MS, verifiedAt: NOW - DAY_MS, claimedAt: NOW - DAY_MS }).returning();
    await db.insert(contributionSectors).values({ contributionId: ct.id, sectorId: sector.id });
  }
  return { db, community, ids, sector, a, b, dA: ids[10], dB: ids[11], e1: ids[20], e2: ids[21], noStanding: ids[22] };
}
type S = Awaited<ReturnType<typeof setup>>;

const nominate = (s: S, by: number, who: number, title = "Assistant") =>
  proposeJointAction(s.db, s.community, by, s.sector.id, "nominate", { nomineeMemberId: who, title }, NOW);
const activeNominees = (s: S) => s.db.select().from(supportingNominees).where(isNull(supportingNominees.revokedAt));

describe("the pair", () => {
  it("is found from either holder, and a stranger is not part of it", async () => {
    const s = await setup();
    expect((await jointPositionOfMember(s.db, s.community.id, s.dA, s.sector.id))?.partner.memberId).toBe(s.dB);
    expect((await jointPositionOfMember(s.db, s.community.id, s.dB, s.sector.id))?.partner.memberId).toBe(s.dA);
    expect(await jointPositionOfMember(s.db, s.community.id, s.e1, s.sector.id)).toBeNull();
    expect(await activePairInSector(s.db, s.community.id, s.sector.id)).not.toBeNull();
  });
});

describe("nominating needs both co-Delegates (6.3)", () => {
  it("one proposes, nothing happens until the other agrees", async () => {
    const s = await setup();
    const r = await nominate(s, s.dA, s.e1);
    if (!r.ok) throw new Error(r.reason);
    expect(await activeNominees(s)).toHaveLength(0);
    const ok = await respondJointAction(s.db, s.community, s.dB, r.actionId, true, NOW);
    expect(ok).toEqual({ ok: true, status: "executed" });
    const nominees = await activeNominees(s);
    expect(nominees).toHaveLength(1);
    expect(nominees[0].nomineeMemberId).toBe(s.e1);
    const log = await s.db.select().from(record);
    expect(log.some((x) => /m10 and m11, jointly holding the Position, nominate m20 as Assistant/.test(x.text))).toBe(true);
  });

  it("the proposer cannot approve their own request, and a stranger cannot answer", async () => {
    const s = await setup();
    const r = await nominate(s, s.dA, s.e1);
    if (!r.ok) throw new Error(r.reason);
    expect(await respondJointAction(s.db, s.community, s.dA, r.actionId, true, NOW)).toEqual({ ok: false, reason: "not-the-other-co-delegate" });
    expect(await respondJointAction(s.db, s.community, s.e2, r.actionId, true, NOW)).toEqual({ ok: false, reason: "not-the-other-co-delegate" });
    expect(await activeNominees(s)).toHaveLength(0);
  });

  it("only co-Delegates can propose, and only an eligible Member can be nominated", async () => {
    const s = await setup();
    expect(await nominate(s, s.e1, s.e2)).toEqual({ ok: false, reason: "not-a-co-delegate" });
    expect(await nominate(s, s.dA, s.noStanding)).toEqual({ ok: false, reason: "nominee-not-eligible" });
    expect(await nominate(s, s.dA, s.dB)).toEqual({ ok: false, reason: "invalid-nominee" });
    expect(await nominate(s, s.dA, 99999)).toEqual({ ok: false, reason: "invalid-nominee" });
    const r = await nominate(s, s.dA, s.e1);
    expect(r.ok).toBe(true);
    expect(await nominate(s, s.dA, s.e1)).toEqual({ ok: false, reason: "already-open" });
  });

  it("a declined request is a deadlock; the proposer can withdraw only while it is pending", async () => {
    const s = await setup();
    const r = await nominate(s, s.dA, s.e1);
    if (!r.ok) throw new Error(r.reason);
    expect(await withdrawJointAction(s.db, s.community, s.dB, r.actionId, NOW)).toEqual({ ok: false, reason: "not-yours" });
    expect(await respondJointAction(s.db, s.community, s.dB, r.actionId, false, NOW)).toEqual({ ok: true, status: "declined" });
    expect(await withdrawJointAction(s.db, s.community, s.dA, r.actionId, NOW)).toEqual({ ok: false, reason: "not-pending" });
    const log = await s.db.select().from(record);
    expect(log.some((x) => /deadlocked; either may refer the question to a community vote at the Ordinary threshold/.test(x.text))).toBe(true);
  });

  it("ending a nomination also needs both", async () => {
    const s = await setup();
    const r = await nominate(s, s.dA, s.e1);
    if (!r.ok) throw new Error(r.reason);
    await respondJointAction(s.db, s.community, s.dB, r.actionId, true, NOW);
    const [n] = await activeNominees(s);
    const end = await proposeJointAction(s.db, s.community, s.dB, s.sector.id, "revoke-nomination", { nomineeId: n.id }, NOW);
    if (!end.ok) throw new Error(end.reason);
    expect(await activeNominees(s)).toHaveLength(1);
    await respondJointAction(s.db, s.community, s.dA, end.actionId, true, NOW);
    expect(await activeNominees(s)).toHaveLength(0);
  });
});

describe("a deadlock goes to a community vote at the Ordinary threshold (6.5)", () => {
  async function deadlocked(s: S) {
    const r = await nominate(s, s.dA, s.e1);
    if (!r.ok) throw new Error(r.reason);
    await respondJointAction(s.db, s.community, s.dB, r.actionId, false, NOW);
    return r.actionId;
  }

  it("either co-Delegate can refer it; strangers and non-deadlocks cannot", async () => {
    const s = await setup();
    const pendingId = (await nominate(s, s.dA, s.e2)) as { ok: true; actionId: number };
    expect(await referJointAction(s.db, s.community, s.dA, pendingId.actionId, NOW)).toEqual({ ok: false, reason: "not-deadlocked" });
    const id = await deadlocked(s);
    expect(await referJointAction(s.db, s.community, s.e1, id, NOW)).toEqual({ ok: false, reason: "not-a-co-delegate" });
    const ref = await referJointAction(s.db, s.community, s.dB, id, NOW); // the one who declined may refer too
    if (!ref.ok) throw new Error(ref.reason);
    const [p] = await s.db.select().from(proposals).where(eq(proposals.id, ref.proposalId));
    expect(p.cls).toBe("ordinary");
    expect(p.jointActionId).toBe(id);
    expect(await referJointAction(s.db, s.community, s.dA, id, NOW)).toEqual({ ok: false, reason: "not-deadlocked" });
  });

  it("a ratified referral makes the nomination", async () => {
    const s = await setup();
    const id = await deadlocked(s);
    const ref = await referJointAction(s.db, s.community, s.dA, id, NOW);
    if (!ref.ok) throw new Error(ref.reason);
    await s.db.update(proposals).set({ stage: "voting", voteOpensAt: NOW - 2000, votingClosesAt: NOW - 1000 }).where(eq(proposals.id, ref.proposalId));
    for (const m of s.ids.slice(2, 20)) await s.db.insert(votes).values({ proposalId: ref.proposalId, memberId: m, value: 1, castAt: NOW - 3000 });
    await tick(s.db, s.community);
    const [row] = await s.db.select().from(jointActions).where(eq(jointActions.id, id));
    expect(row.status).toBe("ratified");
    expect((await activeNominees(s)).map((n) => n.nomineeMemberId)).toEqual([s.e1]);
  });

  it("a referral the community votes down changes nothing", async () => {
    const s = await setup();
    const id = await deadlocked(s);
    const ref = await referJointAction(s.db, s.community, s.dA, id, NOW);
    if (!ref.ok) throw new Error(ref.reason);
    await s.db.update(proposals).set({ stage: "voting", voteOpensAt: NOW - 2000, votingClosesAt: NOW - 1000 }).where(eq(proposals.id, ref.proposalId));
    for (const m of s.ids.slice(2, 20)) await s.db.insert(votes).values({ proposalId: ref.proposalId, memberId: m, value: 0, castAt: NOW - 3000 });
    await tick(s.db, s.community);
    const [row] = await s.db.select().from(jointActions).where(eq(jointActions.id, id));
    expect(row.status).toBe("rejected");
    expect(await activeNominees(s)).toHaveLength(0);
  });

  it("spokesperson and compensation matters are not referred — without agreement the default stands", async () => {
    const s = await setup();
    const r = await proposeJointAction(s.db, s.community, s.dA, s.sector.id, "spokesperson", { memberId: s.dA }, NOW);
    if (!r.ok) throw new Error(r.reason);
    await respondJointAction(s.db, s.community, s.dB, r.actionId, false, NOW);
    expect(await referJointAction(s.db, s.community, s.dA, r.actionId, NOW)).toEqual({ ok: false, reason: "not-referable" });
  });
});

describe("spokesperson (6.6)", () => {
  it("defaults to the co-Delegate with the larger delegated support, then to the one agreed, until the renewal cycle passes", async () => {
    const s = await setup();
    // three delegations to dB, one to dA
    for (const [from, to] of [[s.ids[30], s.dB], [s.ids[31], s.dB], [s.ids[32], s.dB], [s.ids[33], s.dA]]) {
      await s.db.insert(delegations).values({ memberId: from, toMemberId: to, sectorId: null, grantedAt: NOW - DAY_MS });
    }
    expect(await currentSpokesperson(s.db, s.community, s.sector.id, NOW)).toEqual({ memberId: s.dB, how: "larger-share" });

    const r = await proposeJointAction(s.db, s.community, s.dB, s.sector.id, "spokesperson", { memberId: s.dA }, NOW);
    if (!r.ok) throw new Error(r.reason);
    await respondJointAction(s.db, s.community, s.dA, r.actionId, true, NOW);
    expect(await currentSpokesperson(s.db, s.community, s.sector.id, NOW)).toEqual({ memberId: s.dA, how: "agreement" });

    // not reaffirmed at the next renewal cycle: back to the default
    const later = NOW + (s.community.params.delegationExpiryDays + 1) * DAY_MS;
    const sp = await currentSpokesperson(s.db, s.community, s.sector.id, later);
    expect(sp?.how).toBe("larger-share");
  });

  it("must be one of the two", async () => {
    const s = await setup();
    expect(await proposeJointAction(s.db, s.community, s.dA, s.sector.id, "spokesperson", { memberId: s.e1 }, NOW)).toEqual({ ok: false, reason: "not-a-co-delegate" });
  });
});

describe("compensation (6.7)", () => {
  it("splits evenly by default and changes only by mutual agreement, on the record", async () => {
    const s = await setup();
    expect(await compensationSplitFor(s.db, s.community.id, s.sector.id)).toMatchObject({ firstPct: 50, secondPct: 50, agreed: false });
    expect(await proposeJointAction(s.db, s.community, s.dA, s.sector.id, "compensation-split", { sharePct: 100 }, NOW)).toEqual({ ok: false, reason: "invalid-share" });
    expect(await proposeJointAction(s.db, s.community, s.dA, s.sector.id, "compensation-split", { sharePct: 0 }, NOW)).toEqual({ ok: false, reason: "invalid-share" });
    const r = await proposeJointAction(s.db, s.community, s.dA, s.sector.id, "compensation-split", { sharePct: 70 }, NOW);
    if (!r.ok) throw new Error(r.reason);
    expect(await compensationSplitFor(s.db, s.community.id, s.sector.id)).toMatchObject({ agreed: false }); // not until the other agrees
    await respondJointAction(s.db, s.community, s.dB, r.actionId, true, NOW);
    expect(await compensationSplitFor(s.db, s.community.id, s.sector.id)).toMatchObject({ first: s.dA, firstPct: 70, secondPct: 30, agreed: true });
    const log = await s.db.select().from(record);
    expect(log.some((x) => /agreed in writing to split the Position's compensation 70% to m10 and 30% to m11/.test(x.text))).toBe(true);
  });
});

describe("individual removal (6.8)", () => {
  it("the other continues as a sole Delegate, keeps the Position's nominees, and the arrangements and open requests lapse", async () => {
    const s = await setup();
    const n = await nominate(s, s.dA, s.e1);
    if (!n.ok) throw new Error(n.reason);
    await respondJointAction(s.db, s.community, s.dB, n.actionId, true, NOW);
    const sp = await proposeJointAction(s.db, s.community, s.dA, s.sector.id, "spokesperson", { memberId: s.dA }, NOW);
    if (!sp.ok) throw new Error(sp.reason);
    await respondJointAction(s.db, s.community, s.dB, sp.actionId, true, NOW);
    const open = await nominate(s, s.dB, s.e2);
    if (!open.ok) throw new Error(open.reason);

    // the holder whose row carries the nomination is removed
    const [nominee] = await activeNominees(s);
    const holderRowId = nominee.delegateRecognitionId;
    await revokeRecognitions(s.db, s.community.id, [holderRowId], NOW);

    const survivorRow = holderRowId === s.a.id ? s.b.id : s.a.id;
    const [survivor] = await s.db.select().from(delegateRecognitions).where(eq(delegateRecognitions.id, survivorRow));
    expect(survivor.revokedAt).toBeNull();
    expect(survivor.coDelegateOfId).toBeNull();
    expect(await activePairInSector(s.db, s.community.id, s.sector.id)).toBeNull();

    const kept = await activeNominees(s);
    expect(kept).toHaveLength(1);
    expect(kept[0].delegateRecognitionId).toBe(survivorRow);

    const [openRow] = await s.db.select().from(jointActions).where(eq(jointActions.id, open.actionId));
    expect(openRow.status).toBe("void");
    expect(await currentSpokesperson(s.db, s.community, s.sector.id, NOW)).toBeNull();
    const log = await s.db.select().from(record);
    expect(log.some((x) => /now holds the Position alone, as a sole Delegate under Charter 4\.3/.test(x.text))).toBe(true);

    // as a sole Delegate they nominate without anyone else
    const dir = await computeStewardsAndDelegates(s.db, s.community, NOW);
    const entry = dir.find((d) => d.sectorId === s.sector.id)!;
    expect(entry.delegates).toHaveLength(1);
    expect(entry.delegates[0].coDelegate).toBeUndefined();
    expect(entry.delegates[0].nominees).toHaveLength(1);
  });

  it("a co-Delegate who leaves the community is released the same way", async () => {
    const s = await setup();
    await endMembership(s.db, s.community, s.dA, NOW, "left");
    const [survivor] = await s.db.select().from(delegateRecognitions).where(eq(delegateRecognitions.id, s.b.id));
    expect(survivor.coDelegateOfId).toBeNull();
    expect(survivor.revokedAt).toBeNull();
    const [gone] = await s.db.select().from(delegateRecognitions).where(eq(delegateRecognitions.id, s.a.id));
    expect(gone.revokedAt).not.toBeNull();
  });
});

describe("the directory shows the joint Position once, with its spokesperson and split", () => {
  it("lists both holders with shared nominees", async () => {
    const s = await setup();
    const n = await nominate(s, s.dA, s.e1);
    if (!n.ok) throw new Error(n.reason);
    await respondJointAction(s.db, s.community, s.dB, n.actionId, true, NOW);
    const dir = await computeStewardsAndDelegates(s.db, s.community, NOW);
    const entry = dir.find((d) => d.sectorId === s.sector.id)!;
    expect(entry.delegates).toHaveLength(2);
    for (const d of entry.delegates) {
      expect(d.coDelegate).toBeDefined();
      expect(d.nominees.map((x) => x.memberId)).toEqual([s.e1]);
      expect(d.joint?.split).toMatchObject({ firstPct: 50, secondPct: 50, agreed: false });
      expect(d.joint?.spokespersonHow).toBe("larger-share");
    }
  });
});

describe("emergency action by one co-Delegate (6.4)", () => {
  async function post(s: S, by: number) {
    const [p] = await s.db.insert(sectorPosts).values({ communityId: s.community.id, sectorId: s.sector.id, memberId: by, title: "t", body: "a home address", postedAt: NOW }).returning();
    return p.id;
  }

  it("either co-Delegate alone may remove harmful content in their own sector, if they say the other is unreachable", async () => {
    const s = await setup();
    const postId = await post(s, s.e1);
    expect(await interimAuthority(s.db, s.community, s.dA, "sector-post", postId, NOW)).toBe("co-delegate");
    const input = { targetMemberId: s.e1, kind: "remove-content", contentKind: "sector-post", contentId: postId, provision: "2.3", reason: "Posts a home address" };
    expect(await takeInterimMeasure(s.db, s.community, s.dA, input, NOW)).toEqual({ ok: false, reason: "must-state-unreachable" });
    const r = await takeInterimMeasure(s.db, s.community, s.dA, { ...input, otherUnreachable: true }, NOW);
    expect(r.ok).toBe(true);
    const log = await s.db.select().from(record);
    expect(log.some((x) => /Interim measure \(Rules of Procedure 6\.4\): co-Delegate m10, acting alone because the other co-Delegate was unreachable, removed a sector post by m20/.test(x.text))).toBe(true);
  });

  it("not beyond their sector, not a freeze, and not for an ordinary Member", async () => {
    const s = await setup();
    const [other] = await s.db.insert(sectors).values({ communityId: s.community.id, name: "Transit", createdAt: 0 }).returning();
    const [elsewhere] = await s.db.insert(sectorPosts).values({ communityId: s.community.id, sectorId: other.id, memberId: s.e1, title: "t", body: "b", postedAt: NOW }).returning();
    expect(await interimAuthority(s.db, s.community, s.dA, "sector-post", elsewhere.id, NOW)).toBeNull();
    const here = await post(s, s.e1);
    expect(await interimAuthority(s.db, s.community, s.e2, "sector-post", here, NOW)).toBeNull();
    const freeze = await takeInterimMeasure(s.db, s.community, s.dA, { targetMemberId: s.e1, kind: "freeze-account", provision: "2.3", reason: "sybil", otherUnreachable: true }, NOW);
    expect(freeze).toEqual({ ok: false, reason: "not-moderator" });
    expect(await interimAuthority(s.db, s.community, s.dA, "proposal-comment", 1, NOW)).toBeNull();
  });

  it("a moderator still needs no such statement", async () => {
    const s = await setup();
    await appointModerator(s.db, s.community, s.ids[0], s.e2, NOW);
    const postId = await post(s, s.e1);
    const r = await takeInterimMeasure(s.db, s.community, s.e2, { targetMemberId: s.e1, kind: "remove-content", contentKind: "sector-post", contentId: postId, provision: "2.3", reason: "doxxing" }, NOW);
    expect(r.ok).toBe(true);
  });
});

describe("a joint arrangement is announced before the vote (6.1)", () => {
  it("names the sitting Delegate when the candidate's support is within the tie margin", async () => {
    const s = await setup();
    // a sole sitting Delegate in a new sector, with a tied candidate
    const [sec2] = await s.db.insert(sectors).values({ communityId: s.community.id, name: "Transit", createdAt: 0 }).returning();
    const [pr] = await s.db.select().from(proposals).limit(1);
    await s.db.insert(delegateRecognitions).values({ communityId: s.community.id, memberId: s.ids[12], sectorId: sec2.id, positionDecisionProposalId: pr.id, recognizedAt: NOW - DAY_MS });
    // five delegations each: equal shares are within any margin
    for (let i = 0; i < 5; i++) {
      await s.db.insert(delegations).values({ memberId: s.ids[30 + i], toMemberId: s.ids[12], sectorId: sec2.id, grantedAt: NOW - DAY_MS });
      await s.db.insert(delegations).values({ memberId: s.ids[35 + i], toMemberId: s.ids[13], sectorId: sec2.id, grantedAt: NOW - DAY_MS });
    }
    const preview = await jointArrangementPreview(s.db, s.community, sec2.id, s.ids[13], NOW);
    expect(preview?.withName).toBe("m12");
    // a candidate with far less support is not announced as a joint arrangement
    expect(await jointArrangementPreview(s.db, s.community, sec2.id, s.ids[14], NOW)).toBeNull();
  });
});
