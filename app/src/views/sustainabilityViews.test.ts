import { describe, it, expect } from "vitest";
import { DashboardPage, type DashboardProps } from "./dashboard";
import { GovernanceHealthPage } from "./governanceHealth";
import type { GovernanceHealth } from "../lib/community";
import type { SustainabilityProgress } from "../lib/mechanics";
import { DEFAULT_PARAMS } from "../lib/params";

// Stage: Charter 9.3 Phase II measurement. Rendering-based (String(Component))
// rather than source-text scraping, matching clauseChipSpacing.test.ts's own
// convention — these two views now carry several new conditional branches
// (no snapshot yet, insufficient window history, founder unset, fully met)
// that are facts about rendered output, not about the source.

function baseProgress(overrides: Partial<SustainabilityProgress> = {}): SustainabilityProgress {
  const c2 = DEFAULT_PARAMS.criteria.phase2;
  return {
    computedAt: Date.now(),
    windowDays: 180,
    historyDays: 200,
    hasFullWindowHistory: true,
    members: c2.members,
    active: c2.active,
    membershipNonDeclining: true,
    membershipFloorHeldEveryDay: true,
    proposalsCompletedInWindow: 40,
    proposalsPerMonth: c2.proposalsPerMonth,
    participationRate: c2.participationRate,
    participationSampleCount: 10,
    currentMaxDelegateShare: 0.02,
    maxDelegateShareHeldEveryDay: true,
    renewalsFunctioning: true,
    consecutiveOnTimeDividendRunsCount: c2.consecutiveDividendRuns,
    reserveComputed: false,
    reserveNonStandardLedgerEntries: 0,
    disputePanelsResolvedInWindow: c2.disputePanels,
    currentStewardCount: c2.stewardsMin,
    currentSectorsWithStewardship: c2.stewardSectorsMin,
    stewardDepthHeldEveryDay: true,
    founderId: 1,
    founderProposalShareInWindow: 0.1,
    ...overrides,
  };
}

const DASHBOARD_BASE: Omit<DashboardProps, "sustainability"> = {
  member: { id: 1, name: "alice" },
  adminDebug: false,
  communityName: "The Triarc",
  progress: {
    members: 10,
    active: 5,
    proposalsCompleted: 2,
    liveDelegations: 1,
    delegationsRenewedOrRevoked: 0,
    majorityMinParticipationOver90d: false,
    allDomainsHaveVerifiedContribution: false,
  },
  criteria: DEFAULT_PARAMS.criteria,
  treasury: { ops: 0, dividend: 0, reserve: 0 },
  nextDividendAt: Date.now(),
  dividendsPaid: 0,
  rankedProposals: [],
  rankedOpportunities: [],
  phoneVerificationStatus: null,
};

describe("DashboardPage — Sustainability Criteria card (Charter 9.3)", () => {
  it("renders without throwing, and says so plainly, when nothing has been computed yet", () => {
    const html = String(DashboardPage({ ...DASHBOARD_BASE, sustainability: null }));
    expect(html).toMatch(/not computed yet/i);
    expect(html).toMatch(/first daily computation/i);
  });

  it("a young deployment states the real history figure, never a countdown or a fabricated not-met (Amendment C)", () => {
    const html = String(DashboardPage({ ...DASHBOARD_BASE, sustainability: { computedAt: Date.now(), progress: baseProgress({ hasFullWindowHistory: false, historyDays: 12 }) } }));
    expect(html).toMatch(/window needs 180 days of history.*this community has 12/i);
    expect(html).not.toMatch(/only \d+ (more|to go)/i);
    expect(html).not.toMatch(/\d+ days? (left|remaining)/i);
  });

  it("shows 'not recorded' for the founder row when no founder is on record, not a fabricated 0%", () => {
    const html = String(DashboardPage({ ...DASHBOARD_BASE, sustainability: { computedAt: Date.now(), progress: baseProgress({ founderId: null, founderProposalShareInWindow: null }) } }));
    expect(html).toMatch(/not computed.*founder not recorded/i);
  });

  it("when a founder is recorded but nothing has completed, the founder row says that, not 'founder not recorded'", () => {
    const html = String(DashboardPage({ ...DASHBOARD_BASE, sustainability: { computedAt: Date.now(), progress: baseProgress({ founderId: 2, founderProposalShareInWindow: null }) } }));
    expect(html).toMatch(/no proposals have completed in the window yet/i);
    expect(html).not.toMatch(/founder not recorded/i);
  });

  it("the reserve sub-row always reads not-computed, and never shows a fabricated figure or a bare 0", () => {
    const html = String(DashboardPage({ ...DASHBOARD_BASE, sustainability: { computedAt: Date.now(), progress: baseProgress() } }));
    expect(html).toMatch(/not computed.*no operating expenditure has ever been recorded/i);
  });

  it("renders every one of the seven Charter 9.3 bullets when fully populated and 'held'", () => {
    const html = String(DashboardPage({ ...DASHBOARD_BASE, sustainability: { computedAt: Date.now(), progress: baseProgress() } }));
    for (const label of ["1. Membership", "2. Governance cadence", "3. Delegation health", "4. Treasury self-sustaining", "5. Dispute system exercised", "6. Leadership depth", "7. Runs without its founder"]) {
      expect(html).toContain(label);
    }
    // Never implies an automatic transition, however many rows read "met" (Amendment D).
    expect(html).toMatch(/measurement only/i);
    expect(html).not.toMatch(/phase ii (has closed|will close|closes automatically)/i);
  });

  it("never claims a numeric met/not-yet pill for the reserve row even when every other row is fully met (decision 3's sub-row gate)", () => {
    const html = String(DashboardPage({ ...DASHBOARD_BASE, sustainability: { computedAt: Date.now(), progress: baseProgress() } }));
    const reserveRowMatch = html.match(/Reserve covers[^<]*<\/span><span class="small sans">(.*?)<\/span><\/div>/);
    expect(reserveRowMatch).not.toBeNull();
    expect(reserveRowMatch![1]).not.toMatch(/<b>/);
    expect(reserveRowMatch![1]).toMatch(/not computed/i);
  });
});

