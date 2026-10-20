// Phase 2 stage 4 — "Live in this community" values for the Documents
// reader. Every value here reads community.params or a live DB query the
// rest of the app already uses (CLASS_CONFIG, computeFoundingProgress,
// computePositionFillStatus) — never a parallel computation that could
// drift from mechanics.ts/community.ts's own numbers.
//
// Dividend language stays gated (Rules of Procedure 4.3 — no manufactured
// urgency, and the dividend itself is gated until Treasury 5.1 activates):
// every entry below either says "not yet active" with the real activation
// conditions, or — once activated — states that plainly, and nothing here
// ever implies a number is paying out before it is.
import { eq, and, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { members, sectors } from "../db/schema";
import { type Community, computeFoundingProgress, computePositionFillStatus, loadSustainabilitySnapshot, DIVIDEND_ACTIVATION_MEMBERS, now } from "./community";
import { CLASS_CONFIG, CLASS_LABEL, formatPercent, type ProposalClass } from "./params";
import { foundingCriteriaMet } from "./mechanics";

function livePct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export interface LiveValueEntry {
  label: string;
  value: string;
}

// Keyed by "documentSlug#clauseId" — the same key shape as
// DocumentsGenerated.referencedBy in documentsParser.ts.
export type LiveValues = Record<string, LiveValueEntry[]>;

const REAL_MEMBER = isNull(members.seatKind);

async function verifiedMemberCount(db: Db, communityId: number): Promise<number> {
  const rows = await db.select({ id: members.id }).from(members).where(and(eq(members.communityId, communityId), REAL_MEMBER));
  return rows.length;
}

async function activeSectorNames(db: Db, communityId: number): Promise<string[]> {
  const rows = await db.select({ name: sectors.name }).from(sectors).where(and(eq(sectors.communityId, communityId), eq(sectors.active, 1)));
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));
}

// Charter 5.3a's own relation: full distribution needs one Member earning
// for every (multiple − s) ÷ (1 − s), where s is the Foundation Dividend's
// pool share. At the defaults (5, 0.5) this is 9 — "one in nine" — but
// both numbers move if either default moves, which is exactly why this is
// computed here rather than restated as a fixed figure anywhere.
export function oneInN(multiple: number, foundationShare: number): number | null {
  if (foundationShare >= 1) return null;
  return (multiple - foundationShare) / (1 - foundationShare);
}

export function formatOneInN(n: number | null): string {
  if (n === null || !isFinite(n) || n <= 0) return "not applicable at these settings";
  return `one Member in ${Math.round(n)}`;
}

// Rules of Procedure 1.3b's own rule: the greater of the percentage and the
// absolute floor, never more than the community itself has. Mirrors
// mechanics.ts's closeVote exactly (the one-line formula there, not
// exported separately) — if that formula ever changes, this one needs the
// same change, by design: there is nothing else participationNeed could
// mean here.
export function participationNeed(memberCount: number, cls: ProposalClass): number {
  const cfg = CLASS_CONFIG[cls];
  return Math.min(memberCount, Math.max(Math.ceil(memberCount * cfg.minParticipation), cfg.minParticipationMembers));
}

export function thresholdLabel(cls: ProposalClass): string {
  const cfg = CLASS_CONFIG[cls];
  if (cfg.threshold === 0.5) return "simple majority";
  if (Math.abs(cfg.threshold - 3 / 5) < 0.001) return "three-fifths";
  if (Math.abs(cfg.threshold - 2 / 3) < 0.001) return "two-thirds";
  return `${Math.round(cfg.threshold * 100)}%`;
}

/** Everything this function returns is read from params/live DB state —
 * nothing here is the document's own stated default, which the Reader
 * still renders from the generated module regardless of whether this
 * function ever runs at all. Callers (the /documents/:slug route) must
 * wrap this in a try/catch: a fresh or mid-migration local DB throwing here
 * must never take down clause reading itself — see the route for the
 * fallback (no live box, not an error, not a zero that looks real). */
