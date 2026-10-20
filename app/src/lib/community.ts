// Service layer: bridges the pure mechanics in mechanics.ts to D1. Every
// mutating route calls `tick()` first so proposal stage transitions and
// dividend runs happen as a side effect of normal traffic, the same way the
// prototype recomputed everything from state on every render — no cron
// needed for that. The two time-based notification kinds at the bottom of
// this file (Enterprise_and_Community_Roadmap.md Phase 2) are the one
// exception: nothing browses to a page daily just to have them notice a
// vote closing soon, so they run from a real Cloudflare Cron Trigger
// (index.tsx's scheduled() export) instead.

import { eq, and, or, isNull, isNotNull, gte, lte, desc, sql, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  PANEL_DRAW_METHOD,
  drandRoundAfter,
  fetchDrandBeacon,
  drawSeed,
  selectPanel,
  canonicalPool,
  type BeaconFetch,
} from "./panelDraw";
import {
  conductOutcome,
  isProvisionId,
  provisionName,
  sanctionKind,
  stepOfSanctionKind,
  SANCTION_STEPS,
  ACCRUAL_SUSPENSION_DAYS,
  PARTICIPATION_SUSPENSION_DAYS,
  REVOCATION_HOLD_DAYS,
  INTERIM_MEASURE_HOURS,
} from "./conduct";
import {
  communities,
  members,
  delegations,
  proposals,
  votes,
  contributions,
  contributionSectors,
  attestations,
  treasuryLedger,
  treasuryState,
  dividendRuns,
  sectors,
  proposalSectors,
  opportunitySectors,
  delegateRecognitions,
  supportingNominees,
  nominationChallenges,
  disputePanels,
  disputePanelMembers,
  disputePanelVotes,
  disputeDrawRequests,
  disputePanelDraws,
  conductReports,
  memberSanctions,
  moderators,
  interimMeasures,
  jointActions,
  concentrationReviews,
  positionSpokespersons,
  positionCompensationSplits,
  interimMeasureApprovals,
  proposalComments,
  sectorPosts,
  sectorPostComments,
  disputePanelParties,
  proposalDelegationSnapshots,
  businessPageFollows,
  minorityReports,
  securityEvents,
  memberSectorFollows,
  inAppNotifications,
  phoneVerificationAttempts,
  sustainabilitySnapshots,
  sessions,
  notificationPreferences,
  record as recordTable,
} from "../db/schema";
import { DEFAULT_PARAMS, CORE_SECTORS, TRIARC_SECTORS, CIVIC_SECTORS, DAY_MS, CLASS_CONFIG, DOMAINS, type CharterParams, type Domain, type ProposalClass } from "./params";
import { newSessionToken } from "./auth";
import { notify, type NotifyEnv } from "./notify";
import {
  resolveVote,
  closeVote,
  runFoundationAndCivicDividend,
  reciprocityMultipliers,
  civicStewardOf,
  isDelegateActive,
  isSupportingNomineeActive,
  disputePanelOutcome,
  snapshotToVotingMembers,
  eligiblePanelCandidates,
  type PanelCandidate,
  delegateTier,
  concentrationTier,
  graceExpired,
  isCloselyTied,
  delegationExpiryStatus,
  contributionClaimStatus,
  isPhoneVerified,
  isPositionVoteEligible,
  filterTallyByEligibility,
  isValidPositionTarget,
  isValidPositionSector,
  filterExistingIds,
  computeDomainIssuanceReport,
  applyDomainIssuanceCap,
  type DomainIssuanceReport,
  type VotingMember,
  type DelegationRef,
  type AttestationEvent,
  type FoundingProgress,
  type RawMemberRow,
  type RawContributionRow,
  type RawDelegationRow,
  type SustainabilityProgress,
  sampleSustainabilityWindowDaily,
  renewalsFunctioningInWindow,
  disputePanelsResolvedInWindow,
  consecutiveOnTimeDividendRuns,
  proposalsPerMonthRate,
  founderProposalShareInWindow,
  foundingCriteriaMet,
  nomineeEligible,
  isValidPositionMember,
} from "./mechanics";

// Dispute Procedure Code 2.2's default decision window, reused for the
// minimal Dispute Panel primitive (Contribution Code 8.6).
const DISPUTE_PANEL_WINDOW_DAYS = 14;
// Dispute Procedure Code 2.1 (Aug 2026 amendment: raised from 5).
export const DISPUTE_PANEL_SIZE = 11;
// Dispute Procedure Code 2.1 — the panel pool (Active Members who've ever
// volunteered, approximated here as all Active Members — this build has no
// separate volunteer opt-in) must hold at least this many before any panel
// is drawn (Aug 2026 amendment: raised from 15, to keep real margin now that
// a full draw is DISPUTE_PANEL_SIZE seats, not 5).
export const DISPUTE_PANEL_POOL_MINIMUM = 30;
// Dispute Procedure Code 4.2 — the accused's response window. Right IV of the
// Bill of Rights admits no exceptions to it.
export const DISPUTE_RESPONSE_WINDOW_DAYS = 7;
// Treasury Code 5.1 — the Foundation Dividend activation gate. Below ten
// Members an even share of the universal tier necessarily breaches charter
// 5.3's 10%-of-any-distribution cap, so the tier is unpayable, not merely
// small. Thirty clears that with margin and matches DISPUTE_PANEL_POOL_MINIMUM.
export const DIVIDEND_ACTIVATION_MEMBERS = 30;

// Contribution Code 1.4-1.6 — a verified contribution must be actively
// claimed by the member within this many days of verification before it
// counts toward standing or any dividend. Unclaimed past this window, it
// stays on the permanent record marked unclaimed, but never accrues.
export const CONTRIBUTION_CLAIM_WINDOW_DAYS = 60;

// Triarc Membership Code 2.1 (Prompt25_PathA_MembershipEnforcement.md) —
// app-side rate limit on how often a member may (re)start phone
// verification, independent of whatever limits Twilio Verify itself
// enforces server-side. Small and generous — this exists to stop obvious
// abuse (hammering the endpoint), not to second-guess Twilio's own limits.
export const PHONE_VERIFICATION_MAX_ATTEMPTS_PER_DAY = 5;

/** The member's current verified-phone timestamp, or null if never verified — fetched fresh from the DB since the session object doesn't carry it. */
export async function getPhoneVerifiedAt(db: Db, memberId: number): Promise<number | null> {
  const [m] = await db.select({ phoneVerifiedAt: members.phoneVerifiedAt }).from(members).where(eq(members.id, memberId));
  return m?.phoneVerifiedAt ?? null;
}

export interface Community {
  id: number;
  // Deployment identity/branding is not a literal string in the views: the
  // same compiled Worker code can serve more than one deployment, each with
  // its own D1 database. Reading it off this row (already loaded on every
  // request via ensureCommunity) is what lets layout.tsx, auth.tsx,
  // treasury.tsx, notify.ts, and index.tsx's join-record message render the
  // right name without a separate config system.
  name: string;
  params: CharterParams;
  clockOffsetMs: number;
  // Treasury Code 5.1 — null until the Foundation Dividend activation gate is
  // first cleared; set once and never cleared thereafter.
  dividendActivatedAt: number | null;
  // When this deployment was created — Charter 9.3's "how much history
  // exists at all" floor for the Sustainability Criteria's 180-day window.
  createdAt: number;
  // Charter 9.3's "the community runs without its founder" criterion. Null
  // until set — see schema.ts's own comment on this column for how it gets
  // set, and why it is never shown publicly.
  founderId: number | null;
}

// useTriarcSectors (Prompt35, Triarc_Operations_Code.md) selects which sector
// list seeds: TRIARC_SECTORS (three, matched to what the Triarc actually
// does) instead of the organisational six-sector CORE_SECTORS, gated on the
// TRIARC_OPERATING_SECTORS var. A deployment that leaves it unset keeps
// CORE_SECTORS.
export async function ensureCommunity(db: Db, useTriarcSectors: boolean = false, useCivicSectors: boolean = false): Promise<Community> {
  const existing = await db.select().from(communities).limit(1);
  let community: Community;
  if (existing.length) {
    const c = existing[0];
    let parsed = JSON.parse(c.params);
    // Founding Charter 9.2/9.3 as amended 10 Oct 2026. A community created
    // before then stored the old Article IX defaults (500/100 and 2,000/300),
    // which override the new defaults on merge. If — and only if — it still
    // holds exactly those untouched old values, move it to the new ones once
    // and say so on the public record: a Phase I parameter change, which 9.2
    // requires to be recorded publicly. The conditional UPDATE ... RETURNING
    // makes it happen exactly once even if two requests race.
    const oc = parsed.criteria;
    if (
      oc?.phase1?.members === 500 && oc?.phase1?.active === 100 &&
      oc?.phase2?.members === 2000 && oc?.phase2?.active === 300
    ) {
      const migrated = {
        ...parsed,
        criteria: {
          phase1: { ...oc.phase1, members: DEFAULT_PARAMS.criteria.phase1.members, active: DEFAULT_PARAMS.criteria.phase1.active },
          phase2: {
            ...oc.phase2,
            members: DEFAULT_PARAMS.criteria.phase2.members,
            active: DEFAULT_PARAMS.criteria.phase2.active,
            maxFounderProposalShare: DEFAULT_PARAMS.criteria.phase2.maxFounderProposalShare,
          },
        },
      };
      const updated = await db
        .update(communities)
        .set({ params: JSON.stringify(migrated) })
        .where(and(eq(communities.id, c.id), eq(communities.params, c.params)))
        .returning({ id: communities.id });
      if (updated.length === 1) {
        parsed = migrated;
        await writeRecord(
          db,
          c.id,
          "record",
          `Founding criteria updated to match Article IX of the Founding Charter as now published: Phase I closes at ${DEFAULT_PARAMS.criteria.phase1.members} verified Members (${DEFAULT_PARAMS.criteria.phase1.active} Active), Phase II at ${DEFAULT_PARAMS.criteria.phase2.members} (${DEFAULT_PARAMS.criteria.phase2.active} Active), and Phase II now also requires founder-authored proposals to be under ${Math.round(DEFAULT_PARAMS.criteria.phase2.maxFounderProposalShare * 100)}% of those completed. The old thresholds were 500 (100 Active) and 2,000 (300 Active). A Phase I parameter change, recorded here as Charter 9.2 requires, and reversible by ordinary proposal in later phases.`,
          null,
          Date.now()
        );
      }
    }
    // Merge shim: an older communities.params blob may predate the
    // phase1/phase2 criteria reshape or newer top-level fields — fall back
    // to defaults for anything missing rather than crash.
    const params: CharterParams = {
      ...DEFAULT_PARAMS,
      ...parsed,
      criteria: parsed.criteria?.phase1
        ? {
            phase1: { ...DEFAULT_PARAMS.criteria.phase1, ...parsed.criteria.phase1 },
            phase2: { ...DEFAULT_PARAMS.criteria.phase2, ...(parsed.criteria.phase2 ?? {}) },
          }
        : DEFAULT_PARAMS.criteria,
    };
    community = { id: c.id, name: c.name, params, clockOffsetMs: c.clockOffsetMs, dividendActivatedAt: c.dividendActivatedAt, createdAt: c.createdAt, founderId: c.founderId };
  } else {
    const ts = Date.now();
    const [c] = await db
      .insert(communities)
      .values({ name: "The Triarc", params: JSON.stringify(DEFAULT_PARAMS), createdAt: ts, clockOffsetMs: 0 })
      .returning();
    await db.insert(treasuryState).values({ communityId: c.id, opsBalance: 0, dividendBalance: 0, reserveBalance: 0, lastDividendAt: ts, dividendsPaid: 0 });
    community = { id: c.id, name: c.name, params: DEFAULT_PARAMS, clockOffsetMs: 0, dividendActivatedAt: null, createdAt: ts, founderId: null };
  }

  // Seed the founding sector list if this community (fresh or migrated) has
  // none yet — Contribution Code 2.3.
  const existingSectors = await db.select({ id: sectors.id }).from(sectors).where(eq(sectors.communityId, community.id)).limit(1);
  if (existingSectors.length === 0) {
    const ts = Date.now();
    for (const name of useTriarcSectors ? TRIARC_SECTORS : useCivicSectors ? CIVIC_SECTORS : CORE_SECTORS) {
      await db.insert(sectors).values({ communityId: community.id, name, active: 1, createdAt: ts });
    }
  }

  return community;
}

export function now(c: Community): number {
  return Date.now() + c.clockOffsetMs;
}

export async function writeRecord(db: Db, communityId: number, kind: string, text: string, memberId: number | null, ts: number) {
  await db.insert(recordTable).values({ communityId, kind, text, memberId, occurredAt: ts });
}

export async function touchMember(db: Db, memberId: number, ts: number) {
  await db.update(members).set({ lastActiveAt: ts }).where(eq(members.id, memberId));
}

/**
 * Charter 9.3's founder-independence criterion needs a founder on record.
 * Called from /register right after a new Member's row is written. Auto-
 * sets founder_id ONLY when this is a freshly seeded community: `newMemberId`
 * must be the community's only REAL Member (Default-Delegate seat
 * placeholders are excluded — they can exist before any human registers,
 * so a raw row count would wrongly disqualify a genuinely-first human
 * registrant). On any community that already had a real Member when this
 * column was added, this never fires — the live community's founder is set
 * once, by hand, by the founder themself. The UPDATE is itself conditioned
 * on founder_id still being null (not just the in-memory `community.founderId`
 * this function was handed), so two concurrent first-registrations can't
 * both win.
 */
export async function maybeSetFounderOnRegistration(db: Db, community: Community, newMemberId: number): Promise<void> {
  if (community.founderId !== null) return;
  const realMembers = await db.select({ id: members.id }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  if (realMembers.length !== 1) return;
  await db.update(communities).set({ founderId: newMemberId }).where(and(eq(communities.id, community.id), isNull(communities.founderId)));
}

/**
 * Charter 1.3 — "A Member may leave at any time. Their Contribution Record is
 * preserved as part of the public history. Their standing, and any
 * delegations they hold or have granted, lapse immediately."
 *
 * Leaving is final for the account (the name stays taken, because the record
 * still carries it). What changes, all at once:
 *  - every delegation they hold or have granted is revoked, so their standing
 *    and anyone's trust in them lapses and any Position they held falls into
 *    the normal grace-period handling;
 *  - they stop counting as a Member anywhere (REAL_MEMBER) and can't sign in;
 *  - their email and phone are scrubbed (Charter 7.2: only what a Member does
 *    is public, never who they are outside it) and the email is freed;
 *  - sessions, notification settings, follows and in-app notifications go;
 *  - their votes, proposals, contributions and attestations are untouched.
 */
export async function leaveMembership(
  db: Db,
  community: Community,
  memberId: number,
  ts: number
): Promise<{ ok: true } | { ok: false; reason: "not-a-member" | "already-left" }> {
  return endMembership(db, community, memberId, ts, "left");
}

/**
 * Ends a membership. Shared by leaving (Charter 1.3) and revocation by a
 * Dispute Panel (Charter 1.4, Code of Conduct 3.5); both lapse standing and
 * every delegation at once and remove the Member from every count. They differ
 * in what is kept: a Member who leaves has their email and phone removed from
 * the account, while a revoked Member's stay on the row (and their password
 * is untouched), so the person cannot simply register again with them and a
 * later overturn (Charter 6.3) can restore the account exactly.
 */
export async function endMembership(
  db: Db,
  community: Community,
  memberId: number,
  ts: number,
  mode: "left" | "revoked" | "underage"
): Promise<{ ok: true } | { ok: false; reason: "not-a-member" | "already-left" }> {
  const [m] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.communityId, community.id)));
  if (!m || m.seatKind !== null) return { ok: false, reason: "not-a-member" };
  if (m.leftAt !== null) return { ok: false, reason: "already-left" };

  await db.update(delegations).set({ revokedAt: ts }).where(and(eq(delegations.memberId, memberId), isNull(delegations.revokedAt)));
  await db.update(delegations).set({ revokedAt: ts }).where(and(eq(delegations.toMemberId, memberId), isNull(delegations.revokedAt)));

  // A Delegate who leaves or is revoked no longer holds a Position; a co-Delegate
  // left behind continues alone (Rules of Procedure 6.8).
  const heldPositions = await db
    .select({ id: delegateRecognitions.id })
    .from(delegateRecognitions)
    .where(and(eq(delegateRecognitions.memberId, memberId), isNull(delegateRecognitions.revokedAt)));
  await revokeRecognitions(db, community.id, heldPositions.map((r) => r.id), ts);

  await db.delete(sessions).where(eq(sessions.memberId, memberId));
  await db.delete(notificationPreferences).where(eq(notificationPreferences.memberId, memberId));
  await db.delete(inAppNotifications).where(eq(inAppNotifications.memberId, memberId));
  await db.delete(memberSectorFollows).where(eq(memberSectorFollows.memberId, memberId));
  await db.delete(businessPageFollows).where(eq(businessPageFollows.memberId, memberId));

  if (mode === "left" || mode === "underage") {
    await db
      .update(members)
      .set({
        leftAt: ts,
        email: `left-${memberId}@left.triarc.internal`,
        phone: null,
        passwordHash: `left-${newSessionToken()}`,
        salt: "left",
        disputePoolOptInAt: null,
      })
      .where(eq(members.id, memberId));
    await writeRecord(
      db,
      community.id,
      "member",
      mode === "underage"
        ? `${m.name}'s account was closed under the minimum-age rule (Charter 1.1) and its personal data deleted. Their Contribution Record remains part of the public history.`
        : `${m.name} left ${community.name}. Their Contribution Record remains part of the public history (Charter 1.3).`,
      memberId,
      ts
    );
  } else {
    await db.update(members).set({ leftAt: ts, revokedAt: ts, disputePoolOptInAt: null }).where(eq(members.id, memberId));
    await writeRecord(
      db,
      community.id,
      "member",
      `${m.name}'s membership was revoked by a Dispute Panel (Code of Conduct 3.5, Charter 1.4). Their Contribution Record remains part of the public history.`,
      memberId,
      ts
    );
  }
  return { ok: true };
}

/**
 * Founding Charter 1.1 — the minimum age. When it becomes known that a Member is
 * under eighteen, a moderator (or the founder, who is a Member of the Triarc first)
 * closes the account: sessions end, email and phone are wiped, and the public
 * Contribution Record stays under the handle. The person may join again at eighteen.
 */
export async function closeUnderageAccount(
  db: Db,
  community: Community,
  actorId: number,
  targetName: string,
  ts: number
): Promise<{ ok: true } | { ok: false; reason: "not-authorised" | "not-found" | "already-left" }> {
  const authorised = community.founderId === actorId || (await isModerator(db, community, actorId, ts));
  if (!authorised) return { ok: false, reason: "not-authorised" };
  const [target] = await db.select({ id: members.id }).from(members).where(and(eq(members.communityId, community.id), eq(members.name, targetName.trim())));
  if (!target) return { ok: false, reason: "not-found" };
  const res = await endMembership(db, community, target.id, ts, "underage");
  if (!res.ok) return { ok: false, reason: res.reason === "already-left" ? "already-left" : "not-found" };
  return { ok: true };
}

// Enterprise_and_Community_Roadmap.md Phase 1 — non-public security audit
// log, distinct from writeRecord/the public `record` table above precisely
// because this one is allowed to carry ip/userAgent. No UI reads this in
// this pass — storage and writes only.
export async function logSecurityEvent(
  db: Db,
  communityId: number,
  kind: string,
  memberId: number | null,
  ip: string | null,
  userAgent: string | null,
  detail: string | null,
  ts: number
) {
  await db.insert(securityEvents).values({ communityId, kind, memberId, ip, userAgent, detail, occurredAt: ts });
}

/** All non-revoked delegation rows per member, keyed by memberId — a member may hold several (sector-scoped) or one (entire). */
/**
 * Rules of Procedure 3.3 — a revocation takes effect instantly on every vote
 * that is currently open, by marking the matching row in each proposal's
 * vote-open snapshot. Only the delegated weight stops flowing; the delegate's
 * own ballot is untouched, because Member Bill of Rights II permits no
 * exception to a Member's own vote but membership revocation under Right IV.
 *
 * A RENEWAL must never call this. Renewing revokes and re-grants the same
 * delegation to reset its expiry clock, which reaffirms it — treating that as
 * a withdrawal would silently drop the delegator's weight out of every open
 * vote at the exact moment they acted to keep it.
 */
export async function revokeOpenVoteSnapshots(
  db: Db,
  communityId: number,
  memberId: number,
  toMemberId: number,
  sectorId: number | null,
  ts: number
): Promise<number> {
  const open = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.communityId, communityId), eq(proposals.stage, "voting")));
  if (open.length === 0) return 0;
  await db
    .update(proposalDelegationSnapshots)
    .set({ revokedAt: ts })
    .where(
      and(
        inArray(proposalDelegationSnapshots.proposalId, open.map((o) => o.id)),
        eq(proposalDelegationSnapshots.memberId, memberId),
        eq(proposalDelegationSnapshots.toMemberId, toMemberId),
        sectorId === null ? isNull(proposalDelegationSnapshots.sectorId) : eq(proposalDelegationSnapshots.sectorId, sectorId),
        isNull(proposalDelegationSnapshots.revokedAt)
      )
    );
  return open.length;
}

export async function loadMemberDelegations(db: Db, communityId: number): Promise<Map<number, DelegationRef[]>> {
  const rows = await db
    .select({ memberId: delegations.memberId, toId: delegations.toMemberId, grantedAt: delegations.grantedAt, sectorId: delegations.sectorId })
    .from(delegations)
    .innerJoin(members, eq(delegations.memberId, members.id))
    .where(and(eq(members.communityId, communityId), isNull(delegations.revokedAt)))
    .orderBy(delegations.grantedAt);
  const map = new Map<number, DelegationRef[]>();
  for (const r of rows) {
    const arr = map.get(r.memberId) ?? [];
    arr.push({ toId: r.toId, grantedAt: r.grantedAt, sectorId: r.sectorId });
    map.set(r.memberId, arr);
  }
  return map;
}

// Default-Delegate Mechanism seat placeholders (seatKind="default_delegate_seat",
// renamed from "path_a_seat" in the Aug 2026 documentation amendment — see
// CLAUDE.md's Naming section) never log in or vote — they must never count
// toward the voting-member denominator (quorum/participation math), the
// active-member stat, a Dispute Panel's eligible pool, Founding Criteria,
// /governance-health, or Foundation Dividend eligibility. Every members
// query in this file that feeds one of those filters them out; see each
// call site's own comment for why.
// A current Member: not a Default-Delegate Mechanism seat placeholder, and
// not someone who has left (Charter 1.3). Every count, quorum, dividend and
// eligibility list uses this; display lookups of past authors don't.
export const REAL_MEMBER = and(isNull(members.seatKind), isNull(members.leftAt));
// Every real person who ever joined, including those who have left — for the
// historical Phase II reconstruction, which needs their leftAt.
const EVER_REAL_MEMBER = isNull(members.seatKind);

export async function loadVotingMembers(db: Db, communityId: number): Promise<VotingMember[]> {
  const rows = await db.select({ id: members.id }).from(members).where(and(eq(members.communityId, communityId), REAL_MEMBER));
  const dmap = await loadMemberDelegations(db, communityId);
  return rows.map((m) => ({ id: m.id, delegations: dmap.get(m.id) ?? [] }));
}

/**
 * Inserts a live delegation, or reports that one of the same scope already
 * exists. The unique indexes on `delegations` (Charter 3.4) are the real guard;
 * this turns their refusal into `false` so a double-submitted form is a no-op
 * rather than an error page. Any other failure is rethrown.
 */
export async function insertDelegationOnce(db: Db, row: typeof delegations.$inferInsert): Promise<boolean> {
  try {
    await db.insert(delegations).values(row);
    return true;
  } catch (e) {
    if (/UNIQUE constraint failed|constraint failed.*delegations/i.test(String((e as Error)?.message ?? e))) return false;
    throw e;
  }
}

/** All current (non-revoked) delegation rows for a member — may include several sector-scoped rows, or one entire row. May be expired — callers check liveness. */
export async function currentDelegationRows(
  db: Db,
  memberId: number
): Promise<{ id: number; toId: number; grantedAt: number; sectorId: number | null }[]> {
  return db
    .select({ id: delegations.id, toId: delegations.toMemberId, grantedAt: delegations.grantedAt, sectorId: delegations.sectorId })
    .from(delegations)
    .where(and(eq(delegations.memberId, memberId), isNull(delegations.revokedAt)))
    .orderBy(desc(delegations.grantedAt));
}

