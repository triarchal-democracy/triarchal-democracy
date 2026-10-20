// Pure, DB-free implementations of the Charter's mechanics. Ported from
// site/prototype.html's resolveVote/periodCredits/runDividend, parameterized
// by real timestamps instead of a simulated day counter, plus anti-gaming
// mechanics the prototype didn't implement (reciprocity damping, the 5-class
// proposal minimum-participation/threshold matrix, sector-scoped delegation,
// critical-decision classification). Novelty decay (Contribution Code 4.4)
// is intentionally not implemented here yet — see CLAUDE.md / the build plan.

import {
  DAY_MS,
  CONCENTRATION_SUPPORTER_FLOOR,
  type ClassConfig,
  type Domain,
  DOMAINS,
  type ProposalClass,
  CRITICAL_CLASSES,
  CRITICAL_TREASURY_SHARE,
  type FoundingCriteriaPhaseI,
  type FoundingCriteriaPhaseII,
} from "./params";

// ---------- Delegation & voting ----------

export interface DelegationRef {
  toId: number;
  grantedAt: number;
  sectorId: number | null; // null = "entire" delegation — Charter 3.3
}

export interface VotingMember {
  id: number;
  // At most one live "entire" delegation (sectorId null) OR several live
  // sector-scoped ones, never both — enforced where delegations are written,
  // not here.
  delegations: DelegationRef[];
}

/**
 * The delegation that actually applies to a specific vote: a live
 * sector-scoped delegation matching one of the proposal's sectors beats a
 * live "entire" delegation. If more than one scoped delegation matches a
 * multi-sector proposal, break the tie deterministically — lowest sectorId,
 * then earliest grantedAt. This is a documented simplification, not full
 * conflict resolution.
 */
export function effectiveDelegation(
  m: VotingMember,
  now: number,
  expiryDays: number,
  proposalSectorIds: number[] = []
): DelegationRef | null {
  const expiryMs = expiryDays * DAY_MS;
  const live = m.delegations.filter((d) => now - d.grantedAt <= expiryMs);
  if (live.length === 0) return null;

  const scopedMatches = live
    .filter((d): d is DelegationRef & { sectorId: number } => d.sectorId !== null && proposalSectorIds.includes(d.sectorId))
    .sort((a, b) => a.sectorId - b.sectorId || a.grantedAt - b.grantedAt);
  if (scopedMatches.length > 0) return scopedMatches[0];

  return live.find((d) => d.sectorId === null) ?? null;
}

export interface VoteTally {
  yes: number;
  no: number;
  participating: number;
  resolutions: Record<number, { val: boolean; how: string }>;
}

/**
 * One member, one vote. A direct vote always overrides delegation. Chains
 * resolve to a terminal direct voter via each member's effective delegation
 * for this specific proposal's sectors; circular chains (including expired
 * links) resolve to nothing for that member.
 */
/** One captured delegation from a proposal's vote-open snapshot. */
export interface SnapshotDelegationRow {
  memberId: number;
  toId: number;
  sectorId: number | null;
  grantedAt: number;
}

/**
 * Builds the VotingMember list a tally resolves against, from a proposal's
 * vote-open snapshot rather than from live delegation state.
 *
 * The member list stays live while the delegations are frozen: a Member who
 * joined after voting opened simply has no snapshot rows, so an empty
 * delegation set, and can still cast and have counted a direct vote. Rules of
 * Procedure 3.3 governs delegation, not eligibility.
 */
export function snapshotToVotingMembers(memberIds: number[], rows: SnapshotDelegationRow[]): VotingMember[] {
  const byMember = new Map<number, DelegationRef[]>();
  for (const r of rows) {
    const arr = byMember.get(r.memberId) ?? [];
    arr.push({ toId: r.toId, grantedAt: r.grantedAt, sectorId: r.sectorId });
    byMember.set(r.memberId, arr);
  }
  return memberIds.map((id) => ({
    id,
    delegations: (byMember.get(id) ?? []).slice().sort((a, b) => a.grantedAt - b.grantedAt),
  }));
}

/** Charter 3.6 — a delegation to one of these holders is judged against `days` (the shorter renewal cycle) even if the vote is not critical. */
export interface ShortExpiry {
  targets: Set<number>;
  days: number;
}

