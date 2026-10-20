// Phase 2 stage 6 — the Defaults page's single source of truth: one entry
// per community-set default named in the eight schedule-of-defaults
// clauses, each mapped to the app parameter (or code constant) that
// actually implements it — or explicitly to `null` when nothing does.
//
// Scope, stated plainly rather than silently assumed: the eight schedules
// discuss dozens of individual numbers in flowing prose (Charter 2.6 alone
// names defaults across a dozen other clauses). This registry covers every
// default that maps to one clear, checkable app value — a params.ts field
// or a named code constant — rather than attempting to auto-extract every
// number mentioned in prose, which isn't reliably possible without parsing
// free text the way the cross-reference extractor parses structured
// citations. `clauseId` cites the clause that actually STATES the default
// inline ("default: X") — usually not the schedule clause itself, which
// mostly explains *why* a default is what it is, not where it's restated
// in checkable form. `scheduleClauseId` is the schedule-of-defaults clause
// that accounts for it, for grouping on the Defaults page.
//
// `expectedInClauseText` is a literal substring hand-checked against the
// cited document's actual current text (the drift-guard,
// app/src/lib/defaultsRegistry.test.ts, searches the whole document rather
// than only `clauseId`'s own body — several defaults are stated in an
// attached table or a section-level intro, not the clause's own prose,
// e.g. Contribution Code's Domain table sits before clause 2.1, not inside
// it) — the guard fails if the substring ever stops appearing there (the
// document changed and this registry didn't) or if
// `currentAppValue(DEFAULT_PARAMS)`'s figure stops matching it (the app
// changed and this registry didn't). Same two-sided check
// check_arithmetic_page.py already does for the site's arithmetic page.
//
// `expectedValue` is the strict counterpart: the EXACT string
// `currentAppValue(DEFAULT_PARAMS)` must produce, for every entry with a
// real `paramsPath` — not merely "contains the right digits" the way the
// old test's spot-checks did. Entries with `paramsPath: null` carry
// `expectedValue: null`; the two fields are required to agree (checked by
// a test of their own), so a future entry can't gain a real params field
// without also gaining a strict value to check it against.
import { DEFAULT_PARAMS, type CharterParams, CRITICAL_TREASURY_SHARE, PETITION_SIGNATURE_SHARE, TRIARC_SECTORS, formatPercent } from "./params";
import { ACCRUAL_SUSPENSION_DAYS, PARTICIPATION_SUSPENSION_DAYS, PARTICIPATION_SUSPENSION_MAX_DAYS } from "./conduct";
import { DIVIDEND_ACTIVATION_MEMBERS, CONTRIBUTION_CLAIM_WINDOW_DAYS, DISPUTE_PANEL_POOL_MINIMUM } from "./community";

export interface DefaultEntry {
  id: string;
  documentSlug: string;
  clauseId: string;
  scheduleClauseId: string;
  label: string;
  // null = no app parameter implements this today — shown on the Defaults
  // page and surfaced on governanceHealth.tsx's "unaccounted defaults" row,
  // same register as Government Adoption Compact's unaccounted defaults
  // (Phase 2 stage 1) — a plain list item, not an alarm.
  paramsPath: string | null;
  currentAppValue: (params: CharterParams) => string;
  expectedInClauseText: string;
  // Exact expected output of currentAppValue(DEFAULT_PARAMS) when
  // paramsPath is non-null; null exactly when paramsPath is null.
  expectedValue: string | null;
}

// `pct` found a real bug: delegateRecallTrigger's 0.015 (the one
// non-whole-percent default in this corpus) was rounding to "2%" instead of
// the clause's stated "1.5%" — fixed once, in params.ts's formatPercent,
// rather than patched locally here.
const pct = formatPercent;

