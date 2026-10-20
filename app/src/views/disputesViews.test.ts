import { describe, it, expect } from "vitest";
import { DisputesPage, DisputeCasePage, InterimMeasurePage, type CaseView, type MeasureView } from "./disputes";

const member = { id: 1, name: "alice" };
const base = { member, adminDebug: false, communityName: "The Triarc" };

const caseView: CaseView = {
  panelId: 5,
  title: "Conduct challenge to a nomination: Treasurer",
  summary: "A summary.",
  filedAt: 0,
  decision: null,
  decidedAt: null,
  respondBy: Date.now() + 86_400_000,
  respondedAt: null,
  responseWaivedAt: null,
  decidesBy: Date.now() + 10 * 86_400_000,
  parties: [
    { memberId: 1, name: "alice", role: "accused" },
    { memberId: 2, name: "bob", role: "complainant" },
  ],
  panelists: [
    { id: 3, name: "carol", declined: false, drawnAt: 0, vote: null },
    { id: 4, name: "dave", declined: true, drawnAt: 0, vote: null },
  ],
  seats: 11,
  replacementPending: true,
  draws: [
    {
      kind: "initial",
      method: "sha256-fisher-yates/v1",
      beaconChain: "chain",
      beaconRound: 77,
      beaconRandomness: "rand",
      caseKey: "k",
      seed: "seedhex",
      poolIds: [3, 4],
      drawnIds: [3],
      drawnAt: 0,
      verified: true,
    },
  ],
  nameById: { 3: "carol", 4: "dave" },
  votesCast: 0,
};
const caseProps = { ...base, c: caseView, isPanelist: false, canDecline: false, declineBy: null, isAccused: false, canVote: false, myVote: null, responseWindowOpen: true };

describe("disputes views", () => {
  it("the list shows the pool progress, queued draws and cases", () => {
    const html = String(
      DisputesPage({
        ...base,
        cases: [{ panelId: 5, title: "A case", filedAt: 0, status: "deliberating", decision: null, seated: 11, seats: 11 }],
        mine: [],
        involved: [],
        queued: [{ title: "Queued case", requestedAt: 0, reason: "pool-below-minimum" }],
        poolSize: 12,
        poolMinimum: 30,
        isVolunteer: false,
      })
    );
    expect(html).toContain("12 of the 30 volunteers needed");
    expect(html).toContain("Queued case");
    expect(html).toContain("pool below the minimum");
    expect(html).toContain("/disputes/5");
  });

  it("the case page publishes the draw and marks a verified re-run", () => {
    const html = String(DisputeCasePage(caseProps));
    expect(html).toContain("round 77");
    expect(html).toContain("seedhex");
    expect(html).toContain("re-run reproduces this result");
    expect(html).toContain("a replacement is being drawn");
    expect(html).toContain("declined");
  });

  it("flags a draw that does not reproduce", () => {
    const html = String(DisputeCasePage({ ...caseProps, c: { ...caseView, draws: [{ ...caseView.draws[0], verified: false }] } }));
    expect(html).toContain("does NOT reproduce");
  });

  it("shows forms only to the people they belong to", () => {
    const none = String(DisputeCasePage(caseProps));
    expect(none).not.toContain("/respond");
    expect(none).not.toContain("/vote");
    expect(none).not.toContain("/decline");

    const accused = String(DisputeCasePage({ ...caseProps, isAccused: true }));
    expect(accused).toContain("/disputes/5/respond");
    expect(accused).toContain("Waive the response window");

    const panelist = String(DisputeCasePage({ ...caseProps, isPanelist: true, canDecline: true, declineBy: Date.now() + 1000, canVote: true, responseWindowOpen: false }));
    expect(panelist).toContain("/disputes/5/decline");
    expect(panelist).toContain("/disputes/5/vote");
  });

  it("hides individual votes until decided, then shows them", () => {
    const pending = String(DisputeCasePage({ ...caseProps, c: { ...caseView, panelists: [{ id: 3, name: "carol", declined: false, drawnAt: 0, vote: null }] } }));
    expect(pending).not.toContain("voted: uphold");
    const decided = String(
      DisputeCasePage({ ...caseProps, c: { ...caseView, decision: "upheld", decidedAt: 1, panelists: [{ id: 3, name: "carol", declined: false, drawnAt: 0, vote: "uphold" }] } })
    );
    expect(decided).toContain("voted: uphold");
    expect(decided).toContain("Decided");
  });
});

describe("moderators and interim measures on the Disputes page", () => {
  const page = { ...base, cases: [], queued: [], poolSize: 40, poolMinimum: 30, isVolunteer: false, mine: [], involved: [] };
  const measure: MeasureView = {
    id: 9,
    moderatorName: "modmike",
    targetName: "bob",
    kind: "freeze-account",
    contentKind: null,
    reason: "Looks like a sybil",
    takenAt: 0,
    lapsesAt: 72 * 3600000,
    status: "in force",
    endedAt: null,
    reportPanelId: 5,
    approvals: 2,
    seats: 11,
    canApprove: true,
  };

  it("lists moderators and interim measures publicly, with the 72-hour rule stated", () => {
    const html = String(DisputesPage({ ...page, member: null, moderators: [{ id: 1, memberId: 7, name: "modmike", via: "appointed" }], measures: [{ ...measure, canApprove: false }] }));
    expect(html).toContain("modmike");
    expect(html).toContain("Account freeze");
    expect(html).toContain("Looks like a sybil");
    expect(html).toContain("lapses by itself after 72 hours");
    expect(html).not.toContain("/disputes/interim/9/approve");
    expect(html).not.toContain("/moderators/appoint");
  });

  it("shows the keep button only to a seated panelist, the appoint form only to the founder during Phase I, and the freeze link only to a moderator", () => {
    const panelist = String(DisputesPage({ ...page, measures: [measure] }));
    expect(panelist).toContain("/disputes/interim/9/approve");
    const founder = String(DisputesPage({ ...page, isFounder: true, phaseOneActive: true, appointable: [{ id: 3, name: "carol" }], moderators: [{ id: 1, memberId: 7, name: "modmike", via: "appointed" }] }));
    expect(founder).toContain("/moderators/appoint");
    expect(founder).toContain("/moderators/1/remove");
    const lapsed = String(DisputesPage({ ...page, isFounder: true, phaseOneActive: false, appointable: [] }));
    expect(lapsed).not.toContain("/moderators/appoint");
    const mod = String(DisputesPage({ ...page, isModerator: true }));
    expect(mod).toContain("/disputes/interim/new?kind=freeze-account");
    expect(String(DisputesPage({ ...page }))).not.toContain("/disputes/interim/new");
  });

  it("the measure form carries the content and the author it is about", () => {
    const html = String(
      InterimMeasurePage({
        member,
        adminDebug: false,
        communityName: "The Triarc",
        kind: "remove-content",
        members: [],
        content: { contentKind: "sector-post", contentId: 4, authorId: 2, authorName: "bob", excerpt: "a home address" },
      })
    );
    expect(html).toContain('name="contentKind" value="sector-post"');
    expect(html).toContain('name="targetMemberId" value="2"');
    expect(html).toContain("a home address");
    expect(html).toContain("never touches a vote, a delegation or any proposal");
  });
});