export function resolveVote(
  members: VotingMember[],
  votes: Record<number, boolean>,
  now: number,
  delegationExpiryDays: number,
  proposalSectorIds: number[] = [],
  shortExpiry?: ShortExpiry
): VoteTally {
  if (shortExpiry && shortExpiry.targets.size > 0) {
    const limit = shortExpiry.days * DAY_MS;
    members = members.map((m) => ({
      ...m,
      delegations: m.delegations.filter((d) => !(shortExpiry.targets.has(d.toId) && now - d.grantedAt > limit)),
    }));
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  const resolutions: Record<number, { val: boolean; how: string }> = {};

  for (const m of members) {
    if (votes[m.id] !== undefined) {
      resolutions[m.id] = { val: votes[m.id], how: "direct" };
      continue;
    }
    let cur: VotingMember | undefined = m;
    const seen = new Set<number>([m.id]);
    let terminal: VotingMember | null = null;
    while (cur) {
      const d = effectiveDelegation(cur, now, delegationExpiryDays, proposalSectorIds);
      if (!d) break;
      if (seen.has(d.toId)) break; // circular -> void
      const next = byId.get(d.toId);
      if (!next) break;
      seen.add(next.id);
      if (votes[next.id] !== undefined) {
        terminal = next;
        break;
      }
      cur = next;
    }
    if (terminal) {
      resolutions[m.id] = { val: votes[terminal.id], how: `via ${terminal.id}` };
    }
  }

  let yes = 0;
  let no = 0;
  for (const r of Object.values(resolutions)) (r.val ? yes++ : no++);

  return { yes, no, participating: Object.keys(resolutions).length, resolutions };
}

export interface VoteOutcome {
  ratified: boolean;
  label: string;
  metMinParticipation: boolean;
}

/** Minimum-participation + threshold check for whichever of the 5 proposal classes applies. Rules of Procedure §1.3. */
export function closeVote(memberCount: number, tally: VoteTally, cfg: ClassConfig): VoteOutcome {
  // Charter 3.5 — the greater of the fraction and the absolute floor, and never
  // more than the membership itself (a 12-Member community cannot need 10 of 10
  // to be an impossible 10 of 12 — it needs 10; but a 6-Member one needs 6).
  const participationNeed = Math.min(
    memberCount,
    Math.max(Math.ceil(memberCount * cfg.minParticipation), cfg.minParticipationMembers)
  );
  if (tally.participating < participationNeed) {
    return {
      ratified: false,
      label: `failed minimum participation (${tally.participating}/${participationNeed} needed)`,
      metMinParticipation: false,
    };
  }
  const total = tally.yes + tally.no;
  if (total === 0) return { ratified: false, label: "failed minimum participation", metMinParticipation: true };
  const passed = tally.yes / total > cfg.threshold || (cfg.threshold === 0.5 && tally.yes > tally.no);
  return passed
    ? { ratified: true, label: `RATIFIED ${tally.yes}–${tally.no}`, metMinParticipation: true }
    : { ratified: false, label: `rejected ${tally.yes}–${tally.no}`, metMinParticipation: true };
}

// ---------- Critical-decision classification ----------

/** Rules of Procedure §1.6 rule-based half — the petition half lives at the route layer. */
export function computeCritical(cls: ProposalClass, amount: number | null, treasuryTotalBalance: number): boolean {
  if (CRITICAL_CLASSES.includes(cls)) return true;
  if (cls === "treasury" && amount !== null && treasuryTotalBalance > 0) {
    return amount > treasuryTotalBalance * CRITICAL_TREASURY_SHARE;
  }
  return false;
}

// ---------- Sector-scoped Steward / Delegate (Charter 4.2/4.3) ----------

/** Civic Steward is computed, never stored — Charter 4.2: "not an office." */
export function civicStewardOf(hasLiveSectorDelegation: boolean, sectorStandingCredits: number): boolean {
  return hasLiveSectorDelegation && sectorStandingCredits > 0;
}

/**
 * A stored Delegate recognition (Charter 4.3) is active only if it has not
 * been revoked. Revocation happens two ways: a ratified removal Position
 * decision (immediate), or automatic lapse once the grace period of Charter
 * 4.9 has run out (community.ts's updateDelegateGraceTimers, on tick — see
 * delegateTier/graceExpired below). Losing share alone no longer lapses a
 * Delegate at read time the moment it dips under the installation threshold
 * — 4.7's sustaining floor and 4.8's recall band exist precisely so a single
 * bad week doesn't read as revoked; only revokedAt does.
 */
export function isDelegateActive(revokedAt: number | null): boolean {
  return revokedAt === null;
}

export type DelegateTier = "held" | "recall" | "grace";

/**
 * Charter 4.7/4.8's classification of a Delegate's current sector-delegation
 * share against the sustaining floor and the automatic-removal trigger.
 * "held": at/above the sustaining floor, kept automatically, no review.
 * "recall": below the floor but at/above the trigger — the recall band;
 * neither "still fine" nor removal, it warrants a formal review (RoP 4.8)
 * but this function doesn't fire one. "grace": below the trigger — the
 * automatic-removal grace window of 4.9 applies; see graceExpired.
 */
// Charter 4.7 — the sustaining floor is the GREATER of the percentage and two
// supporters. Expressed as a percentage alone, one supporter is 1/S of a sector
// holding S delegations, which clears a 3% floor for every sector below 34. A
// one-supporter Delegate would hold their Position automatically and for good,
// and 4.8's confirmation vote could never fire — in exactly the communities
// where one supporter is least evidence of support. Charter 4.8a.
export function delegateTier(
  share: number,
  sustainingFloor: number,
  recallTrigger: number,
  supporters: number,
  minSupporters = 2
): DelegateTier {
  // Charter 4.7 — "held" is the GREATER of the percentage and two supporters.
  if (share >= sustainingFloor && supporters >= minSupporters) return "held";
  // Charter 4.8 — the band is defined purely by share: below the floor, at or
  // above the trigger. No supporter condition here. An earlier version also
  // returned "recall" for any Delegate retaining one supporter, which meant a
  // Delegate below the removal trigger never reached grace at all — 4.9 has no
  // supporter condition and must not acquire one by implementation.
  if (share >= recallTrigger) return "recall";
  return "grace";
}

export type ConcentrationTier = "none" | "renewal" | "review";

/**
 * Charter 3.6 — a holder with fewer than the ten-supporter floor is never
 * concentrated (one supporter is 100% of a one-delegation sector, which is not
 * concentration); at/above the renewal share the shorter renewal cycle
 * applies; at/above the review share a concentration review opens as well.
 */
export function concentrationTier(share: number, supporters: number, renewalShare: number, reviewShare: number): ConcentrationTier {
  if (supporters < CONCENTRATION_SUPPORTER_FLOOR) return "none";
  if (share >= reviewShare) return "review";
  if (share >= renewalShare) return "renewal";
  return "none";
}

/** Charter 4.9 — has a stored belowTriggerSince timer run out its grace window? Pure function over already-loaded timestamps. */
export function graceExpired(belowTriggerSince: number, graceDays: number, now: number): boolean {
  return now - belowTriggerSince >= graceDays * DAY_MS;
}

export interface DelegationExpiryStatus {
  stillLive: boolean; // false once past ordinary expiry — fully lapsed, nothing left to warn about
  ordinarySoon: boolean; // ordinary expiry (Charter 3.3) falls within warningWindowDays
  criticalSoon: boolean; // shorter critical-cycle expiry (same clause) falls within warningWindowDays
}

/**
 * Charter 3.3 — given one delegation's grantedAt and the community's two
 * expiry cycles, is it still live, and is either threshold approaching?
 * Pure so community.ts's scanDelegationsExpiringSoon (the cron-driven
 * delegation_expiring_soon notification — Enterprise_and_Community_Roadmap.md
 * Phase 2) is unit-testable with an injected `ts` rather than only
 * exercisable via a real dev-clock jump.
 */
export function delegationExpiryStatus(
  grantedAt: number,
  ts: number,
  delegationExpiryDays: number,
  delegationExpiryCriticalDays: number,
  warningWindowDays: number = 7
): DelegationExpiryStatus {
  const ordinaryExpiresAt = grantedAt + delegationExpiryDays * DAY_MS;
  const criticalExpiresAt = grantedAt + delegationExpiryCriticalDays * DAY_MS;
  const warningMs = warningWindowDays * DAY_MS;
  const stillLive = ts <= ordinaryExpiresAt;
  return {
    stillLive,
    ordinarySoon: stillLive && ordinaryExpiresAt - ts <= warningMs,
    criticalSoon: stillLive && ts <= criticalExpiresAt && criticalExpiresAt - ts <= warningMs,
  };
}

/** Charter 4.10 — "closely tied" candidates: shares within `margin` of each other. */
export function isCloselyTied(shareA: number, shareB: number, margin: number): boolean {
  return Math.abs(shareA - shareB) < margin;
}

// ---------- Positions and Supporting Nominees (Contribution Code 8) ----------

/** Contribution Code 8.3 — eligibility to be nominated is a nonzero verified Contribution Record in the sector, reusing the same sectorStandingCredits check as Civic Steward eligibility. No separate threshold. */
export function nomineeEligible(sectorStandingCredits: number): boolean {
  return sectorStandingCredits > 0;
}

/**
 * A Supporting Nominee is active only if not explicitly revoked AND the
 * underlying Delegate recognition is still active — a nominee's role lapses
 * automatically with the Delegate's own lapse (Contribution Code 8.7),
 * computed at read time exactly like Delegate status itself.
 */
export function isSupportingNomineeActive(nomineeRevokedAt: number | null, delegateRevokedAt: number | null): boolean {
  if (nomineeRevokedAt !== null) return false;
  return isDelegateActive(delegateRevokedAt);
}

// ---------- Minimal Dispute Panel (Contribution Code 8.6 conduct-challenge path) ----------
// Scoped only to what a nomination conduct challenge needs — not the full
// Dispute Procedure Code (no appeals, no delegator/delegate exclusion).

export interface PanelVote {
  upheld: boolean;
}

/** Majority of votes actually cast decides; a tie or no votes at all dismisses — "doubt resolves toward the accused" applied to an unresolved panel. */
// ---------- Dispute Panel eligibility (Dispute Procedure Code 2.2) ----------

/**
 * One candidate for a Dispute Panel draw, with every fact clause 2.2 needs to
 * judge them. Populated by community.ts (which owns the queries); kept pure
 * here so each exclusion is unit-testable on its own.
 */
export interface PanelCandidate {
  memberId: number;
  /** 2.2 — "the parties". */
  isParty: boolean;
  /** 2.2 — most recent moment this candidate held or granted a delegation to or from a party; null if never. */
  delegationWithPartyAt: number | null;
  /** 2.2 — "anyone who attested the disputed contribution". */
  attestedDisputedContribution: boolean;
  /** 2.2 — "anyone with a pending dispute against a party". */
  hasPendingDisputeAgainstParty: boolean;
  /** 2.2 — most recent panel this candidate served on involving the same parties; null if never. */
  lastPanelWithSamePartiesAt: number | null;
}

export const DELEGATION_EXCLUSION_LOOKBACK_DAYS = 90;
export const PRIOR_PANEL_EXCLUSION_LOOKBACK_DAYS = 180;

/**
 * Applies all five exclusions of Dispute Procedure Code 2.2 and returns the
 * ids that remain eligible, in the order given.
 *
 * Before this existed the draw excluded only the direct parties, so four of
 * the five exclusions were simply absent. Order matters downstream: the caller
 * must apply the 2.1 pool minimum and the full-seat requirement to what comes
 * back from here, not to the pool before exclusions.
 */
export function eligiblePanelCandidates(
  candidates: PanelCandidate[],
  ts: number,
  delegationLookbackDays: number = DELEGATION_EXCLUSION_LOOKBACK_DAYS,
  priorPanelLookbackDays: number = PRIOR_PANEL_EXCLUSION_LOOKBACK_DAYS
): number[] {
  const delegationCutoff = ts - delegationLookbackDays * DAY_MS;
  const priorPanelCutoff = ts - priorPanelLookbackDays * DAY_MS;
  return candidates
    .filter((c) => {
      if (c.isParty) return false;
      if (c.delegationWithPartyAt !== null && c.delegationWithPartyAt >= delegationCutoff) return false;
      if (c.attestedDisputedContribution) return false;
      if (c.hasPendingDisputeAgainstParty) return false;
      if (c.lastPanelWithSamePartiesAt !== null && c.lastPanelWithSamePartiesAt >= priorPanelCutoff) return false;
      return true;
    })
    .map((c) => c.memberId);
}

export function disputePanelOutcome(votes: PanelVote[]): "upheld" | "dismissed" {
  const upheldCount = votes.filter((v) => v.upheld).length;
  const dismissedCount = votes.length - upheldCount;
  return upheldCount > dismissedCount ? "upheld" : "dismissed";
}

// ---------- Feed ranking (Rules of Procedure 4.4) ----------

/**
 * Disclosed, amendable ranking formula: count-overlap between a member's
 * declared sector-follows and an item's sector tags, plus overlap between
 * the member's own sector-tagged Contribution Record and the item's tags —
 * nothing else feeds it. Always additive to the full unranked list, never a
 * replacement (Right VIII).
 */
export function rankScore(
  followedSectorIds: number[],
  memberContributionSectorIds: number[],
  itemSectorIds: number[],
  weights: { follow: number; contribution: number }
): number {
  const followOverlap = itemSectorIds.filter((s) => followedSectorIds.includes(s)).length;
  const contributionOverlap = itemSectorIds.filter((s) => memberContributionSectorIds.includes(s)).length;
  return followOverlap * weights.follow + contributionOverlap * weights.contribution;
}

// ---------- Contribution Mark claiming (Contribution Code 1.4-1.6) ----------

export type ContributionClaimStatus = "unverified" | "pending" | "claimed" | "lapsed";

/**
 * Contribution Code 1.4-1.6 — a verified contribution must be actively
 * claimed by the member within `claimWindowDays` of verification before it
 * counts toward standing or any dividend. Pure so community.ts and the
 * Contribution page's status labeling are unit-testable with an injected
 * `ts` rather than only exercisable via a real dev-clock jump (same pattern
 * as delegationExpiryStatus above).
 *   "unverified": verifiedAt not yet set — still gathering attestations.
 *   "pending": verified, not yet claimed, within the claim window.
 *   "claimed": claimedAt is set — always counts, regardless of when.
 *   "lapsed": verified, still unclaimed, past the claim window — stays on
 *     the permanent record (1.6), but never counts.
 */
export function contributionClaimStatus(
  verifiedAt: number | null,
  claimedAt: number | null,
  ts: number,
  claimWindowDays: number
): ContributionClaimStatus {
  if (claimedAt !== null) return "claimed";
  if (verifiedAt === null) return "unverified";
  return ts - verifiedAt >= claimWindowDays * DAY_MS ? "lapsed" : "pending";
}

// ---------- Contribution Marks ----------
// Field/function names below still say "credits" — pre-Aug-2026 naming,
// kept as the internal identifier while the member-facing concept it
// represents is now called "Contribution Marks" (Contribution Code 1.1).

/** No more than `diversityCap` (default 50%) of a member's Marks in a period may come from one domain. Contribution Code 4.1. */
export function periodCredits(credits: Record<Domain, number>, diversityCap: number): number {
  const total = DOMAINS.reduce((s, d) => s + (credits[d] ?? 0), 0);
  if (total === 0) return 0;
  return DOMAINS.reduce((capped, d) => capped + Math.min(credits[d] ?? 0, total * diversityCap), 0);
}

// ---------- Domain issuance pool (Contribution Code 2.1) ----------
// A different, narrower cap than diversityCap above: that one bounds one
// *member's* concentration in a single domain; this one bounds the
// *community's aggregate* Mark issuance in a domain against its share of
// the period's total (domainShares — Deliberation 30%/Craft 30%/
// Stewardship 25%/Attestation 15% by default).
//
// !! STALE AS OF THE C1 DECISION (Sep 1 2026) — READ BEFORE USING !!
// This models Marks as a fixed per-period ISSUANCE that a domain can leave
// unearned. Contribution Code 2.1 used to say exactly that, and no longer
// does: Marks are now EARNED units, and the pool divides among those
// actually claimed, with domain shares weighting what a Mark is worth. There
// is no domain allocation left over to cap, so nothing in this section is
// backed by any current founding document.
//
// It stays for now because it moves no money — the report is informational
// and `domainIssuanceCapEnabled` is off. **Do not turn that flag on.** With
// it on, `applyDomainIssuanceCap` would enforce the quota model the founder
// explicitly rejected, against a clause that no longer exists. Either delete
// this section or re-derive it from whatever the documents actually say;
// don't quietly enable it.

export interface DomainIssuanceReport {
  raw: Record<Domain, number>; // community-wide raw claimed Marks per domain this period, before any cap
  rawTotal: number; // sum of raw across all four domains
  cap: Record<Domain, number>; // domainShares[d] * rawTotal — the cap relative to the *raw* total, not a capped total, so this can never be circular
  residue: Record<Domain, number>; // max(0, cap - raw) — unused headroom, "rolls to the treasury" per 2.1
  overage: Record<Domain, number>; // max(0, raw - cap) — how far over cap this domain ran
  scaleFactor: Record<Domain, number>; // cap/raw when raw > cap (< 1, the proportional scale-down enforcement would apply), else 1 (no scaling — full raw value stands)
}

/**
 * The always-on reporting half of Contribution Code 2.1 — computes what a
 * hard cap would do this period without applying it. `perMemberCredits` is
 * every contributing member's raw (pre-cap, pre-diversity-cap) domain
 * credits for the period — e.g. `[...computePeriodCredits(...).values()]`.
 * Same one-pass shape as periodCredits above: cap is computed once against
 * the raw total, never against an already-capped total.
 */
export function computeDomainIssuanceReport(perMemberCredits: Record<Domain, number>[], domainShares: Record<Domain, number>): DomainIssuanceReport {
  const raw = {} as Record<Domain, number>;
  for (const d of DOMAINS) raw[d] = perMemberCredits.reduce((s, c) => s + (c[d] ?? 0), 0);
  const rawTotal = DOMAINS.reduce((s, d) => s + raw[d], 0);
  const cap = {} as Record<Domain, number>;
  const residue = {} as Record<Domain, number>;
  const overage = {} as Record<Domain, number>;
  const scaleFactor = {} as Record<Domain, number>;
  for (const d of DOMAINS) {
    cap[d] = domainShares[d] * rawTotal;
    residue[d] = Math.max(0, cap[d] - raw[d]);
    overage[d] = Math.max(0, raw[d] - cap[d]);
    scaleFactor[d] = raw[d] > 0 && raw[d] > cap[d] ? cap[d] / raw[d] : 1;
  }
  return { raw, rawTotal, cap, residue, overage, scaleFactor };
}

/**
 * The enforcement half — only ever called when `domainIssuanceCapEnabled`
 * is true. Scales every contributor's claimed Marks in an over-cap domain
 * down proportionally so that domain's community-wide total lands exactly
 * at its cap; a domain at or under its cap (scaleFactor 1) passes through
 * unchanged. Applied uniformly across every member with credits in that
 * domain this period — nobody's individual standing within the domain is
 * singled out, only the domain's aggregate total is brought back to cap.
 */
export function applyDomainIssuanceCap(creditsByMember: Map<number, Record<Domain, number>>, scaleFactor: Record<Domain, number>): Map<number, Record<Domain, number>> {
  const out = new Map<number, Record<Domain, number>>();
  for (const [id, credits] of creditsByMember) {
    const scaled = {} as Record<Domain, number>;
    for (const d of DOMAINS) scaled[d] = (credits[d] ?? 0) * scaleFactor[d];
    out.set(id, scaled);
  }
  return out;
}

// ---------- Reciprocity damping ----------

export interface AttestationEvent {
  attestorId: number;
  contributorId: number;
  attestedAt: number;
}

/**
 * Contribution Code 4.2: repeated attestations between the same ordered pair
 * within a period are progressively discounted — full value, then half, then
 * quarter (quarter is the floor, not a continuing decay). Returns a
 * multiplier per input event, same order as input.
 */
export function reciprocityMultipliers(events: AttestationEvent[]): number[] {
  const ordered = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.attestedAt - b.e.attestedAt);
  const occurrence = new Map<string, number>();
  const multipliers = new Array<number>(events.length);
  for (const { e, i } of ordered) {
    const key = `${e.attestorId}→${e.contributorId}`;
    const n = (occurrence.get(key) ?? 0) + 1;
    occurrence.set(key, n);
    multipliers[i] = n === 1 ? 1 : n === 2 ? 0.5 : 0.25;
  }
  return multipliers;
}

