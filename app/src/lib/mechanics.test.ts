import { describe, it, expect } from "vitest";
import {
  effectiveDelegation,
  resolveVote,
  closeVote,
  periodCredits,
  computeDomainIssuanceReport,
  applyDomainIssuanceCap,
  computeDonationSplit,
  reciprocityMultipliers,
  runDividend,
  runFoundationAndCivicDividend,
  computeCritical,
  isDelegateActive,
  delegateTier,
  graceExpired,
  isCloselyTied,
  delegationExpiryStatus,
  civicStewardOf,
  rankScore,
  foundingCriteriaMet,
  nomineeEligible,
  isSupportingNomineeActive,
  disputePanelOutcome,
  snapshotToVotingMembers,
  type SnapshotDelegationRow,
  eligiblePanelCandidates,
  type PanelCandidate,
  contributionClaimStatus,
  isPhoneVerified,
  isPositionVoteEligible,
  filterTallyByEligibility,
  isValidPositionTarget,
  isValidPositionSector,
  isValidPositionMember,
  filterExistingIds,
  type VotingMember,
  type FoundingProgress,
  type VoteTally,
} from "./mechanics";
import { DAY_MS, CLASS_CONFIG, PRE_AMENDMENT_TIMELINE, DEFAULT_PARAMS, type FoundingCriteriaPhaseI } from "./params";
import { DISPUTE_PANEL_SIZE, DISPUTE_PANEL_POOL_MINIMUM, DISPUTE_RESPONSE_WINDOW_DAYS, DIVIDEND_ACTIVATION_MEMBERS, CONTRIBUTION_CLAIM_WINDOW_DAYS } from "./community";

const NOW = 1_000_000_000_000;

describe("effectiveDelegation", () => {
  it("prefers a live sector-scoped delegation over a live entire delegation", () => {
    const m: VotingMember = {
      id: 1,
      delegations: [
        { toId: 2, grantedAt: NOW - DAY_MS, sectorId: null },
        { toId: 3, grantedAt: NOW - DAY_MS, sectorId: 5 },
      ],
    };
    expect(effectiveDelegation(m, NOW, 90, [5])).toEqual({ toId: 3, grantedAt: NOW - DAY_MS, sectorId: 5 });
    // proposal isn't tagged with sector 5 -> falls back to the entire delegation
    expect(effectiveDelegation(m, NOW, 90, [9])).toEqual({ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null });
  });

  it("breaks ties between multiple matching scoped delegations by lowest sectorId, then earliest grantedAt", () => {
    const m: VotingMember = {
      id: 1,
      delegations: [
        { toId: 2, grantedAt: NOW - 2 * DAY_MS, sectorId: 7 },
        { toId: 3, grantedAt: NOW - DAY_MS, sectorId: 5 },
      ],
    };
    expect(effectiveDelegation(m, NOW, 90, [5, 7])?.toId).toBe(3);
  });

  it("falls back to a live entire delegation when the scoped one is expired", () => {
    const m: VotingMember = {
      id: 1,
      delegations: [
        { toId: 2, grantedAt: NOW - 91 * DAY_MS, sectorId: 5 },
        { toId: 4, grantedAt: NOW - DAY_MS, sectorId: null },
      ],
    };
    expect(effectiveDelegation(m, NOW, 90, [5])?.toId).toBe(4);
  });

  it("returns null when both the scoped and entire delegations are expired", () => {
    const m: VotingMember = {
      id: 1,
      delegations: [
        { toId: 2, grantedAt: NOW - 91 * DAY_MS, sectorId: 5 },
        { toId: 4, grantedAt: NOW - 91 * DAY_MS, sectorId: null },
      ],
    };
    expect(effectiveDelegation(m, NOW, 90, [5])).toBeNull();
  });
});

describe("resolveVote", () => {
  it("a direct vote always overrides delegation", () => {
    const members: VotingMember[] = [
      { id: 1, delegations: [{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null }] },
      { id: 2, delegations: [] },
    ];
    const votes = { 1: false, 2: true }; // member 1 delegated to 2 but voted directly
    const t = resolveVote(members, votes, NOW, 90);
    expect(t.resolutions[1]).toEqual({ val: false, how: "direct" });
    expect(t.yes).toBe(1);
    expect(t.no).toBe(1);
  });

  it("follows a delegation chain to the terminal direct voter", () => {
    const members: VotingMember[] = [
      { id: 1, delegations: [{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null }] },
      { id: 2, delegations: [{ toId: 3, grantedAt: NOW - DAY_MS, sectorId: null }] },
      { id: 3, delegations: [] },
    ];
    const votes = { 3: true };
    const t = resolveVote(members, votes, NOW, 90);
    expect(t.resolutions[1]).toEqual({ val: true, how: "via 3" });
    expect(t.resolutions[2]).toEqual({ val: true, how: "via 3" });
    expect(t.participating).toBe(3);
  });

  it("voids circular delegation chains", () => {
    const members: VotingMember[] = [
      { id: 1, delegations: [{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null }] },
      { id: 2, delegations: [{ toId: 1, grantedAt: NOW - DAY_MS, sectorId: null }] },
    ];
    const t = resolveVote(members, {}, NOW, 90);
    expect(t.participating).toBe(0);
  });

  it("an expired delegation does not carry the vote", () => {
    const members: VotingMember[] = [
      { id: 1, delegations: [{ toId: 2, grantedAt: NOW - 91 * DAY_MS, sectorId: null }] },
      { id: 2, delegations: [] },
    ];
    const votes = { 2: true };
    const t = resolveVote(members, votes, NOW, 90);
    expect(t.resolutions[1]).toBeUndefined();
    expect(t.participating).toBe(1);
  });

  it("a sector-scoped delegation only applies to a vote tagged with that sector", () => {
    const members: VotingMember[] = [
      { id: 1, delegations: [{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: 5 }] },
      { id: 2, delegations: [] },
    ];
    const votes = { 2: true };
    expect(resolveVote(members, votes, NOW, 90, [5]).resolutions[1]).toEqual({ val: true, how: "via 2" });
    expect(resolveVote(members, votes, NOW, 90, [7]).resolutions[1]).toBeUndefined();
  });

  it("a live sector-scoped delegation overrides a live entire delegation to a different target", () => {
    const members: VotingMember[] = [
      {
        id: 1,
        delegations: [
          { toId: 2, grantedAt: NOW - DAY_MS, sectorId: null },
          { toId: 3, grantedAt: NOW - DAY_MS, sectorId: 5 },
        ],
      },
      { id: 2, delegations: [] },
      { id: 3, delegations: [] },
    ];
    const votes = { 2: true, 3: false };
    expect(resolveVote(members, votes, NOW, 90, [5]).resolutions[1]).toEqual({ val: false, how: "via 3" });
    expect(resolveVote(members, votes, NOW, 90, [9]).resolutions[1]).toEqual({ val: true, how: "via 2" });
  });

  it("the critical vs. ordinary expiry window changes which delegations resolve", () => {
    const members: VotingMember[] = [
      { id: 1, delegations: [{ toId: 2, grantedAt: NOW - 100 * DAY_MS, sectorId: null }] },
      { id: 2, delegations: [] },
    ];
    const votes = { 2: true };
    // ordinary cycle (365d default): 100 days ago is still live
    expect(resolveVote(members, votes, NOW, 365).participating).toBe(2);
    // critical cycle (90d default): 100 days ago is stale
    expect(resolveVote(members, votes, NOW, 90).participating).toBe(1);
  });
});