/**
 * Adds to the three treasury balances as ONE atomic SQL increment
 * (balance = balance + n), never read-then-write. Two donations landing in the
 * same instant used to be able to overwrite each other and silently lose an
 * increment; the database now does the addition, so neither can be lost.
 */
export async function addToTreasury(
  db: Db,
  communityId: number,
  amounts: { ops: number; dividend: number; reserve: number }
): Promise<void> {
  await db
    .update(treasuryState)
    .set({
      opsBalance: sql`${treasuryState.opsBalance} + ${amounts.ops}`,
      dividendBalance: sql`${treasuryState.dividendBalance} + ${amounts.dividend}`,
      reserveBalance: sql`${treasuryState.reserveBalance} + ${amounts.reserve}`,
    })
    .where(eq(treasuryState.communityId, communityId));
}

/**
 * Claims the right to run one dividend cycle, at most once. The claim is a
 * conditional update on lastDividendAt: of two overlapping ticks (a page visit
 * and the daily cron, say) exactly one changes the row and gets `true`; the
 * other changes nothing and must not pay out a second time.
 */
export async function claimDividendRun(db: Db, communityId: number, previousRunAt: number, ts: number): Promise<boolean> {
  const claimed = await db
    .update(treasuryState)
    .set({ lastDividendAt: ts })
    .where(and(eq(treasuryState.communityId, communityId), eq(treasuryState.lastDividendAt, previousRunAt)))
    .returning({ communityId: treasuryState.communityId });
  return claimed.length === 1;
}

export async function treasuryTotalBalance(db: Db, communityId: number): Promise<number> {
  const [ts_] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, communityId));
  if (!ts_) return 0;
  return ts_.opsBalance + ts_.dividendBalance + ts_.reserveBalance;
}

/** One generic junction-insert helper reused by proposals/contributions/opportunities. */
// Prompt27_SeatPlaceholderValidation.md's follow-up: sectorId here comes
// straight from form input (a set of checkboxes, individually forgeable
// like any other field) with nothing downstream ever checking it against
// this community's own sector list. Unlike a Position decision's target
// (Prompt27), a stray or cross-community sector tag on a proposal,
// contribution, or opportunity isn't a governance-integrity problem — it's
// a data-quality one, and a low-stakes one (it's a *tag*, not something
// anyone's Position or standing turns on) — so the deliberate choice here
// is to filter silently rather than reject the whole submission or surface
// a "some sectors were dropped" notice. Returns the filtered, valid ids so
// a caller that *does* want to know can still find out, without forcing
// every call site to handle a case none of them currently need to.
export async function insertSectorTags(db: Db, kind: "proposal" | "contribution" | "opportunity", itemId: number, sectorIds: number[], communityId: number): Promise<number[]> {
  if (sectorIds.length === 0) return [];
  const existingRows = await db.select({ id: sectors.id }).from(sectors).where(and(eq(sectors.communityId, communityId), inArray(sectors.id, sectorIds)));
  const validIds = filterExistingIds(sectorIds, existingRows.map((r) => r.id));
  for (const sectorId of validIds) {
    if (kind === "proposal") await db.insert(proposalSectors).values({ proposalId: itemId, sectorId });
    else if (kind === "contribution") await db.insert(contributionSectors).values({ contributionId: itemId, sectorId });
    else await db.insert(opportunitySectors).values({ opportunityId: itemId, sectorId });
  }
  return validIds;
}

export async function activeMemberCount(db: Db, communityId: number, ts: number, activeWindowDays: number): Promise<number> {
  const windowStart = ts - activeWindowDays * DAY_MS;
  const rows = await db.select({ id: members.id }).from(members).where(and(eq(members.communityId, communityId), gte(members.lastActiveAt, windowStart), REAL_MEMBER));
  return rows.length;
}

/**
 * Charter 9.1's own definition of "Active Member": at least one verified
 * contribution in the trailing window. Used for the Phase I / Phase II
 * progress figures so both read the same number. Deliberately separate from
 * activeMemberCount above, which reads members.lastActiveAt (touched by
 * logins and other actions) and still drives the petition thresholds.
 */
export async function activeMemberCountByContribution(db: Db, communityId: number, ts: number, activeWindowDays: number): Promise<number> {
  const windowStart = ts - activeWindowDays * DAY_MS;
  const rows = await db
    .selectDistinct({ id: contributions.memberId })
    .from(contributions)
    .innerJoin(members, eq(members.id, contributions.memberId))
    .where(
      and(
        eq(contributions.communityId, communityId),
        isNotNull(contributions.verifiedAt),
        gte(contributions.verifiedAt, windowStart),
        lte(contributions.verifiedAt, ts),
        REAL_MEMBER
      )
    );
  return rows.length;
}

/**
 * For each member, count of live delegations (direct only, not transitive)
 * pointing to them that apply to `sectorId` — either scoped to that sector
 * or "entire" (Charter 4.2 doesn't distinguish delegation types when
 * defining Stewardship, so an entire delegation counts toward every
 * sector's total). Also returns the total live delegation count in scope,
 * for share computation (Charter 4.3's "delegations above a community-set
 * threshold").
 */
export async function sectorDelegationTotals(
  db: Db,
  communityId: number,
  sectorId: number,
  ts: number,
  expiryDays: number
): Promise<{ perMember: Map<number, number>; total: number }> {
  const dmap = await loadMemberDelegations(db, communityId);
  const perMember = new Map<number, number>();
  let total = 0;
  for (const refs of dmap.values()) {
    for (const d of refs) {
      if (ts - d.grantedAt > expiryDays * DAY_MS) continue;
      if (d.sectorId !== null && d.sectorId !== sectorId) continue;
      perMember.set(d.toId, (perMember.get(d.toId) ?? 0) + 1);
      total++;
    }
  }
  return { perMember, total };
}

/**
 * Sector-tagged, verified-and-claimed contribution Marks per member in the
 * trailing `windowDays` window — Contribution Code 1.3's standing window,
 * newly built here since nothing in the app implemented it before this
 * pass. Feeds Civic Steward eligibility, a yes/no threshold — a simple
 * count of verified sector-tagged contributions, not weighted by domain
 * share. Contribution Code 1.4-1.6 — only claimed contributions count
 * toward standing; a verified-but-pending or lapsed-unclaimed contribution
 * does not.
 */
export async function sectorStandingCredits(db: Db, communityId: number, sectorId: number, ts: number, windowDays: number): Promise<Map<number, number>> {
  const windowStart = ts - windowDays * DAY_MS;
  const rows = await db
    .select({ memberId: contributions.memberId })
    .from(contributions)
    .innerJoin(contributionSectors, eq(contributionSectors.contributionId, contributions.id))
    .where(
      and(
        eq(contributions.communityId, communityId),
        eq(contributionSectors.sectorId, sectorId),
        gte(contributions.verifiedAt, windowStart),
        lte(contributions.verifiedAt, ts),
        isNotNull(contributions.claimedAt)
      )
    );
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.memberId, (map.get(r.memberId) ?? 0) + 1);
  return map;
}

/**
 * All-time (not windowed) sector tags on a member's verified contributions —
 * feeds ranking overlap (Rules of Procedure 4.4). Deliberately a different,
 * broader window than Steward eligibility above: ranking wants breadth of
 * interest, Steward eligibility wants sustained recent engagement, per
 * Contribution Code 1.3.
 */
export async function memberContributionSectorTags(db: Db, communityId: number, memberId: number): Promise<number[]> {
  const rows = await db
    .select({ sectorId: contributionSectors.sectorId })
    .from(contributions)
    .innerJoin(contributionSectors, eq(contributionSectors.contributionId, contributions.id))
    .where(and(eq(contributions.communityId, communityId), eq(contributions.memberId, memberId), isNotNull(contributions.verifiedAt)));
  return [...new Set(rows.map((r) => r.sectorId))];
}

// Contribution Code 8.8 — a Supporting Nominee's public disclosure of their
// delegation and attestation history with the nominating Delegate and with
// each other Supporting Nominee under the same Position. Disclosure only:
// nothing here blocks an appointment, it feeds the existing 8.6
// challenge-by-vote mechanism if a Member believes a pattern is a problem.
export interface RelationshipTie {
  memberId: number;
  name: string;
  role: "delegate" | "co-nominee";
  delegatedToThem: boolean;
  delegatedFromThem: boolean;
  attestationsMade: number; // this Nominee attesting their contributions
  attestationsReceived: number; // them attesting this Nominee's contributions
}

export interface NomineeEntry {
  id: number; // supportingNominees.id
  memberId: number;
  name: string;
  title: string;
  nominatedAt: number;
  ties: RelationshipTie[];
}

export interface DelegateEntry {
  delegateRecognitionId: number;
  memberId: number;
  name: string;
  recognizedAt: number;
  nominees: NomineeEntry[];
  // Charter 4.10 — set when this Delegate holds the Position jointly with
  // another, closely-tied candidate (Rules of Procedure 6).
  coDelegate?: { memberId: number; name: string; recognitionId: number };
  // Rules of Procedure 6.6 / 6.7 — for a jointly held Position only.
  joint?: {
    spokespersonId: number | null;
    spokespersonHow: "agreement" | "larger-share" | null;
    split: { first: number; second: number; firstPct: number; secondPct: number; agreed: boolean } | null;
  };
}

export interface SectorDirectoryEntry {
  sectorId: number;
  sectorName: string;
  stewards: { memberId: number; name: string }[];
  delegates: DelegateEntry[];
}

/** Contribution Code 8.8 — every delegation pair a Member has ever granted, all-time (not just live), as "from:to" keys. History, not current status. */
async function loadDelegationPairs(db: Db, communityId: number): Promise<Set<string>> {
  const rows = await db
    .select({ memberId: delegations.memberId, toId: delegations.toMemberId })
    .from(delegations)
    .innerJoin(members, eq(delegations.memberId, members.id))
    .where(eq(members.communityId, communityId));
  return new Set(rows.map((r) => `${r.memberId}:${r.toId}`));
}

/** Contribution Code 8.8 — non-voided attestation counts per (attestor, contributor) pair, all-time. */
async function loadAttestationPairCounts(db: Db, communityId: number): Promise<Map<string, number>> {
  const rows = await db
    .select({ attestorId: attestations.attestorId, contributorId: contributions.memberId })
    .from(attestations)
    .innerJoin(contributions, eq(attestations.contributionId, contributions.id))
    .where(and(eq(contributions.communityId, communityId), isNull(attestations.voidedAt)));
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.attestorId}:${r.contributorId}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function buildTie(
  aId: number,
  bId: number,
  bName: string,
  bRole: "delegate" | "co-nominee",
  delegationPairs: Set<string>,
  attestationPairs: Map<string, number>
): RelationshipTie {
  return {
    memberId: bId,
    name: bName,
    role: bRole,
    delegatedToThem: delegationPairs.has(`${aId}:${bId}`),
    delegatedFromThem: delegationPairs.has(`${bId}:${aId}`),
    attestationsMade: attestationPairs.get(`${aId}:${bId}`) ?? 0,
    attestationsReceived: attestationPairs.get(`${bId}:${aId}`) ?? 0,
  };
}

/** Assembles the Directory/Team page's per-sector computed Stewards + stored-and-still-valid Delegates, each with their active Supporting Nominees. */
export async function computeStewardsAndDelegates(db: Db, community: Community, ts: number): Promise<SectorDirectoryEntry[]> {
  const sectorRows = await db.select().from(sectors).where(and(eq(sectors.communityId, community.id), eq(sectors.active, 1)));
  // A seat placeholder can never actually earn Civic Steward status (no
  // login means no verified contribution), so this exclusion is belt and
  // suspenders — but it's the same list this function later resolves
  // Delegate names against, so kept consistent regardless.
  const memberRows = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  const nameById = new Map(memberRows.map((m) => [m.id, m.name]));
  const recognitions = await db.select().from(delegateRecognitions).where(eq(delegateRecognitions.communityId, community.id));
  const allNominees = await db.select().from(supportingNominees).where(eq(supportingNominees.communityId, community.id));
  const delegationPairs = await loadDelegationPairs(db, community.id);
  const attestationPairs = await loadAttestationPairCounts(db, community.id);

  const out: SectorDirectoryEntry[] = [];
  for (const sector of sectorRows) {
    const { perMember, total } = await sectorDelegationTotals(db, community.id, sector.id, ts, community.params.delegationExpiryDays);
    const standing = await sectorStandingCredits(db, community.id, sector.id, ts, community.params.standingWindowDays);

    const stewards = memberRows
      .filter((m) => civicStewardOf((perMember.get(m.id) ?? 0) > 0, standing.get(m.id) ?? 0))
      .map((m) => ({ memberId: m.id, name: m.name }));

    const activeRecognitions = recognitions.filter((r) => r.sectorId === sector.id).filter((r) => isDelegateActive(r.revokedAt));
    const byId = new Map(activeRecognitions.map((r) => [r.id, r]));
    const sp = await currentSpokesperson(db, community, sector.id, ts);
    const split = await compensationSplitFor(db, community.id, sector.id);
    const delegates: DelegateEntry[] = activeRecognitions.map((r) => {
      // A jointly held Position's nominations belong to the Position, so both co-Delegates list the same ones.
      const holderIds = r.coDelegateOfId !== null && byId.has(r.coDelegateOfId) ? [r.id, r.coDelegateOfId] : [r.id];
      const activeNomineeRows = allNominees.filter((n) => holderIds.includes(n.delegateRecognitionId)).filter((n) => isSupportingNomineeActive(n.revokedAt, r.revokedAt));
      const delegateName = nameById.get(r.memberId) ?? "member";
      const nominees = activeNomineeRows.map((n) => {
        const ties: RelationshipTie[] = [buildTie(n.nomineeMemberId, r.memberId, delegateName, "delegate", delegationPairs, attestationPairs)];
        for (const other of activeNomineeRows) {
          if (other.id === n.id) continue;
          ties.push(buildTie(n.nomineeMemberId, other.nomineeMemberId, nameById.get(other.nomineeMemberId) ?? "member", "co-nominee", delegationPairs, attestationPairs));
        }
        return { id: n.id, memberId: n.nomineeMemberId, name: nameById.get(n.nomineeMemberId) ?? "member", title: n.title, nominatedAt: n.nominatedAt, ties };
      });
      const co = r.coDelegateOfId !== null ? byId.get(r.coDelegateOfId) : undefined;
      return {
        delegateRecognitionId: r.id,
        memberId: r.memberId,
        name: nameById.get(r.memberId) ?? "member",
        recognizedAt: r.recognizedAt,
        nominees,
        coDelegate: co ? { memberId: co.memberId, name: nameById.get(co.memberId) ?? "member", recognitionId: co.id } : undefined,
        joint: co ? { spokespersonId: sp?.memberId ?? null, spokespersonHow: sp?.how ?? null, split } : undefined,
      };
    });

    out.push({ sectorId: sector.id, sectorName: sector.name, stewards, delegates });
  }
  return out;
}

/**
 * Gathers, for each volunteer, the facts Dispute Procedure Code 2.2 needs.
 * The judgement itself lives in mechanics.ts's `eligiblePanelCandidates` so it
 * can be unit-tested; this function only runs the queries.
 */
async function buildPanelCandidates(
  db: Db,
  volunteerIds: number[],
  partyIds: number[],
  disputedContributionId: number | null,
  ts: number
): Promise<PanelCandidate[]> {
  // 2.2 — "anyone holding or granting an active delegation to or from a party
  // within the trailing 90 days". A delegation still open counts as active now,
  // so its effective last-active moment is `ts`; a revoked one's is revokedAt.
  const delegationTouch = new Map<number, number>();
  if (partyIds.length) {
    const rows = await db
      .select({ memberId: delegations.memberId, toMemberId: delegations.toMemberId, revokedAt: delegations.revokedAt })
      .from(delegations)
      .where(or(inArray(delegations.memberId, partyIds), inArray(delegations.toMemberId, partyIds)));
    for (const r of rows) {
      const counterparty = partyIds.includes(r.memberId) ? r.toMemberId : r.memberId;
      const at = r.revokedAt ?? ts;
      const prev = delegationTouch.get(counterparty);
      if (prev === undefined || at > prev) delegationTouch.set(counterparty, at);
    }
  }

  // 2.2 — "anyone who attested the disputed contribution".
  const attestors = new Set<number>();
  if (disputedContributionId !== null) {
    const rows = await db
      .select({ attestorId: attestations.attestorId })
      .from(attestations)
      .where(and(eq(attestations.contributionId, disputedContributionId), isNull(attestations.voidedAt)));
    for (const r of rows) attestors.add(r.attestorId);
  }

  // Panels that involve any of this dispute's parties — the basis for both
  // "pending dispute against a party" and "served on a panel involving the
  // same parties within the trailing 180 days".
  const pendingAgainstParty = new Set<number>();
  const lastPanelWithParties = new Map<number, number>();
  if (partyIds.length) {
    const related = await db
      .select({ panelId: disputePanelParties.panelId, decision: disputePanels.decision })
      .from(disputePanelParties)
      .innerJoin(disputePanels, eq(disputePanelParties.panelId, disputePanels.id))
      .where(inArray(disputePanelParties.memberId, partyIds));
    const relatedPanelIds = [...new Set(related.map((r) => r.panelId))];
    const openPanelIds = new Set(related.filter((r) => r.decision === null).map((r) => r.panelId));
    if (relatedPanelIds.length) {
      // A volunteer who is themselves a party to one of those still-open panels
      // has a pending dispute against a party.
      const otherParties = await db
        .select({ panelId: disputePanelParties.panelId, memberId: disputePanelParties.memberId })
        .from(disputePanelParties)
        .where(inArray(disputePanelParties.panelId, relatedPanelIds));
      for (const r of otherParties) {
        if (openPanelIds.has(r.panelId) && !partyIds.includes(r.memberId)) pendingAgainstParty.add(r.memberId);
      }
      const served = await db
        .select({ memberId: disputePanelMembers.memberId, drawnAt: disputePanelMembers.drawnAt })
        .from(disputePanelMembers)
        .where(inArray(disputePanelMembers.panelId, relatedPanelIds));
      for (const r of served) {
        const prev = lastPanelWithParties.get(r.memberId);
        if (prev === undefined || r.drawnAt > prev) lastPanelWithParties.set(r.memberId, r.drawnAt);
      }
    }
  }

  return volunteerIds.map((id) => ({
    memberId: id,
    isParty: partyIds.includes(id),
    delegationWithPartyAt: delegationTouch.get(id) ?? null,
    attestedDisputedContribution: attestors.has(id),
    hasPendingDisputeAgainstParty: pendingAgainstParty.has(id),
    lastPanelWithSamePartiesAt: lastPanelWithParties.get(id) ?? null,
  }));
}

export type PanelDeferralReason = "pool-below-minimum" | "too-many-exclusions" | "awaiting-randomness";

export interface PanelPoolResult {
  // Volunteers in the pool before 2.2's exclusions.
  poolSize: number;
  // Member ids still eligible after them (and after any extra exclusions).
  eligibleIds: number[];
  // Why no draw can happen yet, or null if one can.
  deferral: Exclude<PanelDeferralReason, "awaiting-randomness"> | null;
}

/**
 * The eligible pool for a Dispute Panel draw under Dispute Procedure Code 2.1
 * and 2.2.
 *
 * Order is load-bearing: volunteer pool -> 2.1 minimum -> 2.2 exclusions -> full
 * seats or defer. The 2.1 minimum used to be tested against every Active Member
 * BEFORE the exclusions, and the draw silently seated a short panel whenever the
 * post-exclusion pool held fewer than the seats needed. A short panel is not
 * cosmetic: 3.1 justifies eleven as "an odd number, large enough that majority
 * decisions (4.3) never tie", and an even panel would silently favour the
 * accused.
 *
 * `requireMinimumPool` is true for the first draw of a panel (2.1: "the pool
 * must hold at least 30 Members before any panel is drawn") and false for a
 * replacement after a decline (3.2), which only needs someone eligible left.
 */
export async function eligiblePanelPool(
  db: Db,
  communityId: number,
  partyMemberIds: number[],
  seats: number,
  ts: number,
  activeWindowDays: number,
  disputedContributionId: number | null,
  alsoExcludeIds: number[],
  requireMinimumPool: boolean
): Promise<PanelPoolResult> {
  const windowStart = ts - activeWindowDays * DAY_MS;
  // 2.1 — "Any Active Member may volunteer for the panel pool." Only
  // volunteers are in it; membership alone is not consent to serve.
  const volunteers = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.communityId, communityId),
        gte(members.lastActiveAt, windowStart),
        isNotNull(members.disputePoolOptInAt),
        REAL_MEMBER
      )
    );
  const poolSize = volunteers.length;
  if (requireMinimumPool && poolSize < DISPUTE_PANEL_POOL_MINIMUM) {
    return { poolSize, eligibleIds: [], deferral: "pool-below-minimum" };
  }
  const candidates = await buildPanelCandidates(db, volunteers.map((v) => v.id), partyMemberIds, disputedContributionId, ts);
  const excluded = new Set(alsoExcludeIds);
  const eligibleIds = eligiblePanelCandidates(candidates, ts).filter((id) => !excluded.has(id));
  if (eligibleIds.length < seats) return { poolSize, eligibleIds, deferral: "too-many-exclusions" };
  return { poolSize, eligibleIds, deferral: null };
}

// ---------- Panel draw requests (Dispute Procedure Code 2.1, 3.1, 3.2) ----------

export const PANEL_DECLINE_WINDOW_HOURS = 48;
const PANEL_DECIDE_WITHIN_DAYS = 14; // 4.3 — "within 14 days of seating"

export interface DrawParty {
  memberId: number;
  role: string; // "complainant" | "accused" | "subject"
}

/** Queues a draw. It is carried out by processDrawRequests — immediately if it can be, later if it cannot. */
export async function requestPanelDraw(
  db: Db,
  communityId: number,
  spec: {
    subjectKind: string;
    subjectId: number;
    panelId?: number | null;
    seq: number;
    seats: number;
    parties: DrawParty[];
    disputedContributionId?: number | null;
  },
  ts: number
): Promise<number> {
  const [row] = await db
    .insert(disputeDrawRequests)
    .values({
      communityId,
      subjectKind: spec.subjectKind,
      subjectId: spec.subjectId,
      panelId: spec.panelId ?? null,
      seq: spec.seq,
      seats: spec.seats,
      requestedAt: ts,
      partiesJson: JSON.stringify(spec.parties),
      disputedContributionId: spec.disputedContributionId ?? null,
    })
    .returning({ id: disputeDrawRequests.id });
  return row.id;
}

/** After a panel is first seated, point the case that asked for it at the panel. */
async function linkCaseToPanel(db: Db, req: { subjectKind: string; subjectId: number }, panelId: number): Promise<void> {
  if (req.subjectKind === "conduct-report") {
    await db.update(conductReports).set({ panelId }).where(eq(conductReports.id, req.subjectId));
  }
  if (req.subjectKind === "supporting-nominee-conduct") {
    await db
      .update(nominationChallenges)
      .set({ disputePanelId: panelId })
      .where(
        and(
          eq(nominationChallenges.supportingNomineeId, req.subjectId),
          eq(nominationChallenges.kind, "conduct"),
          isNull(nominationChallenges.disputePanelId)
        )
      );
  }
}

const DEFERRAL_TEXT: Record<Exclude<PanelDeferralReason, "awaiting-randomness">, (pool: number, eligible: number, seats: number) => string> = {
  "pool-below-minimum": (pool) =>
    `Dispute Panel draw queued: the volunteer pool (${pool}) is below the Dispute Procedure Code 2.1 minimum of ${DISPUTE_PANEL_POOL_MINIMUM}. It is drawn automatically once the pool reaches it.`,
  "too-many-exclusions": (pool, eligible, seats) =>
    `Dispute Panel draw queued: the volunteer pool holds ${pool}, but only ${eligible} remain eligible after the Dispute Procedure Code 2.2 exclusions, short of the ${seats} seat${seats === 1 ? "" : "s"} required. It is drawn automatically once enough are eligible.`,
};

/**
 * Carries out every outstanding draw request that can be carried out now, and
 * leaves the rest queued. Safe to call repeatedly (tick() does): a request is
 * completed at most once, and its beacon round is fixed the first time it is
 * found drawable.
 */