// ---------- Donation split (Treasury Code §§1.4, 2.1) ----------

export interface DonationSplit {
  ops: number;
  dividend: number;
  reserve: number;
}

/**
 * Treasury Code 2.1's standard 40/40/20 split for an ordinary,
 * unrestricted donation — or, per Treasury Code 1.4, a purpose restriction
 * that bypasses the split entirely and routes 100% of the amount to its
 * stated purpose instead. "institutional" is 1.4's own named case
 * (the Triarc and other institutional contributors — never to the
 * dividend pool); "reserve" is a plain restricted gift to the reserve.
 * Deliberately doesn't offer 1.4's third case, "a specific ratified
 * project" — that requires resolving which ratified proposal the
 * restriction attaches to, out of scope for this pass.
 */
export function computeDonationSplit(amount: number, split: { ops: number; dividend: number; reserve: number }, restriction: "institutional" | "reserve" | null): DonationSplit {
  if (restriction === "institutional") return { ops: amount, dividend: 0, reserve: 0 };
  if (restriction === "reserve") return { ops: 0, dividend: 0, reserve: amount };
  const ops = Math.round(amount * split.ops);
  const dividend = Math.round(amount * split.dividend);
  const reserve = amount - ops - dividend;
  return { ops, dividend, reserve };
}