describe("closeVote", () => {
  // Charter 3.5/3.5a — the minimum is the GREATER of the fraction and ten
  // Members. A percentage alone is not a quorum at founding scale: at the 30
  // Members that activate distribution, 10% is three voters and a majority of
  // three is two. Two people should not carry a proposal that binds thirty.
  it("takes the absolute floor over the fraction while the community is small", () => {
    const cfg = CLASS_CONFIG.ordinary;
    // 30 members: 10% is 3, but the floor is 10.
    const three: VoteTally = { yes: 2, no: 1, participating: 3, resolutions: {} };
    expect(closeVote(30, three, cfg).ratified).toBe(false);
    expect(closeVote(30, three, cfg).label).toMatch(/3\/10 needed/);
    const ten: VoteTally = { yes: 6, no: 4, participating: 10, resolutions: {} };
    expect(closeVote(30, ten, cfg).ratified).toBe(true);
  });

  it("takes the fraction over the floor once the community is large enough", () => {
    const cfg = CLASS_CONFIG.ordinary;
    // 300 members: 10% is 30, well above the floor of 10.
    const twelve: VoteTally = { yes: 8, no: 4, participating: 12, resolutions: {} };
    expect(closeVote(300, twelve, cfg).ratified).toBe(false);
    const thirty: VoteTally = { yes: 20, no: 10, participating: 30, resolutions: {} };
    expect(closeVote(300, thirty, cfg).ratified).toBe(true);
  });

  // The floor can never demand more voters than the community has.
  it("never requires more participants than there are members", () => {
    const cfg = CLASS_CONFIG.ordinary;
    const all: VoteTally = { yes: 4, no: 2, participating: 6, resolutions: {} };
    expect(closeVote(6, all, cfg).ratified).toBe(true);
  });

  it("fails minimum participation when too few members participate", () => {
    const tally = { yes: 5, no: 0, participating: 5, resolutions: {} };
    const outcome = closeVote(100, tally, CLASS_CONFIG.ordinary); // needs 10 to meet minimum participation
    expect(outcome.ratified).toBe(false);
    expect(outcome.metMinParticipation).toBe(false);
    expect(outcome.label).toMatch(/minimum participation/);
  });

  it("ratifies an ordinary proposal on simple majority once minimum participation is met", () => {
    const tally = { yes: 11, no: 9, participating: 20, resolutions: {} };
    const outcome = closeVote(100, tally, CLASS_CONFIG.ordinary);
    expect(outcome.ratified).toBe(true);
    expect(outcome.metMinParticipation).toBe(true);
  });

  it("requires two-thirds for a charter amendment", () => {
    const tally = { yes: 14, no: 6, participating: 20, resolutions: {} }; // 70%, participation ok
    const failing = closeVote(100, { yes: 13, no: 7, participating: 20, resolutions: {} }, CLASS_CONFIG.amendment); // 65% < 2/3
    expect(closeVote(100, tally, CLASS_CONFIG.amendment).ratified).toBe(true);
    expect(failing.ratified).toBe(false);
  });

  it("requires three-quarters and 40% minimum participation for an entrenched amendment", () => {
    const cfg = CLASS_CONFIG.entrenched;
    const shortParticipation = closeVote(100, { yes: 30, no: 5, participating: 35, resolutions: {} }, cfg);
    expect(shortParticipation.ratified).toBe(false);
    const shortMajority = closeVote(100, { yes: 30, no: 15, participating: 45, resolutions: {} }, cfg); // 66% < 75%
    expect(shortMajority.ratified).toBe(false);
    const passes = closeVote(100, { yes: 38, no: 5, participating: 43, resolutions: {} }, cfg); // ~88%
    expect(passes.ratified).toBe(true);
  });

  it("evaluates a Position decision at its own three-fifths threshold, lower than a Charter amendment's two-thirds", () => {
    const cfg = CLASS_CONFIG.position;
    expect(cfg.threshold).toBe(3 / 5);
    expect(cfg.minParticipation).toBe(0.2);
    const passes = closeVote(100, { yes: 12, no: 8, participating: 20, resolutions: {} }, cfg); // 60% clears 3/5? no — strictly greater than
    expect(passes.ratified).toBe(false); // exactly 60% does not clear a strictly-greater-than 3/5 bar
    const clears = closeVote(100, { yes: 13, no: 7, participating: 20, resolutions: {} }, cfg); // 65% > 60%
    expect(clears.ratified).toBe(true);
    // 65% clears Position (3/5) but would fail Charter amendment (2/3 ≈ 66.7%)
    expect(closeVote(100, { yes: 13, no: 7, participating: 20, resolutions: {} }, CLASS_CONFIG.amendment).ratified).toBe(false);
    const shortParticipation = closeVote(100, { yes: 10, no: 5, participating: 15, resolutions: {} }, cfg);
    expect(shortParticipation.ratified).toBe(false);
  });
});

describe("CLASS_CONFIG (Rules of Procedure §1.3, Aug 2026 amendment)", () => {
  it("lengthens Ordinary to 30d deliberation + 7d voting", () => {
    expect(CLASS_CONFIG.ordinary.delibDays).toBe(30);
    expect(CLASS_CONFIG.ordinary.voteDays).toBe(7);
  });
  it("lengthens Treasury to 30d deliberation + 7d voting, same as Ordinary", () => {
    expect(CLASS_CONFIG.treasury.delibDays).toBe(30);
    expect(CLASS_CONFIG.treasury.voteDays).toBe(7);
  });
  it("leaves Position at its own shorter 7d + 5d window, unaffected by the amendment", () => {
    expect(CLASS_CONFIG.position.delibDays).toBe(7);
    expect(CLASS_CONFIG.position.voteDays).toBe(5);
  });
  // Founding Charter 8.1 promises amendments "a longer deliberation window" than
  // ordinary business. Before the Aug 31 2026 audit both amendment classes sat at
  // 14d — less than half of Ordinary's 30d — so the charter said the opposite of
  // what the table did. These assertions are what stops that regressing.
  it("gives Charter amendment a genuinely longer window than Ordinary (Charter 8.1)", () => {
    expect(CLASS_CONFIG.amendment.delibDays).toBe(45);
    expect(CLASS_CONFIG.amendment.voteDays).toBe(5);
    expect(CLASS_CONFIG.amendment.delibDays).toBeGreaterThan(CLASS_CONFIG.ordinary.delibDays);
  });
  it("gives Entrenched amendment the longest window of any class (Charter 8.2)", () => {
    expect(CLASS_CONFIG.entrenched.delibDays).toBe(60);
    expect(CLASS_CONFIG.entrenched.voteDays).toBe(7);
    expect(CLASS_CONFIG.entrenched.delibDays).toBeGreaterThan(CLASS_CONFIG.amendment.delibDays);
  });
});

// 2026-10-11 app review, finding H7 — Treasury Code §2.2's blended rule
// ("spending from the treasury reserve is not an ordinary Treasury
// allocation... two-thirds with 20% minimum participation, while keeping
// the Treasury allocation timeline") had no implementation: every treasury
// proposal, reserve-spending or not, ratified at the plain-majority/10%
// "treasury" tuple. Fixed by giving reserve spending its own class.
describe("CLASS_CONFIG.treasury_reserve (Treasury Code §2.2 — reserve spending)", () => {
  it("keeps the Treasury-allocation timeline, not the amendment timeline", () => {
    expect(CLASS_CONFIG.treasury_reserve.delibDays).toBe(CLASS_CONFIG.treasury.delibDays);
    expect(CLASS_CONFIG.treasury_reserve.voteDays).toBe(CLASS_CONFIG.treasury.voteDays);
    expect(CLASS_CONFIG.treasury_reserve.delibDays).toBe(30);
    expect(CLASS_CONFIG.treasury_reserve.voteDays).toBe(7);
  });
  it("raises the threshold and participation to the Charter-amendment level, not Treasury's", () => {
    expect(CLASS_CONFIG.treasury_reserve.threshold).toBe(CLASS_CONFIG.amendment.threshold);
    expect(CLASS_CONFIG.treasury_reserve.minParticipation).toBe(CLASS_CONFIG.amendment.minParticipation);
    expect(CLASS_CONFIG.treasury_reserve.threshold).toBeCloseTo(2 / 3);
    expect(CLASS_CONFIG.treasury_reserve.minParticipation).toBe(0.20);
  });
  it("ratifies a reserve-spending proposal only at two-thirds, where an ordinary Treasury allocation would already have passed", () => {
    const sixty = { yes: 60, no: 40, participating: 100, resolutions: {} };
    expect(closeVote(100, sixty, CLASS_CONFIG.treasury).ratified).toBe(true);
    expect(closeVote(100, sixty, CLASS_CONFIG.treasury_reserve).ratified).toBe(false);
    const sixtySeven = { yes: 67, no: 33, participating: 100, resolutions: {} };
    expect(closeVote(100, sixtySeven, CLASS_CONFIG.treasury_reserve).ratified).toBe(true);
  });
});

describe("PRE_AMENDMENT_TIMELINE (Rules of Procedure §1.3a — time-sensitive petition)", () => {
  it("restores the pre-Aug-2026 7d/5d Ordinary/Treasury timeline", () => {
    expect(PRE_AMENDMENT_TIMELINE.delibDays).toBe(7);
    expect(PRE_AMENDMENT_TIMELINE.voteDays).toBe(5);
  });
});

describe("Dispute Panel sizing (Dispute Procedure Code 2.1, Aug 2026 amendment)", () => {
  it("draws an 11-member panel, up from 5", () => {
    expect(DISPUTE_PANEL_SIZE).toBe(11);
  });
  it("requires a pool of at least 30 Active Members before any panel is drawn, up from 15", () => {
    expect(DISPUTE_PANEL_POOL_MINIMUM).toBe(30);
  });
});

