import { describe, it, expect } from "vitest";
import { TreasuryPage, type TreasuryProps } from "./treasury";
import { DelegationPage, type DelegationProps } from "./delegation";
import { ProposalDetailPage, type ProposalDetail } from "./proposalDetail";

// Stage B polish. These tests actually render each page component to an
// HTML string (Hono JSX nodes stringify synchronously — no request/response
// cycle needed) rather than grepping source text, because the two things
// being checked here — "is there a real space character next to this
// chip," "is this chip rendered exactly once" — are facts about the
// rendered output, not the source.

const TREASURY_PROPS: TreasuryProps = {
  member: null,
  adminDebug: false,
  communityName: "The Triarc",
  ops: 0,
  dividend: 0,
  reserve: 0,
  periodDays: 30,
  dividendCapMultiple: 5,
  dividendCapMemberCount: 1,
  foundationPoolShare: 0.5,
  dividendsPaid: 0,
  nextDividendAt: Date.now(),
  ledger: [],
  reserveMonthsCovered: 12,
};

const DELEGATION_PROPS: DelegationProps = {
  member: { id: 1, name: "alice" },
  adminDebug: false,
  communityName: "The Triarc",
  mine: [],
  otherMembers: [],
  publicSeats: [],
  sectors: [],
  held: [],
  map: [],
  delegationExpiryDays: 365,
  delegationExpiryCriticalDays: 90,
};

function baseProposal(overrides: Partial<ProposalDetail>): ProposalDetail {
  return {
    id: 1,
    title: "Test proposal",
    why: "Because.",
    cost: null,
    amount: null,
    reversal: null,
    cls: "ordinary",
    byName: "alice",
    submittedAt: Date.now(),
    stage: "deliberation",
    voteOpensAt: Date.now(),
    votingClosesAt: Date.now(),
    outcome: null,
    critical: false,
    sectorNames: [],
    targetMemberName: null,
    targetSectorName: null,
    positionAction: null,
    petitionSignatures: 0,
    petitionNeeded: 0,
    iSigned: false,
    timeSensitive: false,
    timeSensitiveDeadlineNote: null,
    tsPetitionSignatures: 0,
    tsPetitionNeeded: 0,
    iSignedTimeSensitive: false,
    resolution: [],
    targetClauses: [],
    ...overrides,
  };
}

describe("treasury.tsx chip spacing", () => {
  const html = String(TreasuryPage(TREASURY_PROPS));

  it("no chip touches the word that follows it", () => {
    expect(html).not.toContain("</a>Marks");
    expect(html).not.toContain("</a>Whatever");
  });

  it("the Treasury Code 4.3 and Charter 5.3 chips are each followed by a real space before the next word", () => {
    expect(html).toContain("</a> Marks");
    expect(html).toContain("</a> Whatever");
  });

  it("the two adjacent activation-gate chips (Treasury Code 5.1, Charter 5.4) have a space between them, not touching", () => {
    expect(html).toContain('</a> <a class="pill gray" href="/documents/charter#5.4"');
    expect(html).not.toContain('</a><a class="pill gray" href="/documents/charter#5.4"');
  });

  it("every chip is preceded by a space, not glued to the preceding word", () => {
    // Every `<a class="pill gray"` chip-open in this page is either at the
    // very start of the matched slice or immediately preceded by whitespace
    // — never by a letter, digit, or punctuation mark.
    const opens = [...html.matchAll(/<a class="pill gray"/g)];
    expect(opens.length).toBeGreaterThan(0);
    for (const m of opens) {
      const before = html[m.index! - 1];
      expect([" ", undefined]).toContain(before);
    }
  });
});

describe("delegation.tsx chip spacing", () => {
  const html = String(DelegationPage(DELEGATION_PROPS));

  it("the Charter 3.3 chip doesn't touch 'Ordinary decisions'", () => {
    expect(html).not.toContain("</a>Ordinary");
    expect(html).toContain("</a> Ordinary");
  });
});

describe("proposalDetail.tsx — no duplicate clause chip", () => {
  it("an Entrenched proposal naming charter#8.2 links to /documents/charter#8.2 exactly once in the rule-and-target area", () => {
    const proposal = baseProposal({
      cls: "entrenched",
      targetClauses: [{ key: "charter#8.2", href: "/documents/charter#8.2", label: "The Founding Charter 8.2", isEntrenched: true }],
    });
    const html = String(
      ProposalDetailPage({
        member: { id: 1, name: "alice" },
        adminDebug: false,
        communityName: "The Triarc",
        proposal,
        comments: [],
        minorityReports: [],
        iFiledMinorityReport: false,
        petitionSharePct: 10,
      })
    );
    const occurrences = html.split('href="/documents/charter#8.2"').length - 1;
    expect(occurrences).toBe(1);
    // Rules of Procedure 1.3 stays on the class line regardless.
    expect(html).toContain('href="/documents/rules-of-procedure#1.3"');
  });

  it("an Entrenched proposal that does NOT name charter#8.2 still shows the class-rule chip once", () => {
    const proposal = baseProposal({ cls: "entrenched", targetClauses: [] });
    const html = String(
      ProposalDetailPage({
        member: { id: 1, name: "alice" },
        adminDebug: false,
        communityName: "The Triarc",
        proposal,
        comments: [],
        minorityReports: [],
        iFiledMinorityReport: false,
        petitionSharePct: 10,
      })
    );
    const occurrences = html.split('href="/documents/charter#8.2"').length - 1;
    expect(occurrences).toBe(1);
  });

  it("an amendment proposal naming charter#8.1 shows it once, not twice", () => {
    const proposal = baseProposal({
      cls: "amendment",
      targetClauses: [{ key: "charter#8.1", href: "/documents/charter#8.1", label: "The Founding Charter 8.1", isEntrenched: false }],
    });
    const html = String(
      ProposalDetailPage({
        member: { id: 1, name: "alice" },
        adminDebug: false,
        communityName: "The Triarc",
        proposal,
        comments: [],
        minorityReports: [],
        iFiledMinorityReport: false,
        petitionSharePct: 10,
      })
    );
    const occurrences = html.split('href="/documents/charter#8.1"').length - 1;
    expect(occurrences).toBe(1);
  });

  it("the Rules of Procedure 1.3 chip is never deduplicated away, and sits with proper spacing", () => {
    const proposal = baseProposal({ cls: "ordinary" });
    const html = String(
      ProposalDetailPage({
        member: { id: 1, name: "alice" },
        adminDebug: false,
        communityName: "The Triarc",
        proposal,
        comments: [],
        minorityReports: [],
        iFiledMinorityReport: false,
        petitionSharePct: 10,
      })
    );
    expect(html.split('href="/documents/rules-of-procedure#1.3"').length - 1).toBe(1);
    expect(html).not.toContain("</a>critical");
    expect(html).not.toContain("</a>·");
  });
});