// ---------- Civic Dividend ----------

export interface DividendMember {
  id: number;
  credits: Record<Domain, number>;
}

export interface DividendShare {
  id: number;
  credits: number;
  amount: number;
}

export interface DividendResult {
  shares: DividendShare[];
  distributed: number;
  residue: number;
}

/**
 * Founding Charter 1.1 — the minimum age to become a Member. There is no other age
 * condition: Treasury Code 9.1 entitles every verified Member to the dividend.
 */
export const MINIMUM_MEMBER_AGE = 18;

/**
 * Pro-rata distribution of the dividend pool by period Marks, capped per
 * member. Charter 5.3.
 *
 * `absolutePerMemberCap`, when given, replaces the default `pool * dividendCap`
 * ceiling with a flat one. The caller uses it to express the amended 5.3 — the
 * cap measured against everything distributed in the cycle, both tiers, minus
 * what this member already received from the Foundation floor. A ceiling of 0
 * or less means no Civic Dividend is payable at all this cycle.
 */
export function runDividend(
  members: DividendMember[],
  pool: number,
  dividendCap: number,
  diversityCap: number,
  absolutePerMemberCap?: number
): DividendResult {
  const entitled = members
    .map((m) => ({ id: m.id, c: periodCredits(m.credits, diversityCap) }))
    .filter((x) => x.c > 0);
  const totalC = entitled.reduce((s, x) => s + x.c, 0);

  if (pool < 1 || totalC === 0) {
    return { shares: [], distributed: 0, residue: pool };
  }

  const cap = absolutePerMemberCap !== undefined ? Math.max(0, absolutePerMemberCap) : pool * dividendCap;
  let distributed = 0;
  const shares: DividendShare[] = [];
  for (const x of entitled) {
    const share = Math.min(pool * (x.c / totalC), cap);
    const amount = Math.floor(share);
    if (amount > 0) {
      shares.push({ id: x.id, credits: Math.round(x.c), amount });
      distributed += amount;
    }
  }
  return { shares, distributed, residue: pool - distributed };
}

// ---------- Foundation + Civic Dividend, combined (Treasury Code §§4-5) ----------
// Both tiers are gated: Treasury Code 5.1 holds them at zero until the deployment
// has 30 verified Members with every Delegate Position filled (see `activated`
// below). Once live, each cycle:
//
//   1. Treasury Code 5.4 — a SHARE of the pool (default one half) is the
//      first-priority claim and divides equally among every verified Member.
//      Being a share, it always fits: there is no scale-down case.
//   2. Treasury Code 4.1 — whatever remains funds the Civic Dividend, pro-rata
//      to claimed Marks (runDividend above). `creditedMembers` is already
//      filtered to claimed Marks by computePeriodCredits (community.ts), so a
//      lapsed-unclaimed contribution (Contribution Code 1.6) never enters the
//      denominator at all.
//   3. Treasury Code 4.3 and 5.5 (founder decision, 10 Oct 2026) — whatever the
//      cap holds back, plus rounding, is CARRIED FORWARD into the NEXT cycle's
//      Foundation Dividend and divided equally there. It is never paid in the
//      cycle that produced it, it never raises the next cycle's cap, and it
//      never accumulates: below one contributor in nine it would otherwise pile
//      up in the pool unpaid. The caller passes the carried amount as
//      `carriedForward`; the cap and the Foundation share are measured on the
//      cycle's NEW money (pool - carriedForward) only. `topUpPerMember` is
//      retained as a field and is always 0.
//
export interface FoundationCivicShare {
  id: number;
  credits: number; // 0 for a verified Member with no claimed Marks this period
  foundationAmount: number;
  civicAmount: number;
  totalAmount: number;
}