describe("computeCritical", () => {
  it("is always true for amendment, entrenched, and position classes", () => {
    expect(computeCritical("amendment", null, 1000)).toBe(true);
    expect(computeCritical("entrenched", null, 1000)).toBe(true);
    expect(computeCritical("position", null, 1000)).toBe(true);
  });

  it("is false for ordinary and for a treasury proposal with no amount", () => {
    expect(computeCritical("ordinary", null, 1000)).toBe(false);
    expect(computeCritical("treasury", null, 1000)).toBe(false);
  });

  it("is false at exactly 5% of the treasury (strictly greater than) and true just over it", () => {
    expect(computeCritical("treasury", 50, 1000)).toBe(false);
    expect(computeCritical("treasury", 51, 1000)).toBe(true);
  });
});

describe("isDelegateActive", () => {
  it("is active when recognized and not revoked", () => {
    expect(isDelegateActive(null)).toBe(true);
  });

  it("is inactive once revoked — by a ratified removal, or by the grace-period auto-lapse tick() writes", () => {
    expect(isDelegateActive(12345)).toBe(false);
  });
});

describe("delegateTier (Charter 4.7/4.8)", () => {
  const floor = 0.03;
  const trigger = 0.015;
  const MANY = 20; // comfortably above the two-supporter condition

  it("is 'held' at or above the sustaining floor with enough supporters", () => {
    expect(delegateTier(0.05, floor, trigger, MANY)).toBe("held");
    expect(delegateTier(0.03, floor, trigger, MANY)).toBe("held");
  });

  it("is 'recall' below the floor but at or above the trigger", () => {
    expect(delegateTier(0.02, floor, trigger, MANY)).toBe("recall");
    expect(delegateTier(0.015, floor, trigger, MANY)).toBe("recall");
  });

  it("is 'grace' below the automatic-removal trigger", () => {
    expect(delegateTier(0, floor, trigger, 0)).toBe("grace");
    // Charter 4.8 defines the band by share alone and 4.9 has no supporter
    // condition. Retaining one supporter must not keep a Delegate out of grace.
    expect(delegateTier(0.01, floor, trigger, 1)).toBe("grace");
    expect(delegateTier(0.014, floor, trigger, 3)).toBe("grace");
  });

  // Charter 4.7/4.8a — the condition that makes the recall band reachable at all
  // in a small sector. One supporter is 1/S of a sector holding S delegations,
  // which clears a 3% floor for every S below 34. Without the supporter
  // condition a one-supporter Delegate holds their Position automatically and
  // permanently, and 4.8's confirmation vote can never fire.
  it("puts a one-supporter Delegate in the recall band however large their share", () => {
    for (const S of [2, 5, 10, 20, 33]) {
      const share = 1 / S;
      expect(share).toBeGreaterThanOrEqual(floor); // the percentage alone would say "held"
      expect(delegateTier(share, floor, trigger, 1)).toBe("recall");
    }
  });

  it("still holds a two-supporter Delegate who clears the percentage", () => {
    expect(delegateTier(2 / 10, floor, trigger, 2)).toBe("held");
  });
});

describe("graceExpired (Charter 4.9)", () => {
  it("has not expired before the grace window elapses", () => {
    expect(graceExpired(NOW, 14, NOW + 13 * DAY_MS)).toBe(false);
  });
  it("has expired once the grace window elapses", () => {
    expect(graceExpired(NOW, 14, NOW + 14 * DAY_MS)).toBe(true);
    expect(graceExpired(NOW, 14, NOW + 20 * DAY_MS)).toBe(true);
  });
});

describe("delegationExpiryStatus (Charter 3.3 — delegation_expiring_soon)", () => {
  const ORDINARY_DAYS = 365;
  const CRITICAL_DAYS = 90;

  it("flags the ordinary-cycle (365-day) expiry within the 7-day warning window, with critical-cycle already long past", () => {
    // 3 days before the 365-day ordinary expiry — the critical-cycle
    // threshold (90 days) is 272 days behind us by this point, so
    // criticalSoon must be false, not just unset. Exercises the path a real
    // dev-clock jump couldn't reach in manual testing (session TTL expired
    // first) — injected ts here, no clock jump involved.
    const grantedAt = NOW;
    const ts = NOW + (ORDINARY_DAYS - 3) * DAY_MS;
    const status = delegationExpiryStatus(grantedAt, ts, ORDINARY_DAYS, CRITICAL_DAYS);
    expect(status).toEqual({ stillLive: true, ordinarySoon: true, criticalSoon: false });
  });

  it("flags the critical-cycle (90-day) expiry within the 7-day warning window, with the ordinary cycle still far off", () => {
    const grantedAt = NOW;
    const ts = NOW + (CRITICAL_DAYS - 3) * DAY_MS;
    const status = delegationExpiryStatus(grantedAt, ts, ORDINARY_DAYS, CRITICAL_DAYS);
    expect(status).toEqual({ stillLive: true, ordinarySoon: false, criticalSoon: true });
  });

  it("flags neither when well outside both warning windows", () => {
    const grantedAt = NOW;
    const ts = NOW + 30 * DAY_MS;
    const status = delegationExpiryStatus(grantedAt, ts, ORDINARY_DAYS, CRITICAL_DAYS);
    expect(status).toEqual({ stillLive: true, ordinarySoon: false, criticalSoon: false });
  });

  it("is no longer live once past the ordinary expiry, and flags neither threshold", () => {
    const grantedAt = NOW;
    const ts = NOW + (ORDINARY_DAYS + 1) * DAY_MS;
    const status = delegationExpiryStatus(grantedAt, ts, ORDINARY_DAYS, CRITICAL_DAYS);
    expect(status).toEqual({ stillLive: false, ordinarySoon: false, criticalSoon: false });
  });

  it("includes the exact 7-day boundary (inclusive) for the ordinary cycle", () => {
    const grantedAt = NOW;
    const ts = NOW + (ORDINARY_DAYS - 7) * DAY_MS;
    expect(delegationExpiryStatus(grantedAt, ts, ORDINARY_DAYS, CRITICAL_DAYS).ordinarySoon).toBe(true);
    expect(delegationExpiryStatus(grantedAt, ts - 1, ORDINARY_DAYS, CRITICAL_DAYS).ordinarySoon).toBe(false);
  });
});

describe("isCloselyTied (Charter 4.10)", () => {
  it("is tied within the margin", () => {
    expect(isCloselyTied(0.05, 0.06, 0.02)).toBe(true);
  });
  it("is not tied outside the margin", () => {
    expect(isCloselyTied(0.05, 0.09, 0.02)).toBe(false);
  });
  it("is order-independent", () => {
    expect(isCloselyTied(0.09, 0.05, 0.02)).toBe(false);
  });
});

describe("civicStewardOf", () => {
  it("requires both a live sector delegation and nonzero sector standing credits", () => {
    expect(civicStewardOf(true, 10)).toBe(true);
    expect(civicStewardOf(true, 0)).toBe(false);
    expect(civicStewardOf(false, 10)).toBe(false);
  });
});

describe("nomineeEligible", () => {
  it("is eligible with any nonzero sector standing credits", () => {
    expect(nomineeEligible(1)).toBe(true);
    expect(nomineeEligible(50)).toBe(true);
  });
  it("is ineligible with zero sector standing credits", () => {
    expect(nomineeEligible(0)).toBe(false);
  });
});

describe("isSupportingNomineeActive", () => {
  it("is active when not revoked and the underlying Delegate is active", () => {
    expect(isSupportingNomineeActive(null, null)).toBe(true);
  });
  it("is inactive once explicitly revoked, even if the Delegate is still active", () => {
    expect(isSupportingNomineeActive(12345, null)).toBe(false);
  });
  it("lapses automatically when the underlying Delegate lapses, without its own revocation", () => {
    expect(isSupportingNomineeActive(null, 12345)).toBe(false);
  });
});

describe("disputePanelOutcome", () => {
  it("upholds the challenge when more panelists vote to uphold than dismiss", () => {
    expect(disputePanelOutcome([{ upheld: true }, { upheld: true }, { upheld: false }])).toBe("upheld");
  });
  it("dismisses on a tie", () => {
    expect(disputePanelOutcome([{ upheld: true }, { upheld: false }])).toBe("dismissed");
  });
  it("dismisses when no votes were cast at all", () => {
    expect(disputePanelOutcome([])).toBe("dismissed");
  });
});

