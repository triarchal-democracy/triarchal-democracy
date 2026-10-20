import { describe, it, expect } from "vitest";
import { TeamPage, type JointActionView } from "./team";
import type { DelegateEntry } from "../lib/community";

const base = { member: { id: 10, name: "alice" }, adminDebug: false, communityName: "The Triarc", sector: { id: 3, name: "Housing" }, allMembers: [{ id: 10, name: "alice" }, { id: 11, name: "bob" }, { id: 20, name: "carol" }], pendingChallengeNomineeIds: [] };
const nominee = { id: 7, memberId: 20, name: "carol", title: "Assistant", nominatedAt: 0, ties: [] };

const sole: DelegateEntry = { delegateRecognitionId: 1, memberId: 10, name: "alice", recognizedAt: 0, nominees: [nominee] };
const a: DelegateEntry = {
  delegateRecognitionId: 1,
  memberId: 10,
  name: "alice",
  recognizedAt: 0,
  nominees: [nominee],
  coDelegate: { memberId: 11, name: "bob", recognitionId: 2 },
  joint: { spokespersonId: 10, spokespersonHow: "larger-share", split: { first: 10, second: 11, firstPct: 50, secondPct: 50, agreed: false } },
};
const b: DelegateEntry = { ...a, delegateRecognitionId: 2, memberId: 11, name: "bob", coDelegate: { memberId: 10, name: "alice", recognitionId: 1 } };

describe("Team page", () => {
  it("a sole Delegate nominates and ends nominations directly", () => {
    const html = String(TeamPage({ ...base, delegates: [sole], myMemberId: 10 }));
    expect(html).toContain("/positions/1/nominate");
    expect(html).toContain("/nominations/7/revoke");
    expect(html).not.toContain("Joint Position");
  });

  it("a joint Position is shown once, and nominating or ending goes through the other co-Delegate", () => {
    const html = String(TeamPage({ ...base, delegates: [a, b], myMemberId: 10 }));
    expect(html.match(/Joint Position/g)).toHaveLength(1);
    expect(html).toContain("alice");
    expect(html).toContain("bob");
    expect(html).not.toContain("/positions/1/nominate");
    expect(html).not.toContain("/nominations/7/revoke");
    expect(html).toContain('action="/sectors/3/joint"');
    expect(html).toContain("Propose a nomination to my co-Delegate");
    expect(html).toContain("Propose ending");
    expect(html).toContain("External spokesperson");
    expect(html).toContain("Compensation split");
    expect(html).toContain("alice 50% · bob 50%");
    expect(html).toContain("the default even split");
  });

  it("a visitor who holds neither seat sees the joint Position but no proposal forms", () => {
    const html = String(TeamPage({ ...base, member: { id: 20, name: "carol" }, delegates: [a, b], myMemberId: 20 }));
    expect(html).toContain("Joint Position");
    expect(html).not.toContain("Propose a nomination to my co-Delegate");
    expect(html).not.toContain("Propose ending");
  });

  it("shows the answer buttons only to the other co-Delegate, withdraw only to the proposer, and refer only on a deadlock", () => {
    const view = (over: Partial<JointActionView>): JointActionView => ({
      id: 5, kind: "nominate", summary: "nominate carol as Assistant", status: "pending", proposedByName: "alice", proposedAt: 0, referralProposalId: null, canRespond: false, canWithdraw: false, canRefer: false, ...over,
    });
    const other = String(TeamPage({ ...base, member: { id: 11, name: "bob" }, delegates: [a, b], myMemberId: 11, jointActions: [view({ canRespond: true })] }));
    expect(other).toContain("/joint/5/respond");
    expect(other).not.toContain("/joint/5/withdraw");
    const proposer = String(TeamPage({ ...base, delegates: [a, b], myMemberId: 10, jointActions: [view({ canWithdraw: true })] }));
    expect(proposer).toContain("/joint/5/withdraw");
    expect(proposer).not.toContain("/joint/5/respond");
    const dead = String(TeamPage({ ...base, delegates: [a, b], myMemberId: 10, jointActions: [view({ status: "declined", canRefer: true })] }));
    expect(dead).toContain("/joint/5/refer");
    expect(dead).toContain("refer to a community vote");
  });
});