export interface FoundationCivicResult {
  shares: FoundationCivicShare[]; // every verified Member with a nonzero total — Foundation-eligible even at zero Marks
  foundationDistributed: number;
  civicDistributed: number;
  distributed: number; // foundationDistributed + civicDistributed
  poolResidue: number; // cap residue + rounding — carried into the NEXT cycle's Foundation Dividend (Treasury Code 4.3/5.5), never to reserve or operations
  floorPerMemberPaid: number; // actual per-Member floor amount paid this cycle (may be less than the target if the pool was short)
  topUpPerMember: number; // additional per-Member amount from Civic Dividend residue (4.3/5.5)
}

export function runFoundationAndCivicDividend(
  allVerifiedMembers: { id: number }[],
  creditedMembers: DividendMember[],
  pool: number,
  // Treasury Code 5.4 — the Foundation Dividend's share of the pool (default 0.5).
  foundationPoolShare: number,
  // Charter 5.3 — a MULTIPLE of the equal share, not a flat fraction. See
  // params.ts for why the cap has this shape.
  dividendCapMultiple: number,
  diversityCap: number,
  // Treasury Code 5.1 — false until the deployment has activated. Before
  // activation the formula computes zero and NEITHER tier distributes; the
  // whole pool is returned as residue and stays in the pool.
  activated: boolean = true,
  // Treasury Code 4.3 — the part of `pool` carried forward from the previous
  // cycle (cap residue and rounding). It joins this cycle's Foundation tier and
  // is excluded from the cap's base. 0 for the first activated cycle.
  carriedForward: number = 0
): FoundationCivicResult {
  const memberCount = allVerifiedMembers.length;
  if (!activated || memberCount === 0 || pool < 1) {
    return { shares: [], foundationDistributed: 0, civicDistributed: 0, distributed: 0, poolResidue: pool, floorPerMemberPaid: 0, topUpPerMember: 0 };
  }

  // Charter 5.3 — the cap as an actual fraction of the cycle's pool: five times
  // the equal share, never more than the whole pool (which is what it collapses
  // to at or below `dividendCapMultiple` Members — a case Treasury Code 5.1's
  // activation gate prevents a real deployment from reaching).
  const dividendCap = Math.min(1, dividendCapMultiple / memberCount);
  const carry = Math.max(0, Math.min(carriedForward, pool));
  const newMoney = pool - carry;

  // Treasury Code 5.4 — the Foundation Dividend is a SHARE of the cycle's pool,
  // the first-priority claim, divided equally among every verified Member. It was
  // a fixed per-Member target until 3 Oct 2026; see params.ts and Treasury Code
  // 5.4a for why a fixed amount is wrong at both ends of the scale.
  //
  // Because it is a share it can never exceed the pool, so unlike the old fixed
  // floor there is no "scale down if the pool is short" case. The Math.floor is
  // rounding only: the remainder stays in the pool and reaches the Civic tier.
  const floorTotalAvailable = Math.min(Math.round(newMoney * foundationPoolShare) + carry, pool);
  const floorPerMemberPaid = Math.floor(floorTotalAvailable / memberCount);
  const floorActualTotal = floorPerMemberPaid * memberCount;

  // Treasury Code 4.1 — Civic Dividend, earned, from what's left.
  const remainingAfterFloor = pool - floorActualTotal;

  // Charter 5.3 — the cap is measured against everything distributed in a cycle,
  // both tiers together, not against the Civic Dividend alone. A Member's
  // Foundation share counts toward their own ceiling of five times an equal
  // share.
  //
  // "Everything distributed in a cycle" is read as the NEW MONEY COMMITTED to
  // the cycle (carried-forward residue excluded, Treasury 4.1/4.3 as amended 10
  // Oct 2026), not as the sum that actually went out. That distinction is not
  // pedantry — the other reading is unsatisfiable. If the ceiling is a share of
  // what was actually paid, then with k recipients the constraint is
  // D <= k * (multiple/n) * D, which holds only at D = 0 whenever k < n/multiple. A cycle in which
  // only a few Members earned Marks would pay out nothing at all, and iterating
  // toward the fixed point drives the distribution to zero rather than to a
  // sensible answer. Measuring against the committed pool is determinate,
  // needs no iteration, and preserves exactly the anti-capture intent charter
  // 5.3 states: no Member takes more than five times an equal share of the cycle's money.
  //
  // Whatever the cap leaves undistributed is not lost — it joins the next
  // cycle's Foundation Dividend under Treasury Code 4.3, split equally then.
  const perMemberCycleCap = newMoney * dividendCap; // Treasury 4.1/4.3: new money only
  const civic = runDividend(
    creditedMembers,
    remainingAfterFloor,
    dividendCap,
    diversityCap,
    perMemberCycleCap - floorPerMemberPaid
  );

  // Treasury Code 4.3/5.5 — residue is carried into the NEXT cycle's
  // Foundation Dividend (via the caller's `carriedForward`). It is never paid
  // in the cycle that produced it: an in-cycle even top-up handed capped money
  // straight back to the Member the cap had just restrained, because at small
  // membership an even share exceeds the cap itself.
  const topUpPerMember = 0;
  const poolResidue = civic.residue;

  const civicByMember = new Map(civic.shares.map((s) => [s.id, s]));
  const foundationAmount = floorPerMemberPaid + topUpPerMember;
  const shares: FoundationCivicShare[] = allVerifiedMembers
    .map((m) => {
      const c = civicByMember.get(m.id);
      const civicAmount = c?.amount ?? 0;
      return { id: m.id, credits: c?.credits ?? 0, foundationAmount, civicAmount, totalAmount: foundationAmount + civicAmount };
    })
    .filter((s) => s.totalAmount > 0);

  return {
    shares,
    foundationDistributed: foundationAmount * memberCount,
    civicDistributed: civic.distributed,
    distributed: foundationAmount * memberCount + civic.distributed,
    poolResidue,
    floorPerMemberPaid,
    topUpPerMember,
  };
}

// ---------- The Triarc's phone-verification membership floor ----------
// Triarc Membership Code 2.1-2.4 (_archive/prompts/Prompt25_PathA_MembershipEnforcement.md
// — that prompt predates the "Path A"/"Path B" deployment-naming retirement; see
// "Four names, not interchangeable" in CLAUDE.md). Every function here is a pure,
// unconditional check on its inputs — the caller (community.ts/index.tsx)
// decides whether to apply it at all, gated on the REQUIRE_PHONE_VERIFICATION
// Worker var. That's deliberate: a deployment without the var must be a complete
// no-op, and "the var is unset" has to be the actual mechanism, not "phoneVerifiedAt
// happens to always be null" — see Prompt25 Part D.4.
// Nothing in this section reads that var; it never will.

/** Triarc Membership Code 2.1/2.3 — a Member may vote, delegate, or receive a delegation only once their phone is verified. */
export function isPhoneVerified(phoneVerifiedAt: number | null): boolean {
  return phoneVerifiedAt !== null;
}