function baseHealth(founderProposalShareInWindow: number | null, founderRecorded = true): GovernanceHealth {
  return {
    computedAt: Date.now(),
    delegation: { totalLiveDelegations: 0, largestRecipientShare: 0, top5Share: 0, top10Share: 0, pctMembersWithNoOutgoingDelegation: 1 },
    contribution: { top5CreditShare: 0, domainShares: { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 }, top5AttestorShare: 0, domainIssuanceCap: { rawTotal: 0, raw: { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 }, cap: { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 }, residue: { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 }, overage: { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 }, scaleFactor: { Deliberation: 1, Craft: 1, Stewardship: 1, Attestation: 1 } } },
    institutional: { distinctHolders: 0, totalSeats: 0, concentrationShare: 0, disputePanelPoolSize: 0 },
    pluralism: { distinctActiveLeaders: 0, sectorsWithLeadership: 0, top5ProposalAuthorShare: 0 },
    resilience: { civicStewardCount: 0, founderProposalShareInWindow, founderRecorded },
    delegatedAuthorityMechanism: null,
  };
}

describe("GovernanceHealthPage — founder-independence row (Charter 9.3, decision 5)", () => {
  it("never mentions 'earliest-joined Member' or a name — the approximation this build replaces", () => {
    const html = String(GovernanceHealthPage({ member: null, adminDebug: false, communityName: "The Triarc", health: baseHealth(0.2), domainIssuanceCapEnabled: false, maxDelegateShare: 0.1, unaccountedDefaults: [] }));
    expect(html).not.toMatch(/earliest-joined/i);
  });

  it("shows 'not recorded' rather than a dash-as-zero when founderProposalShareInWindow is null", () => {
    const html = String(GovernanceHealthPage({ member: null, adminDebug: false, communityName: "The Triarc", health: baseHealth(null, false), domainIssuanceCapEnabled: false, maxDelegateShare: 0.1, unaccountedDefaults: [] }));
    expect(html).toMatch(/founder not recorded/i);
  });

  it("when a founder IS recorded but nothing has completed yet, says so and never claims the founder is unrecorded", () => {
    const html = String(GovernanceHealthPage({ member: null, adminDebug: false, communityName: "The Triarc", health: baseHealth(null, true), domainIssuanceCapEnabled: false, maxDelegateShare: 0.1, unaccountedDefaults: [] }));
    expect(html).toMatch(/no proposals have completed the full lifecycle/i);
    expect(html).not.toMatch(/founder not recorded/i);
  });

  it("renders the real share, never the founder's name, when it is recorded", () => {
    const html = String(GovernanceHealthPage({ member: null, adminDebug: false, communityName: "The Triarc", health: baseHealth(0.37), domainIssuanceCapEnabled: false, maxDelegateShare: 0.1, unaccountedDefaults: [] }));
    expect(html).toContain("37%");
  });
});