describe("contributionClaimStatus (Contribution Code 1.4-1.6)", () => {
  const WINDOW = CONTRIBUTION_CLAIM_WINDOW_DAYS; // 60

  it("is unverified before verification", () => {
    expect(contributionClaimStatus(null, null, NOW, WINDOW)).toBe("unverified");
  });

  it("is pending once verified but not yet claimed, within the claim window — does not count", () => {
    const verifiedAt = NOW - 10 * DAY_MS;
    expect(contributionClaimStatus(verifiedAt, null, NOW, WINDOW)).toBe("pending");
  });

  it("is claimed once the member claims it — counts, regardless of how long ago claimed", () => {
    const verifiedAt = NOW - 10 * DAY_MS;
    const claimedAt = NOW - 5 * DAY_MS;
    expect(contributionClaimStatus(verifiedAt, claimedAt, NOW, WINDOW)).toBe("claimed");
    // still claimed even long past what would otherwise be the lapse window
    expect(contributionClaimStatus(NOW - 200 * DAY_MS, NOW - 199 * DAY_MS, NOW, WINDOW)).toBe("claimed");
  });

  it("lapses once the claim window elapses unclaimed — stays visible, but does not count", () => {
    const verifiedAt = NOW - WINDOW * DAY_MS;
    expect(contributionClaimStatus(verifiedAt, null, NOW, WINDOW)).toBe("lapsed");
    expect(contributionClaimStatus(NOW - (WINDOW + 1) * DAY_MS, null, NOW, WINDOW)).toBe("lapsed");
  });

  it("includes the exact boundary (inclusive) as lapsed, one day short as still pending", () => {
    expect(contributionClaimStatus(NOW - WINDOW * DAY_MS, null, NOW, WINDOW)).toBe("lapsed");
    expect(contributionClaimStatus(NOW - (WINDOW - 1) * DAY_MS, null, NOW, WINDOW)).toBe("pending");
  });
});

// Prompt25_PathA_MembershipEnforcement.md — Triarc Membership Code 2.1-2.4's
// phone-verification floor. Every enforcement point that actually applies
// these functions (route-level rejection, closeOneVote's tallying) lives in
// community.ts/index.tsx, gated on REQUIRE_PHONE_VERIFICATION and only
// exercisable against a real D1 database — this repo has no DB-integration
// test harness (mechanics.test.ts tests pure functions only, by
// established convention), so that route/DB-level behavior was verified
// live against the deployed Triarc Worker instead (see the build report),
// not re-created as a mocked-DB test here. What's fully unit-testable —
// the pure eligibility rules themselves, and that an ineligible member's
// resolved vote drops out of a tally exactly the way resolveVote already
// handles an unresolvable delegation — is covered below.

describe("isPhoneVerified (Triarc Membership Code 2.1/2.3)", () => {
  it("is false until a phone is verified, true once it is", () => {
    expect(isPhoneVerified(null)).toBe(false);
    expect(isPhoneVerified(NOW - DAY_MS)).toBe(true);
  });
});

describe("isPositionVoteEligible (Triarc Membership Code 2.4)", () => {
  const REQUIRED = 30;

  it("is false for an unverified member regardless of ts", () => {
    expect(isPositionVoteEligible(null, NOW, REQUIRED)).toBe(false);
  });

  it("is false one day short of the required window", () => {
    expect(isPositionVoteEligible(NOW - (REQUIRED - 1) * DAY_MS, NOW, REQUIRED)).toBe(false);
  });

  it("is true at the exact boundary (inclusive) and beyond", () => {
    expect(isPositionVoteEligible(NOW - REQUIRED * DAY_MS, NOW, REQUIRED)).toBe(true);
    expect(isPositionVoteEligible(NOW - 90 * DAY_MS, NOW, REQUIRED)).toBe(true);
  });

  it("the clock runs from phoneVerifiedAt, not from an earlier joinedAt", () => {
    // A member who registered 100 days ago but verified only 5 days ago is
    // not yet eligible — 2.4's "held Membership in good standing" starts at
    // verification, not registration.
    const phoneVerifiedAt = NOW - 5 * DAY_MS;
    expect(isPositionVoteEligible(phoneVerifiedAt, NOW, REQUIRED)).toBe(false);
  });
});

describe("filterTallyByEligibility (Triarc Membership Code 2.4 — Position-decision tallying)", () => {
  it("drops ineligible members from yes/no/participating and recomputes the totals", () => {
    const members: VotingMember[] = [
      { id: 1, delegations: [] },
      { id: 2, delegations: [] },
      { id: 3, delegations: [] },
    ];
    const votes = { 1: true, 2: true, 3: false };
    const tally = resolveVote(members, votes, NOW, 90);
    expect(tally.participating).toBe(3);

    // Only member 1 is "eligible" (e.g. verified 30+ days) — 2 and 3 are not.
    const filtered = filterTallyByEligibility(tally, (id) => id === 1);
    expect(filtered.participating).toBe(1);
    expect(filtered.yes).toBe(1);
    expect(filtered.no).toBe(0);
    expect(filtered.resolutions[1]).toEqual({ val: true, how: "direct" });
    expect(filtered.resolutions[2]).toBeUndefined();
    expect(filtered.resolutions[3]).toBeUndefined();
  });

  it("preserves a resolved-via-delegation vote's originating member id, not the terminal voter's", () => {
    // Member 1 (eligible) delegates to member 2 (also eligible), who votes
    // directly. Member 3 (ineligible) delegates to member 2 as well.
    const members: VotingMember[] = [
      { id: 1, delegations: [{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null }] },
      { id: 2, delegations: [] },
      { id: 3, delegations: [{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null }] },
    ];
    const votes = { 2: true };
    const tally = resolveVote(members, votes, NOW, 90);
    expect(tally.participating).toBe(3); // 1 and 3 both resolve via 2, plus 2's own direct vote

    const eligibleIds = new Set([1, 2]); // 3 is excluded (e.g. unverified)
    const filtered = filterTallyByEligibility(tally, (id) => eligibleIds.has(id));
    expect(filtered.participating).toBe(2);
    expect(filtered.resolutions[1]).toEqual({ val: true, how: "via 2" });
    expect(filtered.resolutions[2]).toEqual({ val: true, how: "direct" });
    expect(filtered.resolutions[3]).toBeUndefined();
  });
});

describe("Triarc Membership Code 2.1 — an unverified delegation target resolves like a delegate who's left the community", () => {
  it("a live delegation to a member excluded from the resolution graph never resolves, the same way resolveVote already handles a departed delegate", () => {
    // Prompt25 Part D.3: community.ts's closeOneVote answers this by
    // excluding unverified members from the `members` array it passes to
    // resolveVote — not by adding a phone-verification branch inside
    // resolveVote itself (which stays fully deployment-agnostic). This test
    // reproduces that exact input shape directly against resolveVote: a
    // live delegation whose target simply isn't present in `members`
    // (matching resolveVote's own existing `if (!next) break` path for any
    // delegate no longer in the community) never resolves.
    const memberIncludingTarget: VotingMember[] = [
      { id: 1, delegations: [{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null }] },
      { id: 2, delegations: [] },
    ];
    expect(resolveVote(memberIncludingTarget, { 2: true }, NOW, 90).resolutions[1]).toEqual({ val: true, how: "via 2" });

    // Member 2 (the delegation target) is unverified and so is excluded
    // from resolutionMembers before resolveVote ever runs — exactly what
    // closeOneVote does. member 1's delegation now points at someone
    // resolveVote's `byId` map doesn't contain at all.
    const withTargetExcluded: VotingMember[] = [{ id: 1, delegations: [{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null }] }];
    const tally = resolveVote(withTargetExcluded, {}, NOW, 90);
    expect(tally.resolutions[1]).toBeUndefined();
    expect(tally.participating).toBe(0);
  });
});

describe("rankScore", () => {
  const weights = { follow: 1, contribution: 1 };

  it("is zero with no overlap", () => {
    expect(rankScore([], [], [1, 2], weights)).toBe(0);
  });

  it("counts follow-only overlap", () => {
    expect(rankScore([1], [], [1, 2], weights)).toBe(1);
  });

  it("counts contribution-only overlap", () => {
    expect(rankScore([], [2], [1, 2], weights)).toBe(1);
  });

  it("blends both signals", () => {
    expect(rankScore([1], [2], [1, 2], weights)).toBe(2);
  });

  it("respects disclosed weight parameters", () => {
    expect(rankScore([1], [1], [1], { follow: 2, contribution: 3 })).toBe(5);
  });
});

describe("periodCredits (diversity cap)", () => {
  it("caps any single domain at 50% of the period total", () => {
    const credits = { Deliberation: 100, Craft: 0, Stewardship: 0, Attestation: 0 };
    // total=100, cap=50% -> only 50 of the 100 Deliberation credits count
    expect(periodCredits(credits, 0.5)).toBe(50);
  });

  it("counts everything when spread evenly across domains", () => {
    const credits = { Deliberation: 25, Craft: 25, Stewardship: 25, Attestation: 25 };
    expect(periodCredits(credits, 0.5)).toBe(100);
  });
});