export const DEFAULTS_REGISTRY: DefaultEntry[] = [
  // ---- Charter 2.6 ----
  {
    id: "delegation-expiry-ordinary",
    documentSlug: "charter",
    clauseId: "3.3",
    scheduleClauseId: "2.6",
    label: "Delegation renewal cycle, ordinary decisions",
    paramsPath: "delegationExpiryDays",
    currentAppValue: (p) => `${p.delegationExpiryDays} days`,
    expectedInClauseText: "default: annual",
    expectedValue: "365 days",
  },
  {
    id: "delegation-expiry-critical",
    documentSlug: "charter",
    clauseId: "3.3",
    scheduleClauseId: "2.6",
    label: "Delegation renewal cycle, critical decisions",
    paramsPath: "delegationExpiryCriticalDays",
    currentAppValue: (p) => `${p.delegationExpiryCriticalDays} days`,
    expectedInClauseText: "default: 90 days",
    expectedValue: "90 days",
  },
  {
    id: "delegate-installation-threshold",
    documentSlug: "charter",
    clauseId: "4.3",
    scheduleClauseId: "2.6",
    label: "Delegate installation threshold",
    paramsPath: "delegateThreshold",
    currentAppValue: (p) => pct(p.delegateThreshold),
    expectedInClauseText: "default: 5%",
    expectedValue: "5%",
  },
  {
    id: "delegate-sustaining-floor",
    documentSlug: "charter",
    clauseId: "4.7",
    scheduleClauseId: "2.6",
    label: "Delegate sustaining floor",
    paramsPath: "delegateSustainingFloor",
    currentAppValue: (p) => pct(p.delegateSustainingFloor),
    expectedInClauseText: "default: 3%",
    expectedValue: "3%",
  },
  {
    id: "delegate-recall-trigger",
    documentSlug: "charter",
    clauseId: "4.8",
    scheduleClauseId: "2.6",
    label: "Delegate automatic-removal trigger",
    paramsPath: "delegateRecallTrigger",
    currentAppValue: (p) => pct(p.delegateRecallTrigger),
    expectedInClauseText: "default: 1.5%",
    expectedValue: "1.5%",
  },
  {
    id: "delegate-grace-days",
    documentSlug: "charter",
    clauseId: "4.9",
    scheduleClauseId: "2.6",
    label: "Grace period before automatic removal",
    paramsPath: "delegateGraceDays",
    currentAppValue: (p) => `${p.delegateGraceDays} days`,
    expectedInClauseText: "default: 14 days",
    expectedValue: "14 days",
  },
  {
    id: "concentration-renewal-share",
    documentSlug: "charter",
    clauseId: "3.6",
    scheduleClauseId: "2.6",
    label: "Concentrated-holder share (shorter renewal cycle)",
    paramsPath: "concentrationRenewalShare",
    currentAppValue: (p) => pct(p.concentrationRenewalShare),
    expectedInClauseText: "(default: 10%)",
    expectedValue: "10%",
  },
  {
    id: "concentration-review-share",
    documentSlug: "charter",
    clauseId: "3.6",
    scheduleClauseId: "2.6",
    label: "Concentration review share",
    paramsPath: "concentrationReviewShare",
    currentAppValue: (p) => pct(p.concentrationReviewShare),
    expectedInClauseText: "(default: 20%)",
    expectedValue: "20%",
  },
  {
    id: "delegate-tie-margin",
    documentSlug: "charter",
    clauseId: "4.10",
    scheduleClauseId: "2.6",
    label: "Co-Delegate tie margin",
    paramsPath: "delegateTieMargin",
    currentAppValue: (p) => pct(p.delegateTieMargin),
    expectedInClauseText: "default: 2%",
    expectedValue: "2%",
  },
  {
    id: "dividend-cap-multiple",
    documentSlug: "charter",
    clauseId: "5.3",
    scheduleClauseId: "2.6",
    label: "Accrual cap, as a multiple of an equal share",
    paramsPath: "dividendCapMultiple",
    currentAppValue: (p) => `${p.dividendCapMultiple}×`,
    expectedInClauseText: "five times an equal share",
    expectedValue: "5×",
  },
  {
    id: "active-member-window",
    documentSlug: "charter",
    clauseId: "9.1",
    scheduleClauseId: "2.6",
    label: "Active Member trailing window",
    paramsPath: "activeWindowDays",
    currentAppValue: (p) => `${p.activeWindowDays} days`,
    expectedInClauseText: "trailing 90 days",
    expectedValue: "90 days",
  },
  {
    id: "phase1-criteria",
    documentSlug: "charter",
    clauseId: "9.2",
    scheduleClauseId: "2.6",
    label: "Phase I Foundation Criteria",
    paramsPath: "criteria.phase1",
    currentAppValue: (p) => `${p.criteria.phase1.members} Members (${p.criteria.phase1.active} Active), ${p.criteria.phase1.proposals} proposals, ${p.criteria.phase1.delegations} delegations`,
    expectedInClauseText: "150 verified Members",
    expectedValue: "150 Members (50 Active), 50 proposals, 40 delegations",
  },
  {
    id: "phase2-criteria",
    documentSlug: "charter",
    clauseId: "9.3",
    scheduleClauseId: "2.6",
    label: "Phase II Sustainability Criteria",
    paramsPath: "criteria.phase2",
    currentAppValue: (p) => `${p.criteria.phase2.members} Members (${p.criteria.phase2.active} Active), max ${pct(p.criteria.phase2.maxDelegateShare)} delegated-vote share`,
    expectedInClauseText: "500 verified Members",
    expectedValue: "500 Members (150 Active), max 10% delegated-vote share",
  },
  // ---- Treasury Code 9.7 ----
  // (dividend-activation-members lives here, not under Charter 2.6: its
  // own document is treasury-code, and the clause accounting for why 30
  // is the chosen figure — 5.1a — is itself accounted for by 9.7, per
  // 9.7's own text: "The activation gate of 5.1 is accounted for at
  // 5.1a". Charter 2.6 never mentions it.)
  {
    id: "dividend-activation-members",
    documentSlug: "treasury-code",
    clauseId: "5.1",
    scheduleClauseId: "9.7",
    label: "Foundation Dividend activation gate — verified Members",
    paramsPath: null, // a code constant (community.ts), not a per-community params field — not amendable by ordinary proposal today
    currentAppValue: () => `${DIVIDEND_ACTIVATION_MEMBERS} verified Members`,
    expectedInClauseText: "at least **30 verified Members**",
    expectedValue: null,
  },
  {
    id: "disclosure-threshold",
    documentSlug: "treasury-code",
    clauseId: "1.2",
    scheduleClauseId: "9.7",
    label: "Donor disclosure threshold",
    paramsPath: null,
    currentAppValue: () => "not implemented",
    expectedInClauseText: "$1,000 per source per year",
    expectedValue: null,
  },
  {
    id: "founder-veto-threshold",
    documentSlug: "treasury-code",
    clauseId: "3.3",
    scheduleClauseId: "9.7",
    label: "Founder suspensive-veto threshold (Phase II)",
    paramsPath: null,
    currentAppValue: () => "not implemented",
    expectedInClauseText: "default: 10%",
    expectedValue: null,
  },
  {
    id: "treasury-split",
    documentSlug: "treasury-code",
    clauseId: "2.1",
    scheduleClauseId: "9.7",
    label: "Operations / dividend pool / reserve split",
    paramsPath: "split",
    currentAppValue: (p) => `${pct(p.split.ops)} / ${pct(p.split.dividend)} / ${pct(p.split.reserve)}`,
    expectedInClauseText: "40%",
    expectedValue: "40% / 40% / 20%",
  },
  {
    id: "reserve-months-covered",
    documentSlug: "treasury-code",
    clauseId: "2.1",
    scheduleClauseId: "9.7",
    label: "Reserve target, months of operating costs",
    paramsPath: "criteria.phase2.reserveMonthsCovered",
    currentAppValue: (p) => `${p.criteria.phase2.reserveMonthsCovered} months`,
    expectedInClauseText: "target of 12 months",
    expectedValue: "12 months",
  },
  {
    id: "custodian-count",
    documentSlug: "treasury-code",
    clauseId: "6.1",
    scheduleClauseId: "9.7",
    label: "Minimum number of custodians",
    paramsPath: null,
    currentAppValue: () => "not implemented",
    expectedInClauseText: "no fewer than three custodians",
    expectedValue: null,
  },
  {
    id: "custodian-term",
    documentSlug: "treasury-code",
    clauseId: "6.1",
    scheduleClauseId: "9.7",
    label: "Custodian term length",
    paramsPath: null,
    currentAppValue: () => "not implemented",
    expectedInClauseText: "default: 6 months",
    expectedValue: null,
  },

  // ---- Contribution Code 8.9 ----
  {
    id: "contribution-claim-window",
    documentSlug: "contribution-code",
    clauseId: "1.5",
    scheduleClauseId: "8.9",
    label: "Days to claim a verified contribution",
    paramsPath: null, // a code constant (community.ts), not a params.ts field
    currentAppValue: () => `${CONTRIBUTION_CLAIM_WINDOW_DAYS} days`,
    expectedInClauseText: "60 days from verification",
    expectedValue: null,
  },
  {
    id: "domain-shares",
    documentSlug: "contribution-code",
    clauseId: "2.1",
    scheduleClauseId: "8.9",
    label: "Domain weightings",
    paramsPath: "domainShares",
    currentAppValue: (p) => `Deliberation ${pct(p.domainShares.Deliberation)} / Craft ${pct(p.domainShares.Craft)} / Stewardship ${pct(p.domainShares.Stewardship)} / Attestation ${pct(p.domainShares.Attestation)}`,
    expectedInClauseText: "30%",
    expectedValue: "Deliberation 30% / Craft 30% / Stewardship 25% / Attestation 15%",
  },
  {
    id: "attestations-required",
    documentSlug: "contribution-code",
    clauseId: "3.3",
    scheduleClauseId: "8.9",
    label: "Peer attestations required",
    paramsPath: "attestationsRequired",
    currentAppValue: (p) => `${p.attestationsRequired}`,
    expectedInClauseText: "at least two Active Members",
    expectedValue: "2",
  },
  {
    id: "diversity-cap",
    documentSlug: "contribution-code",
    clauseId: "4.1",
    scheduleClauseId: "8.9",
    label: "Single-domain diversity cap",
    paramsPath: "diversityCap",
    currentAppValue: (p) => pct(p.diversityCap),
    expectedInClauseText: "No more than 50%",
    expectedValue: "50%",
  },
  {
    id: "standing-window",
    documentSlug: "contribution-code",
    clauseId: "1.3",
    scheduleClauseId: "8.9",
    label: "Trailing standing window",
    paramsPath: "standingWindowDays",
    currentAppValue: (p) => `${p.standingWindowDays} days`,
    expectedInClauseText: "trailing 12-month window",
    expectedValue: "365 days",
  },

  // ---- Rules of Procedure 7.4 ----
  {
    id: "vote-freeze-hours",
    documentSlug: "rules-of-procedure",
    clauseId: "2.2",
    scheduleClauseId: "7.4",
    label: "Vote-freeze window before voting opens",
    paramsPath: "voteFreezeHours",
    currentAppValue: (p) => `${p.voteFreezeHours} hours`,
    expectedInClauseText: "24 hours before voting opens",
    expectedValue: "24 hours",
  },
  {
    id: "critical-treasury-share",
    documentSlug: "rules-of-procedure",
    clauseId: "1.6",
    scheduleClauseId: "7.4",
    label: "Treasury-allocation critical-classification share",
    paramsPath: null, // params.ts module constant, not a per-community CharterParams field
    currentAppValue: () => pct(CRITICAL_TREASURY_SHARE),
    expectedInClauseText: "exceeding 5%",
    expectedValue: null,
  },
  {
    id: "petition-signature-share",
    documentSlug: "rules-of-procedure",
    clauseId: "1.6",
    scheduleClauseId: "7.4",
    label: "Petition signature share (critical classification / accelerated timeline)",
    paramsPath: null, // params.ts module constant, not a per-community CharterParams field
    currentAppValue: () => pct(PETITION_SIGNATURE_SHARE),
    expectedInClauseText: "at least 10% of Active Members",
    expectedValue: null,
  },
  {
    id: "ranking-weights",
    documentSlug: "rules-of-procedure",
    clauseId: "4.4",
    scheduleClauseId: "7.4",
    label: "Ranking weights — followed sectors vs. contribution overlap",
    paramsPath: "rankingWeights",
    currentAppValue: (p) => `${pct(p.rankingWeights.follow)} / ${pct(p.rankingWeights.contribution)}`,
    expectedInClauseText: "weighted equally by default",
    expectedValue: "100% / 100%",
  },

  // ---- Code of Conduct 4.5 ----
  {
    id: "accrual-suspension-days",
    documentSlug: "code-of-conduct",
    clauseId: "3.2",
    scheduleClauseId: "4.5",
    label: "Accrual suspension period",
    paramsPath: null, // a code constant (conduct.ts), not a params.ts field
    currentAppValue: () => `${ACCRUAL_SUSPENSION_DAYS} days`,
    expectedInClauseText: "default: 30 days",
    expectedValue: null,
  },
  {
    id: "participation-suspension-days",
    documentSlug: "code-of-conduct",
    clauseId: "3.3",
    scheduleClauseId: "4.5",
    label: "Participation suspension period / maximum",
    paramsPath: null, // code constants (conduct.ts), not params.ts fields
    currentAppValue: () => `${PARTICIPATION_SUSPENSION_DAYS} days, maximum ${PARTICIPATION_SUSPENSION_MAX_DAYS}`,
    expectedInClauseText: "default: 30 days, maximum 90",
    expectedValue: null,
  },

  // ---- Dispute Procedure Code 7.2 (the one DERIVED default, not chosen) ----
  {
    id: "dispute-pool-minimum",
    documentSlug: "dispute-procedure-code",
    clauseId: "2.1",
    scheduleClauseId: "7.2",
    label: "Dispute Panel pool minimum",
    paramsPath: null, // a code constant (community.ts), not a params.ts field
    currentAppValue: () => `${DISPUTE_PANEL_POOL_MINIMUM} Members`,
    expectedInClauseText: "at least 30 Members",
    expectedValue: null,
  },

  // ---- Triarc Membership Code 4.2 ----
  {
    id: "position-vote-eligibility-days",
    documentSlug: "triarc-membership-code",
    clauseId: "2.4",
    scheduleClauseId: "4.2",
    label: "Days before a vote counts toward a Position decision",
    paramsPath: "positionVoteEligibilityDays",
    currentAppValue: (p) => `${p.positionVoteEligibilityDays} days`,
    expectedInClauseText: "at least 30 days",
    expectedValue: "30 days",
  },

  // ---- Triarc Operations Code 5.2 ----
  {
    id: "triarc-sector-list",
    documentSlug: "triarc-operations-code",
    clauseId: "2.1",
    scheduleClauseId: "5.2",
    label: "The Triarc's own sector list",
    paramsPath: null, // a params.ts module constant (a seeding list), not a per-community CharterParams field
    currentAppValue: () => TRIARC_SECTORS.join(", "),
    expectedInClauseText: "Data Collection & Research",
    expectedValue: null,
  },
];

/** True entrenched provisions are derived from Charter 8.2 by
 * documentsParser.ts, not hand-marked here — this helper just resolves
 * "is this registry entry's clause one of them" at render/test time,
 * so the two sources of truth (entrenchment, defaults) never need to agree
 * by construction instead of by lookup. */
export function isDefaultEntrenched(entry: DefaultEntry, entrenchedClauseIds: string[]): boolean {
  return entrenchedClauseIds.includes(`${entry.documentSlug}#${entry.clauseId}`);
}