/**
 * Triarc Membership Code 2.4 — a Member's vote counts toward a Position
 * decision only once they've held verified Membership for at least
 * `requiredDays` (default params.positionVoteEligibilityDays — see
 * params.ts, 2.5's "adjustable... like any other parameter"). The clock
 * starts at phoneVerifiedAt, not joinedAt (2.4's own text: "held Membership
 * in good standing," and Membership itself begins at verification per 2.1).
 * `ts` should be the same tally-time timestamp closeOneVote already threads
 * through everywhere else (community clock, not a fresh Date.now()) — same
 * convention as delegationExpiryStatus/contributionClaimStatus above.
 */
export function isPositionVoteEligible(phoneVerifiedAt: number | null, ts: number, requiredDays: number): boolean {
  if (phoneVerifiedAt === null) return false;
  return ts - phoneVerifiedAt >= requiredDays * DAY_MS;
}

/**
 * Re-filters an already-resolved VoteTally (resolveVote's output) down to
 * only the members `eligible` accepts, recomputing yes/no/participating from
 * what's left. Used for Position-decision tallying under
 * REQUIRE_PHONE_VERIFICATION (Triarc Membership Code 2.4): resolveVote
 * itself stays fully generic and unaware of phone verification (it's shared,
 * unmodified, by every deployment); this is a pure post-filter over its
 * output rather than a phone-verification branch grafted into the
 * delegation-chain-resolution algorithm itself.
 */
export function filterTallyByEligibility(tally: VoteTally, eligible: (memberId: number) => boolean): VoteTally {
  const resolutions: Record<number, { val: boolean; how: string }> = {};
  let yes = 0;
  let no = 0;
  for (const [idStr, r] of Object.entries(tally.resolutions)) {
    if (!eligible(Number(idStr))) continue;
    resolutions[Number(idStr)] = r;
    if (r.val) yes++;
    else no++;
  }
  return { yes, no, participating: Object.keys(resolutions).length, resolutions };
}

// ---------- Position-decision target validation ----------
// Prompt27_SeatPlaceholderValidation.md. A Position decision's targetMemberId
// must resolve to a real member of the requesting community — never a
// Default-Delegate Mechanism seat placeholder (members.seatKind non-null;
// GET /proposals' target-member dropdown already excludes these, but that's
// client-facing only) and never a member row belonging to a different
// community (not checked anywhere before this pass either). Pure so the
// creation-time check (index.tsx's POST /proposals) and the
// ratification-time check (community.ts's closeOneVote — a second,
// independent guard, since a placeholder's seatKind is mutable state that
// can drift during a proposal's full deliberation/voting window) share one
// definition instead of two that could quietly drift apart.
export function isValidPositionTarget(target: { communityId: number; seatKind: string | null } | undefined | null, communityId: number): boolean {
  return !!target && target.communityId === communityId && target.seatKind === null;
}

// Same follow-up pass that added insertSectorTags' validation below — the
// same class of gap on a Position decision's targetSectorId:
// proposals.targetSectorId has a real
// FK to sectors.id (schema.ts), so a wholly nonexistent sector id already
// throws a raw DB error rather than silently inserting — but the FK can't
// know about community scoping, so a real sector id belonging to a
// *different* community passes it silently. Kept as a separate function
// from isValidPositionTarget rather than folded into it: sectors don't have
// a seatKind concept, the two validate different tables, and the two call
// sites (creation, ratification) already check both independently anyway.
export function isValidPositionSector(sector: { communityId: number } | undefined | null, communityId: number): boolean {
  return !!sector && sector.communityId === communityId;
}

// Same class of gap, a third instance: Contribution Code 8's Supporting
// Nominee nomination (POST /positions/:delegateRecognitionId/nominate)
// inserts a nomineeMemberId with no explicit check it belongs to this
// community — today that's only *incidentally* caught, because
// nomineeEligible's standing-credit lookup requires this-community
// contribution history a cross-community member can't have, so the
// nomination silently fails to qualify rather than actually succeeding. That's
// a side effect of an unrelated check, not a deliberate guard, so it gets
// the same explicit treatment as isValidPositionTarget/isValidPositionSector
// above rather than staying incidental. A distinct function from
// isValidPositionSector on purpose, even though the body is identical —
// different table, different call site, and a name that reads correctly at
// its own call site ("is this candidate a valid... member" vs. "...sector").
export function isValidPositionMember(nominee: { communityId: number } | undefined | null, communityId: number): boolean {
  return !!nominee && nominee.communityId === communityId;
}

// ---------- Sector-tag validation (proposal/contribution/opportunity sectorId inputs) ----------
// community.ts's insertSectorTags takes candidate sector ids straight from
// form input and needs to know which actually exist *in the requesting
// community* before inserting any of them — that DB lookup already scopes
// by communityId (so a cross-community sector id never even reaches
// `existingIds` here), leaving this the pure, unit-testable core: given
// what came back from the DB, which of the candidates survive. Split out
// the same way isValidPositionTarget/isValidPositionSector are, so the
// filtering logic is testable without a database.
export function filterExistingIds(candidateIds: number[], existingIds: number[]): number[] {
  const existing = new Set(existingIds);
  return candidateIds.filter((id) => existing.has(id));
}

// ---------- Founding criteria (Charter 9.2) ----------

export interface FoundingProgress {
  members: number;
  active: number;
  proposalsCompleted: number;
  liveDelegations: number;
  delegationsRenewedOrRevoked: number;
  majorityMinParticipationOver90d: boolean;
  allDomainsHaveVerifiedContribution: boolean;
}

export function foundingCriteriaMet(progress: FoundingProgress, criteria: FoundingCriteriaPhaseI): boolean {
  return (
    progress.members >= criteria.members &&
    progress.active >= criteria.active &&
    progress.proposalsCompleted >= criteria.proposals &&
    progress.liveDelegations >= criteria.delegations &&
    progress.delegationsRenewedOrRevoked >= criteria.delegationsRenewedOrRevoked &&
    progress.majorityMinParticipationOver90d &&
    progress.allDomainsHaveVerifiedContribution
  );
}

// ---------- Sustainability criteria (Charter 9.3) — pure core ----------
// MEASUREMENT ONLY: this round computes and displays Phase II's seven
// bullets. It does not close Phase II automatically, and reserveComputed's
// literal `false` type makes it impossible for sustainabilityCriteriaMet to
// ever return true this round — the Treasury bullet can never read "met"
// while the reserve-at-current-rate figure is uncomputable (no operating
// expenditure has ever been recorded; see community.ts's own check).
//
// community.ts bulk-fetches raw history once per computation (a fixed,
// small number of D1 queries, independent of window length) and calls the
// pure functions below once per sampled day — no D1 query happens inside
// this file. Every function here takes plain row arrays so it can be unit
// tested without a database.

export interface RawMemberRow {
  id: number;
  joinedAt: number;
  // Charter 1.3 — when the Member left, if they did. A Member counts as a
  // Member on `day` only if joined by then and not yet left.
  leftAt?: number | null;
}

// One row per (contribution, sector-tag) pair — a contribution with no
// sector tag appears once with sectorId null; one with several tags appears
// once per tag. Both shapes are handled: the active-member reconstruction
// below dedupes by memberId regardless of how many rows a member has on a
// given day, and the per-sector Steward check filters by sectorId directly.
export interface RawContributionRow {
  memberId: number;
  verifiedAt: number;
  sectorId: number | null;
}