export async function processDrawRequests(
  db: Db,
  community: Community,
  ts: number,
  opts: { fetchFn?: BeaconFetch } = {}
): Promise<void> {
  const pending = await db
    .select()
    .from(disputeDrawRequests)
    .where(and(eq(disputeDrawRequests.communityId, community.id), isNull(disputeDrawRequests.completedAt)))
    .orderBy(disputeDrawRequests.id);

  for (const req of pending) {
    const parties = JSON.parse(req.partiesJson) as DrawParty[];
    const partyIds = parties.map((p) => p.memberId);
    const isReplacement = req.panelId !== null;

    // Anyone already on (or who has declined) this panel is not re-drawn for it.
    const alsoExclude = isReplacement
      ? (await db.select({ id: disputePanelMembers.memberId }).from(disputePanelMembers).where(eq(disputePanelMembers.panelId, req.panelId!))).map((r) => r.id)
      : [];

    const poolResult = await eligiblePanelPool(
      db,
      community.id,
      partyIds,
      req.seats,
      ts,
      community.params.activeWindowDays,
      req.disputedContributionId,
      alsoExclude,
      !isReplacement
    );
    if (poolResult.deferral) {
      if (req.deferralReason !== poolResult.deferral) {
        await db.update(disputeDrawRequests).set({ deferralReason: poolResult.deferral }).where(eq(disputeDrawRequests.id, req.id));
        await writeRecord(db, community.id, "record", DEFERRAL_TEXT[poolResult.deferral](poolResult.poolSize, poolResult.eligibleIds.length, req.seats), null, ts);
      }
      continue;
    }

    // Drawable. Fix the beacon round now — before the value exists — and keep it.
    let round = req.beaconRound;
    if (round === null) {
      round = drandRoundAfter(ts);
      await db.update(disputeDrawRequests).set({ beaconRound: round, deferralReason: "awaiting-randomness" }).where(eq(disputeDrawRequests.id, req.id));
    }
    const beacon = await fetchDrandBeacon(round, opts.fetchFn);
    if (!beacon) continue; // not published yet, or the relays are unreachable: retry on the next tick

    const caseKey = `${req.subjectKind}:${req.subjectId}:${isReplacement ? `replacement-${req.seq}` : "initial"}`;
    const seed = await drawSeed({ beacon, caseKey, poolIds: poolResult.eligibleIds, size: req.seats });
    const drawn = await selectPanel(poolResult.eligibleIds, seed, req.seats);

    // Claim the request before writing anything, so two overlapping ticks cannot both seat a panel.
    const claim = await db
      .update(disputeDrawRequests)
      .set({ completedAt: ts, deferralReason: null })
      .where(and(eq(disputeDrawRequests.id, req.id), isNull(disputeDrawRequests.completedAt)))
      .returning({ id: disputeDrawRequests.id });
    if (claim.length === 0) continue;

    let panelId = req.panelId;
    if (panelId === null) {
      const [filer] = parties.filter((p) => p.role === "complainant");
      const [panel] = await db
        .insert(disputePanels)
        .values({
          communityId: community.id,
          subjectKind: req.subjectKind,
          subjectId: req.subjectId,
          filedBy: filer?.memberId ?? partyIds[0],
          filedAt: req.requestedAt,
          // 4.3 — "within 14 days of seating"; 4.2 — the accused's 7 days run from the same moment.
          decidesBy: ts + PANEL_DECIDE_WITHIN_DAYS * DAY_MS,
          respondBy: ts + DISPUTE_RESPONSE_WINDOW_DAYS * DAY_MS,
        })
        .returning();
      panelId = panel.id;
      for (const party of parties) {
        await db.insert(disputePanelParties).values({ panelId, memberId: party.memberId, role: party.role });
      }
      await linkCaseToPanel(db, req, panelId);
      await db.update(disputeDrawRequests).set({ panelId }).where(eq(disputeDrawRequests.id, req.id));
    }
    for (const id of drawn) await db.insert(disputePanelMembers).values({ panelId, memberId: id, drawnAt: ts });

    await db.insert(disputePanelDraws).values({
      panelId,
      requestId: req.id,
      kind: isReplacement ? "replacement" : "initial",
      method: PANEL_DRAW_METHOD,
      beaconChain: beacon.chainHash,
      beaconRound: beacon.round,
      beaconRandomness: beacon.randomness,
      caseKey,
      seed,
      poolJson: JSON.stringify(canonicalPool(poolResult.eligibleIds)),
      drawnJson: JSON.stringify(drawn),
      drawnAt: ts,
    });
    await writeRecord(
      db,
      community.id,
      "record",
      `Dispute Panel ${isReplacement ? "replacement" : "draw"} completed (Dispute Procedure Code 3.1): ${drawn.length} drawn from ${poolResult.eligibleIds.length} eligible, by ${PANEL_DRAW_METHOD} from drand round ${beacon.round}. Seed ${seed}. The full draw is published on the case page and can be re-run by anyone.`,
      null,
      ts
    );
  }
}

/**
 * processDrawRequests, then — if a draw is now waiting only for the beacon
 * round it just fixed (a few seconds away) — wait for it and try once more, so
 * a Member who files a report sees a panel seated straight away rather than on
 * somebody's next page view. Anything still unfinished stays queued for tick().
 */
export async function processDrawRequestsPromptly(
  db: Db,
  community: Community,
  ts: number,
  opts: { fetchFn?: BeaconFetch; waitMs?: number } = {}
): Promise<void> {
  await processDrawRequests(db, community, ts, opts);
  const waitMs = opts.waitMs ?? 4000;
  if (waitMs <= 0) return;
  const [waiting] = await db
    .select({ id: disputeDrawRequests.id })
    .from(disputeDrawRequests)
    .where(and(eq(disputeDrawRequests.communityId, community.id), isNull(disputeDrawRequests.completedAt), isNotNull(disputeDrawRequests.beaconRound)))
    .limit(1);
  if (!waiting) return;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  await processDrawRequests(db, community, ts + waitMs, opts);
}

// ---------- Conduct reports and sanctions (Code of Conduct; Dispute Procedure Code 4) ----------

export const CONDUCT_STATEMENT_MAX_CHARS = 4000;

export type FileConductReportResult =
  | { ok: true; reportId: number }
  | { ok: false; reason: "invalid-provision" | "empty-statement" | "statement-too-long" | "self-report" | "accused-not-member" | "already-open" | "bad-evidence-link" | "contributions-not-theirs" };

/**
 * Code of Conduct 4.1 / Dispute Procedure Code 4.1 — any Member may report a
 * violation; the report states what happened, which provision it violates and
 * what evidence supports it, and is filed on the record. The panel is queued
 * for drawing at once.
 */
export async function fileConductReport(
  db: Db,
  community: Community,
  reporterId: number,
  input: { accusedId: number; provision: string; statement: string; evidenceLink?: string | null; contributionIds?: number[] },
  ts: number
): Promise<FileConductReportResult> {
  if (!isProvisionId(input.provision)) return { ok: false, reason: "invalid-provision" };
  const statement = input.statement.trim();
  if (!statement) return { ok: false, reason: "empty-statement" };
  if (statement.length > CONDUCT_STATEMENT_MAX_CHARS) return { ok: false, reason: "statement-too-long" };
  if (input.accusedId === reporterId) return { ok: false, reason: "self-report" };

  const [accused] = await db.select().from(members).where(and(eq(members.id, input.accusedId), eq(members.communityId, community.id), REAL_MEMBER));
  const [reporter] = await db.select().from(members).where(and(eq(members.id, reporterId), eq(members.communityId, community.id), REAL_MEMBER));
  if (!accused || !reporter) return { ok: false, reason: "accused-not-member" };

  const evidenceLink = (input.evidenceLink ?? "").trim() || null;
  if (evidenceLink && !/^https?:\/\/\S+$/i.test(evidenceLink)) return { ok: false, reason: "bad-evidence-link" };

  // Entries alleged to be fraudulent (2.2 only) must be the accused's own.
  let contributionIds: number[] = [];
  if (input.provision === "2.2" && input.contributionIds?.length) {
    const owned = await db
      .select({ id: contributions.id })
      .from(contributions)
      .where(and(eq(contributions.memberId, accused.id), inArray(contributions.id, input.contributionIds)));
    if (owned.length !== new Set(input.contributionIds).size) return { ok: false, reason: "contributions-not-theirs" };
    contributionIds = owned.map((o) => o.id);
  }

  // One undecided report per reporter and accused: the accused answers a report
  // once, not repeatedly (Dispute Procedure Code 7.1 names harassment-by-process).
  const open = await db
    .select({ id: conductReports.id, panelId: conductReports.panelId })
    .from(conductReports)
    .where(and(eq(conductReports.communityId, community.id), eq(conductReports.reportedBy, reporterId), eq(conductReports.accusedId, accused.id)));
  for (const r of open) {
    if (r.panelId === null) return { ok: false, reason: "already-open" };
    const [pn] = await db.select({ decision: disputePanels.decision }).from(disputePanels).where(eq(disputePanels.id, r.panelId));
    if (pn && pn.decision === null) return { ok: false, reason: "already-open" };
  }

  const [report] = await db
    .insert(conductReports)
    .values({
      communityId: community.id,
      reportedBy: reporterId,
      accusedId: accused.id,
      provision: input.provision,
      statement,
      evidenceLink,
      contributionIdsJson: contributionIds.length ? JSON.stringify(contributionIds) : null,
      filedAt: ts,
    })
    .returning({ id: conductReports.id });

  await writeRecord(
    db,
    community.id,
    "record",
    `${reporter.name} reported ${accused.name} under Code of Conduct ${input.provision} (${provisionName(input.provision)}): ${statement}${evidenceLink ? ` Evidence: ${evidenceLink}` : ""}`,
    reporterId,
    ts
  );
  await requestPanelDraw(
    db,
    community.id,
    {
      subjectKind: "conduct-report",
      subjectId: report.id,
      seq: 0,
      seats: DISPUTE_PANEL_SIZE,
      parties: [
        { memberId: reporterId, role: "complainant" },
        { memberId: accused.id, role: "accused" },
      ],
      disputedContributionId: contributionIds[0] ?? null,
    },
    ts
  );
  return { ok: true, reportId: report.id };
}

/** The ladder steps a Member has already been sanctioned at (Code of Conduct 3.5: repetition after every lower step). */
export async function priorSanctionSteps(db: Db, communityId: number, memberId: number): Promise<number[]> {
  const rows = await db
    .select({ kind: memberSanctions.kind })
    .from(memberSanctions)
    .where(and(eq(memberSanctions.communityId, communityId), eq(memberSanctions.memberId, memberId), isNull(memberSanctions.overturnedAt)));
  return [...new Set(rows.map((r) => stepOfSanctionKind(r.kind)).filter((x): x is number => x !== null))];
}

/** Sanctions (suspensions) in force for a Member at `ts`. */
export async function activeSuspensions(db: Db, memberId: number, ts: number) {
  const rows = await db.select().from(memberSanctions).where(eq(memberSanctions.memberId, memberId));
  return rows.filter(
    (r) => (r.kind === "accrual-suspension" || r.kind === "participation-suspension") && r.startsAt <= ts && (r.endsAt === null || ts < r.endsAt)
  );
}

/** Code of Conduct 3.3 — returns the moment a participation suspension ends, or null if the Member's posting and proposal rights are intact. */
export async function participationSuspendedUntil(db: Db, memberId: number, ts: number): Promise<number | null> {
  const rows = (await activeSuspensions(db, memberId, ts)).filter((r) => r.kind === "participation-suspension");
  if (rows.length === 0) return null;
  return Math.max(...rows.map((r) => r.endsAt ?? ts));
}

/** Applies a conduct panel's finding: records it, and puts the sanction (and any bad-faith finding) into effect. */
async function applyConductFinding(
  db: Db,
  community: Community,
  panel: { id: number },
  report: typeof conductReports.$inferSelect,
  outcome: ReturnType<typeof conductOutcome>,
  ts: number
): Promise<void> {
  const [accused] = await db.select({ name: members.name }).from(members).where(eq(members.id, report.accusedId));
  const [reporter] = await db.select({ name: members.name }).from(members).where(eq(members.id, report.reportedBy));
  const accusedName = accused?.name ?? "the accused";
  const stepInfo = SANCTION_STEPS.find((x) => x.step === outcome.step);
  const tallyText = outcome.tally.map((n, i) => `${i === 0 ? "dismiss" : SANCTION_STEPS[i - 1].label.toLowerCase()} ${n}`).join(", ");

  let extra = "";
  if (outcome.step > 0) {
    const kind = sanctionKind(outcome.step);
    if (kind === "notice") {
      await db.insert(memberSanctions).values({ communityId: community.id, memberId: report.accusedId, panelId: panel.id, kind, step: 1, startsAt: ts, endsAt: null, createdAt: ts });
    } else if (kind === "accrual-suspension" || kind === "participation-suspension") {
      const days = kind === "accrual-suspension" ? ACCRUAL_SUSPENSION_DAYS : PARTICIPATION_SUSPENSION_DAYS;
      await db.insert(memberSanctions).values({ communityId: community.id, memberId: report.accusedId, panelId: panel.id, kind, step: outcome.step, startsAt: ts, endsAt: ts + days * DAY_MS, createdAt: ts });
      extra = ` It runs ${days} days, to ${new Date(ts + days * DAY_MS).toDateString()}.`;
    } else if (kind === "voidance") {
      const ids: number[] = report.contributionIdsJson ? JSON.parse(report.contributionIdsJson) : [];
      const entries = ids.length
        ? await db.select().from(contributions).where(and(eq(contributions.memberId, report.accusedId), inArray(contributions.id, ids)))
        : [];
      // Clearing verifiedAt and claimedAt makes every existing "verified" and
      // "claimed" query stop counting the entry; voidedAt keeps what happened.
      for (const e of entries) {
        await db
          .update(contributions)
          .set({ voidedAt: ts, preVoidVerifiedAt: e.verifiedAt, preVoidClaimedAt: e.claimedAt, verifiedAt: null, claimedAt: null })
          .where(eq(contributions.id, e.id));
      }
      await db.insert(memberSanctions).values({ communityId: community.id, memberId: report.accusedId, panelId: panel.id, kind, step: 4, startsAt: ts, endsAt: null, createdAt: ts });
      extra = ` ${entries.length} contribution entr${entries.length === 1 ? "y was" : "ies were"} voided and no longer count (${entries.map((e) => `"${e.description}"`).join("; ") || "none named"}). Recovering any dividend already paid on voided entries is not automated.`;
    }
  }

  if (outcome.step === 5) {
    const effectiveAt = ts + REVOCATION_HOLD_DAYS * DAY_MS;
    await db.update(disputePanels).set({ revocationEffectiveAt: effectiveAt }).where(eq(disputePanels.id, panel.id));
    extra = ` Revocation is held for ${REVOCATION_HOLD_DAYS} days, to ${new Date(effectiveAt).toDateString()} (Dispute Procedure Code 6.2): any Member may file a proposal to overturn it in that time, and if one is filed the revocation stays paused until it resolves.`;
  }

  await writeRecord(
    db,
    community.id,
    "record",
    outcome.decision === "upheld"
      ? `Dispute Panel upheld the Code of Conduct ${report.provision} report against ${accusedName}: ${stepInfo?.label ?? "finding"} (Code of Conduct ${stepInfo?.ref ?? "3"}).${extra} Votes after clamping to what the provision allows (${outcome.votesCast} of ${DISPUTE_PANEL_SIZE} cast): ${tallyText}. Reasoning and dissents are on the case page.`
      : `Dispute Panel dismissed the Code of Conduct ${report.provision} report against ${accusedName}. Votes (${outcome.votesCast} of ${DISPUTE_PANEL_SIZE} cast): ${tallyText}. Reasoning is on the case page.`,
    report.accusedId,
    ts
  );

  if (outcome.badFaith) {
    await db.insert(memberSanctions).values({ communityId: community.id, memberId: report.reportedBy, panelId: panel.id, kind: "bad-faith-notice", step: 1, startsAt: ts, endsAt: null, createdAt: ts });
    await writeRecord(
      db,
      community.id,
      "record",
      `The same panel found the report brought in bad faith (Dispute Procedure Code 7.1) and enters a public notice against ${reporter?.name ?? "the reporter"} under Code of Conduct 2.1.`,
      report.reportedBy,
      ts
    );
  }
}

// ---------- Revocation, its hold, and overturning a decision (Dispute Procedure Code 6) ----------

/**
 * Dispute Procedure Code 6.2 — carries out each upheld revocation whose 14-day
 * hold has run out, unless an overturn proposal filed in time is still
 * unresolved ("however long that takes"), or the decision has been overturned.
 */
export async function processRevocations(db: Db, community: Community, ts: number): Promise<void> {
  const due = await db
    .select()
    .from(disputePanels)
    .where(
      and(
        eq(disputePanels.communityId, community.id),
        eq(disputePanels.decision, "upheld"),
        eq(disputePanels.sanctionStep, 5),
        isNull(disputePanels.revocationCompletedAt),
        isNull(disputePanels.overturnedAt),
        lte(disputePanels.revocationEffectiveAt, ts)
      )
    );
  for (const panel of due) {
    const [open] = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(and(eq(proposals.overturnsPanelId, panel.id), sql`${proposals.stage} != 'record'`))
      .limit(1);
    if (open) continue;
    const [report] = await db.select().from(conductReports).where(eq(conductReports.id, panel.subjectId));
    if (!report) continue;
    const claim = await db
      .update(disputePanels)
      .set({ revocationCompletedAt: ts })
      .where(and(eq(disputePanels.id, panel.id), isNull(disputePanels.revocationCompletedAt)))
      .returning({ id: disputePanels.id });
    if (claim.length === 0) continue;
    await endMembership(db, community, report.accusedId, ts, "revoked");
  }
}

export type OverturnResult = { ok: true; proposalId: number } | { ok: false; reason: "no-such-decision" | "nothing-to-overturn" | "already-overturned" | "already-open" | "empty-reasons" };

/**
 * Charter 6.3 / Dispute Procedure Code 6.1 — "a panel decision is overturned
 * only by full community vote at the charter-amendment threshold... Any Member,
 * not only a party, may bring the overturn proposal. There is no second panel."
 * This files that proposal. Only an upheld decision has anything to overturn.
 */
export async function fileOverturnProposal(
  db: Db,
  community: Community,
  memberId: number,
  panelId: number,
  reasons: string,
  title: string,
  ts: number
): Promise<OverturnResult> {
  const [panel] = await db.select().from(disputePanels).where(and(eq(disputePanels.id, panelId), eq(disputePanels.communityId, community.id)));
  if (!panel || panel.decision === null) return { ok: false, reason: "no-such-decision" };
  if (panel.decision !== "upheld") return { ok: false, reason: "nothing-to-overturn" };
  if (panel.overturnedAt !== null) return { ok: false, reason: "already-overturned" };
  const why = reasons.trim().slice(0, 4000);
  if (!why) return { ok: false, reason: "empty-reasons" };
  const [open] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.overturnsPanelId, panelId), sql`${proposals.stage} != 'record'`))
    .limit(1);
  if (open) return { ok: false, reason: "already-open" };

  const [member] = await db.select({ name: members.name }).from(members).where(eq(members.id, memberId));
  const cfg = CLASS_CONFIG.amendment; // "at the charter-amendment threshold"
  const voteOpensAt = ts + cfg.delibDays * DAY_MS;
  const [proposal] = await db
    .insert(proposals)
    .values({
      communityId: community.id,
      by: memberId,
      title: `Overturn a Dispute Panel decision: ${title}`,
      why,
      cls: "amendment",
      submittedAt: ts,
      voteFreezeAt: voteOpensAt - community.params.voteFreezeHours * 60 * 60 * 1000,
      voteOpensAt,
      votingClosesAt: voteOpensAt + cfg.voteDays * DAY_MS,
      critical: 1,
      overturnsPanelId: panelId,
    })
    .returning({ id: proposals.id });
  await writeRecord(
    db,
    community.id,
    "proposal",
    `${member?.name ?? "A Member"} proposed to overturn a Dispute Panel decision (Dispute Procedure Code 6.1) — a charter-amendment-threshold vote. ${
      panel.revocationEffectiveAt !== null && panel.revocationCompletedAt === null ? "The revocation stays paused while it is unresolved (6.2)." : ""
    }`.trim(),
    memberId,
    ts
  );
  return { ok: true, proposalId: proposal.id };
}

/** Puts an overturn into effect after the community vote ratifies it: ends the sanctions, restores voided entries, reinstates a revoked Member, restores a nomination. */
export async function overturnPanelDecision(db: Db, communityId: number, panelId: number, ts: number): Promise<void> {
  const [panel] = await db.select().from(disputePanels).where(eq(disputePanels.id, panelId));
  if (!panel || panel.overturnedAt !== null) return;
  await db.update(disputePanels).set({ overturnedAt: ts }).where(eq(disputePanels.id, panelId));

  const sanctions = await db.select().from(memberSanctions).where(eq(memberSanctions.panelId, panelId));
  for (const x of sanctions) {
    await db
      .update(memberSanctions)
      .set({ overturnedAt: ts, endsAt: x.endsAt === null ? null : Math.min(x.endsAt, ts) })
      .where(eq(memberSanctions.id, x.id));
  }

  let restored = "";
  if (panel.subjectKind === "conduct-report") {
    const [report] = await db.select().from(conductReports).where(eq(conductReports.id, panel.subjectId));
    if (report) {
      const ids: number[] = report.contributionIdsJson ? JSON.parse(report.contributionIdsJson) : [];
      const voided = ids.length ? await db.select().from(contributions).where(and(inArray(contributions.id, ids), isNotNull(contributions.voidedAt))) : [];
      for (const e of voided) {
        await db.update(contributions).set({ voidedAt: null, verifiedAt: e.preVoidVerifiedAt, claimedAt: e.preVoidClaimedAt, preVoidVerifiedAt: null, preVoidClaimedAt: null }).where(eq(contributions.id, e.id));
      }
      if (voided.length) restored += ` ${voided.length} voided contribution entr${voided.length === 1 ? "y was" : "ies were"} restored.`;
      const [accused] = await db.select().from(members).where(eq(members.id, report.accusedId));
      if (panel.revocationCompletedAt !== null && accused && accused.revokedAt !== null) {
        await db.update(members).set({ leftAt: null, revokedAt: null }).where(eq(members.id, accused.id));
        restored += ` ${accused.name}'s membership was reinstated; the delegations that lapsed when it ended are not restored and must be granted again.`;
      }
    }
  }
  if (panel.subjectKind === "supporting-nominee-conduct") {
    await db.update(supportingNominees).set({ revokedAt: null }).where(eq(supportingNominees.id, panel.subjectId));
    restored += " The challenged nomination was restored.";
  }
  await writeRecord(db, communityId, "record", `A Dispute Panel decision was overturned by a full community vote (Charter 6.3).${restored}`, null, ts);
}

// ---------- Moderators and interim measures (Code of Conduct 4.3; Dispute Procedure Code 5.1) ----------

export { INTERIM_MEASURE_HOURS };

export async function phaseOneActive(db: Db, community: Community, ts: number): Promise<boolean> {
  return !foundingCriteriaMet(await computeFoundingProgress(db, community, ts), community.params.criteria.phase1);
}

/**
 * Code of Conduct 4.3 — "Moderators are Members recognised to a moderation
 * Position... installed and removed by Position decision exactly as any other
 * Delegate Position. During the founding period the founder may appoint interim
 * moderators instead (Charter 9.2); that power lapses with Phase I, and from
 * Phase II onward the role exists only by community vote."
 *
 * So: a Member is a moderator if the founder appointed them AND Phase I is
 * still running, or if they currently hold the Delegate Position for a sector
 * named "Moderation". The Triarc defines no such sector today; the community
 * can add one and decide the Position like any other.
 */
export async function isModerator(db: Db, community: Community, memberId: number, ts: number): Promise<boolean> {
  const [m] = await db.select({ leftAt: members.leftAt }).from(members).where(and(eq(members.id, memberId), eq(members.communityId, community.id)));
  if (!m || m.leftAt !== null) return false;
  const [appointed] = await db
    .select({ id: moderators.id })
    .from(moderators)
    .where(and(eq(moderators.communityId, community.id), eq(moderators.memberId, memberId), isNull(moderators.removedAt)))
    .limit(1);
  if (appointed && (await phaseOneActive(db, community, ts))) return true;
  const [position] = await db
    .select({ id: delegateRecognitions.id })
    .from(delegateRecognitions)
    .innerJoin(sectors, eq(delegateRecognitions.sectorId, sectors.id))
    .where(and(eq(delegateRecognitions.memberId, memberId), isNull(delegateRecognitions.revokedAt), eq(sectors.communityId, community.id), eq(sectors.name, "Moderation")))
    .limit(1);
  return position !== undefined;
}