describe("computeDomainIssuanceReport (Contribution Code 2.1's domain issuance pool)", () => {
  // Default domainShares: Deliberation 30% / Craft 30% / Stewardship 25% / Attestation 15%.
  const domainShares = { Deliberation: 0.3, Craft: 0.3, Stewardship: 0.25, Attestation: 0.15 };
  // rawTotal = 100. Craft (50 raw, target 30 -> 30) runs over cap; the other
  // three all land under their cap — one scenario exercising both cases at
  // once, same as the actual mixed periods this will run against.
  const perMemberCredits = [
    { Deliberation: 20, Craft: 0, Stewardship: 0, Attestation: 0 },
    { Deliberation: 0, Craft: 50, Stewardship: 0, Attestation: 0 },
    { Deliberation: 0, Craft: 0, Stewardship: 20, Attestation: 0 },
    { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 10 },
  ];

  it("computes each domain's cap relative to the raw total, not a capped total", () => {
    const r = computeDomainIssuanceReport(perMemberCredits, domainShares);
    expect(r.rawTotal).toBe(100);
    expect(r.cap).toEqual({ Deliberation: 30, Craft: 30, Stewardship: 25, Attestation: 15 });
  });

  it("an under-cap domain gets residue and a scaleFactor of 1 (no scaling)", () => {
    const r = computeDomainIssuanceReport(perMemberCredits, domainShares);
    expect(r.residue.Deliberation).toBe(10); // cap 30 - raw 20
    expect(r.overage.Deliberation).toBe(0);
    expect(r.scaleFactor.Deliberation).toBe(1);
    expect(r.residue.Stewardship).toBe(5); // cap 25 - raw 20
    expect(r.residue.Attestation).toBe(5); // cap 15 - raw 10
  });

  it("an over-cap domain gets overage, zero residue, and a sub-1 scaleFactor that would bring it exactly to cap", () => {
    const r = computeDomainIssuanceReport(perMemberCredits, domainShares);
    expect(r.raw.Craft).toBe(50);
    expect(r.overage.Craft).toBe(20); // raw 50 - cap 30
    expect(r.residue.Craft).toBe(0);
    expect(r.scaleFactor.Craft).toBeCloseTo(0.6); // 30/50
    expect(r.raw.Craft * r.scaleFactor.Craft).toBeCloseTo(r.cap.Craft);
  });

  it("returns all zeros, no NaN, for a period with no contributions at all", () => {
    const r = computeDomainIssuanceReport([], domainShares);
    expect(r.rawTotal).toBe(0);
    for (const d of ["Deliberation", "Craft", "Stewardship", "Attestation"] as const) {
      expect(r.raw[d]).toBe(0);
      expect(r.cap[d]).toBe(0);
      expect(r.residue[d]).toBe(0);
      expect(r.overage[d]).toBe(0);
      expect(r.scaleFactor[d]).toBe(1);
    }
  });
});

describe("applyDomainIssuanceCap (Contribution Code 2.1 enforcement — only ever called when domainIssuanceCapEnabled is true)", () => {
  const domainShares = { Deliberation: 0.3, Craft: 0.3, Stewardship: 0.25, Attestation: 0.15 };
  // Same rawTotal=100 fixture as computeDomainIssuanceReport's tests above,
  // so the expected scaleFactor.Craft (0.6) and capped value (30) line up.
  const perMember = new Map([
    [1, { Deliberation: 20, Craft: 0, Stewardship: 0, Attestation: 0 }],
    [2, { Deliberation: 0, Craft: 50, Stewardship: 0, Attestation: 0 }],
    [3, { Deliberation: 0, Craft: 0, Stewardship: 20, Attestation: 0 }],
    [4, { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 10 }],
  ]);

  it("scales down every contributor's credits in an over-cap domain proportionally, leaving under-cap domains untouched", () => {
    const report = computeDomainIssuanceReport([...perMember.values()], domainShares);
    const scaled = applyDomainIssuanceCap(perMember, report.scaleFactor);
    expect(scaled.get(1)!.Deliberation).toBe(20); // under cap -> unchanged
    expect(scaled.get(2)!.Craft).toBeCloseTo(30); // 50 * 0.6 -> exactly the cap
  });

  it("is a pure pass-through (scaleFactor all 1) when nothing is over cap — the domainIssuanceCapEnabled=false path", () => {
    const noOp = { Deliberation: 1, Craft: 1, Stewardship: 1, Attestation: 1 };
    const scaled = applyDomainIssuanceCap(perMember, noOp);
    expect(scaled.get(1)).toEqual(perMember.get(1));
    expect(scaled.get(2)).toEqual(perMember.get(2));
  });
});

describe("reciprocityMultipliers", () => {
  it("discounts repeated attestations between the same pair: full, half, quarter, quarter...", () => {
    const events = [
      { attestorId: 1, contributorId: 2, attestedAt: 1 },
      { attestorId: 1, contributorId: 2, attestedAt: 2 },
      { attestorId: 1, contributorId: 2, attestedAt: 3 },
      { attestorId: 1, contributorId: 2, attestedAt: 4 },
    ];
    expect(reciprocityMultipliers(events)).toEqual([1, 0.5, 0.25, 0.25]);
  });

  it("does not discount attestations from different attestors on the same contributor", () => {
    const events = [
      { attestorId: 1, contributorId: 3, attestedAt: 1 },
      { attestorId: 2, contributorId: 3, attestedAt: 2 },
    ];
    expect(reciprocityMultipliers(events)).toEqual([1, 1]);
  });

  it("is order-independent in the input array (sorts by attestedAt internally)", () => {
    const events = [
      { attestorId: 1, contributorId: 2, attestedAt: 5 },
      { attestorId: 1, contributorId: 2, attestedAt: 1 },
    ];
    // chronologically: attestedAt=1 is first (full), attestedAt=5 is second (half)
    expect(reciprocityMultipliers(events)).toEqual([0.5, 1]);
  });
});

describe("computeDonationSplit (Treasury Code §§1.4, 2.1)", () => {
  const split = { ops: 0.4, dividend: 0.4, reserve: 0.2 };

  it("an unrestricted donation still splits 40/40/20 exactly as before", () => {
    expect(computeDonationSplit(100, split, null)).toEqual({ ops: 40, dividend: 40, reserve: 20 });
  });

  it("an institutional-restricted donation routes 100% to ops — nothing to dividend or reserve", () => {
    expect(computeDonationSplit(100, split, "institutional")).toEqual({ ops: 100, dividend: 0, reserve: 0 });
  });

  it("a reserve-restricted donation routes 100% to reserve — nothing to ops or dividend", () => {
    expect(computeDonationSplit(100, split, "reserve")).toEqual({ ops: 0, dividend: 0, reserve: 100 });
  });

  it("an unrestricted split accounts for every dollar even when rounding leaves a remainder", () => {
    const s = computeDonationSplit(101, split, null);
    expect(s.ops + s.dividend + s.reserve).toBe(101);
  });
});

describe("runDividend", () => {
  it("caps any member's share at dividendCap of the pool and reports the rest as residue", () => {
    const members = [
      { id: 1, credits: { Deliberation: 1000, Craft: 0, Stewardship: 0, Attestation: 0 } }, // huge, will hit cap
      { id: 2, credits: { Deliberation: 10, Craft: 0, Stewardship: 0, Attestation: 0 } },
    ];
    const result = runDividend(members, 1000, 0.10, 0.5);
    const capped = result.shares.find((s) => s.id === 1)!;
    expect(capped.amount).toBeLessThanOrEqual(100); // 10% of 1000
    expect(result.distributed).toBeLessThan(1000);
    expect(result.residue).toBeGreaterThan(0);
  });

  it("distributes nothing and returns the full pool as residue when no one has credits", () => {
    const members = [{ id: 1, credits: { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 } }];
    const result = runDividend(members, 500, 0.10, 0.5);
    expect(result.shares).toEqual([]);
    expect(result.residue).toBe(500);
  });
});

