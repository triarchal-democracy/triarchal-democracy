// Charter parameter defaults. Stored per-community as JSON (communities.params)
// so they can become community-amendable later without a schema change —
// for v1 every community is seeded with these defaults and nothing amends
// them yet.

export const DAY_MS = 24 * 60 * 60 * 1000;

// A fraction formatted as "N%", rounded to at most one decimal place
// rather than the nearest whole percent. Charter 4.8's delegateRecallTrigger
// (0.015) is the one community-set default that isn't a whole percent —
// plain `Math.round(n * 100)` rounds 1.5 up to 2, silently misquoting the
// clause's stated "default: 1.5%" as "2%" wherever it was used this way
// (found while adding defaultsRegistry.test.ts's exact-value drift guard).
export function formatPercent(n: number): string {
  const v = Math.round(n * 1000) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

export type ProposalClass = "ordinary" | "treasury" | "treasury_reserve" | "position" | "amendment" | "entrenched";

export interface ClassConfig {
  delibDays: number;
  voteDays: number;
  threshold: number; // fraction of yes/(yes+no) required, strictly greater than
  minParticipation: number; // fraction of members required to participate
  // Charter 3.5 — an absolute floor under the fraction above. A percentage alone
  // is not a quorum at founding scale: at the 30 Members that activate
  // distribution (Treasury Code 5.1), 10% is three voters and a majority of
  // three is two. Charter 3.5a. Binds only while the community is small — above
  // 100 Members the fraction is the greater of the two and this never applies.
  minParticipationMembers: number;
}

// Rules of Procedure §1.3 — Ordinary/Treasury lengthened from 7d/5d to
// 30d/7d in the Aug 2026 amendment. See PRE_AMENDMENT_TIMELINE and
// Rules of Procedure 1.3a below for the time-sensitive petition that lets a
// proposal with a genuine external deadline run on the old timeline instead.
export const CLASS_CONFIG: Record<ProposalClass, ClassConfig> = {
  ordinary: { delibDays: 30, voteDays: 7, threshold: 0.5, minParticipation: 0.10, minParticipationMembers: 10 },
  treasury: { delibDays: 30, voteDays: 7, threshold: 0.5, minParticipation: 0.10, minParticipationMembers: 10 },
  // Treasury Code §2.2 — "spending from the treasury reserve is not an
  // ordinary Treasury allocation": it keeps the Treasury-allocation timeline
  // (30d + 7d) but ratifies at the Charter-amendment threshold and
  // participation (two-thirds, 20%), not Treasury's plain majority/10%. A
  // distinct class rather than a flag on "treasury" so the existing
  // per-class CLASS_CONFIG lookup (community.ts's closeOneVote) applies the
  // right numbers with no special-casing.
  treasury_reserve: { delibDays: 30, voteDays: 7, threshold: 2 / 3, minParticipation: 0.20, minParticipationMembers: 10 },
  position: { delibDays: 7, voteDays: 5, threshold: 3 / 5, minParticipation: 0.20, minParticipationMembers: 10 },
  amendment: { delibDays: 45, voteDays: 5, threshold: 2 / 3, minParticipation: 0.20, minParticipationMembers: 10 },
  entrenched: { delibDays: 60, voteDays: 7, threshold: 0.75, minParticipation: 0.40, minParticipationMembers: 10 },
};

export const CLASS_LABEL: Record<ProposalClass, string> = {
  ordinary: "Ordinary (30d + 7d, majority, 10% minimum participation)",
  treasury: "Treasury allocation (30d + 7d, majority, 10% minimum participation)",
  treasury_reserve: "Reserve spending (30d + 7d, two-thirds, 20% minimum participation — Treasury Code 2.2)",
  position: "Position decision (7d + 5d, three-fifths, 20% minimum participation)",
  amendment: "Charter amendment (45d + 5d, two-thirds, 20% minimum participation)",
  entrenched: "Entrenched amendment (60d + 7d, three-quarters, 40% minimum participation)",
};

// Rules of Procedure §1.3a — the pre-Aug-2026-amendment Ordinary/Treasury
// timeline, restored for a proposal that successfully petitions as
// time-sensitive (same 10%-of-Active-Members mechanic as the `critical`
// petition, a distinct petition for a distinct purpose — see
// timeSensitivePetitionSignatures in schema.ts). Position/Amendment/
// Entrenched already run shorter or equal windows, so this petition only
// has an effect on Ordinary and Treasury proposals.
export const PRE_AMENDMENT_TIMELINE = { delibDays: 7, voteDays: 5 };

// Rules of Procedure §1.6 — amendment/entrenched/position are always
// critical; a treasury proposal is critical above CRITICAL_TREASURY_SHARE of
// the treasury's total balance at submission (strictly greater than).
// Anything else can be petitioned critical before voting opens.
export const CRITICAL_CLASSES: ProposalClass[] = ["amendment", "entrenched", "position"];
export const CRITICAL_TREASURY_SHARE = 0.05;

// Rules of Procedure §1.6 (critical-classification petition) and §1.3a
// (accelerated-timeline petition) — "signatures from at least 10% of Active
// Members." Phase 2 stage 5: this was a bare `0.1` literal duplicated at
// both petition-threshold computations in index.tsx and retyped a third
// time as "10%" in proposalDetail.tsx's copy — one named constant for all
// three now.
export const PETITION_SIGNATURE_SHARE = 0.1;

export const DOMAINS = ["Deliberation", "Craft", "Stewardship", "Attestation"] as const;
export type Domain = (typeof DOMAINS)[number];

// Contribution Code §2.3 — founding defaults for the community-maintained
// sector list. Stored as real DB rows (db/schema.ts `sectors`), not a
// hardcoded union like DOMAINS, since the code says this list is amendable
// by ordinary proposal. These six are the organisational (internal-operations)
// sectors any deployment starts with; the Triarc's own no longer come from
// here — see TRIARC_SECTORS below (Triarc_Operations_Code.md).
export const CORE_SECTORS = [
  "Infrastructure & Technology",
  "Policy & Governance",
  "Outreach & Membership",
  "Finance & Treasury",
  "Dispute & Conduct",
  "Culture & Communications",
] as const;

// Contribution Code §2.3 (10 Oct 2026) — the civic founding defaults, for a
// deployment governing a municipality: drawn from what a city's budget
// covers, plus one sector for running the deployment itself. Selected only
// when the CIVIC_SECTORS Worker var is "true"; the Triarc's config does not
// set it, so the Triarc (TRIARC_SECTORS) is unchanged. Precedence at seed
// time: Triarc, then civic, then core.
export const CIVIC_SECTORS = [
  "Public Safety",
  "Transportation",
  "Parks, Recreation & Culture",
  "Housing, Planning & Development",
  "Utilities & Environment",
  "Community Platform",
] as const;

// Triarc_Operations_Code.md (Proposal Ten) — Triarc-specific, replaces
// CORE_SECTORS on that deployment only (community.ts's ensureCommunity,
// gated on the TRIARC_OPERATING_SECTORS Worker var). Any other deployment
// keeps CORE_SECTORS unchanged. One Delegate
// Position per sector (Operations Delegate, Research Delegate, Software
// Delegate) — filled later through the normal Position-decision process,
// not seeded here.
// Order matches Triarc_Operations_Code.md 2.1's documented standing priority —
// Data Collection & Research is the Triarc's formal lead sector (Aug 2026
// research-first repositioning). This array's order only governs seed order
// for a fresh deployment; the Triarc's own sectors are already seeded live
// (see CLAUDE.md) and are unaffected by reordering this constant.
export const TRIARC_SECTORS = [
  "Data Collection & Research",
  "Nonprofit Operations",
  "Software Stewardship",
] as const;

// Charter 9.2 — Phase I closes when all of these hold simultaneously.
export interface FoundingCriteriaPhaseI {
  members: number;
  active: number;
  proposals: number;
  delegations: number;
  delegationsRenewedOrRevoked: number; // "at least N delegation(s) revoked or lapsed and renewed"
  minParticipationWindowDays: number; // trailing window for the vote-participation check
}

// Charter 9.3 — Phase II closes when all of these hold continuously across
// nonDecliningWindowDays. Tracked in config only this pass — see
// mechanics.ts / community.ts for why it isn't computed live yet.
export interface FoundingCriteriaPhaseII {
  members: number;
  active: number;
  nonDecliningWindowDays: number;
  proposalsPerMonth: number;
  participationRate: number;
  maxDelegateShare: number;
  consecutiveDividendRuns: number;
  reserveMonthsCovered: number;
  disputePanels: number;
  stewardsMin: number;
  stewardSectorsMin: number;
  maxFounderProposalShare: number; // founder-authored share of completed proposals must stay below this
}

export interface CharterParams {
  delegationExpiryDays: number; // ordinary cycle — Charter 3.3 (default: annual)
  delegationExpiryCriticalDays: number; // critical-decision cycle — Charter 3.3 (default: 90 days)
  periodDays: number; // Contribution Code 1.1 / dividend cycle
  // retired-rule-ok: the flat 10% cap below is named as retired history, not a live rule.
  // Charter 5.3 — the per-Member dividend cap, expressed as a MULTIPLE of the
  // equal share (1/n), not as a flat percentage. A flat percentage is wrong in
  // both directions at once: at founding scale it binds so hard that most of
  // the pool strands (five contributors capped at 10% leave half the cycle
  // undistributed), and at scale it is far too loose (ten Members could absorb
  // the entire dividend of a community of any size). A multiple scales with n:
  // 5 means no Member takes more than five times what they would get if
  // everyone contributed equally.
  //
  // The multiple also encodes an expected participation rate. Full distribution
  // needs one Member earning in every (multiple - s)/(1 - s), where s is the
  // Foundation share: at 5 and s = 1/2, one in nine. Anything the cap withholds
  // is not lost; it joins the next cycle's Foundation Dividend under Treasury
  // Code 4.3 (10 Oct 2026). This reasoning is now in the documents too, at Charter 5.3a.
  //
  // CHARTER 2.4a: every community-set default is accounted for as DERIVED or
  // CHOSEN, at its clause or in its document's schedule of defaults. If you add
  // a parameter here, add its account there — an unexplained default in a
  // governance document reads as a finding, which is how four of them stayed
  // wrong until someone went looking.
  dividendCapMultiple: number; // Charter 5.3
  domainShares: Record<Domain, number>; // Contribution Code §2
  split: { ops: number; dividend: number; reserve: number }; // Treasury Code §2.1
  attestationsRequired: number; // Contribution Code 3.3
  activeWindowDays: number; // Charter 9.1
  diversityCap: number; // Contribution Code 4.1
  criteria: { phase1: FoundingCriteriaPhaseI; phase2: FoundingCriteriaPhaseII }; // Charter 9.2/9.3
  voteFreezeHours: number; // Rules of Procedure 2.2
  delegateThreshold: number; // Charter 4.3 — community-set installation threshold to become a Delegate
  delegateSustainingFloor: number; // Charter 4.7 — lower floor that keeps a Position automatically, once installed
  delegateRecallTrigger: number; // Charter 4.8 — below this (but at/above 0) opens the automatic-removal grace window of 4.9
  delegateGraceDays: number; // Charter 4.9 — grace period below the recall trigger before automatic removal
  delegateTieMargin: number; // Charter 4.10 — margin defining "closely tied" candidates who hold a Position jointly
  concentrationRenewalShare: number; // Charter 3.6 — a holder at/above this share of a sector's active delegation is on the shorter renewal cycle
  concentrationReviewShare: number; // Charter 3.6 — at/above this share a concentration review (confirmation vote) opens
  concentrationReviewIntervalDays: number; // Charter 3.6 — no further review opens for this long after a holder is kept
  concentrationBarDays: number; // Charter 3.6 — no new delegation to a holder whose delegations a review ended, for this long
  standingWindowDays: number; // Contribution Code 1.3 — trailing standing window (Civic Steward eligibility)
  rankingWeights: { follow: number; contribution: number }; // Rules of Procedure 4.4 — disclosed, amendable
  // Treasury Code 5.4 — the Foundation Dividend's SHARE OF THE POOL, set aside
  // first each cycle and divided equally among verified Members. A share, not a
  // fixed per-Member amount, for the same reason the cap above is a multiple of
  // the equal share: a fixed amount is wrong in both directions. A fixed floor
  // consumes the whole pool when the pool is small, leaving the Civic Dividend
  // nothing and removing the return that sustains contribution at exactly the
  // stage a deployment most needs it; and it dwindles to a token as the pool
  // grows, so the universal tier stops being universal. 0.5 means half of what
  // the community produces is returned for being a Member and half for what was
  // contributed (Treasury Code 5.4a). Because it is a share it always fits: no
  // cycle requires it to be scaled down.
  foundationPoolShare: number;
  // Triarc Membership Code 2.4/2.5 — days of verified Membership (from
  // phoneVerifiedAt, not joinedAt) required before a vote counts toward a
  // Position decision. Only consulted when REQUIRE_PHONE_VERIFICATION is set
  // for the deployment (the Triarc); stored per-community like every other
  // parameter here so it stays "adjustable by ordinary proposal" per 2.5,
  // even though it is meaningless where that variable is unset.
  positionVoteEligibilityDays: number;
  // STALE AUTHORITY — do not cite Contribution Code 2.1 for this. 2.1 now reads
  // "Marks are earned, never issued against a quota" and "The shares govern what
  // a Mark is worth, never how many may exist". This flag implements a quota
  // model no current clause backs; it is off and must stay off until one does.
  // See the stale-section note above computeDomainIssuanceReport in mechanics.ts.
  //
  // What it did, when 2.1 still said it: each domain's Mark issuance structurally
  // capped at its domainShares' fraction of the period's total; unearned
  // headroom "rolls to the treasury," never redistributed to other domains
  // within the period. Reporting (mechanics.ts's computeDomainIssuanceReport)
  // always runs regardless of this flag — it's surfaced on
  // governance-health either way. Enforcement (actually scaling down an
  // over-cap domain's claimed Marks before dividend/standing computations)
  // only happens when this is true. Defaults false everywhere: this is a
  // real, visible reduction in what specific members receive in a given
  // period, and turning it on for a real deployment is a separate, explicit
  // decision for the founder, not a side effect of shipping the mechanism.
  domainIssuanceCapEnabled: boolean;
}

export const DEFAULT_PARAMS: CharterParams = {
  delegationExpiryDays: 365,
  delegationExpiryCriticalDays: 90,
  periodDays: 30,
  dividendCapMultiple: 5,
  domainShares: { Deliberation: 0.30, Craft: 0.30, Stewardship: 0.25, Attestation: 0.15 },
  split: { ops: 0.40, dividend: 0.40, reserve: 0.20 },
  attestationsRequired: 2,
  activeWindowDays: 90,
  diversityCap: 0.5,
  criteria: {
    phase1: {
      members: 150,
      active: 50,
      proposals: 50,
      delegations: 40,
      delegationsRenewedOrRevoked: 3,
      minParticipationWindowDays: 90,
    },
    phase2: {
      members: 500,
      active: 150,
      nonDecliningWindowDays: 180,
      proposalsPerMonth: 6,
      participationRate: 0.75,
      maxDelegateShare: 0.10,
      consecutiveDividendRuns: 8,
      reserveMonthsCovered: 12,
      disputePanels: 5,
      stewardsMin: 8,
      stewardSectorsMin: 3,
      maxFounderProposalShare: 0.25,
    },
  },
  voteFreezeHours: 24,
  delegateThreshold: 0.05,
  delegateSustainingFloor: 0.03,
  delegateRecallTrigger: 0.015,
  delegateGraceDays: 14,
  delegateTieMargin: 0.02,
  concentrationRenewalShare: 0.1,
  concentrationReviewShare: 0.2,
  concentrationReviewIntervalDays: 180,
  concentrationBarDays: 90,
  standingWindowDays: 365,
  rankingWeights: { follow: 1, contribution: 1 },
  foundationPoolShare: 0.5,
  positionVoteEligibilityDays: 30,
  domainIssuanceCapEnabled: false,
};

/** Charter 3.6 — a concentrated holder needs at least this many supporters, the same ten-Member floor every participation requirement carries. */
export const CONCENTRATION_SUPPORTER_FLOOR = 10;