export async function listModerators(db: Db, community: Community, ts: number): Promise<{ id: number; memberId: number; name: string; via: "appointed" | "position" }[]> {
  const rows = await db
    .select({ id: moderators.id, memberId: moderators.memberId, name: members.name })
    .from(moderators)
    .innerJoin(members, eq(moderators.memberId, members.id))
    .where(and(eq(moderators.communityId, community.id), isNull(moderators.removedAt), isNull(members.leftAt)));
  const out: { id: number; memberId: number; name: string; via: "appointed" | "position" }[] = [];
  if (rows.length && (await phaseOneActive(db, community, ts))) out.push(...rows.map((r) => ({ ...r, via: "appointed" as const })));
  const positions = await db
    .select({ id: delegateRecognitions.id, memberId: delegateRecognitions.memberId, name: members.name })
    .from(delegateRecognitions)
    .innerJoin(sectors, eq(delegateRecognitions.sectorId, sectors.id))
    .innerJoin(members, eq(delegateRecognitions.memberId, members.id))
    .where(and(isNull(delegateRecognitions.revokedAt), eq(sectors.communityId, community.id), eq(sectors.name, "Moderation")));
  out.push(...positions.map((r) => ({ id: -r.id, memberId: r.memberId, name: r.name, via: "position" as const })));
  return out;
}

export type ModeratorAdminResult = { ok: true } | { ok: false; reason: "not-founder" | "phase-over" | "not-a-member" | "already-moderator" | "not-found" };

/** Charter 9.2 — only the founder, and only while Phase I runs. */
export async function appointModerator(db: Db, community: Community, actorId: number, targetId: number, ts: number): Promise<ModeratorAdminResult> {
  if (community.founderId === null || community.founderId !== actorId) return { ok: false, reason: "not-founder" };
  if (!(await phaseOneActive(db, community, ts))) return { ok: false, reason: "phase-over" };
  const [target] = await db.select().from(members).where(and(eq(members.id, targetId), eq(members.communityId, community.id), REAL_MEMBER));
  if (!target) return { ok: false, reason: "not-a-member" };
  const [existing] = await db.select({ id: moderators.id }).from(moderators).where(and(eq(moderators.memberId, targetId), isNull(moderators.removedAt))).limit(1);
  if (existing) return { ok: false, reason: "already-moderator" };
  await db.insert(moderators).values({ communityId: community.id, memberId: targetId, appointedBy: actorId, appointedAt: ts });
  await writeRecord(db, community.id, "record", `${target.name} was appointed an interim moderator by the founder (Charter 9.2, Code of Conduct 4.3). The power to appoint lapses with Phase I; moderation carries no authority over any proposal, vote or delegation.`, targetId, ts);
  return { ok: true };
}

export async function removeModerator(db: Db, community: Community, actorId: number, moderatorRowId: number, ts: number): Promise<ModeratorAdminResult> {
  if (community.founderId === null || community.founderId !== actorId) return { ok: false, reason: "not-founder" };
  const [row] = await db.select().from(moderators).where(and(eq(moderators.id, moderatorRowId), eq(moderators.communityId, community.id), isNull(moderators.removedAt)));
  if (!row) return { ok: false, reason: "not-found" };
  await db.update(moderators).set({ removedAt: ts }).where(eq(moderators.id, row.id));
  const [m] = await db.select({ name: members.name }).from(members).where(eq(members.id, row.memberId));
  await writeRecord(db, community.id, "record", `${m?.name ?? "A Member"} is no longer an interim moderator.`, row.memberId, ts);
  return { ok: true };
}

const CONTENT_TABLES = {
  "proposal-comment": proposalComments,
  "sector-post": sectorPosts,
  "sector-comment": sectorPostComments,
} as const;
export type InterimContentKind = keyof typeof CONTENT_TABLES;
export function isInterimContentKind(x: string): x is InterimContentKind {
  return x in CONTENT_TABLES;
}

export type TakeMeasureResult =
  | { ok: true; measureId: number; reportId: number }
  | { ok: false; reason: "not-moderator" | "invalid-target" | "empty-reason" | "invalid-kind" | "content-not-theirs" | "already-frozen" | "invalid-provision" | "report-failed" | "must-state-unreachable" };

/**
 * Who may take an interim measure over a piece of content: a moderator
 * anywhere, or — Rules of Procedure 6.4 — either co-Delegate alone, within the
 * Position's own sector, when the other is unreachable.
 */
export async function interimAuthority(db: Db, community: Community, memberId: number, contentKind: string | null | undefined, contentId: number | null | undefined, ts: number): Promise<"moderator" | "co-delegate" | null> {
  if (await isModerator(db, community, memberId, ts)) return "moderator";
  if (!contentId || (contentKind !== "sector-post" && contentKind !== "sector-comment")) return null;
  let sectorId: number | null = null;
  if (contentKind === "sector-post") {
    const [p] = await db.select({ sectorId: sectorPosts.sectorId }).from(sectorPosts).where(eq(sectorPosts.id, contentId));
    sectorId = p?.sectorId ?? null;
  } else {
    const [c] = await db.select({ postId: sectorPostComments.postId }).from(sectorPostComments).where(eq(sectorPostComments.id, contentId));
    const [p] = c ? await db.select({ sectorId: sectorPosts.sectorId }).from(sectorPosts).where(eq(sectorPosts.id, c.postId)) : [];
    sectorId = p?.sectorId ?? null;
  }
  if (sectorId === null) return null;
  return (await jointPositionOfMember(db, community.id, memberId, sectorId)) ? "co-delegate" : null;
}

/**
 * Code of Conduct 4.3 / Dispute Procedure Code 5.1 — an emergency interim
 * measure, taken only for active, ongoing harm: removing doxxed content, or
 * freezing a suspected sybil account. A freeze stops posting, proposing and
 * contribution logging; it never touches the vote or a delegation ("moderation
 * carries no authority over any proposal, vote, or delegation"). It is logged
 * when taken, filed together with a conduct report so a panel exists to review
 * it, and lapses on its own after 72 hours unless that panel's majority keeps it.
 */
export async function takeInterimMeasure(
  db: Db,
  community: Community,
  moderatorId: number,
  input: { targetMemberId: number; kind: string; contentKind?: string | null; contentId?: number | null; provision: string; reason: string; otherUnreachable?: boolean },
  ts: number
): Promise<TakeMeasureResult> {
  let viaCoDelegate = false;
  if (!(await isModerator(db, community, moderatorId, ts))) {
    if (input.kind === "remove-content" && (await interimAuthority(db, community, moderatorId, input.contentKind, input.contentId, ts)) === "co-delegate") {
      if (!input.otherUnreachable) return { ok: false, reason: "must-state-unreachable" };
      viaCoDelegate = true;
    } else {
      return { ok: false, reason: "not-moderator" };
    }
  }
  if (input.kind !== "freeze-account" && input.kind !== "remove-content") return { ok: false, reason: "invalid-kind" };
  const reason = input.reason.trim().slice(0, 2000);
  if (!reason) return { ok: false, reason: "empty-reason" };
  if (input.targetMemberId === moderatorId) return { ok: false, reason: "invalid-target" };
  const [target] = await db.select().from(members).where(and(eq(members.id, input.targetMemberId), eq(members.communityId, community.id), REAL_MEMBER));
  if (!target) return { ok: false, reason: "invalid-target" };

  let contentKind: InterimContentKind | null = null;
  let contentId: number | null = null;
  if (input.kind === "remove-content") {
    if (!input.contentKind || !isInterimContentKind(input.contentKind) || !input.contentId) return { ok: false, reason: "content-not-theirs" };
    contentKind = input.contentKind;
    contentId = input.contentId;
    const table = CONTENT_TABLES[contentKind];
    const [row] = await db.select({ memberId: table.memberId }).from(table).where(eq(table.id, contentId));
    if (!row || row.memberId !== target.id) return { ok: false, reason: "content-not-theirs" };
  } else if (await activeFreeze(db, target.id, ts)) {
    return { ok: false, reason: "already-frozen" };
  }

  // The report that gives the measure a panel to review it.
  const filed = await fileConductReport(db, community, moderatorId, { accusedId: target.id, provision: input.provision, statement: `Interim measure taken: ${reason}` }, ts);
  let reportId: number;
  if (filed.ok) {
    reportId = filed.reportId;
  } else if (filed.reason === "already-open") {
    const [existing] = await db
      .select({ id: conductReports.id })
      .from(conductReports)
      .where(and(eq(conductReports.reportedBy, moderatorId), eq(conductReports.accusedId, target.id)))
      .orderBy(desc(conductReports.id))
      .limit(1);
    if (!existing) return { ok: false, reason: "report-failed" };
    reportId = existing.id;
  } else if (filed.reason === "invalid-provision") {
    return { ok: false, reason: "invalid-provision" };
  } else {
    return { ok: false, reason: "report-failed" };
  }

  const [measure] = await db
    .insert(interimMeasures)
    .values({
      communityId: community.id,
      moderatorId,
      targetMemberId: target.id,
      kind: input.kind,
      contentKind,
      contentId,
      reason,
      reportId,
      takenAt: ts,
      lapsesAt: ts + INTERIM_MEASURE_HOURS * 60 * 60 * 1000,
    })
    .returning({ id: interimMeasures.id });

  if (contentKind && contentId) {
    const table = CONTENT_TABLES[contentKind];
    await db.update(table).set({ hiddenMeasureId: measure.id }).where(eq(table.id, contentId));
  }
  const [mod] = await db.select({ name: members.name }).from(members).where(eq(members.id, moderatorId));
  await writeRecord(
    db,
    community.id,
    "record",
    `Interim measure (${viaCoDelegate ? "Rules of Procedure 6.4" : "Code of Conduct 4.3"}): ${viaCoDelegate ? `co-Delegate ${mod?.name ?? "a co-Delegate"}, acting alone because the other co-Delegate was unreachable,` : `moderator ${mod?.name ?? "a moderator"}`} ${input.kind === "freeze-account" ? `froze ${target.name}'s posting, proposing and contribution logging` : `removed a ${contentKind?.replace("-", " ")} by ${target.name}`}. Reason: ${reason} It lapses automatically in ${INTERIM_MEASURE_HOURS} hours (${new Date(ts + INTERIM_MEASURE_HOURS * 3600000).toLocaleString()}) unless the reviewing panel keeps it. Votes and delegations are not affected.`,
    target.id,
    ts
  );
  return { ok: true, measureId: measure.id, reportId };
}

/** True while an interim measure is in force. */
function measureInForce(m: { endedAt: number | null; extendedAt: number | null; lapsesAt: number }, ts: number): boolean {
  return m.endedAt === null && (m.extendedAt !== null || ts < m.lapsesAt);
}

/** An interim freeze on a Member, if one is in force — returns when it ends (the 72-hour lapse, or the reviewing panel's decision date once extended). */
export async function activeFreeze(db: Db, memberId: number, ts: number): Promise<{ until: number } | null> {
  const rows = await db
    .select()
    .from(interimMeasures)
    .where(and(eq(interimMeasures.targetMemberId, memberId), eq(interimMeasures.kind, "freeze-account"), isNull(interimMeasures.endedAt)));
  let until: number | null = null;
  for (const m of rows) {
    if (!measureInForce(m, ts)) continue;
    let end = m.lapsesAt;
    if (m.extendedAt !== null) {
      const [r] = await db.select({ panelId: conductReports.panelId }).from(conductReports).where(eq(conductReports.id, m.reportId));
      const [pn] = r?.panelId ? await db.select({ decidesBy: disputePanels.decidesBy }).from(disputePanels).where(eq(disputePanels.id, r.panelId)) : [];
      end = pn?.decidesBy ?? m.lapsesAt;
    }
    until = until === null ? end : Math.max(until, end);
  }
  return until === null ? null : { until };
}

/** Ids of interim measures currently hiding content. */
export async function hidingMeasureIds(db: Db, communityId: number, ts: number): Promise<Set<number>> {
  const rows = await db
    .select()
    .from(interimMeasures)
    .where(and(eq(interimMeasures.communityId, communityId), eq(interimMeasures.kind, "remove-content"), isNull(interimMeasures.endedAt)));
  return new Set(rows.filter((m) => measureInForce(m, ts)).map((m) => m.id));
}

export type ApproveMeasureResult = { ok: true; extended: boolean } | { ok: false; reason: "not-found" | "not-reviewing-panelist" | "no-longer-in-force" };

/**
 * "Lapsing automatically unless a panel reviews and extends": a seated member of
 * the panel reviewing the report behind the measure may approve keeping it; once
 * more than half of the panel's seats have, it stays until the panel decides.
 */
export async function approveInterimMeasure(db: Db, community: Community, memberId: number, measureId: number, ts: number): Promise<ApproveMeasureResult> {
  const [m] = await db.select().from(interimMeasures).where(and(eq(interimMeasures.id, measureId), eq(interimMeasures.communityId, community.id)));
  if (!m) return { ok: false, reason: "not-found" };
  if (!measureInForce(m, ts)) return { ok: false, reason: "no-longer-in-force" };
  const [report] = await db.select({ panelId: conductReports.panelId }).from(conductReports).where(eq(conductReports.id, m.reportId));
  if (!report?.panelId) return { ok: false, reason: "not-reviewing-panelist" };
  const seated = await seatedPanelistIds(db, report.panelId);
  if (!seated.includes(memberId)) return { ok: false, reason: "not-reviewing-panelist" };
  const [dupe] = await db.select({ id: interimMeasureApprovals.id }).from(interimMeasureApprovals).where(and(eq(interimMeasureApprovals.measureId, measureId), eq(interimMeasureApprovals.memberId, memberId)));
  if (!dupe) await db.insert(interimMeasureApprovals).values({ measureId, memberId, approvedAt: ts });
  const approvals = (await db.select().from(interimMeasureApprovals).where(eq(interimMeasureApprovals.measureId, measureId))).filter((a) => seated.includes(a.memberId));
  if (m.extendedAt === null && approvals.length * 2 > DISPUTE_PANEL_SIZE) {
    await db.update(interimMeasures).set({ extendedAt: ts }).where(eq(interimMeasures.id, measureId));
    await writeRecord(db, community.id, "record", `The reviewing Dispute Panel kept an interim measure in force until it decides (${approvals.length} of ${DISPUTE_PANEL_SIZE} seats approved; Code of Conduct 4.3).`, m.targetMemberId, ts);
    return { ok: true, extended: true };
  }
  return { ok: true, extended: m.extendedAt !== null };
}

/** Ends interim measures that have lapsed, or whose reviewing panel has now decided, and returns hidden content. */
export async function processInterimMeasures(db: Db, community: Community, ts: number): Promise<void> {
  const open = await db.select().from(interimMeasures).where(and(eq(interimMeasures.communityId, community.id), isNull(interimMeasures.endedAt)));
  for (const m of open) {
    const [r] = await db.select({ panelId: conductReports.panelId }).from(conductReports).where(eq(conductReports.id, m.reportId));
    const [pn] = r?.panelId ? await db.select({ decision: disputePanels.decision, decidedAt: disputePanels.decidedAt }).from(disputePanels).where(eq(disputePanels.id, r.panelId)) : [];
    let endedAt: number | null = null;
    let why = "";
    if (pn && pn.decision !== null) {
      endedAt = pn.decidedAt ?? ts;
      why = "ended when the reviewing Dispute Panel decided; its finding governs from here";
    } else if (m.extendedAt === null && ts >= m.lapsesAt) {
      endedAt = m.lapsesAt;
      why = `lapsed automatically after ${INTERIM_MEASURE_HOURS} hours without the reviewing panel keeping it`;
    }
    if (endedAt === null) continue;
    await db.update(interimMeasures).set({ endedAt }).where(eq(interimMeasures.id, m.id));
    for (const table of [proposalComments, sectorPosts, sectorPostComments]) {
      await db.update(table).set({ hiddenMeasureId: null }).where(eq(table.hiddenMeasureId, m.id));
    }
    await writeRecord(db, community.id, "record", `An interim measure (${m.kind === "freeze-account" ? "account freeze" : "content removal"}) ${why}.`, m.targetMemberId, ts);
  }
}

// ---------- Co-Delegate joint authority (Rules of Procedure 6) ----------

type RecognitionRow = typeof delegateRecognitions.$inferSelect;
export type JointKind = "nominate" | "revoke-nomination" | "spokesperson" | "compensation-split";
/** Rules of Procedure 6.3 — the matters that need both; a deadlock on these goes to a community vote (6.5). */
export const JOINT_REFERABLE_KINDS: JointKind[] = ["nominate", "revoke-nomination"];
export const JOINT_KINDS: JointKind[] = ["nominate", "revoke-nomination", "spokesperson", "compensation-split"];

/** The two active, mutually-linked recognitions that hold a sector's Position jointly, if the sector has such a pair. */
export async function activePairInSector(db: Db, communityId: number, sectorId: number): Promise<{ a: RecognitionRow; b: RecognitionRow } | null> {
  const rows = await db
    .select()
    .from(delegateRecognitions)
    .where(and(eq(delegateRecognitions.communityId, communityId), eq(delegateRecognitions.sectorId, sectorId), isNull(delegateRecognitions.revokedAt)));
  for (const r of rows) {
    if (r.coDelegateOfId === null) continue;
    const other = rows.find((x) => x.id === r.coDelegateOfId);
    if (other && other.coDelegateOfId === r.id) return r.id < other.id ? { a: r, b: other } : { a: other, b: r };
  }
  return null;
}

/** The joint Position a Member holds in a sector, with their own row and their partner's. */
export async function jointPositionOfMember(db: Db, communityId: number, memberId: number, sectorId: number): Promise<{ mine: RecognitionRow; partner: RecognitionRow } | null> {
  const pair = await activePairInSector(db, communityId, sectorId);
  if (!pair) return null;
  if (pair.a.memberId === memberId) return { mine: pair.a, partner: pair.b };
  if (pair.b.memberId === memberId) return { mine: pair.b, partner: pair.a };
  return null;
}

type JointCheck = { ok: true; summary: string; payload: Record<string, unknown> } | { ok: false; reason: string };

async function nameOf(db: Db, id: number): Promise<string> {
  const [m] = await db.select({ name: members.name }).from(members).where(eq(members.id, id));
  return m?.name ?? "a Member";
}

async function checkJointPayload(
  db: Db,
  community: Community,
  pair: { a: RecognitionRow; b: RecognitionRow },
  proposerId: number,
  kind: string,
  raw: Record<string, unknown>,
  ts: number
): Promise<JointCheck> {
  const holderIds = [pair.a.memberId, pair.b.memberId];
  if (kind === "nominate") {
    const nomineeMemberId = Number(raw.nomineeMemberId);
    const title = String(raw.title ?? "").trim().slice(0, 80) || "Supporting Nominee";
    if (!Number.isInteger(nomineeMemberId) || nomineeMemberId <= 0 || holderIds.includes(nomineeMemberId)) return { ok: false, reason: "invalid-nominee" };
    const [candidate] = await db.select({ communityId: members.communityId, seatKind: members.seatKind, leftAt: members.leftAt }).from(members).where(eq(members.id, nomineeMemberId));
    if (!isValidPositionMember(candidate, community.id) || candidate.seatKind !== null || candidate.leftAt !== null) return { ok: false, reason: "invalid-nominee" };
    const standing = await sectorStandingCredits(db, community.id, pair.a.sectorId, ts, community.params.standingWindowDays);
    if (!nomineeEligible(standing.get(nomineeMemberId) ?? 0)) return { ok: false, reason: "nominee-not-eligible" };
    const existing = await db
      .select({ id: supportingNominees.id })
      .from(supportingNominees)
      .where(and(inArray(supportingNominees.delegateRecognitionId, [pair.a.id, pair.b.id]), eq(supportingNominees.nomineeMemberId, nomineeMemberId), isNull(supportingNominees.revokedAt)));
    if (existing.length) return { ok: false, reason: "already-nominated" };
    return { ok: true, payload: { nomineeMemberId, title }, summary: `nominate ${await nameOf(db, nomineeMemberId)} as ${title}` };
  }
  if (kind === "revoke-nomination") {
    const nomineeId = Number(raw.nomineeId);
    const [n] = await db.select().from(supportingNominees).where(eq(supportingNominees.id, nomineeId));
    if (!n || n.revokedAt !== null || ![pair.a.id, pair.b.id].includes(n.delegateRecognitionId)) return { ok: false, reason: "no-such-nomination" };
    return { ok: true, payload: { nomineeId }, summary: `end the nomination of ${await nameOf(db, n.nomineeMemberId)} (${n.title})` };
  }
  if (kind === "spokesperson") {
    const memberId = Number(raw.memberId);
    if (!holderIds.includes(memberId)) return { ok: false, reason: "not-a-co-delegate" };
    return { ok: true, payload: { memberId }, summary: `designate ${await nameOf(db, memberId)} as the Position's external spokesperson` };
  }
  if (kind === "compensation-split") {
    const pct = Number(raw.sharePct);
    if (!Number.isInteger(pct) || pct < 1 || pct > 99) return { ok: false, reason: "invalid-share" };
    const other = holderIds.find((x) => x !== proposerId)!;
    return {
      ok: true,
      payload: { sharePct: pct }, // the proposer's own share; re-validates unchanged when carried out
      summary: `split the Position's compensation ${pct}% to ${await nameOf(db, proposerId)} and ${100 - pct}% to ${await nameOf(db, other)}`,
    };
  }
  return { ok: false, reason: "invalid-kind" };
}

export type ProposeJointResult = { ok: true; actionId: number } | { ok: false; reason: string };

/** One co-Delegate puts a joint matter to the other (Rules of Procedure 6.3, 6.6, 6.7). */
export async function proposeJointAction(db: Db, community: Community, memberId: number, sectorId: number, kind: string, raw: Record<string, unknown>, ts: number): Promise<ProposeJointResult> {
  const jp = await jointPositionOfMember(db, community.id, memberId, sectorId);
  if (!jp) return { ok: false, reason: "not-a-co-delegate" };
  const pair = jp.mine.id < jp.partner.id ? { a: jp.mine, b: jp.partner } : { a: jp.partner, b: jp.mine };
  const checked = await checkJointPayload(db, community, pair, memberId, kind, raw, ts);
  if (!checked.ok) return checked;
  const payloadJson = JSON.stringify(checked.payload);
  const dupes = await db
    .select({ id: jointActions.id })
    .from(jointActions)
    .where(and(eq(jointActions.communityId, community.id), eq(jointActions.sectorId, sectorId), eq(jointActions.kind, kind), eq(jointActions.payloadJson, payloadJson), inArray(jointActions.status, ["pending", "declined", "referred"])));
  if (dupes.length) return { ok: false, reason: "already-open" };
  const [row] = await db
    .insert(jointActions)
    .values({ communityId: community.id, sectorId, recognitionId: jp.mine.id, kind, payloadJson, summary: checked.summary, proposedBy: memberId, proposedAt: ts })
    .returning({ id: jointActions.id });
  const [sector] = await db.select({ name: sectors.name }).from(sectors).where(eq(sectors.id, sectorId));
  await writeRecord(
    db,
    community.id,
    "record",
    `${await nameOf(db, memberId)} asked ${await nameOf(db, jp.partner.memberId)}, their co-Delegate for ${sector?.name ?? "the Position"}, to jointly ${checked.summary}. It needs both (Rules of Procedure ${kind === "spokesperson" ? "6.6" : kind === "compensation-split" ? "6.7" : "6.3"}).`,
    memberId,
    ts
  );
  return { ok: true, actionId: row.id };
}

type ActionRow = typeof jointActions.$inferSelect;