describe("runFoundationAndCivicDividend (Treasury Code §§4-5, Batch 6)", () => {
  // Treasury Code 5.4 default: half the pool is the Foundation tier.
  const HALF = 0.5;
  const allMembers = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const oneCredited = [{ id: 1, credits: { Deliberation: 50, Craft: 50, Stewardship: 0, Attestation: 0 } }];

  it("pays the hard-minimum floor to every verified member, even those with no credits", () => {
    const result = runFoundationAndCivicDividend(allMembers, oneCredited, 100, HALF, 5, 0.5);
    expect(result.shares).toHaveLength(3);
    const m2 = result.shares.find((s) => s.id === 2)!;
    expect(m2.civicAmount).toBe(0);
    expect(m2.foundationAmount).toBeGreaterThan(0);
  });

  // Replaced 3 Oct 2026. This used to assert that a fixed per-Member target
  // scales down when the pool cannot cover it. Treasury Code 5.4 now sets the
  // Foundation tier as a SHARE of the pool, so that case cannot arise: a share
  // always fits. What matters instead is that the share never exceeds the pool
  // at any size, and that the Civic tier always keeps its complement.
  it("never exceeds the pool, at any pool size, because it is a share of it", () => {
    for (const pool of [1, 5, 99, 100, 1_000_000]) {
      const r = runFoundationAndCivicDividend(allMembers, [], pool, HALF, 5, 0.5);
      expect(r.foundationDistributed).toBeLessThanOrEqual(pool);
      expect(r.foundationDistributed + r.civicDistributed + r.poolResidue).toBe(pool);
    }
  });

  it("leaves the Civic tier its complement of the pool, which a fixed floor did not", () => {
    // The defect that retired the fixed floor: at a small pool a fixed target
    // consumed all of it and the Civic Dividend paid nothing, removing the
    // return that sustains contribution at exactly the stage it is needed.
    const small = runFoundationAndCivicDividend(allMembers, oneCredited, 10, HALF, 5, 0.5);
    expect(small.civicDistributed).toBeGreaterThan(0);
    const large = runFoundationAndCivicDividend(allMembers, oneCredited, 1_000_000, HALF, 5, 0.5);
    // And at a large pool the universal tier stays proportionate rather than
    // dwindling to a token: roughly half the pool, not a fixed few dollars.
    expect(large.foundationDistributed / 1_000_000).toBeGreaterThan(0.49);
    expect(large.foundationDistributed / 1_000_000).toBeLessThanOrEqual(0.5);
  });

  it("draws the floor first, ahead of the Civic Dividend, even if it shrinks the Civic pool", () => {
    const result = runFoundationAndCivicDividend(allMembers, oneCredited, 100, HALF, 5, 0.5);
    // Half of 100 is 50, split three ways = 16 each (rounding stays in the pool).
    expect(result.floorPerMemberPaid).toBe(16);
    // At 3 members a 5x-equal-share cap exceeds the whole pool, so it clamps to
    // 1.0 and binds on nobody — correct: a cap meant to stop one Member taking
    // many times their neighbours' share has nothing to do at that size.
    expect(result.civicDistributed).toBeLessThanOrEqual(100 - result.foundationDistributed);
    expect(result.civicDistributed).toBeGreaterThan(0);
  });

  // retired-rule-ok: the flat cap below is named as retired history, not a live rule.
  // Replaced Aug 31 2026. This used to assert the opposite — that residue
  // topped up the Foundation Dividend in-cycle, split evenly across every
  // verified Member. That is exactly the leak: an even share at small
  // membership exceeds charter 5.3's 10% cap, so the split handed capped
  // money straight back to the Member the cap had just restrained. Treasury
  // Code 4.3/5.5 now roll residue forward instead.
  it("never splits Civic Dividend residue in-cycle; it carries to the next Foundation Dividend", () => {
    const result = runFoundationAndCivicDividend(allMembers, oneCredited, 100, HALF, 5, 0.5);
    expect(result.topUpPerMember).toBe(0);
    const m2 = result.shares.find((s) => s.id === 2)!;
    expect(m2.foundationAmount).toBe(result.floorPerMemberPaid);
    // Residue is whatever the cap and rounding withheld. At 3 members the 5x
    // cap binds on nobody, so there is little or none — the point of this test
    // is that no even split happened, not that money was left over.
    expect(result.poolResidue).toBeGreaterThanOrEqual(0);
    expect(result.distributed + result.poolResidue).toBe(100);
  });

  it("distributes nothing at all before Treasury Code 5.1 activation, and keeps the whole pool", () => {
    const result = runFoundationAndCivicDividend(allMembers, oneCredited, 100, HALF, 5, 0.5, false);
    expect(result.shares).toHaveLength(0);
    expect(result.foundationDistributed).toBe(0);
    expect(result.civicDistributed).toBe(0);
    expect(result.distributed).toBe(0);
    expect(result.poolResidue).toBe(100);
  });

  it("gates both tiers until Treasury Code 5.1's 30 verified Members", () => {
    // Treasury Code 5.1 holds the Foundation and Civic tiers at zero until a
    // deployment has 30 verified Members with every Delegate Position filled.
    // The threshold is that clause, not an arithmetic artefact: under Charter
    // 5.3's multiple-of-the-equal-share cap an even share never breaches the
    // cap at any membership, so the arithmetic sets no floor on n at all.
    expect(DIVIDEND_ACTIVATION_MEMBERS).toBe(30);
  });

  it("conserves the pool: distributed + poolResidue equals the input pool", () => {
    const result = runFoundationAndCivicDividend(allMembers, oneCredited, 100, HALF, 5, 0.5);
    expect(result.distributed + result.poolResidue).toBe(100);
  });

  // Inverted Aug 31 2026 along with the top-up removal above: under Treasury
  // Code 4.3/5.5 the bulk of undistributed residue is now SUPPOSED to reach
  // poolResidue, because that is what carrying it forward means (into the
  // next cycle's Foundation Dividend since 10 Oct 2026). The pool is
  // still conserved — see the conservation test below.
  it("rolls the full undistributed residue forward, not just rounding dust", () => {
    const result = runFoundationAndCivicDividend(allMembers, [], 100, HALF, 5, 0.5);
    // Nobody earned Marks, so only the floor pays out and the rest carries over.
    expect(result.civicDistributed).toBe(0);
    expect(result.poolResidue).toBe(100 - result.foundationDistributed);
    expect(result.poolResidue).toBeGreaterThan(allMembers.length);
  });

  it("distributes nothing and returns the full pool as residue when there are no verified members", () => {
    const result = runFoundationAndCivicDividend([], [], 100, HALF, 5, 0.5);
    expect(result.shares).toEqual([]);
    expect(result.poolResidue).toBe(100);
  });
});

describe("isValidPositionTarget (Prompt27_SeatPlaceholderValidation.md)", () => {
  const COMMUNITY = 1;

  it("accepts a real member of the requesting community", () => {
    expect(isValidPositionTarget({ communityId: COMMUNITY, seatKind: null }, COMMUNITY)).toBe(true);
  });

  it("rejects a Default-Delegate Mechanism seat placeholder (non-null seatKind)", () => {
    expect(isValidPositionTarget({ communityId: COMMUNITY, seatKind: "default_delegate_seat" }, COMMUNITY)).toBe(false);
  });

  it("rejects a member belonging to a different community", () => {
    expect(isValidPositionTarget({ communityId: 2, seatKind: null }, COMMUNITY)).toBe(false);
  });

  it("rejects a target that doesn't exist at all (undefined/null row, e.g. a deleted or bogus id)", () => {
    expect(isValidPositionTarget(undefined, COMMUNITY)).toBe(false);
    expect(isValidPositionTarget(null, COMMUNITY)).toBe(false);
  });
});

describe("isValidPositionSector (targetSectorId follow-up to Prompt27)", () => {
  const COMMUNITY = 1;

  it("accepts a real sector in the requesting community", () => {
    expect(isValidPositionSector({ communityId: COMMUNITY }, COMMUNITY)).toBe(true);
  });

  it("rejects a sector belonging to a different community", () => {
    expect(isValidPositionSector({ communityId: 2 }, COMMUNITY)).toBe(false);
  });

  it("rejects a sector that doesn't exist at all (undefined/null row)", () => {
    expect(isValidPositionSector(undefined, COMMUNITY)).toBe(false);
    expect(isValidPositionSector(null, COMMUNITY)).toBe(false);
  });
});

describe("isValidPositionMember (Supporting Nominee nomination — same class of gap as targetMemberId/targetSectorId)", () => {
  const COMMUNITY = 1;

  it("accepts a real member of the requesting community", () => {
    expect(isValidPositionMember({ communityId: COMMUNITY }, COMMUNITY)).toBe(true);
  });

  it("rejects a candidate belonging to a different community", () => {
    expect(isValidPositionMember({ communityId: 2 }, COMMUNITY)).toBe(false);
  });

  it("rejects a candidate that doesn't exist at all (undefined/null row)", () => {
    expect(isValidPositionMember(undefined, COMMUNITY)).toBe(false);
    expect(isValidPositionMember(null, COMMUNITY)).toBe(false);
  });
});