export interface RawDelegationRow {
  memberId: number; // the delegator (granter) — matches delegations.memberId
  toMemberId: number; // the recipient
  sectorId: number | null; // null = entire
  grantedAt: number;
  revokedAt: number | null;
}

// Charter 9.1's own definition of "Active Member" — "at least one verified
// contribution in the trailing window" — reconstructed from the permanent,
// append-only contributions table. Deliberately NOT the same source as the
// live community.ts activeMemberCount (which reads members.lastActiveAt,
// touched by logins and other actions, not just contributions) — lastActiveAt
// has no history, only ever the latest value, so it cannot answer "how many
// were active as of 90 days ago." This reconstruction is arguably the more
// Charter-faithful of the two; the two can diverge in one direction (a
// member active only via login, never a contribution, counts toward
// lastActiveAt-based activeMemberCount but not here) — disclosed, not
// silently assumed equal. See mechanics.test.ts for where this is checked
// against activeMemberCount at ts=now.
function activeMemberIdsAt(contributions: RawContributionRow[], day: number, activeWindowDays: number, members?: RawMemberRow[]): Set<number> {
  const start = day - activeWindowDays * DAY_MS;
  const ids = new Set<number>();
  for (const c of contributions) if (c.verifiedAt <= day && c.verifiedAt >= start) ids.add(c.memberId);
  if (members) {
    // Charter 1.3 — a Member who had left by `day` is no longer Active then,
    // however recent their last contribution was.
    const present = new Set(members.filter((m) => memberPresentAt(m, day)).map((m) => m.id));
    for (const id of ids) if (!present.has(id)) ids.delete(id);
  }
  return ids;
}

function memberPresentAt(m: RawMemberRow, day: number): boolean {
  return m.joinedAt <= day && !(m.leftAt != null && m.leftAt <= day);
}

// members.joinedAt is permanent and never retroactively changed, so a
// point-in-time member count is just a filter — no reconstruction needed.
function memberCountAt(members: RawMemberRow[], day: number): number {
  let n = 0;
  for (const m of members) if (memberPresentAt(m, day)) n++;
  return n;
}

// "Live" matches computeFoundingProgress's own definition: granted within
// delegationExpiryDays of `day`, and not yet revoked as of `day`.
function liveDelegationsAt(delegations: RawDelegationRow[], day: number, expiryDays: number): RawDelegationRow[] {
  const expiryMs = expiryDays * DAY_MS;
  return delegations.filter((d) => d.grantedAt <= day && day - d.grantedAt <= expiryMs && (d.revokedAt === null || d.revokedAt > day));
}

// Charter 9.3 bullet 3's "no Member holds more than 10% of all delegated
// votes" — the same figure computeGovernanceHealth calls
// delegation.largestRecipientShare, reconstructed at an arbitrary past day
// instead of only "now".
export function maxDelegateShareAt(delegations: RawDelegationRow[], day: number, expiryDays: number): number {
  const live = liveDelegationsAt(delegations, day, expiryDays);
  if (live.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const d of live) counts.set(d.toMemberId, (counts.get(d.toMemberId) ?? 0) + 1);
  return Math.max(...counts.values()) / live.length;
}

// Charter 4.2's Civic Steward definition (civicStewardOf above): a live
// sector delegation AND sectorStandingCredits > 0 in that sector, both as of
// `day`. Standing credits themselves are already a trailing-window figure
// (standingWindowDays, default 365) ending at `day` — reconstructed the same
// way sectorStandingCredits queries it live, just from pre-fetched rows.
export function stewardsAt(
  contributions: RawContributionRow[],
  delegations: RawDelegationRow[],
  sectorIds: number[],
  day: number,
  expiryDays: number,
  standingWindowDays: number
): { stewardCount: number; sectorsCovered: number } {
  const standingStart = day - standingWindowDays * DAY_MS;
  const live = liveDelegationsAt(delegations, day, expiryDays);
  const stewardIds = new Set<number>();
  let sectorsCovered = 0;
  for (const sectorId of sectorIds) {
    const recipientsInSector = new Set(live.filter((d) => d.sectorId === null || d.sectorId === sectorId).map((d) => d.toMemberId));
    let sectorHasSteward = false;
    for (const c of contributions) {
      if (c.sectorId !== sectorId) continue;
      if (c.verifiedAt < standingStart || c.verifiedAt > day) continue;
      if (recipientsInSector.has(c.memberId)) {
        stewardIds.add(c.memberId);
        sectorHasSteward = true;
      }
    }
    if (sectorHasSteward) sectorsCovered++;
  }
  return { stewardCount: stewardIds.size, sectorsCovered };
}

export interface DailySamplingResult {
  membershipNonDeclining: boolean;
  membershipFloorHeldEveryDay: boolean;
  maxDelegateShareHeldEveryDay: boolean;
  stewardDepthHeldEveryDay: boolean;
  currentMembers: number;
  currentActive: number;
  currentMaxDelegateShare: number;
  currentStewardCount: number;
  currentSectorsWithStewardship: number;
}

/**
 * Charter 9.3's chapeau — "have held continuously across a trailing 180-day
 * window" — for the three bullets that are genuinely state conditions (true
 * or false at a given instant): membership's floor, delegation's max-share
 * ceiling, and leadership depth. Sampled once per day across the window,
 * from already-bulk-fetched rows — no D1 query in this function. "Net,
 * non-declining" (decision 1) is deliberately NOT strict every-day monotone:
 * a community with a normal daily wobble but a net rise across the window
 * still passes, checked only by comparing the window's two endpoints.
 */
export function sampleSustainabilityWindowDaily(
  ts: number,
  windowDays: number,
  memberRows: RawMemberRow[],
  contributionRows: RawContributionRow[],
  delegationRows: RawDelegationRow[],
  sectorIds: number[],
  activeWindowDays: number,
  delegationExpiryDays: number,
  standingWindowDays: number,
  criteria: FoundingCriteriaPhaseII
): DailySamplingResult {
  const windowStart = ts - windowDays * DAY_MS;
  let membershipFloorHeldEveryDay = true;
  let maxDelegateShareHeldEveryDay = true;
  let stewardDepthHeldEveryDay = true;
  let activeAtStart = 0;

  for (let i = 0; i <= windowDays; i++) {
    const day = windowStart + i * DAY_MS;
    const activeIds = activeMemberIdsAt(contributionRows, day, activeWindowDays, memberRows);
    const members = memberCountAt(memberRows, day);
    if (activeIds.size < criteria.active || members < criteria.members) membershipFloorHeldEveryDay = false;
    if (maxDelegateShareAt(delegationRows, day, delegationExpiryDays) > criteria.maxDelegateShare) maxDelegateShareHeldEveryDay = false;
    const { stewardCount, sectorsCovered } = stewardsAt(contributionRows, delegationRows, sectorIds, day, delegationExpiryDays, standingWindowDays);
    if (stewardCount < criteria.stewardsMin || sectorsCovered < criteria.stewardSectorsMin) stewardDepthHeldEveryDay = false;
    if (i === 0) activeAtStart = activeIds.size;
  }

  const currentActive = activeMemberIdsAt(contributionRows, ts, activeWindowDays, memberRows).size;
  const currentMembers = memberCountAt(memberRows, ts);
  const currentMaxDelegateShare = maxDelegateShareAt(delegationRows, ts, delegationExpiryDays);
  const { stewardCount: currentStewardCount, sectorsCovered: currentSectorsWithStewardship } = stewardsAt(
    contributionRows,
    delegationRows,
    sectorIds,
    ts,
    delegationExpiryDays,
    standingWindowDays
  );

  return {
    membershipNonDeclining: currentActive >= activeAtStart,
    membershipFloorHeldEveryDay,
    maxDelegateShareHeldEveryDay,
    stewardDepthHeldEveryDay,
    currentMembers,
    currentActive,
    currentMaxDelegateShare,
    currentStewardCount,
    currentSectorsWithStewardship,
  };
}