/** Carries out an agreed or ratified joint action against the Position as it stands now. Returns false if it can no longer be done. */
async function executeJointAction(db: Db, community: Community, action: ActionRow, ts: number): Promise<boolean> {
  const pair = await activePairInSector(db, community.id, action.sectorId);
  if (!pair) return false;
  const payload = JSON.parse(action.payloadJson) as Record<string, unknown>;
  const checked = await checkJointPayload(db, community, pair, action.proposedBy, action.kind, payload, ts);
  if (!checked.ok) return false;
  const names = `${await nameOf(db, pair.a.memberId)} and ${await nameOf(db, pair.b.memberId)}`;
  if (action.kind === "nominate") {
    const holder = [pair.a, pair.b].find((r) => r.id === action.recognitionId) ?? pair.a;
    await db.insert(supportingNominees).values({ communityId: community.id, delegateRecognitionId: holder.id, nomineeMemberId: Number(payload.nomineeMemberId), title: String(payload.title), nominatedAt: ts });
    await writeRecord(db, community.id, "record", `${names}, jointly holding the Position, ${checked.summary} (Rules of Procedure 6.3).`, Number(payload.nomineeMemberId), ts);
  } else if (action.kind === "revoke-nomination") {
    await db.update(supportingNominees).set({ revokedAt: ts }).where(eq(supportingNominees.id, Number(payload.nomineeId)));
    await writeRecord(db, community.id, "record", `${names}, jointly holding the Position, agreed to ${checked.summary} (Rules of Procedure 6.3).`, null, ts);
  } else if (action.kind === "spokesperson") {
    await db.update(positionSpokespersons).set({ endedAt: ts }).where(and(eq(positionSpokespersons.sectorId, action.sectorId), isNull(positionSpokespersons.endedAt)));
    await db.insert(positionSpokespersons).values({ communityId: community.id, sectorId: action.sectorId, memberId: Number(payload.memberId), designatedAt: ts });
    await writeRecord(db, community.id, "record", `${names} agreed to ${checked.summary}. The designation carries no additional authority and is reaffirmed each renewal cycle (Rules of Procedure 6.6).`, Number(payload.memberId), ts);
  } else if (action.kind === "compensation-split") {
    await db.update(positionCompensationSplits).set({ endedAt: ts }).where(and(eq(positionCompensationSplits.sectorId, action.sectorId), isNull(positionCompensationSplits.endedAt)));
    const first = action.proposedBy;
    const second = [pair.a.memberId, pair.b.memberId].find((x) => x !== first)!;
    await db.insert(positionCompensationSplits).values({ communityId: community.id, sectorId: action.sectorId, firstMemberId: first, secondMemberId: second, firstSharePct: Number(payload.sharePct), agreedAt: ts });
    await writeRecord(db, community.id, "record", `${names} agreed in writing to ${checked.summary} (Rules of Procedure 6.7).`, null, ts);
  }
  return true;
}

export type RespondJointResult = { ok: true; status: "executed" | "declined" | "void" } | { ok: false; reason: "not-found" | "not-the-other-co-delegate" | "not-pending" };

/** The other co-Delegate accepts (it is carried out) or declines (a deadlock, for the 6.3 matters). */
export async function respondJointAction(db: Db, community: Community, memberId: number, actionId: number, accept: boolean, ts: number): Promise<RespondJointResult> {
  const [action] = await db.select().from(jointActions).where(and(eq(jointActions.id, actionId), eq(jointActions.communityId, community.id)));
  if (!action) return { ok: false, reason: "not-found" };
  if (action.status !== "pending") return { ok: false, reason: "not-pending" };
  const jp = await jointPositionOfMember(db, community.id, memberId, action.sectorId);
  if (!jp || action.proposedBy === memberId) return { ok: false, reason: "not-the-other-co-delegate" };
  const me = await nameOf(db, memberId);
  if (!accept) {
    await db.update(jointActions).set({ status: "declined", resolvedBy: memberId, resolvedAt: ts }).where(eq(jointActions.id, action.id));
    const referable = JOINT_REFERABLE_KINDS.includes(action.kind as JointKind);
    await writeRecord(
      db,
      community.id,
      "record",
      `${me} declined to jointly ${action.summary}.${referable ? " The co-Delegates are deadlocked; either may refer the question to a community vote at the Ordinary threshold (Rules of Procedure 6.5)." : " Without agreement the default rule stands."}`,
      memberId,
      ts
    );
    return { ok: true, status: "declined" };
  }
  const done = await executeJointAction(db, community, action, ts);
  await db.update(jointActions).set({ status: done ? "executed" : "void", resolvedBy: memberId, resolvedAt: ts }).where(eq(jointActions.id, action.id));
  if (!done) await writeRecord(db, community.id, "record", `A joint action to ${action.summary} could no longer be carried out and was dropped.`, memberId, ts);
  return { ok: true, status: done ? "executed" : "void" };
}

export async function withdrawJointAction(db: Db, community: Community, memberId: number, actionId: number, ts: number): Promise<{ ok: true } | { ok: false; reason: "not-found" | "not-yours" | "not-pending" }> {
  const [action] = await db.select().from(jointActions).where(and(eq(jointActions.id, actionId), eq(jointActions.communityId, community.id)));
  if (!action) return { ok: false, reason: "not-found" };
  if (action.proposedBy !== memberId) return { ok: false, reason: "not-yours" };
  if (action.status !== "pending") return { ok: false, reason: "not-pending" };
  await db.update(jointActions).set({ status: "withdrawn", resolvedBy: memberId, resolvedAt: ts }).where(eq(jointActions.id, action.id));
  await writeRecord(db, community.id, "record", `${await nameOf(db, memberId)} withdrew the request to jointly ${action.summary}.`, memberId, ts);
  return { ok: true };
}

export type ReferJointResult = { ok: true; proposalId: number } | { ok: false; reason: "not-found" | "not-a-co-delegate" | "not-deadlocked" | "not-referable" };

/** Rules of Procedure 6.5 — a deadlock on a 6.3 matter is put to a community vote at the Ordinary threshold. */
export async function referJointAction(db: Db, community: Community, memberId: number, actionId: number, ts: number): Promise<ReferJointResult> {
  const [action] = await db.select().from(jointActions).where(and(eq(jointActions.id, actionId), eq(jointActions.communityId, community.id)));
  if (!action) return { ok: false, reason: "not-found" };
  if (!JOINT_REFERABLE_KINDS.includes(action.kind as JointKind)) return { ok: false, reason: "not-referable" };
  if (action.status !== "declined") return { ok: false, reason: "not-deadlocked" };
  const jp = await jointPositionOfMember(db, community.id, memberId, action.sectorId);
  if (!jp) return { ok: false, reason: "not-a-co-delegate" };
  const [sector] = await db.select({ name: sectors.name }).from(sectors).where(eq(sectors.id, action.sectorId));
  const cfg = CLASS_CONFIG.ordinary;
  const voteOpensAt = ts + cfg.delibDays * DAY_MS;
  const [proposal] = await db
    .insert(proposals)
    .values({
      communityId: community.id,
      by: memberId,
      title: `Joint Position question (${sector?.name ?? "Position"}): ${action.summary}`,
      why: `The two co-Delegates of this Position could not agree on a matter that needs both of them (Rules of Procedure 6.3). Referred to the community under Rules of Procedure 6.5. If ratified, the Position does this: ${action.summary}. If not, it does not.`,
      cls: "ordinary",
      submittedAt: ts,
      voteFreezeAt: voteOpensAt - community.params.voteFreezeHours * 60 * 60 * 1000,
      voteOpensAt,
      votingClosesAt: voteOpensAt + cfg.voteDays * DAY_MS,
      jointActionId: action.id,
    })
    .returning({ id: proposals.id });
  await db.update(jointActions).set({ status: "referred", referralProposalId: proposal.id }).where(eq(jointActions.id, action.id));
  await writeRecord(db, community.id, "proposal", `${await nameOf(db, memberId)} referred a deadlock between the co-Delegates to a community vote (Rules of Procedure 6.5): ${action.summary}.`, memberId, ts);
  return { ok: true, proposalId: proposal.id };
}

/** Called when a referral vote closes: ratified carries the action out, anything else drops it. */
export async function resolveJointReferral(db: Db, community: Community, jointActionId: number, ratified: boolean, ts: number): Promise<void> {
  const [action] = await db.select().from(jointActions).where(and(eq(jointActions.id, jointActionId), eq(jointActions.communityId, community.id)));
  if (!action || action.status !== "referred") return;
  if (!ratified) {
    await db.update(jointActions).set({ status: "rejected", resolvedAt: ts }).where(eq(jointActions.id, action.id));
    await writeRecord(db, community.id, "record", `The community declined to have the Position ${action.summary}; it does not happen.`, null, ts);
    return;
  }
  const done = await executeJointAction(db, community, action, ts);
  await db.update(jointActions).set({ status: done ? "ratified" : "void", resolvedAt: ts }).where(eq(jointActions.id, action.id));
  if (!done) await writeRecord(db, community.id, "record", `The community ratified a joint Position question (${action.summary}) but it could no longer be carried out.`, null, ts);
}

/**
 * Rules of Procedure 6.8 — either co-Delegate may leave without affecting the
 * other's standing, and "the Position does not automatically revert to
 * requiring a second holder". Call after any recognition is revoked.
 */
export async function releaseCoDelegate(db: Db, communityId: number, revokedRecognitionId: number, ts: number): Promise<void> {
  const [rev] = await db.select().from(delegateRecognitions).where(eq(delegateRecognitions.id, revokedRecognitionId));
  if (!rev) return;
  const survivors = await db
    .select()
    .from(delegateRecognitions)
    .where(and(eq(delegateRecognitions.coDelegateOfId, revokedRecognitionId), isNull(delegateRecognitions.revokedAt), sql`${delegateRecognitions.id} != ${revokedRecognitionId}`));
  if (survivors.length === 0) return;
  for (const s of survivors) {
    await db.update(delegateRecognitions).set({ coDelegateOfId: null }).where(eq(delegateRecognitions.id, s.id));
    // The Position's nominations belong to the Position, not to one of its holders.
    await db.update(supportingNominees).set({ delegateRecognitionId: s.id }).where(and(eq(supportingNominees.delegateRecognitionId, revokedRecognitionId), isNull(supportingNominees.revokedAt)));
    await writeRecord(
      db,
      communityId,
      "record",
      `${await nameOf(db, s.memberId)} now holds the Position alone, as a sole Delegate under Charter 4.3 and subject to the same thresholds as any other. It does not revert to requiring a second holder (Rules of Procedure 6.8).`,
      s.memberId,
      ts
    );
  }
  await db.update(jointActions).set({ status: "void", resolvedAt: ts }).where(and(eq(jointActions.sectorId, rev.sectorId), inArray(jointActions.status, ["pending", "declined", "referred"])));
  await db.update(positionSpokespersons).set({ endedAt: ts }).where(and(eq(positionSpokespersons.sectorId, rev.sectorId), isNull(positionSpokespersons.endedAt)));
  await db.update(positionCompensationSplits).set({ endedAt: ts }).where(and(eq(positionCompensationSplits.sectorId, rev.sectorId), isNull(positionCompensationSplits.endedAt)));
}

/** Revokes Delegate recognitions and releases any co-Delegate the revocation leaves holding the Position alone. */
export async function revokeRecognitions(db: Db, communityId: number, recognitionIds: number[], ts: number, extra: Record<string, unknown> = {}): Promise<void> {
  for (const id of recognitionIds) {
    await db.update(delegateRecognitions).set({ revokedAt: ts, ...extra }).where(and(eq(delegateRecognitions.id, id), isNull(delegateRecognitions.revokedAt)));
    await releaseCoDelegate(db, communityId, id, ts);
  }
}

/** Rules of Procedure 6.6 — who speaks for a jointly held Position, and why. */
export async function currentSpokesperson(db: Db, community: Community, sectorId: number, ts: number): Promise<{ memberId: number; how: "agreement" | "larger-share" } | null> {
  const pair = await activePairInSector(db, community.id, sectorId);
  if (!pair) return null;
  const ids = [pair.a.memberId, pair.b.memberId];
  const [sp] = await db
    .select()
    .from(positionSpokespersons)
    .where(and(eq(positionSpokespersons.sectorId, sectorId), isNull(positionSpokespersons.endedAt)))
    .orderBy(desc(positionSpokespersons.designatedAt))
    .limit(1);
  if (sp && ids.includes(sp.memberId) && ts - sp.designatedAt <= community.params.delegationExpiryDays * DAY_MS) return { memberId: sp.memberId, how: "agreement" };
  const { perMember } = await sectorDelegationTotals(db, community.id, sectorId, ts, community.params.delegationExpiryDays);
  const sa = perMember.get(pair.a.memberId) ?? 0;
  const sb = perMember.get(pair.b.memberId) ?? 0;
  const winner = sa > sb ? pair.a : sb > sa ? pair.b : pair.a.recognizedAt <= pair.b.recognizedAt ? pair.a : pair.b;
  return { memberId: winner.memberId, how: "larger-share" };
}

/** Rules of Procedure 6.7 — the compensation split between the co-Delegates: even unless they agreed otherwise. */
export async function compensationSplitFor(db: Db, communityId: number, sectorId: number): Promise<{ first: number; second: number; firstPct: number; secondPct: number; agreed: boolean } | null> {
  const pair = await activePairInSector(db, communityId, sectorId);
  if (!pair) return null;
  const [row] = await db
    .select()
    .from(positionCompensationSplits)
    .where(and(eq(positionCompensationSplits.sectorId, sectorId), isNull(positionCompensationSplits.endedAt)))
    .orderBy(desc(positionCompensationSplits.agreedAt))
    .limit(1);
  if (row && [pair.a.memberId, pair.b.memberId].includes(row.firstMemberId) && [pair.a.memberId, pair.b.memberId].includes(row.secondMemberId)) {
    return { first: row.firstMemberId, second: row.secondMemberId, firstPct: row.firstSharePct, secondPct: 100 - row.firstSharePct, agreed: true };
  }
  return { first: pair.a.memberId, second: pair.b.memberId, firstPct: 50, secondPct: 50, agreed: false };
}

export async function listJointActions(db: Db, communityId: number, sectorId: number, limit = 30): Promise<ActionRow[]> {
  return db
    .select()
    .from(jointActions)
    .where(and(eq(jointActions.communityId, communityId), eq(jointActions.sectorId, sectorId)))
    .orderBy(desc(jointActions.proposedAt))
    .limit(limit);
}

/**
 * Rules of Procedure 6.1 — "the proposal states plainly that it is installing
 * a joint arrangement, not a single Delegate, before the vote opens." Returns
 * the sitting Delegate the candidate would currently share the Position with.
 */
export async function jointArrangementPreview(db: Db, community: Community, sectorId: number, candidateId: number, ts: number): Promise<{ withName: string; candidateShare: number; theirShare: number } | null> {
  const active = await db
    .select()
    .from(delegateRecognitions)
    .where(and(eq(delegateRecognitions.communityId, community.id), eq(delegateRecognitions.sectorId, sectorId), isNull(delegateRecognitions.revokedAt), isNull(delegateRecognitions.coDelegateOfId)));
  if (active.length === 0) return null;
  const { perMember, total } = await sectorDelegationTotals(db, community.id, sectorId, ts, community.params.delegationExpiryDays);
  const candShare = total > 0 ? (perMember.get(candidateId) ?? 0) / total : 0;
  for (const r of active) {
    if (r.memberId === candidateId) continue;
    const share = total > 0 ? (perMember.get(r.memberId) ?? 0) / total : 0;
    if (isCloselyTied(candShare, share, community.params.delegateTieMargin)) return { withName: await nameOf(db, r.memberId), candidateShare: candShare, theirShare: share };
  }
  return null;
}

/** Panelists actually seated: drawn and not declined (Dispute Procedure Code 3.2). */
export async function seatedPanelistIds(db: Db, panelId: number): Promise<number[]> {
  const rows = await db
    .select({ id: disputePanelMembers.memberId })
    .from(disputePanelMembers)
    .where(and(eq(disputePanelMembers.panelId, panelId), isNull(disputePanelMembers.declinedAt)));
  return rows.map((r) => r.id);
}

/**
 * Dispute Procedure Code 3.2 — a drawn panelist may decline within 48 hours
 * without stating reasons, and a replacement is drawn the same way.
 */
export async function declinePanelSeat(
  db: Db,
  community: Community,
  panelId: number,
  memberId: number,
  ts: number
): Promise<{ ok: true } | { ok: false; reason: "not-seated" | "window-closed" | "decided" }> {
  const [panel] = await db.select().from(disputePanels).where(and(eq(disputePanels.id, panelId), eq(disputePanels.communityId, community.id)));
  const [seat] = await db
    .select()
    .from(disputePanelMembers)
    .where(and(eq(disputePanelMembers.panelId, panelId), eq(disputePanelMembers.memberId, memberId), isNull(disputePanelMembers.declinedAt)));
  if (!panel || !seat) return { ok: false, reason: "not-seated" };
  if (panel.decision !== null) return { ok: false, reason: "decided" };
  if (ts > seat.drawnAt + PANEL_DECLINE_WINDOW_HOURS * 60 * 60 * 1000) return { ok: false, reason: "window-closed" };

  await db.update(disputePanelMembers).set({ declinedAt: ts }).where(eq(disputePanelMembers.id, seat.id));
  // A declined seat's vote (if somehow cast) no longer counts.
  await db.delete(disputePanelVotes).where(and(eq(disputePanelVotes.panelId, panelId), eq(disputePanelVotes.memberId, memberId)));

  const parties = await db.select().from(disputePanelParties).where(eq(disputePanelParties.panelId, panelId));
  const prior = await db
    .select({ seq: disputeDrawRequests.seq })
    .from(disputeDrawRequests)
    .where(eq(disputeDrawRequests.panelId, panelId));
  const [{ nextSeq }] = [{ nextSeq: Math.max(0, ...prior.map((r) => r.seq)) + 1 }];
  await requestPanelDraw(
    db,
    community.id,
    {
      subjectKind: panel.subjectKind,
      subjectId: panel.subjectId,
      panelId,
      seq: nextSeq,
      seats: 1,
      parties: parties.map((p) => ({ memberId: p.memberId, role: p.role })),
    },
    ts
  );
  await writeRecord(db, community.id, "record", `A drawn panelist declined their seat within ${PANEL_DECLINE_WINDOW_HOURS} hours (Dispute Procedure Code 3.2); a replacement is being drawn the same way.`, null, ts);
  return { ok: true };
}

/** Closes any Dispute Panel whose decision window has passed: majority-of-votes-cast decides, dismissed on a tie or no votes at all. Upholding a "conduct" challenge revokes the challenged Supporting Nominee. */
async function closeDisputePanels(db: Db, community: Community, ts: number) {
  const due = await db
    .select()
    .from(disputePanels)
    .where(and(eq(disputePanels.communityId, community.id), isNull(disputePanels.decision), lte(disputePanels.decidesBy, ts)));
  for (const panel of due) {
    // Dispute Procedure Code 4.2 — "The accused receives the specifics and has
    // 7 days to respond on the record. Right IV of the Bill of Rights admits no
    // exceptions: no decision before the response window closes, except where
    // the accused waives it." The window is a floor on deciding, never a
    // ceiling: once it has passed, or the accused has responded or waived, the
    // panel decides normally.
    const responseWindowOpen =
      ts < panel.respondBy && panel.respondedAt === null && panel.responseWaivedAt === null;
    if (responseWindowOpen) continue;
    // 3.2 — a seat vacated by a decline is refilled before the panel decides.
    const [outstanding] = await db
      .select({ id: disputeDrawRequests.id })
      .from(disputeDrawRequests)
      .where(and(eq(disputeDrawRequests.panelId, panel.id), isNull(disputeDrawRequests.completedAt)))
      .limit(1);
    if (outstanding) continue;
    if (panel.subjectKind === "conduct-report") {
      const [report] = await db.select().from(conductReports).where(eq(conductReports.id, panel.subjectId));
      if (report) {
        const seated = new Set(await seatedPanelistIds(db, panel.id));
        const cast = (await db.select().from(disputePanelVotes).where(eq(disputePanelVotes.panelId, panel.id))).filter((v) => seated.has(v.memberId));
        const prior = await priorSanctionSteps(db, community.id, report.accusedId);
        const outcome = conductOutcome(
          cast.map((v) => ({ step: v.step ?? (v.upheld === 1 ? 1 : 0), badFaith: v.badFaith === 1 })),
          report.provision,
          prior
        );
        await db
          .update(disputePanels)
          .set({ decision: outcome.decision, decidedAt: ts, sanctionStep: outcome.step > 0 ? outcome.step : null, badFaithFinding: outcome.badFaith ? 1 : 0 })
          .where(eq(disputePanels.id, panel.id));
        await applyConductFinding(db, community, panel, report, outcome, ts);
        continue;
      }
    }
    const voteRows = await db.select({ upheld: disputePanelVotes.upheld }).from(disputePanelVotes).where(eq(disputePanelVotes.panelId, panel.id));
    const decision = disputePanelOutcome(voteRows.map((v) => ({ upheld: v.upheld === 1 })));
    await db.update(disputePanels).set({ decision, decidedAt: ts }).where(eq(disputePanels.id, panel.id));

    if (panel.subjectKind === "supporting-nominee-conduct" && decision === "upheld") {
      await db.update(supportingNominees).set({ revokedAt: ts }).where(eq(supportingNominees.id, panel.subjectId));
    }
    await writeRecord(
      db,
      community.id,
      "record",
      `Dispute Panel decided: ${decision} (${voteRows.length} of ${DISPUTE_PANEL_SIZE} panelists voted).`,
      null,
      ts
    );
  }
}

// ---------- Charter 3.6 / Rules of Procedure 1.5b — delegation concentration ----------

async function activeSectorIds(db: Db, communityId: number): Promise<number[]> {
  const rows = await db.select({ id: sectors.id }).from(sectors).where(and(eq(sectors.communityId, communityId), eq(sectors.active, 1)));
  return rows.map((r) => r.id);
}

/**
 * Members who are concentrated holders (Charter 3.6) in any of `sectorIds` — or
 * in any active sector when none is given. Judged on live delegations at `ts`
 * against the ordinary renewal cycle; a delegation to one of these is then
 * judged against the shorter cycle when a vote is resolved.
 */
export async function concentrationHolders(db: Db, communityId: number, params: CharterParams, ts: number, sectorIds: number[] = []): Promise<Set<number>> {
  const ids = sectorIds.length > 0 ? sectorIds : await activeSectorIds(db, communityId);
  const out = new Set<number>();
  for (const sectorId of ids) {
    const { perMember, total } = await sectorDelegationTotals(db, communityId, sectorId, ts, params.delegationExpiryDays);
    if (total === 0) continue;
    for (const [memberId, supporters] of perMember) {
      if (concentrationTier(supporters / total, supporters, params.concentrationRenewalShare, params.concentrationReviewShare) !== "none") out.add(memberId);
    }
  }
  return out;
}

/** Charter 3.6 — has a concentration review ended this Member's delegations recently enough that no new one may be granted? `sectorId` null = an entire-scope delegation, barred by any sector's review. */
export async function concentrationBarred(db: Db, communityId: number, params: CharterParams, memberId: number, sectorId: number | null, ts: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(concentrationReviews)
    .where(and(eq(concentrationReviews.communityId, communityId), eq(concentrationReviews.memberId, memberId), eq(concentrationReviews.outcome, "ended")));
  return rows.some((r) => r.resolvedAt !== null && ts - r.resolvedAt < params.concentrationBarDays * DAY_MS && (sectorId === null || r.sectorId === sectorId));
}

/**
 * Each tick: a concentrated holder at/above the review share, with no review
 * open and none recently resolved in their favour, is put to a confirmation
 * vote — the Position-decision class, opened automatically, not by a Member
 * (Rules of Procedure 1.5b). Same shape as the recall-band vote of 1.5a.
 */