describe("filterExistingIds (insertSectorTags' pure core)", () => {
  it("keeps every candidate id when all are present in existingIds", () => {
    expect(filterExistingIds([1, 2, 3], [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("drops only the ids not present in existingIds, keeping the rest in their original order", () => {
    expect(filterExistingIds([1, 2, 3], [1, 3])).toEqual([1, 3]);
  });

  it("drops every candidate when none are present in existingIds — returns empty, doesn't throw", () => {
    expect(filterExistingIds([1, 2, 3], [])).toEqual([]);
  });

  it("treats a cross-community sector id as invalid the same way a wholly nonexistent one is: community.ts's DB lookup already scopes existingIds by communityId, so a real sector belonging to a different community simply never appears in it", () => {
    // Sector 99 is a real row somewhere, but not in this community — the
    // caller's DB query for existingIds never returns it, so from this
    // function's perspective it's indistinguishable from a bogus id.
    expect(filterExistingIds([1, 99], [1])).toEqual([1]);
  });
});

describe("foundingCriteriaMet", () => {
  const criteria: FoundingCriteriaPhaseI = {
    members: 500,
    active: 100,
    proposals: 50,
    delegations: 40,
    delegationsRenewedOrRevoked: 3,
    minParticipationWindowDays: 90,
  };
  const passing: FoundingProgress = {
    members: 500,
    active: 100,
    proposalsCompleted: 50,
    liveDelegations: 40,
    delegationsRenewedOrRevoked: 3,
    majorityMinParticipationOver90d: true,
    allDomainsHaveVerifiedContribution: true,
  };

  it("is true when every one of the 7 criteria is met", () => {
    expect(foundingCriteriaMet(passing, criteria)).toBe(true);
  });

  it("fails on members short", () => {
    expect(foundingCriteriaMet({ ...passing, members: 499 }, criteria)).toBe(false);
  });
  it("fails on active members short", () => {
    expect(foundingCriteriaMet({ ...passing, active: 99 }, criteria)).toBe(false);
  });
  it("fails on completed proposals short", () => {
    expect(foundingCriteriaMet({ ...passing, proposalsCompleted: 49 }, criteria)).toBe(false);
  });
  it("fails on live delegations short", () => {
    expect(foundingCriteriaMet({ ...passing, liveDelegations: 39 }, criteria)).toBe(false);
  });
  it("fails on delegations-renewed-or-revoked short", () => {
    expect(foundingCriteriaMet({ ...passing, delegationsRenewedOrRevoked: 2 }, criteria)).toBe(false);
  });
  it("fails when minimum participation hasn't been met in a majority of votes over the trailing window", () => {
    expect(foundingCriteriaMet({ ...passing, majorityMinParticipationOver90d: false }, criteria)).toBe(false);
  });
  it("fails when not all four domains have a verified contribution", () => {
    expect(foundingCriteriaMet({ ...passing, allDomainsHaveVerifiedContribution: false }, criteria)).toBe(false);
  });
});

describe("eligiblePanelCandidates (Dispute Procedure Code 2.2)", () => {
  const clean = (id: number): PanelCandidate => ({
    memberId: id,
    isParty: false,
    delegationWithPartyAt: null,
    attestedDisputedContribution: false,
    hasPendingDisputeAgainstParty: false,
    lastPanelWithSamePartiesAt: null,
  });

  it("keeps a candidate with no disqualifying relationship", () => {
    expect(eligiblePanelCandidates([clean(1), clean(2)], NOW)).toEqual([1, 2]);
  });

  it("excludes the parties themselves", () => {
    const cands = [clean(1), { ...clean(2), isParty: true }, clean(3)];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([1, 3]);
  });

  it("excludes a delegation relationship with a party inside the 90-day window", () => {
    const cands = [{ ...clean(1), delegationWithPartyAt: NOW - 89 * DAY_MS }, clean(2)];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([2]);
  });

  it("keeps a delegation relationship that lapsed outside the 90-day window", () => {
    const cands = [{ ...clean(1), delegationWithPartyAt: NOW - 91 * DAY_MS }];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([1]);
  });

  it("treats the 90-day boundary itself as still inside the window", () => {
    const cands = [{ ...clean(1), delegationWithPartyAt: NOW - 90 * DAY_MS }];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([]);
  });

  it("excludes anyone who attested the disputed contribution", () => {
    const cands = [{ ...clean(1), attestedDisputedContribution: true }, clean(2)];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([2]);
  });

  it("excludes anyone with a pending dispute against a party", () => {
    const cands = [clean(1), { ...clean(2), hasPendingDisputeAgainstParty: true }];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([1]);
  });

  it("excludes anyone who served on a panel with the same parties inside 180 days", () => {
    const cands = [{ ...clean(1), lastPanelWithSamePartiesAt: NOW - 179 * DAY_MS }, clean(2)];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([2]);
  });

  it("keeps someone whose prior panel with the same parties fell outside 180 days", () => {
    const cands = [{ ...clean(1), lastPanelWithSamePartiesAt: NOW - 181 * DAY_MS }];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([1]);
  });

  it("applies every exclusion together, not just the first that matches", () => {
    const cands = [
      { ...clean(1), isParty: true },
      { ...clean(2), delegationWithPartyAt: NOW - 10 * DAY_MS },
      { ...clean(3), attestedDisputedContribution: true },
      { ...clean(4), hasPendingDisputeAgainstParty: true },
      { ...clean(5), lastPanelWithSamePartiesAt: NOW - 10 * DAY_MS },
      clean(6),
    ];
    expect(eligiblePanelCandidates(cands, NOW)).toEqual([6]);
  });

  // The bug this slice exists to prevent: a pool that clears 2.1's minimum of
  // 30 can still fail to seat 11 once 2.2 is applied. drawRandomPanel must
  // defer in that case rather than slicing a short panel — 3.1 justifies
  // eleven as an odd number so majority decisions never tie, and
  // disputePanelOutcome resolves a tie to "dismissed".
  it("can leave fewer than a full panel even from a pool above the 2.1 minimum", () => {
    const cands = Array.from({ length: DISPUTE_PANEL_POOL_MINIMUM }, (_, i) =>
      i < DISPUTE_PANEL_POOL_MINIMUM - 3 ? { ...clean(i + 1), hasPendingDisputeAgainstParty: true } : clean(i + 1)
    );
    const eligible = eligiblePanelCandidates(cands, NOW);
    expect(cands.length).toBeGreaterThanOrEqual(DISPUTE_PANEL_POOL_MINIMUM);
    expect(eligible.length).toBeLessThan(DISPUTE_PANEL_SIZE);
  });
});

describe("DISPUTE_RESPONSE_WINDOW_DAYS (Dispute Procedure Code 4.2)", () => {
  it("gives the accused the 7 days the clause states", () => {
    expect(DISPUTE_RESPONSE_WINDOW_DAYS).toBe(7);
  });
  it("closes well inside 4.3's 14-day decision window, so the two can run concurrently", () => {
    expect(DISPUTE_RESPONSE_WINDOW_DAYS).toBeLessThan(14);
  });
});

describe("snapshotToVotingMembers (Rules of Procedure 3.3 — vote-open snapshot)", () => {
  const row = (memberId: number, toId: number, sectorId: number | null, grantedAt: number): SnapshotDelegationRow =>
    ({ memberId, toId, sectorId, grantedAt });

  it("gives each member the delegations captured for them", () => {
    const out = snapshotToVotingMembers([1, 2, 3], [row(1, 2, null, NOW - DAY_MS)]);
    expect(out.find((m) => m.id === 1)!.delegations).toEqual([{ toId: 2, grantedAt: NOW - DAY_MS, sectorId: null }]);
    expect(out.find((m) => m.id === 2)!.delegations).toEqual([]);
  });

  // The actual defect this slice fixes: before the snapshot, resolution ran at
  // close against live rows, so a delegation created mid-window counted.
  it("cannot include a delegation granted after capture, because it was never captured", () => {
    const captured = [row(1, 2, null, NOW - DAY_MS)];
    const out = snapshotToVotingMembers([1, 2, 3], captured);
    // member 3 delegates to 2 *after* voting opened — absent from `captured`
    expect(out.find((m) => m.id === 3)!.delegations).toEqual([]);
  });

  it("excludes rows the caller filtered out as revoked during the window", () => {
    const afterRevocation = [row(3, 2, null, NOW - DAY_MS)]; // member 1's row dropped
    const out = snapshotToVotingMembers([1, 2, 3], afterRevocation);
    expect(out.find((m) => m.id === 1)!.delegations).toEqual([]);
    expect(out.find((m) => m.id === 3)!.delegations).toHaveLength(1);
  });

  it("gives a member who joined after capture an empty delegation set, not absence from the tally", () => {
    // Rules of Procedure 3.3 governs delegation, not eligibility — a new
    // member must still be able to cast and have counted a direct vote.
    const out = snapshotToVotingMembers([1, 2, 99], [row(1, 2, null, NOW - DAY_MS)]);
    expect(out.map((m) => m.id)).toContain(99);
    expect(out.find((m) => m.id === 99)!.delegations).toEqual([]);
  });

  it("orders each member's delegations oldest-first, matching loadMemberDelegations", () => {
    const out = snapshotToVotingMembers([1], [row(1, 3, 7, NOW), row(1, 2, 8, NOW - 5 * DAY_MS)]);
    expect(out[0].delegations.map((d) => d.toId)).toEqual([2, 3]);
  });

  it("resolves a snapshot exactly as resolveVote would resolve live state", () => {
    const members = snapshotToVotingMembers([1, 2], [row(1, 2, null, NOW - DAY_MS)]);
    const tally = resolveVote(members, { 2: true }, NOW, 365);
    expect(tally.yes).toBe(2);
    expect(tally.participating).toBe(2);
  });
});

describe("combined-tier cap as a multiple of the equal share (Charter 5.3)", () => {
  // 30 members — the Treasury Code 5.1 activation threshold — only two of whom
  // earned any Marks, and one of those overwhelmingly.
  const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }));
  const hog = [
    { id: 1, credits: { Deliberation: 500, Craft: 500, Stewardship: 400, Attestation: 200 } },
    { id: 2, credits: { Deliberation: 5, Craft: 5, Stewardship: 4, Attestation: 2 } },
  ];
  const POOL = 100000;
  const CAP_MULTIPLE = 5;
  // Treasury Code 5.4 default: half the pool is the Foundation tier.
  const HALF = 0.5;
  // 30 members, so the cap works out to 5/30 of the pool.
  const CAP = (POOL * CAP_MULTIPLE) / 30;

  it("holds no member above 10% of the cycle's pool, both tiers counted together", () => {
    const r = runFoundationAndCivicDividend(many, hog, POOL, HALF, 5, 0.5);
    for (const s of r.shares) {
      // +1 absorbs integer flooring on the per-member floor amount.
      expect(s.totalAmount).toBeLessThanOrEqual(CAP + 1);
    }
  });

  it("counts the Foundation floor toward the cap, not just the Civic share", () => {
    const r = runFoundationAndCivicDividend(many, hog, POOL, HALF, 5, 0.5);
    const top = r.shares.find((s) => s.id === 1)!;
    expect(top.foundationAmount).toBeGreaterThan(0);
    expect(top.civicAmount).toBeLessThanOrEqual(CAP - top.foundationAmount + 1);
    expect(top.civicAmount + top.foundationAmount).toBeLessThanOrEqual(CAP + 1);
  });

  // Why the cap is measured against the committed pool rather than against the
  // sum actually paid out. With k recipients, "no member above 10% of what was
  // distributed" is D <= k * 0.10 * D, which for k < 10 holds only at D = 0.
  // Two recipients would therefore be entitled to nothing at all. The committed
  // -pool basis pays them their capped share and rolls the rest forward.
  it("still pays a cycle with fewer than ten recipients, which the other reading could not", () => {
    const r = runFoundationAndCivicDividend(many, hog, POOL, 0, 5, 0.5);
    expect(r.civicDistributed).toBeGreaterThan(0);
    const top = r.shares.find((s) => s.id === 1)!;
    expect(top.civicAmount).toBe(Math.floor(CAP));
  });

  it("rolls everything the cap withheld forward rather than losing it", () => {
    const r = runFoundationAndCivicDividend(many, hog, POOL, HALF, 5, 0.5);
    expect(r.distributed + r.poolResidue).toBe(POOL);
    expect(r.poolResidue).toBeGreaterThan(0);
    expect(r.topUpPerMember).toBe(0);
  });

  it("is deterministic — no iteration, no oscillation", () => {
    const a = runFoundationAndCivicDividend(many, hog, POOL, HALF, 5, 0.5);
    const b = runFoundationAndCivicDividend(many, hog, POOL, HALF, 5, 0.5);
    expect(a.distributed).toBe(b.distributed);
    expect(a.civicDistributed).toBe(b.civicDistributed);
  });

  it("applies an absolute ceiling directly when runDividend is given one", () => {
    const capped = runDividend(hog, 10000, 0.10, 0.5, 250);
    for (const s of capped.shares) expect(s.amount).toBeLessThanOrEqual(250);
  });

  // retired-rule-ok: the flat cap below is named as retired history, not a live rule.
  // A flat 10% cap was unpayable below ten Members: an even floor share of 1/n
  // exceeded the cap, so the universal tier breached it on its own. A multiple
  // of the equal share removes that pathology entirely — at or below
  // CAP_MULTIPLE members the cap clamps to the whole pool and binds on nobody,
  // which is right: a cap against taking many times your neighbours' share has
  // nothing to do when there are fewer members than the multiple.
  it("no longer breaks below ten members, which a flat percentage did", () => {
    const few = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    const r = runFoundationAndCivicDividend(few, hog, POOL, HALF, CAP_MULTIPLE, 0.5);
    // Half of 100000 is 50000, split five ways = 10000 each.
    expect(r.floorPerMemberPaid).toBe(10000);
    expect(r.foundationDistributed).toBe(50000);
    // Under the old flat 10% this cycle paid no Civic Dividend at all.
    expect(r.civicDistributed).toBeGreaterThan(0);
    expect(r.distributed + r.poolResidue).toBe(POOL);
  });
});

// Founder decision, 10 Oct 2026 (Treasury Code 4.3/5.5): what the cap holds back
// joins the NEXT cycle's Foundation Dividend, split equally, and never raises
// that cycle's cap. Before this, held-back money joined the whole next pool,
// half of it was split evenly anyway, and the cap's base grew with it.
describe("carried-forward residue (Treasury Code 4.3, 10 Oct 2026)", () => {
  const HALF = 0.5;
  const members = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const credited = (ids: number[]) =>
    ids.map((id) => ({ id, credits: { Deliberation: 10, Craft: 10, Stewardship: 0, Attestation: 0 } }));

  it("adds the carried amount to the Foundation tier, divided equally", () => {
    // 10 Members, nobody contributing: new money 800, carry 200.
    const r = runFoundationAndCivicDividend(members(10), [], 1000, HALF, 5, 0.5, true, 200);
    // Foundation = half of the new 800 (400) + the whole carry (200) = 600 -> 60 each.
    expect(r.floorPerMemberPaid).toBe(60);
    expect(r.civicDistributed).toBe(0);
    expect(r.distributed + r.poolResidue).toBe(1000);
  });

  it("measures the cap on new money only, never on the carry", () => {
    const n = 40;
    const newMoney = 3000;
    const carry = 1000;
    const r = runFoundationAndCivicDividend(members(n), credited([1]), newMoney + carry, HALF, 5, 0.5, true, carry);
    const hog = r.shares.find((s) => s.id === 1)!;
    // Five times an equal share of NEW money: 5 * 3000 / 40 = 375.
    expect(hog.totalAmount).toBeLessThanOrEqual(375);
    expect(hog.totalAmount).toBeGreaterThan(300);
  });

  it("does not let held-back money pile up when few Members contribute", () => {
    // 100 Members, 5 contributing (one in twenty), 10,000 of new money a cycle.
    const all = members(100);
    const few = credited([1, 2, 3, 4, 5]);
    let carry = 0;
    const residues: number[] = [];
    for (let cycle = 0; cycle < 24; cycle++) {
      const r = runFoundationAndCivicDividend(all, few, 10_000 + carry, HALF, 5, 0.5, true, carry);
      carry = r.poolResidue;
      residues.push(carry);
    }
    // It settles instead of growing: the last year's residue is no larger than
    // the first year's, and always below one cycle's Civic half.
    expect(Math.max(...residues.slice(12))).toBeLessThanOrEqual(Math.max(...residues.slice(0, 12)) + 1);
    expect(Math.max(...residues)).toBeLessThan(5_000);
    // Contributors sit at the ceiling of five equal shares of new money (500).
    const last = runFoundationAndCivicDividend(all, few, 10_000 + carry, HALF, 5, 0.5, true, carry);
    const c = last.shares.find((s) => s.id === 1)!;
    expect(c.totalAmount).toBeLessThanOrEqual(500);
    expect(c.totalAmount).toBeGreaterThanOrEqual(495);
  });
});