export async function computeLiveValues(db: Db, community: Community): Promise<LiveValues> {
  const params = community.params;
  const live: LiveValues = {};

  const memberCount = await verifiedMemberCount(db, community.id);
  const positionFill = await computePositionFillStatus(db, community.id);
  const activated = community.dividendActivatedAt !== null;

  const activationEntries: LiveValueEntry[] = activated
    ? [{ label: "Foundation Dividend", value: "Active — permanent once activated, never re-gated (Treasury Code 5.1)." }]
    : [
        { label: "Foundation Dividend", value: "Not yet active." },
        { label: "Verified Members", value: `${memberCount} of ${DIVIDEND_ACTIVATION_MEMBERS} required` },
        { label: "Delegate Positions filled", value: positionFill.totalSectors > 0 ? `${positionFill.filledSectors} of ${positionFill.totalSectors}` : "no sectors defined yet" },
      ];
  live["treasury-code#5.1"] = activationEntries;
  live["treasury-code#5.1a"] = activationEntries;

  const n = oneInN(params.dividendCapMultiple, params.foundationPoolShare);
  const capEntries: LiveValueEntry[] = [
    { label: "Accrual cap", value: `${params.dividendCapMultiple}× an equal share, both tiers combined` },
    { label: "Foundation Dividend share", value: `${formatPercent(params.foundationPoolShare)} of the pool` },
    { label: "Full distribution needs", value: `${formatOneInN(n)} contributing that cycle, at current settings` },
  ];
  live["charter#5.3"] = capEntries;
  live["charter#5.3a"] = capEntries;

  const foundationEntries: LiveValueEntry[] = [{ label: "Pool share", value: `${formatPercent(params.foundationPoolShare)} of new money each cycle` }, ...activationEntries];
  live["treasury-code#5.4"] = foundationEntries;
  live["treasury-code#5.4a"] = foundationEntries;

  // Charter Article IX — Phase I is genuinely computed; Phase II is not
  // (Phase 1 app review finding H3). Say so plainly rather than implying a
  // data/time limitation that would overstate how built it is.
  const progress = await computeFoundingProgress(db, community, now(community));
  const phase1Met = foundingCriteriaMet(progress, params.criteria.phase1);
  live["charter#9.2"] = [
    { label: "Verified Members", value: `${progress.members} of ${params.criteria.phase1.members} (${progress.active} of ${params.criteria.phase1.active} Active)` },
    { label: "Proposals completed", value: `${progress.proposalsCompleted} of ${params.criteria.phase1.proposals}` },
    { label: "Live delegations", value: `${progress.liveDelegations} of ${params.criteria.phase1.delegations}` },
    { label: "Phase I criteria", value: phase1Met ? "all met" : "not yet all met" },
  ];
  // Charter 9.3 — Phase II, one entry per bullet, read from the cached
  // daily snapshot (tick() computes it at most once per 24h; see
  // community.ts's computeSustainabilityProgress). Measurement only — no
  // row here implies a transition will occur because a criterion reads met.
  const c2 = params.criteria.phase2;
  const snapshot = await loadSustainabilitySnapshot(db, community.id);
  if (snapshot === null) {
    live["charter#9.3"] = [{ label: "Phase II tracking", value: "Not computed yet — the first daily computation runs automatically on the next page load." }];
  } else {
    const sp = snapshot.progress;
    const windowNote = sp.hasFullWindowHistory ? "" : ` (the window needs ${sp.windowDays} days of history; this community has ${Math.max(0, sp.historyDays)})`;
    live["charter#9.3"] = [
      { label: "1. Membership", value: `${sp.members} of ${c2.members} verified (${sp.active} of ${c2.active} Active) — non-declining: ${sp.membershipNonDeclining ? "yes" : "not yet"}, floor held every day: ${sp.membershipFloorHeldEveryDay ? "yes" : "not yet"}${windowNote}` },
      { label: "2. Governance cadence", value: `${Math.round(sp.proposalsPerMonth * 10) / 10} of ${c2.proposalsPerMonth}+ proposals/month; ${sp.participationSampleCount > 0 ? `minimum participation met in ${livePct(sp.participationRate)} of the ${sp.participationSampleCount} votes closed in the window` : "no votes have closed in the window yet"} (need ${livePct(c2.participationRate)})` },
      { label: "3. Delegation health", value: `largest recipient share ${livePct(sp.currentMaxDelegateShare)} (ceiling ${livePct(c2.maxDelegateShare)}, held every day: ${sp.maxDelegateShareHeldEveryDay ? "yes" : "not yet"}); renewals functioning: ${sp.renewalsFunctioning ? "yes" : "not yet"}` },
      { label: "4. Treasury self-sustaining", value: `${sp.consecutiveOnTimeDividendRunsCount} of ${c2.consecutiveDividendRuns} consecutive on-time dividend runs; reserve coverage: not computed — no operating expenditure has ever been recorded` },
      { label: "5. Dispute system exercised", value: `${sp.disputePanelsResolvedInWindow} of ${c2.disputePanels} panels resolved within their windows, in the trailing window` },
      { label: "6. Leadership depth", value: `${sp.currentStewardCount} of ${c2.stewardsMin} Civic Stewards, spanning ${sp.currentSectorsWithStewardship} of ${c2.stewardSectorsMin} sectors (held every day: ${sp.stewardDepthHeldEveryDay ? "yes" : "not yet"})` },
      {
        label: "7. Runs without its founder",
        value:
          sp.founderProposalShareInWindow === null
            ? sp.founderId === null
              ? "Not computed — founder not recorded"
              : "No proposals have completed the full lifecycle in the window yet"
            : `founder-authored share ${livePct(sp.founderProposalShareInWindow)} (ceiling ${livePct(c2.maxFounderProposalShare)})`,
      },
      { label: "As of", value: new Date(snapshot.computedAt).toDateString() },
    ];
  }

  // Rules of Procedure 1.3/1.3b — what each class's threshold means in
  // actual votes at the current verified membership.
  const classEntries: LiveValueEntry[] = (Object.keys(CLASS_CONFIG) as ProposalClass[]).map((cls) => ({
    label: CLASS_LABEL[cls],
    value: `${thresholdLabel(cls)}, at least ${participationNeed(memberCount, cls)} of ${memberCount} verified Members participating`,
  }));
  live["rules-of-procedure#1.3"] = classEntries;
  live["rules-of-procedure#1.3b"] = classEntries;

  // Contribution Code 2.3 — this community's actual sector list.
  const sectorNames = await activeSectorNames(db, community.id);
  live["contribution-code#2.3"] = [{ label: "Current sectors", value: sectorNames.length > 0 ? sectorNames.join(", ") : "none seeded yet" }];

  // Charter 3.3 — delegation expiry periods in force.
  live["charter#3.3"] = [
    { label: "Ordinary renewal cycle", value: `${params.delegationExpiryDays} days` },
    { label: "Critical renewal cycle", value: `${params.delegationExpiryCriticalDays} days` },
  ];

  // Charter 4.7-4.9 — the recall-band thresholds this community currently
  // has configured (percentages/days are params-level "current settings",
  // not a live per-Delegate computation of who is in the band right now).
  const recallEntries: LiveValueEntry[] = [
    { label: "Installation threshold (4.3)", value: `${formatPercent(params.delegateThreshold)} of sector delegation` },
    { label: "Sustaining floor (4.7)", value: formatPercent(params.delegateSustainingFloor) },
    { label: "Recall trigger (4.8)", value: formatPercent(params.delegateRecallTrigger) },
    { label: "Grace period (4.9)", value: `${params.delegateGraceDays} days` },
  ];
  live["charter#4.7"] = recallEntries;
  live["charter#4.8"] = recallEntries;
  live["charter#4.9"] = recallEntries;

  return live;
}