async function updateConcentrationReviews(db: Db, community: Community, ts: number) {
  const params = community.params;
  for (const sectorId of await activeSectorIds(db, community.id)) {
    const { perMember, total } = await sectorDelegationTotals(db, community.id, sectorId, ts, params.delegationExpiryDays);
    if (total === 0) continue;
    for (const [memberId, supporters] of perMember) {
      const share = supporters / total;
      if (concentrationTier(share, supporters, params.concentrationRenewalShare, params.concentrationReviewShare) !== "review") continue;
      const [holder] = await db.select({ leftAt: members.leftAt, seatKind: members.seatKind }).from(members).where(and(eq(members.id, memberId), eq(members.communityId, community.id)));
      if (!holder || holder.leftAt !== null || holder.seatKind !== null) continue;
      const prior = await db
        .select()
        .from(concentrationReviews)
        .where(and(eq(concentrationReviews.communityId, community.id), eq(concentrationReviews.sectorId, sectorId), eq(concentrationReviews.memberId, memberId)));
      if (prior.some((r) => r.resolvedAt === null)) continue;
      if (prior.some((r) => r.outcome === "kept" && r.resolvedAt !== null && ts - r.resolvedAt < params.concentrationReviewIntervalDays * DAY_MS)) continue;
      const cfg = CLASS_CONFIG.position;
      const voteOpensAt = ts + cfg.delibDays * DAY_MS;
      const voteFreezeAt = voteOpensAt - params.voteFreezeHours * 60 * 60 * 1000;
      const votingClosesAt = voteOpensAt + cfg.voteDays * DAY_MS;
      const [vote] = await db
        .insert(proposals)
        .values({
          communityId: community.id,
          by: memberId, // `by` is NOT NULL; the record line says plainly that nobody filed this
          title: "Concentration review: do delegations to this Member in this sector continue?",
          why: "Opened automatically: this Member holds at least the review share of the sector's active delegation (Founding Charter 3.6). Ratifying keeps their delegations; failing to reach the Position decision threshold ends every live delegation to them that applies in this sector, returning each delegator's vote to the delegator.",
          cls: "position",
          submittedAt: ts,
          voteFreezeAt,
          voteOpensAt,
          votingClosesAt,
          stage: "deliberation",
          critical: 1,
          positionAction: "concentration",
          targetMemberId: memberId,
          targetSectorId: sectorId,
        })
        .returning();
      await db.insert(concentrationReviews).values({ communityId: community.id, sectorId, memberId, proposalId: vote.id, openedAt: ts, supporters, sharePct: Math.round(share * 1000) / 10 });
      await writeRecord(
        db,
        community.id,
        "proposal",
        `Concentration review opened automatically (Charter 3.6, Rules of Procedure 1.5b): this Member holds ${supporters} of the sector's ${total} active delegations (${Math.round(share * 1000) / 10}%). No Member filed this. Their delegations continue unless the vote fails.`,
        memberId,
        ts
      );
    }
  }
}

/** Called when a concentration review's vote closes. Ratified keeps the holder; otherwise every live delegation to them that applies in the sector is ended. */
async function resolveConcentrationReview(db: Db, communityId: number, proposalId: number, targetMemberId: number, targetSectorId: number, ratified: boolean, ts: number) {
  const [review] = await db.select().from(concentrationReviews).where(and(eq(concentrationReviews.proposalId, proposalId), isNull(concentrationReviews.resolvedAt)));
  if (!review) return;
  if (ratified) {
    await db.update(concentrationReviews).set({ resolvedAt: ts, outcome: "kept" }).where(eq(concentrationReviews.id, review.id));
    await writeRecord(db, communityId, "record", `Concentration review ratified: delegations to this Member in the sector continue (Charter 3.6).`, targetMemberId, ts);
    return;
  }
  const live = await db
    .select({ id: delegations.id, memberId: delegations.memberId, sectorId: delegations.sectorId })
    .from(delegations)
    .innerJoin(members, eq(delegations.memberId, members.id))
    .where(and(eq(members.communityId, communityId), eq(delegations.toMemberId, targetMemberId), isNull(delegations.revokedAt)));
  const ending = live.filter((d) => d.sectorId === null || d.sectorId === targetSectorId);
  for (const d of ending) {
    await db.update(delegations).set({ revokedAt: ts }).where(eq(delegations.id, d.id));
    await revokeOpenVoteSnapshots(db, communityId, d.memberId, targetMemberId, d.sectorId, ts);
  }
  await db.update(concentrationReviews).set({ resolvedAt: ts, outcome: "ended" }).where(eq(concentrationReviews.id, review.id));
  await writeRecord(
    db,
    communityId,
    "record",
    `Concentration review did not reach the Position decision threshold: ${ending.length} delegation(s) to this Member that applied in the sector were ended, and each delegator's vote returned to the delegator (Charter 3.6). No new delegation to them may be granted for the bar period.`,
    targetMemberId,
    ts
  );
}

/**
 * Charter 4.7-4.9's tiered hysteresis, applied each tick. A Delegate whose
 * current sector-delegation share sits at/above the sustaining floor keeps
 * the Position untouched. One in the recall band (below the floor, at/above
 * the automatic-removal trigger) also keeps it untouched here — 4.8's
 * formal review is a community action (a confirmation vote or performance
 * review), not something this loop fires on its own. A Delegate whose share
 * drops below the trigger starts (or continues) a stored grace timer; once
 * params.delegateGraceDays has elapsed still below the trigger, the
 * recognition is revoked automatically, without a vote (Charter 4.9).
 * Recovering above the trigger at any point before the timer expires clears
 * it — "the Delegate may rebuild support before removal becomes automatic."
 */
async function updateDelegateGraceTimers(db: Db, community: Community, ts: number) {
  const live = await db
    .select()
    .from(delegateRecognitions)
    .where(and(eq(delegateRecognitions.communityId, community.id), isNull(delegateRecognitions.revokedAt)));
  if (live.length === 0) return;

  const bySector = new Map<number, typeof live>();
  for (const r of live) {
    const arr = bySector.get(r.sectorId) ?? [];
    arr.push(r);
    bySector.set(r.sectorId, arr);
  }

  for (const [sectorId, recognitions] of bySector) {
    const { perMember, total } = await sectorDelegationTotals(db, community.id, sectorId, ts, community.params.delegationExpiryDays);
    for (const r of recognitions) {
      // sectorDelegationTotals counts one per delegation, so this IS the
       // supporter count, and `total` is the sector's active delegations.
      const supporters = perMember.get(r.memberId) ?? 0;
      const share = total > 0 ? supporters / total : 0;
      const tier = delegateTier(
        share,
        community.params.delegateSustainingFloor,
        community.params.delegateRecallTrigger,
        supporters
      );

      if (tier === "grace") {
        if (r.belowTriggerSince === null) {
          await db.update(delegateRecognitions).set({ belowTriggerSince: ts }).where(eq(delegateRecognitions.id, r.id));
        } else if (graceExpired(r.belowTriggerSince, community.params.delegateGraceDays, ts)) {
          await revokeRecognitions(db, community.id, [r.id], ts);
          await writeRecord(
            db,
            community.id,
            "record",
            `Delegate recognition lapsed automatically: support stayed below the automatic-removal trigger for ${community.params.delegateGraceDays} days (Charter 4.9).`,
            r.memberId,
            ts
          );
        }
      } else if (tier === "recall") {
        // Charter 4.8 / Rules of Procedure 1.5a — the recall band opens a
        // confirmation vote. Before this existed the band did nothing at all:
        // 4.8 offered "a confirmation vote... or a public performance review,
        // as the Rules of Procedure specify" and the Rules specified neither,
        // so a Delegate could sit in the band indefinitely with no review.
        if (r.confirmationProposalId === null) {
          const cfg = CLASS_CONFIG.position;
          const voteOpensAt = ts + cfg.delibDays * DAY_MS;
          const voteFreezeAt = voteOpensAt - community.params.voteFreezeHours * 60 * 60 * 1000;
          const votingClosesAt = voteOpensAt + cfg.voteDays * DAY_MS;
          const [confirmation] = await db
            .insert(proposals)
            .values({
              communityId: community.id,
              // Opened by the sweep, not by a Member. `by` is NOT NULL, so the
              // incumbent is recorded as proposer — the record message below
              // states plainly that nobody filed this.
              by: r.memberId,
              title: "Confirmation vote: does this Delegate keep the Position?",
              why: "Opened automatically: delegated support fell into the recall band of Founding Charter 4.8. Ratifying this keeps the Delegate in the Position; failing to reach the threshold removes them.",
              cls: "position",
              submittedAt: ts,
              voteFreezeAt,
              voteOpensAt,
              votingClosesAt,
              stage: "deliberation",
              critical: 1,
              positionAction: "confirm",
              targetMemberId: r.memberId,
              targetSectorId: sectorId,
            })
            .returning();
          await db
            .update(delegateRecognitions)
            .set({ confirmationProposalId: confirmation.id, belowTriggerSince: null })
            .where(eq(delegateRecognitions.id, r.id));
          await writeRecord(
            db,
            community.id,
            "proposal",
            `Confirmation vote opened automatically (Charter 4.8, Rules of Procedure 1.5a): delegated support fell into the recall band. No Member filed this. The Position is held until the vote resolves.`,
            r.memberId,
            ts
          );
        }
      } else if (r.belowTriggerSince !== null) {
        await db.update(delegateRecognitions).set({ belowTriggerSince: null }).where(eq(delegateRecognitions.id, r.id));
      }
    }
  }
}

export async function computePeriodCredits(
  db: Db,
  communityId: number,
  periodStart: number,
  ts: number
): Promise<Map<number, Record<Domain, number>>> {
  const zero = (): Record<Domain, number> => ({ Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 });
  const out = new Map<number, Record<Domain, number>>();
  const get = (id: number) => {
    if (!out.has(id)) out.set(id, zero());
    return out.get(id)!;
  };

  // Contribution Code 1.4-1.6 — only claimed contributions count toward
  // period credits (and so toward the dividend, via computePeriodCredits'
  // caller in tick()). A verified-but-still-pending or lapsed-unclaimed
  // contribution contributes nothing here.
  // Code of Conduct 3.2 — a Member under accrual suspension earns nothing for
  // what is verified, or attested, while it runs. Participation, voting and
  // voice are untouched.
  const suspensions = await db
    .select({ memberId: memberSanctions.memberId, startsAt: memberSanctions.startsAt, endsAt: memberSanctions.endsAt })
    .from(memberSanctions)
    .where(and(eq(memberSanctions.communityId, communityId), eq(memberSanctions.kind, "accrual-suspension")));
  const accrualSuspendedAt = (memberId: number, at: number) =>
    suspensions.some((x) => x.memberId === memberId && at >= x.startsAt && (x.endsAt === null || at < x.endsAt));

  const verified = await db
    .select({ memberId: contributions.memberId, domain: contributions.domain, verifiedAt: contributions.verifiedAt })
    .from(contributions)
    .where(
      and(
        eq(contributions.communityId, communityId),
        gte(contributions.verifiedAt, periodStart),
        lte(contributions.verifiedAt, ts),
        isNotNull(contributions.claimedAt)
      )
    );
  for (const v of verified) {
    if (v.verifiedAt !== null && accrualSuspendedAt(v.memberId, v.verifiedAt)) continue;
    get(v.memberId)[v.domain as Domain] += 10;
  }

  const attested = await db
    .select({ attestorId: attestations.attestorId, contributorId: contributions.memberId, attestedAt: attestations.attestedAt })
    .from(attestations)
    .innerJoin(contributions, eq(attestations.contributionId, contributions.id))
    .where(
      and(
        eq(contributions.communityId, communityId),
        isNull(attestations.voidedAt),
        gte(attestations.attestedAt, periodStart),
        lte(attestations.attestedAt, ts)
      )
    );
  const events: AttestationEvent[] = attested.map((a) => ({ attestorId: a.attestorId, contributorId: a.contributorId, attestedAt: a.attestedAt }));
  const multipliers = reciprocityMultipliers(events);
  events.forEach((e, i) => {
    if (accrualSuspendedAt(e.attestorId, e.attestedAt)) return;
    get(e.attestorId).Attestation += 3 * multipliers[i];
  });

  return out;
}

// ---------- Contribution Mark claiming (Contribution Code 1.4-1.8) ----------

export type ClaimContributionResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_yours" | "not_verified" | "already_claimed" | "lapsed" };

/**
 * Contribution Code 1.4 — claiming is the member's own explicit act, only on
 * their own contribution, only once verified, only once, and only within
 * CONTRIBUTION_CLAIM_WINDOW_DAYS of verification. Per 1.6, a lapsed
 * contribution is never revived by a late claim — the underlying work has to
 * be logged again as a new contribution instead — so this deliberately does
 * not accept a claim past the window; it stays on the record marked
 * unclaimed. No re-verification and no dispute window reopened by claiming.
 */
export async function claimContribution(db: Db, communityId: number, memberId: number, contributionId: number, ts: number): Promise<ClaimContributionResult> {
  const [con] = await db.select().from(contributions).where(eq(contributions.id, contributionId));
  if (!con || con.communityId !== communityId) return { ok: false, reason: "not_found" };
  if (con.memberId !== memberId) return { ok: false, reason: "not_yours" };
  if (con.verifiedAt === null) return { ok: false, reason: "not_verified" };
  if (con.claimedAt !== null) return { ok: false, reason: "already_claimed" };
  const status = contributionClaimStatus(con.verifiedAt, con.claimedAt, ts, CONTRIBUTION_CLAIM_WINDOW_DAYS);
  if (status === "lapsed") return { ok: false, reason: "lapsed" };

  await db.update(contributions).set({ claimedAt: ts }).where(eq(contributions.id, contributionId));
  await writeRecord(db, communityId, "contribution", `${con.domain} contribution claimed (Contribution Code 1.4) — now counts toward standing and the dividend.`, memberId, ts);
  return { ok: true };
}

/**
 * Share of proposals completing the full lifecycle in the trailing
 * `windowDays` window (by votingClosesAt) that met minimum participation —
 * extracted from Charter 9.2's Phase I check (originally inline, 90 days
 * only) so Charter 9.3's Phase II governance-cadence criterion can reuse
 * the identical definition at 180 days instead of a parallel computation.
 * `count === 0` means nothing closed in the window — callers must treat
 * that as "no data," not as a rate of 0.
 */
export async function participationRateOverWindow(db: Db, communityId: number, ts: number, windowDays: number): Promise<{ rate: number; count: number }> {
  const windowStart = ts - windowDays * DAY_MS;
  const closedRecently = await db
    .select({ metMinParticipation: proposals.metMinParticipation })
    .from(proposals)
    .where(
      and(
        eq(proposals.communityId, communityId),
        eq(proposals.stage, "record"),
        gte(proposals.votingClosesAt, windowStart),
        lte(proposals.votingClosesAt, ts)
      )
    );
  const count = closedRecently.length;
  const rate = count > 0 ? closedRecently.filter((p) => p.metMinParticipation === 1).length / count : 0;
  return { rate, count };
}

/**
 * Charter 9.2 Foundation Criteria, assembled from the record. The
 * "delegationsRenewedOrRevoked" count is an approximation, documented
 * inline — a flat delegations table doesn't cleanly reconstruct "lapsed and
 * renewed" history, so this counts ever-revoked rows plus any (member,
 * sector) key that has been granted more than once (a renewal).
 */
export async function computeFoundingProgress(db: Db, community: Community, ts: number): Promise<FoundingProgress> {
  // Default-Delegate Mechanism seat placeholders never count toward Charter 9.2's "members"/
  // "active" figures — this is the Dashboard's Founding Criteria panel.
  const memberRows = await db.select({ id: members.id }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  // Charter 9.1's definition (a verified contribution in the trailing window),
  // the same one Phase II's Membership row uses, so the two boxes agree.
  const activeCount = await activeMemberCountByContribution(db, community.id, ts, community.params.activeWindowDays);

  const completedProposals = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.communityId, community.id), eq(proposals.stage, "record")));

  const dmap = await loadMemberDelegations(db, community.id);
  let liveDelegations = 0;
  for (const refs of dmap.values()) {
    for (const d of refs) {
      if (ts - d.grantedAt <= community.params.delegationExpiryDays * DAY_MS) liveDelegations++;
    }
  }

  const allDelegationRows = await db
    .select({ memberId: delegations.memberId, sectorId: delegations.sectorId, revokedAt: delegations.revokedAt })
    .from(delegations)
    .innerJoin(members, eq(delegations.memberId, members.id))
    .where(eq(members.communityId, community.id));
  const revokedCount = allDelegationRows.filter((r) => r.revokedAt !== null).length;
  const keyCounts = new Map<string, number>();
  for (const r of allDelegationRows) {
    const key = `${r.memberId}:${r.sectorId ?? "entire"}`;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const renewedCount = [...keyCounts.values()].filter((n) => n > 1).length;

  const participation90d = await participationRateOverWindow(db, community.id, ts, community.params.criteria.phase1.minParticipationWindowDays);
  const majorityMinParticipationOver90d = participation90d.count > 0 && participation90d.rate > 0.5;

  const verifiedDomains = await db
    .select({ domain: contributions.domain })
    .from(contributions)
    .where(and(eq(contributions.communityId, community.id), isNotNull(contributions.verifiedAt)));
  const domainsCovered = new Set(verifiedDomains.map((r) => r.domain));
  const allDomainsHaveVerifiedContribution = DOMAINS.every((d) => domainsCovered.has(d));

  return {
    members: memberRows.length,
    active: activeCount,
    proposalsCompleted: completedProposals.length,
    liveDelegations,
    delegationsRenewedOrRevoked: revokedCount + renewedCount,
    majorityMinParticipationOver90d,
    allDomainsHaveVerifiedContribution,
  };
}

// Kinds treasuryLedger has ever actually recorded (donation, dividend,
// dividend-return) — zero operating-expenditure events among them. Decision
// 3: checked live rather than hardcoded, so this flips the moment an
// "operations" (or similar) kind is first recorded, instead of silently
// going stale the way a hardcoded assumption would.
const KNOWN_NON_OPERATING_LEDGER_KINDS = ["donation", "dividend", "dividend-return"];

/**
 * Charter 9.3's Sustainability Criteria (Phase II) — MEASUREMENT ONLY
 * (Amendment D): computes and returns the seven bullets' current state.
 * Nothing here triggers a phase transition. A fixed, small number of bulk
 * queries (independent of windowDays) feeds the pure, in-memory daily
 * sampling in mechanics.ts — see that file's own comments for why each
 * bullet is either daily-sampled (a state condition) or a single
 * window-aggregate (a rate or count over the whole window).
 */
export async function computeSustainabilityProgress(db: Db, community: Community, ts: number): Promise<SustainabilityProgress> {
  const criteria = community.params.criteria.phase2;
  const windowDays = criteria.nonDecliningWindowDays;
  const historyDays = Math.floor((ts - community.createdAt) / DAY_MS);
  const hasFullWindowHistory = historyDays >= windowDays;

  // ---- Bulk fetch (fixed query count, independent of windowDays) ----
  const memberRows: RawMemberRow[] = await db
    .select({ id: members.id, joinedAt: members.joinedAt, leftAt: members.leftAt })
    .from(members)
    .where(and(eq(members.communityId, community.id), EVER_REAL_MEMBER));

  // One row per (contribution, sector-tag) — a LEFT JOIN so an untagged
  // contribution still appears once (sectorId null), still usable for the
  // active-member reconstruction even though it can't feed the per-sector
  // Steward check. isNotNull(verifiedAt) only (not claimedAt) — Charter
  // 9.1's "Active Member" is "verified contribution," full stop; the
  // stronger claimedAt requirement is Contribution Code 1.3's own rule for
  // standing, applied separately inside stewardsAt.
  const contributionRows: RawContributionRow[] = (
    await db
      .select({ memberId: contributions.memberId, verifiedAt: contributions.verifiedAt, sectorId: contributionSectors.sectorId })
      .from(contributions)
      .leftJoin(contributionSectors, eq(contributionSectors.contributionId, contributions.id))
      .where(and(eq(contributions.communityId, community.id), isNotNull(contributions.verifiedAt)))
  ).map((r) => ({ memberId: r.memberId, verifiedAt: r.verifiedAt as number, sectorId: r.sectorId }));

  const delegationRows: RawDelegationRow[] = await db
    .select({ memberId: delegations.memberId, toMemberId: delegations.toMemberId, sectorId: delegations.sectorId, grantedAt: delegations.grantedAt, revokedAt: delegations.revokedAt })
    .from(delegations)
    .innerJoin(members, eq(delegations.memberId, members.id))
    .where(eq(members.communityId, community.id));

  const sectorRows = await db.select({ id: sectors.id }).from(sectors).where(and(eq(sectors.communityId, community.id), eq(sectors.active, 1)));
  const sectorIds = sectorRows.map((s) => s.id);

  const windowStart = ts - windowDays * DAY_MS;
  const completedInWindow = await db
    .select({ by: proposals.by, metMinParticipation: proposals.metMinParticipation })
    .from(proposals)
    .where(
      and(
        eq(proposals.communityId, community.id),
        eq(proposals.stage, "record"),
        gte(proposals.votingClosesAt, windowStart),
        lte(proposals.votingClosesAt, ts)
      )
    );

  const panelRows = await db
    .select({ decidesBy: disputePanels.decidesBy, decidedAt: disputePanels.decidedAt })
    .from(disputePanels)
    .where(eq(disputePanels.communityId, community.id));

  const allRuns = await db.select({ periodEnd: dividendRuns.periodEnd }).from(dividendRuns).where(eq(dividendRuns.communityId, community.id));

  const nonOperatingKinds = KNOWN_NON_OPERATING_LEDGER_KINDS;
  const ledgerRows = await db.select({ kind: treasuryLedger.kind }).from(treasuryLedger).where(eq(treasuryLedger.communityId, community.id));
  const reserveNonStandardLedgerEntries = ledgerRows.filter((r) => !nonOperatingKinds.includes(r.kind)).length;

  // ---- Pure, in-memory computation (no further D1 queries) ----
  const daily = sampleSustainabilityWindowDaily(
    ts,
    windowDays,
    memberRows,
    contributionRows,
    delegationRows,
    sectorIds,
    community.params.activeWindowDays,
    community.params.delegationExpiryDays,
    community.params.standingWindowDays,
    criteria
  );

  const participation = await participationRateOverWindow(db, community.id, ts, windowDays);

  return {
    computedAt: ts,
    windowDays,
    historyDays,
    hasFullWindowHistory,

    members: daily.currentMembers,
    active: daily.currentActive,
    membershipNonDeclining: daily.membershipNonDeclining,
    membershipFloorHeldEveryDay: daily.membershipFloorHeldEveryDay,

    proposalsCompletedInWindow: completedInWindow.length,
    proposalsPerMonth: proposalsPerMonthRate(completedInWindow.length, windowDays),
    participationRate: participation.rate,
    participationSampleCount: participation.count,

    currentMaxDelegateShare: daily.currentMaxDelegateShare,
    maxDelegateShareHeldEveryDay: daily.maxDelegateShareHeldEveryDay,
    renewalsFunctioning: renewalsFunctioningInWindow(delegationRows, ts, windowDays, community.params.delegationExpiryDays),

    consecutiveOnTimeDividendRunsCount: consecutiveOnTimeDividendRuns(allRuns, community.dividendActivatedAt, community.params.periodDays),
    reserveComputed: false,
    reserveNonStandardLedgerEntries,

    disputePanelsResolvedInWindow: disputePanelsResolvedInWindow(panelRows, ts, windowDays),

    currentStewardCount: daily.currentStewardCount,
    currentSectorsWithStewardship: daily.currentSectorsWithStewardship,
    stewardDepthHeldEveryDay: daily.stewardDepthHeldEveryDay,

    founderId: community.founderId,
    founderProposalShareInWindow: founderProposalShareInWindow(completedInWindow.map((p) => p.by), community.founderId),
  };
}

/** Parses the cached Phase II snapshot (tick() writes it at most once per 24h) — null if none exists yet. */
export async function loadSustainabilitySnapshot(db: Db, communityId: number): Promise<{ computedAt: number; progress: SustainabilityProgress } | null> {
  const [row] = await db.select().from(sustainabilitySnapshots).where(eq(sustainabilitySnapshots.communityId, communityId));
  if (!row) return null;
  return { computedAt: row.computedAt, progress: JSON.parse(row.result) as SustainabilityProgress };
}

// ---------- Minority reports (Rules of Procedure 5.3) ----------

export interface MinorityReportEntry {
  id: number;
  memberId: number;
  memberName: string;
  body: string;
  filedAt: number;
}

/** Rules of Procedure 5.3 — opt-in only; one per Member per proposal, enforced by the schema's unique constraint. A second attempt is silently a no-op, not an error. */
export async function fileMinorityReport(db: Db, communityId: number, proposalId: number, memberId: number, body: string, ts: number) {
  const existing = await db
    .select({ id: minorityReports.id })
    .from(minorityReports)
    .where(and(eq(minorityReports.proposalId, proposalId), eq(minorityReports.memberId, memberId)));
  if (existing.length > 0) return;
  await db.insert(minorityReports).values({ communityId, proposalId, memberId, body, filedAt: ts });
  await writeRecord(db, communityId, "record", `Minority report filed (Rules of Procedure 5.3).`, memberId, ts);
}