/**
 * Charter 9.3 bullet 3's "renewals functioning" (decision 2) — at least one
 * delegation lapsed or revoked and then renewed within the trailing window.
 * Windowed and causal: groups by (delegator, scope) exactly as
 * computeFoundingProgress's all-time approximation does, but additionally
 * sorts each group by grantedAt and requires the later grant to (a) fall
 * inside the window and (b) genuinely follow an ended predecessor (revoked
 * at-or-before the new grant, or lapsed via expiry) — not merely "granted
 * more than once ever," which Phase I's simpler all-time count accepts.
 */
export function renewalsFunctioningInWindow(delegationRows: RawDelegationRow[], ts: number, windowDays: number, expiryDays: number): boolean {
  const windowStart = ts - windowDays * DAY_MS;
  const expiryMs = expiryDays * DAY_MS;
  const groups = new Map<string, RawDelegationRow[]>();
  for (const r of delegationRows) {
    const key = `${r.memberId}:${r.sectorId ?? "entire"}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => a.grantedAt - b.grantedAt);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (next.grantedAt < windowStart || next.grantedAt > ts) continue;
      const prevEndedByRevoke = prev.revokedAt !== null && prev.revokedAt <= next.grantedAt;
      const prevEndedByLapse = prev.grantedAt + expiryMs <= next.grantedAt;
      if (prevEndedByRevoke || prevEndedByLapse) return true;
    }
  }
  return false;
}

/** Charter 9.3 bullet 5 — resolved dispute panels in the trailing window. */
export function disputePanelsResolvedInWindow(panelRows: { decidesBy: number; decidedAt: number | null }[], ts: number, windowDays: number): number {
  const windowStart = ts - windowDays * DAY_MS;
  return panelRows.filter((p) => p.decidedAt !== null && p.decidedAt <= p.decidesBy && p.decidedAt >= windowStart && p.decidedAt <= ts).length;
}

/**
 * Charter 9.3 bullet 4's dividend half (decision 4) — "at least 8
 * consecutive scheduled Civic Dividend distributions executed on time,"
 * measured over their own span (the clause's own carve-out from the
 * 180-day window — this function takes no windowDays). dividendRuns stores
 * the real execution time (periodEnd), not a theoretical schedule — nothing
 * in this build records a schedule separately — so "on time" compares each
 * run to the PREVIOUS run's periodEnd with a 10% tolerance. The very first
 * run has no previous run: its baseline is dividendActivatedAt (Treasury
 * 5.1 — when the cycle itself started), which is exactly as principled a
 * reference point as any later run's predecessor. Counts the longest streak
 * ending at the most recent run — a late run resets the streak to 0 (it
 * doesn't count toward any streak, including a fresh one), it doesn't end
 * the criterion forever.
 */
export function consecutiveOnTimeDividendRuns(runs: { periodEnd: number }[], dividendActivatedAt: number | null, periodDays: number): number {
  if (dividendActivatedAt === null || runs.length === 0) return 0;
  const sorted = [...runs].sort((a, b) => a.periodEnd - b.periodEnd);
  const toleranceMs = periodDays * DAY_MS * 1.1;
  let streak = 0;
  let prevEnd = dividendActivatedAt;
  for (const run of sorted) {
    streak = run.periodEnd - prevEnd <= toleranceMs ? streak + 1 : 0;
    prevEnd = run.periodEnd;
  }
  return streak;
}

/** Charter 9.3 bullet 2's rate half (Amendment E) — windowDays/30 average. */
export function proposalsPerMonthRate(completedCountInWindow: number, windowDays: number): number {
  return completedCountInWindow / (windowDays / 30);
}

/**
 * Charter 9.3 bullet 7 — founder-authored share of proposals completing the
 * full lifecycle across the window. Null (not a rate of 0) when there is no
 * founder on record yet, or nothing completed in the window to measure —
 * absence of evidence is not evidence of independence.
 */
export function founderProposalShareInWindow(completedProposalAuthors: number[], founderId: number | null): number | null {
  if (founderId === null || completedProposalAuthors.length === 0) return null;
  return completedProposalAuthors.filter((by) => by === founderId).length / completedProposalAuthors.length;
}

export interface SustainabilityProgress {
  computedAt: number;
  windowDays: number;
  historyDays: number;
  hasFullWindowHistory: boolean;

  members: number;
  active: number;
  membershipNonDeclining: boolean;
  membershipFloorHeldEveryDay: boolean;

  proposalsCompletedInWindow: number;
  proposalsPerMonth: number;
  participationRate: number;
  participationSampleCount: number;

  currentMaxDelegateShare: number;
  maxDelegateShareHeldEveryDay: boolean;
  renewalsFunctioning: boolean;

  consecutiveOnTimeDividendRunsCount: number;
  // Decision 3 — literally never true this round: there is no operating
  // expenditure recorded anywhere to measure a rate against. The literal
  // `false` type (not `boolean`) makes it a compile-time guarantee, not just
  // a runtime one, that sustainabilityCriteriaMet below can never read the
  // Treasury bullet as met while this is the case.
  reserveComputed: false;
  reserveNonStandardLedgerEntries: number;

  disputePanelsResolvedInWindow: number;

  currentStewardCount: number;
  currentSectorsWithStewardship: number;
  stewardDepthHeldEveryDay: boolean;

  founderId: number | null;
  founderProposalShareInWindow: number | null;
}

/**
 * Charter 9.3 — Phase II closes when all seven bullets hold. MEASUREMENT
 * ONLY this round (Amendment D): this function exists so progress can be
 * checked and displayed, not so a transition can fire from it — nothing in
 * this codebase calls this function to trigger a phase change.
 * reserveComputed's literal-false type means this can never return true
 * while that remains the case, which is every community running this build.
 */
export function sustainabilityCriteriaMet(progress: SustainabilityProgress, criteria: FoundingCriteriaPhaseII): boolean {
  if (!progress.hasFullWindowHistory) return false;
  if (progress.founderProposalShareInWindow === null) return false;
  return (
    progress.members >= criteria.members &&
    progress.active >= criteria.active &&
    progress.membershipNonDeclining &&
    progress.membershipFloorHeldEveryDay &&
    progress.proposalsPerMonth >= criteria.proposalsPerMonth &&
    progress.participationRate >= criteria.participationRate &&
    progress.maxDelegateShareHeldEveryDay &&
    progress.renewalsFunctioning &&
    progress.consecutiveOnTimeDividendRunsCount >= criteria.consecutiveDividendRuns &&
    progress.reserveComputed &&
    progress.disputePanelsResolvedInWindow >= criteria.disputePanels &&
    progress.stewardDepthHeldEveryDay &&
    progress.founderProposalShareInWindow < criteria.maxFounderProposalShare
  );
}