export async function loadMinorityReports(db: Db, proposalId: number): Promise<MinorityReportEntry[]> {
  const rows = await db
    .select({ id: minorityReports.id, memberId: minorityReports.memberId, memberName: members.name, body: minorityReports.body, filedAt: minorityReports.filedAt })
    .from(minorityReports)
    .innerJoin(members, eq(minorityReports.memberId, members.id))
    .where(eq(minorityReports.proposalId, proposalId))
    .orderBy(minorityReports.filedAt);
  return rows;
}

export interface ProfilePosition {
  kind: "steward" | "delegate" | "nominee";
  sectorId: number;
  sectorName: string;
  title?: string; // nominee only
}

export interface MemberProfile {
  memberId: number;
  // Code of Conduct 3 / 4.4 — findings against this Member, public by design.
  sanctions: { kind: string; step: number; startsAt: number; endsAt: number | null; panelId: number; overturnedAt: number | null }[];
  name: string;
  visibilityLevel: string;
  contributions: { id: number; domain: string; description: string; sectorNames: string[]; verified: boolean; loggedAt: number }[];
  positions: ProfilePosition[];
  myDelegations: { toName: string; scopeName: string }[];
  heldByCount: number;
  // Triarc Membership Code 2.1 (Prompt25_PathA_MembershipEnforcement.md) —
  // never rendered publicly; the Profile page only shows this on the
  // member's own self-view (2.1/3.3: never disclosed to anyone else).
  phoneVerifiedAt: number | null;
  // Dispute Procedure Code 2.1 — whether this Member has volunteered for the
  // Dispute Panel pool. Own-view only, like phoneVerifiedAt above.
  disputePoolOptInAt: number | null;
  // Charter 1.3 — set once the Member has left; their record stays public.
  leftAt: number | null;
}

/** Aggregates everything the Profile page shows — all from data that already exists elsewhere, assembled in one place for the first time. */
export async function buildMemberProfile(db: Db, community: Community, memberId: number, ts: number): Promise<MemberProfile> {
  const [m] = await db.select().from(members).where(eq(members.id, memberId));

  const conRows = await db.select().from(contributions).where(eq(contributions.memberId, memberId)).orderBy(desc(contributions.loggedAt)).limit(50);
  const sectorNameById = new Map((await db.select().from(sectors).where(eq(sectors.communityId, community.id))).map((s) => [s.id, s.name]));
  const conSectorRows = await db.select().from(contributionSectors);
  const sectorsByContribution = new Map<number, number[]>();
  for (const r of conSectorRows) {
    const arr = sectorsByContribution.get(r.contributionId) ?? [];
    arr.push(r.sectorId);
    sectorsByContribution.set(r.contributionId, arr);
  }
  const contributionRows = conRows.map((c) => ({
    id: c.id,
    domain: c.domain,
    description: c.description,
    sectorNames: (sectorsByContribution.get(c.id) ?? []).map((id) => sectorNameById.get(id) ?? "").filter(Boolean),
    verified: c.verifiedAt !== null,
    loggedAt: c.loggedAt,
  }));

  const directory = await computeStewardsAndDelegates(db, community, ts);
  const positions: ProfilePosition[] = [];
  for (const entry of directory) {
    if (entry.stewards.some((s) => s.memberId === memberId)) positions.push({ kind: "steward", sectorId: entry.sectorId, sectorName: entry.sectorName });
    for (const d of entry.delegates) {
      if (d.memberId === memberId) positions.push({ kind: "delegate", sectorId: entry.sectorId, sectorName: entry.sectorName });
      for (const n of d.nominees) {
        if (n.memberId === memberId) positions.push({ kind: "nominee", sectorId: entry.sectorId, sectorName: entry.sectorName, title: n.title });
      }
    }
  }

  const myRows = await currentDelegationRows(db, memberId);
  const ordinaryExpiry = community.params.delegationExpiryDays;
  const nameById = new Map((await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.communityId, community.id))).map((x) => [x.id, x.name]));
  const myDelegations = myRows
    .filter((d) => ts - d.grantedAt <= ordinaryExpiry * DAY_MS)
    .map((d) => ({ toName: nameById.get(d.toId) ?? "a member", scopeName: d.sectorId === null ? "Entire" : sectorNameById.get(d.sectorId) ?? "a sector" }));

  const dmap = await loadMemberDelegations(db, community.id);
  let heldByCount = 0;
  for (const refs of dmap.values()) {
    for (const d of refs) {
      if (d.toId === memberId && ts - d.grantedAt <= ordinaryExpiry * DAY_MS) heldByCount++;
    }
  }

  return {
    memberId,
    name: m?.name ?? "member",
    visibilityLevel: m?.visibilityLevel ?? "open",
    contributions: contributionRows,
    positions,
    myDelegations,
    heldByCount,
    phoneVerifiedAt: m?.phoneVerifiedAt ?? null,
    disputePoolOptInAt: m?.disputePoolOptInAt ?? null,
    leftAt: m?.leftAt ?? null,
    sanctions: (await db.select().from(memberSanctions).where(eq(memberSanctions.memberId, memberId)).orderBy(desc(memberSanctions.createdAt))).map((x) => ({ kind: x.kind, step: x.step, startsAt: x.startsAt, endsAt: x.endsAt, panelId: x.panelId, overturnedAt: x.overturnedAt })),
  };
}

// ---------- Governance-health dashboard (Rules of Procedure 7) ----------
// Public, read-only, informational only — nothing here restricts or blocks
// any action. Methodology is a parameter, not a principle (RoP 7.2): every
// number below is a documented, honestly-scoped proxy computed from data
// this app already tracks, not a claim of a single canonical formula.

function topNShare<T>(counts: Map<T, number>, n: number): { top1: number; topN: number; total: number } {
  const values = [...counts.values()].sort((a, b) => b - a);
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return { top1: 0, topN: 0, total: 0 };
  const top1 = (values[0] ?? 0) / total;
  const topN = values.slice(0, n).reduce((s, v) => s + v, 0) / total;
  return { top1, topN, total };
}

export interface GovernanceHealth {
  computedAt: number;
  delegation: {
    totalLiveDelegations: number;
    largestRecipientShare: number; // Charter 9.3's own "no Member holds more than 10% of all delegated votes" figure
    top5Share: number;
    top10Share: number;
    pctMembersWithNoOutgoingDelegation: number; // members voting directly on everything, delegating nothing
  };
  contribution: {
    top5CreditShare: number; // share of all-time verified Marks held by the 5 most-Marked members
    domainShares: Record<Domain, number>; // observed share of verified Marks per domain, vs. Contribution Code 2's target weights
    top5AttestorShare: number; // share of all non-voided attestations made by the 5 most active attestors
    // Contribution Code 2.1's domain issuance pool, for the current
    // in-progress period — always computed regardless of
    // domainIssuanceCapEnabled ("what a hard cap would currently do").
    // Distinct from domainShares above (all-time, unweighted contribution
    // counts) — this uses the same weighted, period-scoped raw Marks the
    // real dividend computation runs on.
    domainIssuanceCap: DomainIssuanceReport;
  };
  institutional: {
    distinctHolders: number; // distinct members holding any Delegate or Supporting Nominee role right now
    totalSeats: number; // active Delegate recognitions + active Supporting Nominee roles right now
    concentrationShare: number; // 0 = every seat held by a different person; approaches 1 as seats concentrate in fewer people
    disputePanelPoolSize: number; // distinct members who have ever been drawn to a panel — Dispute Procedure Code 2.1's volunteer pool, approximated
  };
  pluralism: {
    distinctActiveLeaders: number; // distinct members holding Civic Steward or Delegate recognition in any sector
    sectorsWithLeadership: number;
    top5ProposalAuthorShare: number; // share of all submitted proposals authored by the 5 most prolific proposers
  };
  resilience: {
    civicStewardCount: number; // distinct members currently Steward-eligible somewhere — the bench a Delegate vacancy could draw from
    // Charter 9.3's founder-independence criterion: founder-authored share of
    // proposals completing the full lifecycle in the trailing window. Null
    // when no founder is on record yet (schema.ts's communities.founderId) —
    // never the founder's name, which is never displayed publicly.
    founderProposalShareInWindow: number | null;
    // Whether a founder is on record at all, so the view can tell "no founder
    // recorded" apart from "founder recorded, nothing completed yet".
    founderRecorded: boolean;
  };
  delegatedAuthorityMechanism: null; // Government Adoption Compact 4.7/4.8's delegated-authority-exercised and implementation/override rates — not applicable until some government has actually ratified a Delegated-Authority Mechanism agreement (renamed from "Path B" in the Aug 2026 documentation amendment — see CLAUDE.md's Naming section)
}

export async function computeGovernanceHealth(db: Db, community: Community, ts: number): Promise<GovernanceHealth> {
  // Excludes Default-Delegate Mechanism seat placeholders — otherwise they'd inflate
  // pctMembersWithNoOutgoingDelegation's denominator below (they never
  // delegate), since seats are seeded as members rows too.
  const memberRows = await db
    .select({ id: members.id, name: members.name, joinedAt: members.joinedAt })
    .from(members)
    .where(and(eq(members.communityId, community.id), REAL_MEMBER))
    .orderBy(members.joinedAt);

  // ---- Delegation concentration ----
  const dmap = await loadMemberDelegations(db, community.id);
  const expiryMs = community.params.delegationExpiryDays * DAY_MS;
  const recipientCounts = new Map<number, number>();
  let membersWithOutgoing = 0;
  for (const m of memberRows) {
    const refs = (dmap.get(m.id) ?? []).filter((d) => ts - d.grantedAt <= expiryMs);
    if (refs.length > 0) membersWithOutgoing++;
    for (const d of refs) recipientCounts.set(d.toId, (recipientCounts.get(d.toId) ?? 0) + 1);
  }
  const delegationShares = topNShare(recipientCounts, 5);
  const delegationTop10 = topNShare(recipientCounts, 10);

  // ---- Contribution distribution ----
  const verifiedContributions = await db
    .select({ memberId: contributions.memberId, domain: contributions.domain })
    .from(contributions)
    .where(and(eq(contributions.communityId, community.id), isNotNull(contributions.verifiedAt)));
  const creditsByMember = new Map<number, number>();
  const creditsByDomain: Record<Domain, number> = { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 };
  for (const row of verifiedContributions) {
    creditsByMember.set(row.memberId, (creditsByMember.get(row.memberId) ?? 0) + 1);
    creditsByDomain[row.domain as Domain] = (creditsByDomain[row.domain as Domain] ?? 0) + 1;
  }
  const contributionShares = topNShare(creditsByMember, 5);
  const totalDomainCredits = DOMAINS.reduce((s, d) => s + creditsByDomain[d], 0);
  const domainShares = Object.fromEntries(DOMAINS.map((d) => [d, totalDomainCredits > 0 ? creditsByDomain[d] / totalDomainCredits : 0])) as Record<Domain, number>;

  // Contribution Code 2.1's domain issuance pool — always computed and
  // shown here, regardless of domainIssuanceCapEnabled, labeled plainly as
  // "what a hard cap would currently do" (Prompt32 Part A.2). Distinct from
  // domainShares just above: that's an all-time, unweighted contribution
  // *count* by domain; this is the *current, in-progress period's* raw
  // claimed Marks (properly weighted — 10/verified+claimed contribution, 3×
  // reciprocity-damped/attestation), the same input tick()'s real dividend
  // computation uses.
  const [currentTreasuryState] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));
  const periodStart = currentTreasuryState?.lastDividendAt ?? ts;
  const currentPeriodCredits = await computePeriodCredits(db, community.id, periodStart, ts);
  const domainIssuanceCap = computeDomainIssuanceReport([...currentPeriodCredits.values()], community.params.domainShares);

  const attestationRows = await db
    .select({ attestorId: attestations.attestorId })
    .from(attestations)
    .innerJoin(contributions, eq(attestations.contributionId, contributions.id))
    .where(and(eq(contributions.communityId, community.id), isNull(attestations.voidedAt)));
  const attestationsByMember = new Map<number, number>();
  for (const row of attestationRows) attestationsByMember.set(row.attestorId, (attestationsByMember.get(row.attestorId) ?? 0) + 1);
  const attestationShares = topNShare(attestationsByMember, 5);

  // ---- Institutional concentration, pluralism, resilience (shared source: computeStewardsAndDelegates) ----
  const directory = await computeStewardsAndDelegates(db, community, ts);
  const institutionalHolders = new Map<number, number>(); // memberId -> seat count
  let totalSeats = 0;
  const activeLeaderIds = new Set<number>();
  let sectorsWithLeadership = 0;
  for (const entry of directory) {
    let sectorHasLeadership = false;
    for (const s of entry.stewards) {
      activeLeaderIds.add(s.memberId);
      sectorHasLeadership = true;
    }
    for (const d of entry.delegates) {
      activeLeaderIds.add(d.memberId);
      sectorHasLeadership = true;
      institutionalHolders.set(d.memberId, (institutionalHolders.get(d.memberId) ?? 0) + 1);
      totalSeats++;
      for (const n of d.nominees) {
        institutionalHolders.set(n.memberId, (institutionalHolders.get(n.memberId) ?? 0) + 1);
        totalSeats++;
      }
    }
    if (sectorHasLeadership) sectorsWithLeadership++;
  }
  const institutionalConcentration = totalSeats > 0 ? 1 - institutionalHolders.size / totalSeats : 0;

  // Dispute Procedure Code 2.1's volunteer pool, counted directly. This used
  // to be approximated as "distinct Members who have ever been drawn to a
  // panel" — circular (you could only join the pool by already having been
  // drawn from it) and inconsistent with what drawRandomPanel actually drew
  // from, so the dashboard could report 0 while a full panel was seated.
  const poolRows = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.communityId, community.id),
        gte(members.lastActiveAt, ts - community.params.activeWindowDays * DAY_MS),
        isNotNull(members.disputePoolOptInAt),
        REAL_MEMBER
      )
    );
  const disputePanelPoolSize = poolRows.length;

  // ---- Pluralism: proposal-authorship concentration ----
  const authorRows = await db.select({ by: proposals.by }).from(proposals).where(eq(proposals.communityId, community.id));
  const proposalsByAuthor = new Map<number, number>();
  for (const row of authorRows) proposalsByAuthor.set(row.by, (proposalsByAuthor.get(row.by) ?? 0) + 1);
  const authorShares = topNShare(proposalsByAuthor, 5);

  // ---- Resilience: Charter 9.3's founder-independence figure ----
  const founderWindowDays = community.params.criteria.phase2.nonDecliningWindowDays;
  const founderWindowStart = ts - founderWindowDays * DAY_MS;
  const completedInFounderWindow = await db
    .select({ by: proposals.by })
    .from(proposals)
    .where(
      and(
        eq(proposals.communityId, community.id),
        eq(proposals.stage, "record"),
        gte(proposals.votingClosesAt, founderWindowStart),
        lte(proposals.votingClosesAt, ts)
      )
    );
  const founderShare = founderProposalShareInWindow(completedInFounderWindow.map((p) => p.by), community.founderId);

  return {
    computedAt: ts,
    delegation: {
      totalLiveDelegations: delegationShares.total,
      largestRecipientShare: delegationShares.top1,
      top5Share: delegationShares.topN,
      top10Share: delegationTop10.topN,
      pctMembersWithNoOutgoingDelegation: memberRows.length > 0 ? 1 - membersWithOutgoing / memberRows.length : 0,
    },
    contribution: {
      top5CreditShare: contributionShares.topN,
      domainShares,
      top5AttestorShare: attestationShares.topN,
      domainIssuanceCap,
    },
    institutional: {
      distinctHolders: institutionalHolders.size,
      totalSeats,
      concentrationShare: institutionalConcentration,
      disputePanelPoolSize,
    },
    pluralism: {
      distinctActiveLeaders: activeLeaderIds.size,
      sectorsWithLeadership,
      top5ProposalAuthorShare: authorShares.topN,
    },
    resilience: {
      civicStewardCount: activeLeaderIds.size,
      founderProposalShareInWindow: founderShare,
      founderRecorded: community.founderId !== null,
    },
    delegatedAuthorityMechanism: null,
  };
}

async function closeOneVote(db: Db, communityId: number, proposal: typeof proposals.$inferSelect, ts: number, requirePhoneVerification: boolean) {
  const votingMembers = await loadVotingMembers(db, communityId);
  const directVotes = await db.select().from(votes).where(eq(votes.proposalId, proposal.id));
  const voteMap: Record<number, boolean> = {};
  for (const v of directVotes) voteMap[v.memberId] = v.value === 1;

  // Same merge shim as the main load path above: a stored params blob may predate
  // any top-level field added since it was written, and a raw JSON.parse here would
  // hand back undefined for it. That bit on 3 Oct 2026 when foundationFloorPerMember
  // became foundationPoolShare — every community row still carried the old key.
  const params: CharterParams = {
    ...DEFAULT_PARAMS,
    ...JSON.parse((await db.select().from(communities).where(eq(communities.id, communityId)))[0].params),
  };
  const sectorRows = await db.select({ sectorId: proposalSectors.sectorId }).from(proposalSectors).where(eq(proposalSectors.proposalId, proposal.id));
  const proposalSectorIds = sectorRows.map((r) => r.sectorId);

  const expiryDays = proposal.critical ? params.delegationExpiryCriticalDays : params.delegationExpiryDays;

  // Triarc Membership Code 2.1/2.3 (Prompt25_PathA_MembershipEnforcement.md
  // Part D), the Triarc only. An unverified member is excluded from the graph
  // resolveVote actually walks — not from votingMembers itself, which stays
  // every real Member regardless of verification (the minimum-participation
  // denominator below is deliberately untouched; this Code doesn't say
  // otherwise). Excluding them here means a live delegation that somehow
  // still targets an unverified member (write-time checks in index.tsx
  // should already prevent this — this is defense-in-depth for tallying)
  // resolves exactly the way resolveVote already handles a delegate who's
  // left the community: `byId.get(toId)` misses, the chain breaks, nothing
  // resolves for that link. No branch inside resolveVote itself changes —
  // it stays fully deployment-agnostic.
  // Rules of Procedure 3.3 — resolve against the snapshot taken when voting
  // opened, not against live delegation state. Grants made during the window
  // are absent from it by construction; revocations during the window are
  // marked on it and filtered out here.
  const snapRows = await db
    .select({ memberId: proposalDelegationSnapshots.memberId, toId: proposalDelegationSnapshots.toMemberId, sectorId: proposalDelegationSnapshots.sectorId, grantedAt: proposalDelegationSnapshots.grantedAt, capturedAt: proposalDelegationSnapshots.capturedAt })
    .from(proposalDelegationSnapshots)
    .where(and(eq(proposalDelegationSnapshots.proposalId, proposal.id), isNull(proposalDelegationSnapshots.revokedAt)));
  // A proposal already in "voting" when this shipped has no snapshot. Fall
  // back to live delegations exactly as before, and say so on the record — two
  // proposals tallied by different rules must not look identical afterwards.
  const anySnapshot = await db
    .select({ id: proposalDelegationSnapshots.id })
    .from(proposalDelegationSnapshots)
    .where(eq(proposalDelegationSnapshots.proposalId, proposal.id))
    .limit(1);
  const usedSnapshot = anySnapshot.length > 0;
  // Delegation expiry (Charter 3.3's renewal cycle) is judged at capture, not
  // at close: a delegation live when voting opened must not silently lapse
  // mid-window, which would move the resolution after the fact.
  const resolveAt = usedSnapshot ? (snapRows[0]?.capturedAt ?? proposal.voteOpensAt) : ts;
  const snapshotMembers = snapshotToVotingMembers(votingMembers.map((m) => m.id), snapRows);

  let phoneVerifiedById: Map<number, number | null> | null = null;
  let resolutionMembers = usedSnapshot ? snapshotMembers : votingMembers;
  if (requirePhoneVerification) {
    const phoneRows = await db.select({ id: members.id, phoneVerifiedAt: members.phoneVerifiedAt }).from(members).where(and(eq(members.communityId, communityId), REAL_MEMBER));
    phoneVerifiedById = new Map(phoneRows.map((r) => [r.id, r.phoneVerifiedAt]));
    resolutionMembers = votingMembers.filter((m) => isPhoneVerified(phoneVerifiedById!.get(m.id) ?? null));
  }

  // Charter 3.6 — delegations to a concentrated holder are judged against the shorter renewal cycle, critical vote or not.
  const concentrated = await concentrationHolders(db, communityId, params, ts, proposalSectorIds);
  let tally = resolveVote(resolutionMembers, voteMap, resolveAt, expiryDays, proposalSectorIds, concentrated.size ? { targets: concentrated, days: params.delegationExpiryCriticalDays } : undefined);

  // Triarc Membership Code 2.4 — additionally, for a Position decision only,
  // a vote (direct or resolved via delegation) doesn't count unless the
  // originating member has held verified Membership for at least
  // positionVoteEligibilityDays as of this tally. This is a second, stricter
  // filter layered on top of the unverified-exclusion above, not a
  // replacement for it — an already-excluded unverified member is also
  // under 30 days verified by construction (isPositionVoteEligible returns
  // false for null), so this is safe to apply unconditionally to whatever
  // resolutions remain.
  if (requirePhoneVerification && proposal.cls === "position" && phoneVerifiedById) {
    const requiredDays = params.positionVoteEligibilityDays;
    tally = filterTallyByEligibility(tally, (memberId) => isPositionVoteEligible(phoneVerifiedById!.get(memberId) ?? null, ts, requiredDays));
  }

  const cfg = CLASS_CONFIG[proposal.cls as ProposalClass];
  const outcome = closeVote(votingMembers.length, tally, cfg);

  await db
    .update(proposals)
    .set({ stage: "record", outcome: outcome.label, tally: JSON.stringify(tally), metMinParticipation: outcome.metMinParticipation ? 1 : 0 })
    .where(eq(proposals.id, proposal.id));

  await writeRecord(
    db,
    communityId,
    "record",
    `"${proposal.title}" closed: ${outcome.label} (${tally.participating} of ${votingMembers.length} members participating, directly or by delegation).${usedSnapshot ? "" : " Resolved against live delegations — this proposal predates the Rules of Procedure 3.3 vote-open snapshot."}`,
    null,
    ts
  );

  // Dispute Procedure Code 6.1 — a ratified overturn proposal overturns the
  // panel decision it names.
  if (proposal.overturnsPanelId && outcome.ratified) {
    await overturnPanelDecision(db, communityId, proposal.overturnsPanelId, ts);
  }

  // Rules of Procedure 6.5 — a ratified referral carries the joint action out;
  // anything else drops it.
  if (proposal.jointActionId) {
    const [comm] = await db.select().from(communities).where(eq(communities.id, communityId));
    if (comm) {
      const asCommunity: Community = { id: comm.id, name: comm.name, params, clockOffsetMs: comm.clockOffsetMs, dividendActivatedAt: comm.dividendActivatedAt, createdAt: comm.createdAt, founderId: comm.founderId };
      await resolveJointReferral(db, asCommunity, proposal.jointActionId, outcome.ratified, ts);
    }
  }

  // Bounded, hardcoded proposal-effect exception — the same pattern tick()
  // already uses for stage transitions and dividend runs, not a general
  // proposal-effect-execution engine. A ratified Position decision actually
  // installs/removes a Delegate (Charter 4.3).
  if (proposal.cls === "position" && outcome.ratified && proposal.targetMemberId && proposal.targetSectorId && proposal.positionAction) {
    // Prompt27_SeatPlaceholderValidation.md — the same guard POST
    // /proposals already applies at creation time (app/src/index.tsx),
    // checked again here as defense-in-depth: a placeholder's seatKind is
    // mutable state (an officeholder claiming their seat presumably clears
    // it, or vice versa), and a proposal can sit in deliberation for the
    // full voting window between creation and this ratification tick —
    // plenty of time for the target to stop being valid, and any proposal
    // created before this fix shipped had no creation-time check at all.
    // Fail loudly rather than silently skipping the recognition while the
    // vote itself still reads as ratified: the tally outcome genuinely was
    // ratified (that label stays accurate), but execution did not happen,
    // and both the public record and the proposal's own outcome field say
    // so explicitly — this app has no other "ratified but couldn't
    // execute" precedent to match, so this is the shape chosen for it.
    // A follow-up pass added the same independent check on targetSectorId
    // (sector state is far less mutable than seatKind, but a proposal
    // created before either fix shipped could still reach here with a bad
    // one) — one combined "invalid target" outcome/record for either
    // reason, rather than two near-identical failure shapes to keep in sync.
    const [target] = await db.select({ communityId: members.communityId, seatKind: members.seatKind }).from(members).where(eq(members.id, proposal.targetMemberId));
    const [sector] = await db.select({ communityId: sectors.communityId }).from(sectors).where(eq(sectors.id, proposal.targetSectorId));
    const targetValid = isValidPositionTarget(target, communityId) && isValidPositionSector(sector, communityId);
    if (!targetValid) {
      await db
        .update(proposals)
        .set({ outcome: `${outcome.label} — NOT EXECUTED: invalid target` })
        .where(eq(proposals.id, proposal.id));
      await writeRecord(
        db,
        communityId,
        "record",
        `"${proposal.title}" was ratified but NOT executed — its target member and/or target sector is not valid for this community (missing, belonging to a different community, or — for the target member — a Default-Delegate Mechanism seat placeholder). No Delegate recognition was created or removed. This needs review.`,
        null,
        ts
      );
    } else if (proposal.positionAction === "recognize") {
      // Charter 4.10 — if an active Delegate already holds this sector and
      // the newly-recognized candidate's delegated support is closely tied
      // to theirs, the Position is held jointly: both rows link to each
      // other via coDelegateOfId instead of the new row standing alone.
      const existingActive = await db
        .select()
        .from(delegateRecognitions)
        .where(and(eq(delegateRecognitions.communityId, communityId), eq(delegateRecognitions.sectorId, proposal.targetSectorId), isNull(delegateRecognitions.revokedAt)));
      let coDelegateOfId: number | null = null;
      if (existingActive.length > 0) {
        const { perMember, total } = await sectorDelegationTotals(db, communityId, proposal.targetSectorId, ts, params.delegationExpiryDays);
        const newShare = total > 0 ? (perMember.get(proposal.targetMemberId) ?? 0) / total : 0;
        for (const existing of existingActive) {
          if (existing.coDelegateOfId !== null) continue; // a Position held jointly already has its two
          const existingShare = total > 0 ? (perMember.get(existing.memberId) ?? 0) / total : 0;
          if (isCloselyTied(newShare, existingShare, params.delegateTieMargin)) {
            coDelegateOfId = existing.id;
            break;
          }
        }
      }

      const [inserted] = await db
        .insert(delegateRecognitions)
        .values({
          communityId,
          memberId: proposal.targetMemberId,
          sectorId: proposal.targetSectorId,
          positionDecisionProposalId: proposal.id,
          recognizedAt: ts,
          coDelegateOfId,
        })
        .returning();
      if (coDelegateOfId !== null) {
        await db.update(delegateRecognitions).set({ coDelegateOfId: inserted.id }).where(eq(delegateRecognitions.id, coDelegateOfId));
        await writeRecord(
          db,
          communityId,
          "record",
          `Position decision ratified: recognized as co-Delegate — support was closely tied with the sitting Delegate (Charter 4.10), so the Position is held jointly.`,
          proposal.targetMemberId,
          ts
        );
      } else {
        await writeRecord(db, communityId, "record", `Position decision ratified: recognized as Delegate.`, proposal.targetMemberId, ts);
      }
    } else if (proposal.positionAction === "remove") {
      const toRemove = await db
        .select({ id: delegateRecognitions.id })
        .from(delegateRecognitions)
        .where(
          and(
            eq(delegateRecognitions.communityId, communityId),
            eq(delegateRecognitions.memberId, proposal.targetMemberId),
            eq(delegateRecognitions.sectorId, proposal.targetSectorId),
            isNull(delegateRecognitions.revokedAt)
          )
        );
      await revokeRecognitions(db, communityId, toRemove.map((r) => r.id), ts);
      await writeRecord(db, communityId, "record", `Position decision ratified: Delegate recognition removed.`, proposal.targetMemberId, ts);
    }
  }

  // Charter 4.8 / Rules of Procedure 1.5a — the recall-band confirmation vote.
  // INVERTED relative to every other Position action, deliberately: ratifying
  // KEEPS the Delegate, and failing to reach the threshold removes them. That
  // is what "a confirmation vote asking whether they keep the Position" means
  // — the incumbent must clear the bar to stay, rather than opponents clearing
  // it to remove them. A split short of three-fifths therefore removes. Do not
  // "fix" this to match recognize/remove; the direction is the point.
  if (proposal.cls === "position" && proposal.positionAction === "confirm" && proposal.targetMemberId && proposal.targetSectorId) {
    const target = and(
      eq(delegateRecognitions.communityId, communityId),
      eq(delegateRecognitions.memberId, proposal.targetMemberId),
      eq(delegateRecognitions.sectorId, proposal.targetSectorId),
      isNull(delegateRecognitions.revokedAt)
    );
    if (outcome.ratified) {
      await db.update(delegateRecognitions).set({ confirmationProposalId: null }).where(target);
      await writeRecord(db, communityId, "record", `Confirmation vote ratified: the Delegate keeps the Position (Charter 4.8).`, proposal.targetMemberId, ts);
    } else {
      const toRemove = await db.select({ id: delegateRecognitions.id }).from(delegateRecognitions).where(target);
      await revokeRecognitions(db, communityId, toRemove.map((r) => r.id), ts, { confirmationProposalId: null });
      await writeRecord(db, communityId, "record", `Confirmation vote did not reach the Position decision threshold: the Delegate recognition is removed (Charter 4.8).`, proposal.targetMemberId, ts);
    }
  }

  // Charter 3.6 / Rules of Procedure 1.5b — the concentration-review vote. Like
  // the recall-band vote, ratifying KEEPS the holder's delegations; failing to
  // reach the Position decision threshold ends them.
  if (proposal.cls === "position" && proposal.positionAction === "concentration" && proposal.targetMemberId && proposal.targetSectorId) {
    await resolveConcentrationReview(db, communityId, proposal.id, proposal.targetMemberId, proposal.targetSectorId, outcome.ratified, ts);
  }

  // Contribution Code 8.6's "fit" challenge path — reuses the Position
  // decision class directly, targeting a Supporting Nominee instead of a
  // Delegate seat.
  if (proposal.cls === "position" && proposal.positionAction === "challenge_nomination" && proposal.targetSupportingNomineeId) {
    if (outcome.ratified) {
      await db.update(supportingNominees).set({ revokedAt: ts }).where(eq(supportingNominees.id, proposal.targetSupportingNomineeId));
      await writeRecord(db, communityId, "record", `Nomination challenge upheld by community vote: nomination removed.`, null, ts);
    } else {
      await writeRecord(db, communityId, "record", `Nomination challenge rejected by community vote: nomination stands.`, null, ts);
    }
  }
}

export interface PositionFillStatus {
  totalSectors: number;
  filledSectors: number;
  everyPositionFilled: boolean;
}

// Treasury Code 5.1's "every Delegate Position it has defined has been
// filled" half of the activation gate. Shared so the dividend tick (which
// decides) and app/src/lib/liveValues.ts (which only displays current
// progress toward the gate, in the Documents reader's "Live in this
// community" box) read the identical check rather than two copies of it
// quietly drifting apart. A community with zero sectors defined is never
// "every Position filled" — there's nothing to be vacuous-true about.
export async function computePositionFillStatus(db: Db, communityId: number): Promise<PositionFillStatus> {
  const sectorRows = await db.select({ id: sectors.id }).from(sectors).where(eq(sectors.communityId, communityId));
  const liveRecognitions = await db
    .select({ sectorId: delegateRecognitions.sectorId })
    .from(delegateRecognitions)
    .where(and(eq(delegateRecognitions.communityId, communityId), isNull(delegateRecognitions.revokedAt)));
  const sectorsWithDelegate = new Set(liveRecognitions.map((r) => r.sectorId));
  const filledSectors = sectorRows.filter((sec) => sectorsWithDelegate.has(sec.id)).length;
  return { totalSectors: sectorRows.length, filledSectors, everyPositionFilled: sectorRows.length > 0 && filledSectors === sectorRows.length };
}

export async function tick(db: Db, community: Community, requirePhoneVerification: boolean = false) {
  const ts = now(community);

  const deliberating = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.communityId, community.id), eq(proposals.stage, "deliberation"), lte(proposals.voteOpensAt, ts)));
  for (const p of deliberating) {
    await db.update(proposals).set({ stage: "voting" }).where(eq(proposals.id, p.id));
    // Rules of Procedure 3.3 — capture the delegation snapshot at the moment
    // voting opens. Everything live right now resolves this vote; anything
    // granted from here on applies to the next one.
    const live = await db
      .select({ memberId: delegations.memberId, toMemberId: delegations.toMemberId, sectorId: delegations.sectorId, grantedAt: delegations.grantedAt })
      .from(delegations)
      .innerJoin(members, eq(delegations.memberId, members.id))
      .where(and(eq(members.communityId, community.id), isNull(delegations.revokedAt)));
    for (const d of live) {
      await db.insert(proposalDelegationSnapshots).values({
        proposalId: p.id,
        memberId: d.memberId,
        toMemberId: d.toMemberId,
        sectorId: d.sectorId,
        grantedAt: d.grantedAt,
        capturedAt: ts,
        revokedAt: null,
      });
    }
    await writeRecord(db, community.id, "proposal", `Voting opened on "${p.title}" (closes ${new Date(p.votingClosesAt).toISOString()}). ${live.length} standing delegation(s) captured for resolution (Rules of Procedure 3.3).`, null, ts);
  }

  const voting = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.communityId, community.id), eq(proposals.stage, "voting"), lte(proposals.votingClosesAt, ts)));
  for (const p of voting) await closeOneVote(db, community.id, p, ts, requirePhoneVerification);

  await processDrawRequests(db, community, ts);
  await closeDisputePanels(db, community, ts);
  await processRevocations(db, community, ts);
  await processInterimMeasures(db, community, ts);
  await updateDelegateGraceTimers(db, community, ts);
  await updateConcentrationReviews(db, community, ts);

  const [ts_] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));
  if (ts_ && ts - ts_.lastDividendAt >= community.params.periodDays * DAY_MS && (await claimDividendRun(db, community.id, ts_.lastDividendAt, ts))) {
    const creditsMap = await computePeriodCredits(db, community.id, ts_.lastDividendAt, ts);

    // Contribution Code 2.1's domain issuance pool — reporting always runs;
    // enforcement (actually scaling a domain's credits down) only when
    // domainIssuanceCapEnabled is set. See mechanics.ts's own header comment
    // for why this is two stages, not one — this is a real, visible
    // reduction in what specific members receive, deliberately gated behind
    // an explicit, founder-approved flag rather than silently live.
    const domainIssuance = computeDomainIssuanceReport([...creditsMap.values()], community.params.domainShares);
    const effectiveCreditsMap = community.params.domainIssuanceCapEnabled ? applyDomainIssuanceCap(creditsMap, domainIssuance.scaleFactor) : creditsMap;
    // Default-Delegate Mechanism seat placeholders are not verified Members — excluded here so
    // they never receive a Foundation Dividend entry, and so the Foundation
    // share (Treasury Code 5.4) divides across real members only, not diluted
    // by 13 accounts that can never log in to see or use it.
    const allMemberRows = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
    const names = new Map(allMemberRows.map((m) => [m.id, m.name]));
    // Treasury Code 9.1-9.2 — every verified Member is entitled, and the equal-share
    // divisor is the number of verified Members. There is no age condition here;
    // Charter 1.1 has already admitted only people who declared they are eighteen or older.
    const memberIds = new Set(allMemberRows.map((m) => m.id));
    const creditedMembers = Array.from(effectiveCreditsMap.entries())
      .filter(([id]) => memberIds.has(id))
      .map(([id, credits]) => ({ id, credits }));

    // Treasury Code 5.1 — the activation gate. Both tiers stay at zero until
    // the deployment first reaches DIVIDEND_ACTIVATION_MEMBERS verified
    // Members with every Delegate Position it has defined filled. Checked
    // against the persisted flag first: 5.1 is ONE-WAY, so once set it is
    // never re-tested and never cleared, whatever later happens to membership
    // or to any Position.
    let dividendActivated = community.dividendActivatedAt !== null;
    if (!dividendActivated) {
      const positionFill = await computePositionFillStatus(db, community.id);
      if (allMemberRows.length >= DIVIDEND_ACTIVATION_MEMBERS && positionFill.everyPositionFilled) {
        await db.update(communities).set({ dividendActivatedAt: ts }).where(eq(communities.id, community.id));
        dividendActivated = true;
        await writeRecord(
          db,
          community.id,
          "record",
          `Foundation Dividend activated (Treasury Code 5.1): ${allMemberRows.length} verified Members, every Delegate Position filled. This is permanent — the tier is never re-gated.`,
          null,
          ts
        );
      }
    }

    // The Foundation share (plus anything carried forward) is drawn first each
    // cycle, the Civic Dividend runs on what is left, and what the cap holds
    // back joins the NEXT cycle's Foundation share (Treasury 4.3/5.5).
    // Treasury Code 4.3 — what the last ACTIVATED cycle held back (cap residue
    // and rounding) is carried into this cycle's Foundation tier. Derived from
    // the last run's own totals; a pre-activation run distributed nothing and
    // carries nothing, so money saved before activation counts as new money.
    const [lastRun] = await db
      .select({ pool: dividendRuns.poolAmount, f: dividendRuns.foundationDistributed, c: dividendRuns.civicDistributed })
      .from(dividendRuns)
      .where(eq(dividendRuns.communityId, community.id))
      .orderBy(desc(dividendRuns.periodEnd))
      .limit(1);
    const carriedForward =
      lastRun && lastRun.f > 0 ? Math.max(0, Math.min(ts_.dividendBalance, lastRun.pool - lastRun.f - lastRun.c)) : 0;
    const result = runFoundationAndCivicDividend(
      allMemberRows,
      creditedMembers,
      ts_.dividendBalance,
      community.params.foundationPoolShare,
      community.params.dividendCapMultiple,
      community.params.diversityCap,
      dividendActivated,
      carriedForward
    );

    for (const share of result.shares) {
      if (share.foundationAmount > 0) {
        await db.insert(treasuryLedger).values({
          communityId: community.id,
          kind: "dividend",
          amount: share.foundationAmount,
          source: `Foundation Dividend → ${names.get(share.id) ?? "member"}`,
          memberId: share.id,
          recordedAt: ts,
        });
      }
      if (share.civicAmount > 0) {
        await db.insert(treasuryLedger).values({
          communityId: community.id,
          kind: "dividend",
          amount: share.civicAmount,
          source: `Civic Dividend → ${names.get(share.id) ?? "member"}`,
          memberId: share.id,
          recordedAt: ts,
        });
      }
    }
    await db.insert(dividendRuns).values({
      communityId: community.id,
      periodEnd: ts,
      poolAmount: ts_.dividendBalance,
      distributedAmount: result.distributed,
      foundationDistributed: result.foundationDistributed,
      civicDistributed: result.civicDistributed,
      // "marks", not "credits" — the Aug 2026 rename (see schema.ts's
      // perMember comment). result.shares' own field is still named
      // `credits` internally (mechanics.ts kept its pre-rename identifiers,
      // see that file's own note) — remapped here, at the one place this
      // blob is actually written.
      perMember: JSON.stringify(result.shares.map((s) => ({ id: s.id, marks: s.credits, foundationAmount: s.foundationAmount, civicAmount: s.civicAmount, totalAmount: s.totalAmount }))),
    });

    // Treasury Code 5.5 — the true remainder left after the Foundation share
    // divides evenly (rounding too small to give every Member a unit)
    // stays in the dividend pool and, with Civic Dividend residue, is carried
    // into the next cycle's Foundation Dividend (Treasury Code 4.3 as amended
    // 10 Oct 2026). It never reverts to operations or reserve.
    await db
      .update(treasuryState)
      // Relative, not absolute: subtract what this run distributed instead of
      // overwriting the balance with a figure computed earlier, so a donation
      // that landed while the run was in progress is kept, not erased.
      .set({
        dividendBalance: sql`${treasuryState.dividendBalance} - ${ts_.dividendBalance - result.poolResidue}`,
        lastDividendAt: ts,
        dividendsPaid: sql`${treasuryState.dividendsPaid} + 1`,
      })
      .where(eq(treasuryState.communityId, community.id));
    await writeRecord(
      db,
      community.id,
      "treasury",
      `Foundation Dividend: $${result.floorPerMemberPaid}/member (Treasury Code 5.4 — an equal share of the pool's Foundation tier)`,
      null,
      ts
    );

    // Contribution Code 2.1's domain issuance pool — always logged,
    // regardless of domainIssuanceCapEnabled, so the founder can watch this
    // compute for real periods before ever turning enforcement on. An
    // informational, transparency-only entry: no real dollars move here (see
    // this file's own note on domainIssuance above and the build report for
    // why converting Marks-residue to a dollar figure is a separate,
    // unresolved decision this pass deliberately doesn't make).
    const domainIssuanceSummary = DOMAINS.map((d) => {
      const over = domainIssuance.overage[d] > 0 ? `, OVER by ${domainIssuance.overage[d].toFixed(1)}` : "";
      return `${d} ${domainIssuance.raw[d].toFixed(1)} (cap ${domainIssuance.cap[d].toFixed(1)}, residue ${domainIssuance.residue[d].toFixed(1)}${over})`;
    }).join("; ");
    await writeRecord(
      db,
      community.id,
      "treasury",
      `Domain issuance for this period (Contribution Code 2.1, raw claimed Marks before any cap): ${domainIssuanceSummary}. ${
        community.params.domainIssuanceCapEnabled
          ? "Enforcement is ON — any over-cap domain above was already scaled down to its cap before this period's dividend/standing figures above."
          : "Reporting only — domainIssuanceCapEnabled is off, so no Marks were reduced; this shows what a hard cap would currently do."
      } Per 2.1, unearned headroom is never redistributed to other domains within the period.`,
      null,
      ts
    );
  }

  // Charter 9.3 — Sustainability Criteria (decision 6): compute at most once
  // per 24h, as a side effect of ordinary traffic (tick()'s own reactive
  // pattern, same as the dividend run above), not from a cron trigger. Every
  // page that displays Phase II progress reads the cached row via
  // loadSustainabilitySnapshot, never recomputing live.
  const [existingSnapshot] = await db.select({ computedAt: sustainabilitySnapshots.computedAt }).from(sustainabilitySnapshots).where(eq(sustainabilitySnapshots.communityId, community.id));
  if (!existingSnapshot || ts - existingSnapshot.computedAt >= DAY_MS) {
    const progress = await computeSustainabilityProgress(db, community, ts);
    const result = JSON.stringify(progress);
    if (existingSnapshot) {
      await db.update(sustainabilitySnapshots).set({ computedAt: ts, result }).where(eq(sustainabilitySnapshots.communityId, community.id));
    } else {
      await db.insert(sustainabilitySnapshots).values({ communityId: community.id, computedAt: ts, result });
    }
  }
}

// ---------- Time-based notification scan (Enterprise_and_Community_Roadmap.md Phase 2) ----------
// Runs from a real Cloudflare Cron Trigger (index.tsx's scheduled() export),
// not from tick() — nothing browses to a page daily just to have these two
// kinds notice a deadline approaching. Duplicate-avoidance is deliberately
// simple, exactly as scoped: before inserting, check for an existing
// in_app_notifications row with the same (memberId, eventKind, link). Known
// limitation, flagged rather than silently accepted: since notify() only
// writes that row when the member's in_app preference is enabled, a member
// with email enabled but in_app disabled for one of these two kinds has no
// dedup marker and could receive a repeat email on a later run, until the
// underlying condition changes (the proposal's vote closes, or the
// delegation is renewed/revoked). Good enough for a first pass; a dedicated
// marker independent of delivery preference would close this gap if it
// matters in practice.

async function alreadyNotified(db: Db, memberId: number, eventKind: string, link: string): Promise<boolean> {
  const rows = await db
    .select({ id: inAppNotifications.id })
    .from(inAppNotifications)
    .where(and(eq(inAppNotifications.memberId, memberId), eq(inAppNotifications.eventKind, eventKind), eq(inAppNotifications.link, link)))
    .limit(1);
  return rows.length > 0;
}

/** followed_sector_vote_closing_soon — proposals in "voting" whose votingClosesAt falls within the next 48 hours, fanned out to every member following any of that proposal's tagged sectors. */
async function scanVotesClosingSoon(db: Db, community: Community, ts: number, env: NotifyEnv) {
  const windowEnd = ts + 48 * 60 * 60 * 1000;
  const closingSoon = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.communityId, community.id), eq(proposals.stage, "voting"), gte(proposals.votingClosesAt, ts), lte(proposals.votingClosesAt, windowEnd)));

  for (const p of closingSoon) {
    const sectorRows = await db.select({ sectorId: proposalSectors.sectorId }).from(proposalSectors).where(eq(proposalSectors.proposalId, p.id));
    const sectorIds = sectorRows.map((r) => r.sectorId);
    if (sectorIds.length === 0) continue;

    const followerRows = await db.select({ memberId: memberSectorFollows.memberId }).from(memberSectorFollows).where(inArray(memberSectorFollows.sectorId, sectorIds));
    const followerIds = [...new Set(followerRows.map((r) => r.memberId))];
    const link = `/proposals/${p.id}`;
    for (const followerId of followerIds) {
      if (await alreadyNotified(db, followerId, "followed_sector_vote_closing_soon", link)) continue;
      await notify(db, env, community.id, followerId, "followed_sector_vote_closing_soon", `Voting closes soon on "${p.title}" — a proposal in a sector you follow.`, link, ts);
    }
  }
}

/**
 * delegation_expiring_soon — live (non-revoked, not yet fully lapsed)
 * delegations whose ordinary expiry (Charter 3.3) or shorter critical-cycle
 * expiry (same clause) falls within the next 7 days. The two thresholds get
 * independent dedup links (`#d<id>` vs `#d<id>-critical`) so a member who
 * was already warned about losing critical-eligibility still gets a
 * separate heads-up later, as the full ordinary expiry approaches, for the
 * same delegation.
 */
async function scanDelegationsExpiringSoon(db: Db, community: Community, ts: number, env: NotifyEnv) {
  const rows = await db
    .select({ id: delegations.id, memberId: delegations.memberId, grantedAt: delegations.grantedAt })
    .from(delegations)
    .innerJoin(members, eq(delegations.memberId, members.id))
    .where(and(eq(members.communityId, community.id), isNull(delegations.revokedAt)));

  for (const row of rows) {
    const { stillLive, ordinarySoon, criticalSoon } = delegationExpiryStatus(
      row.grantedAt,
      ts,
      community.params.delegationExpiryDays,
      community.params.delegationExpiryCriticalDays
    );
    if (!stillLive) continue; // already fully lapsed — nothing to warn about

    if (ordinarySoon) {
      const link = `/delegation#d${row.id}`;
      if (!(await alreadyNotified(db, row.memberId, "delegation_expiring_soon", link))) {
        await notify(db, env, community.id, row.memberId, "delegation_expiring_soon", "A delegation you hold is expiring soon — renew it if you'd like it to continue (Charter 3.3).", link, ts);
      }
    }
    if (criticalSoon) {
      const link = `/delegation#d${row.id}-critical`;
      if (!(await alreadyNotified(db, row.memberId, "delegation_expiring_soon", link))) {
        await notify(
          db,
          env,
          community.id,
          row.memberId,
          "delegation_expiring_soon",
          "A delegation you hold will soon stop counting toward critical decisions (Charter amendments, Position decisions, large Treasury allocations) unless renewed within the shorter 90-day cycle.",
          link,
          ts
        );
      }
    }
  }
}

/**
 * What the daily Cron Trigger runs: the same upkeep tick() does on every page
 * load (stages advancing, votes closing, dividends, the cached Phase II
 * snapshot), then the notification scan. Doing the first on the cron too means
 * none of it depends on someone visiting the site that day — a vote closes
 * on time, a dividend runs on schedule, the snapshot stays fresh.
 */
export async function runScheduledMaintenance(db: Db, community: Community, requirePhoneVerification: boolean, env: NotifyEnv) {
  await tick(db, community, requirePhoneVerification);
  await runDailyNotificationScan(db, community, now(community), env);
}

export async function runDailyNotificationScan(db: Db, community: Community, ts: number, env: NotifyEnv) {
  await scanVotesClosingSoon(db, community, ts, env);
  await scanDelegationsExpiringSoon(db, community, ts, env);
}
