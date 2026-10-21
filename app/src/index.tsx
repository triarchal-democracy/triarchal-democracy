import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq, and, isNull, isNotNull, desc, gte, count, inArray, sql } from "drizzle-orm";
import { makeDb } from "./db/client";
import {
  members,
  sessions,
  proposals,
  votes,
  delegations,
  contributions,
  contributionSectors,
  attestations,
  treasuryLedger,
  treasuryState,
  record as recordTable,
  communities,
  proposalComments,
  sectors,
  proposalSectors,
  opportunities,
  opportunitySectors,
  memberSectorFollows,
  criticalPetitionSignatures,
  timeSensitivePetitionSignatures,
  delegateRecognitions,
  supportingNominees,
  nominationChallenges,
  disputePanels,
  disputePanelMembers,
  disputePanelVotes,
  disputePanelParties,
  disputeDrawRequests,
  disputePanelDraws,
  conductReports,
  sectorPosts,
  sectorPostComments,
  interimMeasures,
  interimMeasureApprovals,
  jointActions,
  businessPages,
  businessPageUpdates,
  businessPageFollows,
  notificationPreferences,
  loginAttempts,
  inAppNotifications,
  phoneVerificationAttempts,
} from "./db/schema";
import {
  ensureCommunity,
  now as clockNow,
  tick,
  writeRecord,
  touchMember,
  loadVotingMembers,
  currentDelegationRows,
  loadMemberDelegations,
  computePeriodCredits,
  computeFoundingProgress,
  loadSustainabilitySnapshot,
  maybeSetFounderOnRegistration,
  leaveMembership,
  addToTreasury,
  insertDelegationOnce,
  REAL_MEMBER,
  computeStewardsAndDelegates,
  treasuryTotalBalance,
  insertSectorTags,
  activeMemberCount,
  memberContributionSectorTags,
  sectorStandingCredits,
  requestPanelDraw,
  processDrawRequestsPromptly,
  eligiblePanelPool,
  declinePanelSeat,
  fileConductReport,
  fileOverturnProposal,
  priorSanctionSteps,
  participationSuspendedUntil,
  activeFreeze,
  hidingMeasureIds,
  isModerator,
  interimAuthority,
  jointPositionOfMember,
  proposeJointAction,
  respondJointAction,
  withdrawJointAction,
  referJointAction,
  listJointActions,
  currentSpokesperson,
  compensationSplitFor,
  jointArrangementPreview,
  listModerators,
  appointModerator,
  closeUnderageAccount,
  concentrationHolders,
  concentrationBarred,
  removeModerator,
  takeInterimMeasure,
  approveInterimMeasure,
  INTERIM_MEASURE_HOURS,
  phaseOneActive,
  isInterimContentKind,
  seatedPanelistIds,
  CONDUCT_STATEMENT_MAX_CHARS,
  PANEL_DECLINE_WINDOW_HOURS,
  type DrawParty,
  revokeOpenVoteSnapshots,
  buildMemberProfile,
  fileMinorityReport,
  loadMinorityReports,
  computeGovernanceHealth,
  logSecurityEvent,
  runScheduledMaintenance,
  DISPUTE_PANEL_SIZE,
  DISPUTE_PANEL_POOL_MINIMUM,
  DISPUTE_RESPONSE_WINDOW_DAYS,
  CONTRIBUTION_CLAIM_WINDOW_DAYS,
  claimContribution,
  getPhoneVerifiedAt,
  PHONE_VERIFICATION_MAX_ATTEMPTS_PER_DAY,
} from "./lib/community";
import { resolveVote, periodCredits, computeCritical, rankScore, nomineeEligible, contributionClaimStatus, isPhoneVerified, isValidPositionTarget, isValidPositionSector, isValidPositionMember, computeDonationSplit } from "./lib/mechanics";
import { notify } from "./lib/notify";
import { startPhoneVerification, checkPhoneVerification } from "./lib/twilioVerify";
import { CLASS_CONFIG, PRE_AMENDMENT_TIMELINE, DAY_MS, DOMAINS, PETITION_SIGNATURE_SHARE, DEFAULT_PARAMS, type Domain, type ProposalClass } from "./lib/params";
import { hashPassword, verifyPassword, newSalt, newSessionToken, SESSION_TTL_MS, isMinimumAgeDeclared } from "./lib/auth";
import type { Env } from "./types";
import { LoginPage, RegisterPage } from "./views/auth";
import { Layout } from "./views/layout";
import { DashboardPage } from "./views/dashboard";
import { ProposalsPage, type ProposalListRow } from "./views/proposals";
import { ProposalDetailPage } from "./views/proposalDetail";
import { DelegationPage, type DelegationRowView } from "./views/delegation";
import { ContributionPage, type ContributionRow } from "./views/contribution";
import { TreasuryPage } from "./views/treasury";
import { RecordPage } from "./views/record";
import { OpportunitiesPage, type OpportunityRow } from "./views/opportunities";
import { DirectoryPage } from "./views/directory";
import { ActivityPage } from "./views/activity";
import { TeamPage, type JointActionView } from "./views/team";
import { ProfilePage, LeaveMembershipPage, LeftMembershipPage } from "./views/profile";
import { PeoplePage } from "./views/people";
import { SectorHubPage, SectorPostPage, SectorsIndexPage } from "./views/sectorHub";
import { BusinessesPage, BusinessDetailPage } from "./views/business";
import { SearchPage } from "./views/search";
import { NotificationPreferencesPage, NotificationsInboxPage, EVENT_KINDS } from "./views/notifications";
import { OnboardingSectorsPage, OnboardingWalkthroughPage } from "./views/onboarding";
import { VerifyPhonePage, type VerifyPhoneStatus } from "./views/verifyPhone";
import { GovernanceHealthPage } from "./views/governanceHealth";
import { TheTriarcLandingPage } from "./views/theTriarc";
import { DocumentsLibraryPage, DocumentsReaderPage, DocumentsDefaultsPage, type DefaultsPageRow } from "./views/documents";
import { documentsData } from "./generated/documents";
import { DisputesPage, DisputeCasePage, FileReportPage, InterimMeasurePage, type MeasureView, type DisputeListItem, type QueuedDraw, type CaseDraw, type CasePanelist, type ConductView } from "./views/disputes";
import { provisionName, allowedSteps, stepAllowed, SANCTION_STEPS } from "./lib/conduct";
import { verifyDraw } from "./lib/panelDraw";
import type { Db } from "./db/client";
import { computeLiveValues } from "./lib/liveValues";
import { DEFAULTS_REGISTRY, isDefaultEntrenched } from "./lib/defaultsRegistry";
import { resolveProposalClassification, resolveClauseKey, isClauseEntrenched, clauseLabel, inScopeAmendmentDocuments, classFloor, buildClausePicker, resolveStoredClauseChips } from "./lib/clauseAmendments";
import { searchDocuments } from "./lib/documentsSearch";
import { burstAllowed, registrationCapReached, failedLoginCapReached, parseRegistrationHourlyCap, registrationThrottle, throttleMessage, throttleMinutes, REGISTER_EVENT_KIND } from "./lib/rateLimit";
import { publicPageCache } from "./lib/publicCache";
import { StatusPage } from "./views/status";
import { TourPage } from "./views/tour";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;
// E.164: a leading +, then 1-15 digits, first digit 1-9 — Prompt25_PathA_MembershipEnforcement.md Part A.
const E164_RE = /^\+[1-9]\d{1,14}$/;

// Enterprise_and_Community_Roadmap.md Phase 1 — POST /login rate limiting.
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

const app = new Hono<Env>();
const SESSION_COOKIE = "triarc_session";

function setSessionCookie(c: any, token: string) {
  const isHttps = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: isHttps, sameSite: "Lax", path: "/", maxAge: SESSION_TTL_MS / 1000 });
}

/** Cloudflare sets CF-Connecting-IP at the edge for real internet traffic (a client can't spoof it there); falls back to X-Forwarded-For, then "unknown" in local dev where neither is set. */
function clientIp(c: any): string {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
}

/** Enterprise_and_Community_Roadmap.md Phase 1 — every /admin/* route logs here, once the ADMIN_DEBUG gate has already passed. */
async function logAdminAction(c: any, detail: string) {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member");
  await logSecurityEvent(db, community.id, "admin_action", member?.id ?? null, clientIp(c), c.req.header("User-Agent") ?? null, detail, clockNow(community));
}

/** Normalizes a possibly-repeated form field (checkboxes sharing a name) into a deduped list of positive ids. */
function toIdArray(v: unknown): number[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(arr.map((x) => Number(x)).filter((n) => !isNaN(n) && n > 0))];
}

/** Same shape as toIdArray, for the clause-key checkboxes (clause-structured
 * amendments) — string keys like "charter#1.2", not numeric ids. */
function toStringArray(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(arr.map((x) => String(x)).filter((s) => s.length > 0))];
}

// ---------- Security response headers (Enterprise_and_Community_Roadmap.md Phase 1) ----------
// Registered first so it wraps every response, including 404s and the
// global error handler below. CSP allows exactly the two Google Fonts
// origins layout.tsx already loads from (fonts.googleapis.com,
// fonts.gstatic.com) and nothing else external. style-src needs
// 'unsafe-inline' because layout.tsx's <style>{STYLE}</style> block and
// every view's inline style="..." attributes are load-bearing today — a
// real, existing constraint, not waved past. script-src is 'none', not a
// relaxed default: this app runs zero client-side JavaScript by design
// (CLAUDE.md).
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self'",
      "script-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
    ].join("; ")
  );
  // Same isHttps pattern setSessionCookie already uses — only sent once the
  // request is already HTTPS.
  const isHttps = new URL(c.req.url).protocol === "https:";
  if (isHttps) c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
});

// ---------- Anonymous page cache (lib/publicCache.ts) ----------
// Before the bootstrap so a hit also skips ensureCommunity and tick(). It only ever touches GETs for a
// short allow-list of public pages from visitors with no session cookie, and fails open. It cuts D1 reads
// and CPU, not the Worker request count, and may do nothing on workers.dev: see the header of
// lib/publicCache.ts before relying on it.
app.use("*", publicPageCache(SESSION_COOKIE));

// ---------- Bootstrap: DB, community, and the debug clock tick ----------
app.use("*", async (c, next) => {
  const db = makeDb(c.env.DB);
  c.set("db", db);
  const community = await ensureCommunity(db, c.env.TRIARC_OPERATING_SECTORS === "true", c.env.CIVIC_SECTORS === "true");
  c.set("community", community);
  await tick(db, community, requirePhoneVerification(c));
  await next();
});

// ---------- Session resolution ----------
app.use("*", async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = c.get("db");
    const ts = clockNow(c.get("community"));
    const rows = await db
      .select({ id: members.id, name: members.name, expiresAt: sessions.expiresAt, leftAt: members.leftAt })
      .from(sessions)
      .innerJoin(members, eq(sessions.memberId, members.id))
      .where(eq(sessions.token, token));
    const row = rows[0];
    if (row && row.expiresAt > ts && row.leftAt === null) {
      const [unread] = await db.select({ n: count() }).from(inAppNotifications).where(and(eq(inAppNotifications.memberId, row.id), isNull(inAppNotifications.readAt)));
      c.set("member", { id: row.id, name: row.name, unreadCount: unread?.n ?? 0 });
    } else {
      c.set("member", null);
      deleteCookie(c, SESSION_COOKIE);
    }
  } else {
    c.set("member", null);
  }
  await next();
});

// ---------- Auth gate ----------
// Rules of Procedure 2.4 — low-commitment deliberation is open to the
// public, not only to Members: proposal reading and comment-posting are
// public; everything else (voting, delegating, contribution logging,
// treasury, opportunities, the directory) stays member-gated.
export function isPublicRequest(method: string, path: string): boolean {
  if (path === "/login" || path === "/register") return true;
  // Guest entry point: "/" no longer forces a sign-in wall. A visitor lands
  // on real content (the open proposals list) and only hits a sign-up prompt
  // when they try to do something that requires standing — voting, delegating,
  // submitting a proposal, logging contribution, etc. See the "/" handler
  // below, which redirects a guest straight to /proposals.
  if (method === "GET" && path === "/") return true;
  // /dashboard carries the same guest-redirects-to-/proposals behavior "/"
  // always has — needs to be public for the same reason, independent of
  // which deployment's "/" now shows its own institutional landing page
  // instead.
  if (method === "GET" && path === "/dashboard") return true;
  if (method === "GET" && path === "/proposals") return true;
  // The Directory doubles as an "open positions" board — a guest can see
  // which sectors have a serving Delegate and which are vacant before ever
  // signing up; only the follow/apply actions themselves stay member-gated.
  if (method === "GET" && path === "/directory") return true;
  if (method === "GET" && /^\/proposals\/\d+$/.test(path)) return true;
  if (method === "POST" && /^\/proposals\/\d+\/comments$/.test(path)) return true;
  // Rules of Procedure 7 — the governance-health dashboard is public and
  // read-only by design, same reasoning as public proposal-reading above.
  if (method === "GET" && path === "/governance-health") return true;
  // Treasury Code §7.1 — the ledger is the audit. Reading balances and the
  // public ledger shouldn't require membership; only donating (a write) does.
  if (method === "GET" && path === "/treasury") return true;
  // Charter Article VII — the Record is explicitly public by design ("The
  // Record — permanent, public, append-only" is the page's own title).
  // Gating it behind login was an oversight, not a deliberate choice.
  if (method === "GET" && path === "/record") return true;
  // Charter 7.1 / Dispute Procedure Code 3.1, 4.5 — panel decisions, the
  // published draws and the reports themselves are public by design.
  if (method === "GET" && path === "/disputes") return true;
  if (method === "GET" && /^\/disputes\/\d+$/.test(path)) return true;
  // Phase 2, the Documents area — the founding documents are proposals
  // offered to the public, not Member-only content. Readable signed in or
  // not, same reasoning as /proposals and /governance-health above.
  if (method === "GET" && path === "/documents") return true;
  if (method === "GET" && path === "/documents/defaults") return true;
  if (method === "GET" && /^\/documents\/[a-z0-9-]+$/.test(path)) return true;
  // Launch readiness: the registration-throttle status page (read-only; shows a cap and a count,
  // nothing about any person) and the "look around before you join" tour, which is built only from
  // pages already listed above. Both exist so a visitor can see before they sign up.
  if (method === "GET" && path === "/status") return true;
  if (method === "GET" && path === "/tour") return true;
  return false;
}
app.use("*", async (c, next) => {
  if (isPublicRequest(c.req.method, c.req.path)) return next();
  if (!c.get("member")) return c.redirect("/login");
  return next();
});

// Code of Conduct 3.3 — a Member under participation suspension has their
// posting and proposal rights paused. Their vote, delegations and ability to
// answer a report are untouched ("only revocation itself touches the vote").
const POSTING_ROUTES: RegExp[] = [
  /^\/proposals$/,
  /^\/proposals\/\d+\/comments$/,
  /^\/proposals\/\d+\/minority-report$/,
  /^\/opportunities$/,
  /^\/sectors\/\d+\/posts$/,
  /^\/sectors\/\d+\/posts\/\d+\/comments$/,
  /^\/businesses$/,
  /^\/businesses\/\d+\/updates$/,
];
app.use("*", async (c, next) => {
  const member = c.get("member");
  if (member && c.req.method === "POST" && POSTING_ROUTES.some((r) => r.test(c.req.path))) {
    const until = await participationSuspendedUntil(c.get("db"), member.id, clockNow(c.get("community")));
    if (until !== null) {
      return c.text(
        `Your posting and proposal rights are paused until ${new Date(until).toDateString()} under a Dispute Panel finding (Code of Conduct 3.3). Your vote and your delegations are not affected. The finding and its reasoning are on the public record.`,
        403
      );
    }
  }
  return next();
});

// Code of Conduct 4.3 — an interim freeze stops posting, proposing and
// contribution logging for at most 72 hours unless the reviewing panel keeps
// it. It never reaches the vote or a delegation.
app.use("*", async (c, next) => {
  const member = c.get("member");
  if (member && c.req.method === "POST" && (POSTING_ROUTES.some((r) => r.test(c.req.path)) || /^\/contribution$/.test(c.req.path))) {
    const freeze = await activeFreeze(c.get("db"), member.id, clockNow(c.get("community")));
    if (freeze) {
      return c.text(
        `A moderator has frozen your posting, proposing and contribution logging as an emergency interim measure (Code of Conduct 4.3). It lapses automatically by ${new Date(freeze.until).toLocaleString()} unless the reviewing Dispute Panel keeps it. Your vote and your delegations are not affected. The measure is on the public record.`,
        403
      );
    }
  }
  return next();
});

// Code of Conduct 4.3 — content a moderator has removed as an interim measure is
// replaced by this notice for as long as the measure is in force; the text never
// leaves the server meanwhile, and it returns on its own if the measure lapses.
const REMOVED_NOTICE = "[Removed by a moderator as an interim measure (Code of Conduct 4.3). It returns automatically if the measure lapses; see Disputes.]";
function modRemoveHref(contentKind: string, contentId: number): string {
  return `/disputes/interim/new?kind=remove-content&contentKind=${contentKind}&contentId=${contentId}`;
}

function adminDebug(c: any): boolean {
  return c.env.ADMIN_DEBUG === "true";
}

// 2026-10-11 app review, finding H1 — ADMIN_DEBUG alone is a single
// plaintext env-var compare standing between "disabled" and full
// passwordless account takeover of any Member via /admin/switch-member. A
// config typo or a copy-pasted .toml edit was the entire distance to that.
// This adds a second, independent gate: the request's own hostname, which
// on a deployed Worker (triarchalframework.triarchal-democracy.workers.dev or
// example.invalid) is never "localhost" or "127.0.0.1" —
// that hostname is what Cloudflare's edge already used to route the
// request to this Worker in the first place, not a client-supplied header
// this code reads back, so it can't be spoofed by a request to a deployed
// URL. Only `wrangler dev` serves on localhost/127.0.0.1. Fails closed on a
// malformed URL.
function isLocalRequest(c: any): boolean {
  try {
    const host = new URL(c.req.url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

// Prompt24_PathA_PathB_Split.md — same helper pattern as adminDebug(c) above,
// threaded through every Layout-rendering route the same way, so each
// deployment's own communities.name row (not a literal string) drives the
// title/header/footer branding. Defensive fallback for the rare render
// before the community middleware has set anything (index.tsx's error
// handlers) — matches Layout's own default.
function communityName(c: any): string {
  return c.get("community")?.name ?? "The Triarc";
}

// Prompt25_PathA_MembershipEnforcement.md Part D.4 — the single source of
// truth every enforcement point below checks. Unset means
// every gate this var guards is a complete no-op; never inferred from data
// shape.
function requirePhoneVerification(c: any): boolean {
  return c.env.REQUIRE_PHONE_VERIFICATION === "true";
}

// ================= Auth =================

app.get("/login", (c) => c.html(<LoginPage communityName={communityName(c)} />));

app.post("/login", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const ip = clientIp(c);
  const userAgent = c.req.header("User-Agent") ?? null;
  const ts = clockNow(community);

  // Launch rate limits (lib/rateLimit.ts): a burst limiter first (no D1 cost), then the per-network
  // failure cap, both before any credential is touched.
  if (!(await burstAllowed(c.env.LOGIN_LIMITER, ip)) || (await failedLoginCapReached(db, ip, ts, LOGIN_LOCKOUT_WINDOW_MS))) {
    await logSecurityEvent(db, community.id, "login_failure", null, ip, userAgent, "network rate limit", ts);
    return c.html(<LoginPage communityName={communityName(c)} error="Too many sign-in attempts from this network. Please wait a few minutes and try again." />, 429);
  }

  // Enterprise_and_Community_Roadmap.md Phase 1 — 5 failed attempts for this
  // email within 15 minutes locks out further attempts for that email,
  // across every IP (a distributed attempt from many IPs against one email
  // is still caught; `ip` is recorded per-attempt for audit but isn't part
  // of the lockout key). Checked before touching credentials at all, so a
  // locked-out response never reveals whether the email exists.
  const windowStart = ts - LOGIN_LOCKOUT_WINDOW_MS;
  const recentFailures = await db
    .select({ attemptedAt: loginAttempts.attemptedAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, 0), gte(loginAttempts.attemptedAt, windowStart)))
    .orderBy(loginAttempts.attemptedAt);
  if (recentFailures.length >= LOGIN_LOCKOUT_THRESHOLD) {
    const retryAfterMs = recentFailures[0].attemptedAt + LOGIN_LOCKOUT_WINDOW_MS - ts;
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    await logSecurityEvent(db, community.id, "login_failure", null, ip, userAgent, `locked out: ${email}`, ts);
    return c.html(<LoginPage communityName={communityName(c)} error={`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`} />, 429);
  }

  const rows = await db.select().from(members).where(and(eq(members.communityId, community.id), eq(members.email, email)));
  const m = rows[0];
  // Belt and suspenders: a seatKind row's passwordHash is a random, unusable
  // value (see community.ts's Default-Delegate Mechanism seat seeding), so verifyPassword should
  // never actually match one — but reject explicitly rather than leaving
  // that as the only thing standing between a seat placeholder and a login.
  const ok = !!m && m.seatKind === null && m.leftAt === null && (await verifyPassword(password, m.salt, m.passwordHash));

  await db.insert(loginAttempts).values({ communityId: community.id, email, ip, success: ok ? 1 : 0, attemptedAt: ts });
  await logSecurityEvent(db, community.id, ok ? "login_success" : "login_failure", ok ? m!.id : null, ip, userAgent, ok ? null : `email=${email}`, ts);

  if (!ok) {
    return c.html(<LoginPage communityName={communityName(c)} error="Incorrect email or password." />, 401);
  }

  const token = newSessionToken();
  await db.insert(sessions).values({ token, memberId: m!.id, expiresAt: ts + SESSION_TTL_MS });
  setSessionCookie(c, token);
  await touchMember(db, m!.id, ts);
  return c.redirect("/");
});

app.get("/register", (c) => c.html(<RegisterPage communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} />));

app.post("/register", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const phoneRaw = requirePhoneVerification(c) ? String(body.phone ?? "").trim() : "";
  // Launch rate limits (lib/rateLimit.ts): burst limiter, then the per-network hourly cap. The cap is
  // generous because one IP can be a school or a mobile carrier; the message asks for patience, not blame.
  const regIp = clientIp(c);
  if (!(await burstAllowed(c.env.REGISTER_LIMITER, regIp)) || (await registrationCapReached(db, community.id, regIp, clockNow(community)))) {
    return c.html(<RegisterPage communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} error="A lot of people are joining from this network right now. Please wait a little while and try again." />, 429);
  }
  // Community-wide throttle (lib/rateLimit.ts, public at /status). Temporary pacing only: it counts
  // successful sign-ups in the last rolling hour, lifts on its own, and never decides who may join
  // (Charter 1.1). An unset REGISTRATION_HOURLY_CAP means no throttle and no extra query.
  const hourlyCap = parseRegistrationHourlyCap(c.env.REGISTRATION_HOURLY_CAP);
  if (hourlyCap > 0) {
    const throttle = await registrationThrottle(db, community.id, hourlyCap, clockNow(community));
    if (throttle.throttled) {
      c.header("Retry-After", String(Math.ceil(throttle.retryAfterMs / 1000)));
      return c.html(<RegisterPage communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} error={throttleMessage(throttle.retryAfterMs)} />, 429);
    }
  }
  // Charter 1.1 — the minimum age is eighteen; the Member declares it at registration.
  // It is a declaration, not a check. The dividend has no separate age condition (Treasury Code 9.1).
  if (!isMinimumAgeDeclared(body.minimumAge)) {
    return c.html(<RegisterPage communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} error="You must be at least 18 years old to become a Member (Charter 1.1)." />, 400);
  }
  if (!USERNAME_RE.test(name)) {
    return c.html(<RegisterPage communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} error="Username must be 3-20 characters: letters, numbers, underscore, or hyphen. No real names required — Charter Article VII.2." />, 400);
  }
  if (!email || password.length < 8) {
    return c.html(<RegisterPage communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} error="A valid email and an 8+ character password are required." />, 400);
  }
  const existingEmail = await db.select().from(members).where(and(eq(members.communityId, community.id), eq(members.email, email)));
  if (existingEmail.length) {
    return c.html(<RegisterPage communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} error="That email is already a member. Try signing in." />, 400);
  }
  const existingName = await db.select().from(members).where(and(eq(members.communityId, community.id), eq(members.name, name)));
  if (existingName.length) {
    return c.html(<RegisterPage communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} error="That username is taken. Try another." />, 400);
  }

  const ts = clockNow(community);
  const salt = newSalt();
  const passwordHash = await hashPassword(password, salt);
  const [m] = await db
    .insert(members)
    .values({ communityId: community.id, name, email, passwordHash, salt, joinedAt: ts, lastActiveAt: ts, ageDeclaredAt: ts })
    .returning();

  await writeRecord(db, community.id, "member", `${name} joined ${community.name} and affirmed the charter.`, m.id, ts);
  await logSecurityEvent(db, community.id, REGISTER_EVENT_KIND, m.id, regIp, c.req.header("User-Agent") ?? null, null, ts);

  // Charter 9.3's founder-independence criterion — see
  // community.ts's maybeSetFounderOnRegistration for the exact rule (auto-
  // sets only on a freshly seeded community; never on one that already had
  // members; race-safe).
  await maybeSetFounderOnRegistration(db, community, m.id);

  const token = newSessionToken();
  await db.insert(sessions).values({ token, memberId: m.id, expiresAt: ts + SESSION_TTL_MS });
  setSessionCookie(c, token);

  // Triarc Membership Code 2.1/2.2 (Prompt25_PathA_MembershipEnforcement.md
  // Part C.1) — registration never blocks on phone verification; the
  // account above is already created and the session already set regardless
  // of what happens below. An optional phone at registration is purely a
  // convenience so the very next screen can be "enter the code" instead of
  // "enter your phone" — nothing here writes to members.phone (that only
  // ever happens atomically with phoneVerifiedAt at /verify-phone/confirm,
  // so a merely-claimed, unconfirmed number can never collide with the
  // unique constraint — see phoneVerificationAttempts' own schema comment).
  // If Twilio is unavailable or the number's malformed, registration still
  // succeeds; the member just lands on onboarding and can retry from the
  // profile prompt later.
  if (requirePhoneVerification(c) && E164_RE.test(phoneRaw)) {
    const result = await startPhoneVerification(c.env, phoneRaw);
    if (result.ok) {
      await db.insert(phoneVerificationAttempts).values({ memberId: m.id, phone: phoneRaw, startedAt: ts, confirmedAt: null });
      return c.redirect("/verify-phone");
    }
  }
  return c.redirect("/onboarding/sectors");
});

app.post("/logout", async (c) => {
  const db = c.get("db");
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  deleteCookie(c, SESSION_COOKIE);
  return c.redirect("/login");
});

// ================= Leaving (Charter 1.3) =================
// "A Member may leave at any time." Confirmed by typing the username, so it
// can't be done by accident. Final for the account — see leaveMembership.

app.get("/membership/leave", (c) => {
  const member = c.get("member")!;
  return c.html(<LeaveMembershipPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} />);
});

app.post("/membership/leave", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const typed = String(body.confirmName ?? "").trim();
  if (typed !== member.name || String(body.confirm ?? "") !== "on") {
    return c.html(
      <LeaveMembershipPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} error="To leave, tick the box and type your username exactly." />,
      400
    );
  }
  const result = await leaveMembership(db, community, member.id, ts);
  deleteCookie(c, SESSION_COOKIE);
  if (!result.ok) return c.redirect("/login");
  return c.html(<LeftMembershipPage communityName={communityName(c)} />);
});

// ================= Onboarding (Phase 10) =================
// A new Member is prompted to pick sector interests, then a brief
// walkthrough of voting/delegation, before landing on the dashboard for the
// first time. Both happen once, at signup — the redirect chain from
// /register starts it; nothing else in the app is gated behind it.

app.get("/onboarding/sectors", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const [row] = await db.select({ onboardedAt: members.onboardedAt }).from(members).where(eq(members.id, member.id));
  if (row?.onboardedAt) return c.redirect("/");
  const sectorRows = await db.select().from(sectors).where(and(eq(sectors.communityId, community.id), eq(sectors.active, 1)));
  return c.html(<OnboardingSectorsPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} sectors={sectorRows.map((s) => ({ id: s.id, name: s.name }))} />);
});

app.post("/onboarding/sectors", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody({ all: true });
  const raw = body.sectorId;
  const sectorIds = [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map((s) => Number(s)).filter((n) => !isNaN(n) && n > 0))];
  for (const sectorId of sectorIds) {
    const existing = await db.select().from(memberSectorFollows).where(and(eq(memberSectorFollows.memberId, member.id), eq(memberSectorFollows.sectorId, sectorId)));
    if (!existing.length) await db.insert(memberSectorFollows).values({ memberId: member.id, sectorId, followedAt: ts });
  }
  return c.redirect("/onboarding/walkthrough");
});

app.get("/onboarding/walkthrough", async (c) => {
  const db = c.get("db");
  const member = c.get("member")!;
  const [row] = await db.select({ onboardedAt: members.onboardedAt }).from(members).where(eq(members.id, member.id));
  if (row?.onboardedAt) return c.redirect("/");
  return c.html(<OnboardingWalkthroughPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} />);
});

app.post("/onboarding/complete", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  await db.update(members).set({ onboardedAt: ts }).where(eq(members.id, member.id));
  return c.redirect("/");
});

// ================= Phone verification (Triarc Membership Code 2.1, the Triarc only) =================
// Prompt25_PathA_MembershipEnforcement.md Part C (that prompt predates the
// "Path A"/"Path B" deployment-naming retirement — see CLAUDE.md's Naming
// section). Registration itself never requires this (2.2) — these routes
// only ever move phoneVerifiedAt from null to set; the actual vote/
// delegation gates live at the routes that do those things (Part D, below)
// and in community.ts's closeOneVote. 404s entirely when
// REQUIRE_PHONE_VERIFICATION is unset rather than
// silently no-opping, so a stray link doesn't look like a working feature
// on a deployment where this Code doesn't apply.

app.get("/verify-phone", async (c) => {
  if (!requirePhoneVerification(c)) return c.notFound();
  const db = c.get("db");
  const member = c.get("member")!;
  const phoneVerifiedAt = await getPhoneVerifiedAt(db, member.id);
  let status: VerifyPhoneStatus;
  if (isPhoneVerified(phoneVerifiedAt)) {
    status = { kind: "verified" };
  } else {
    const [attempt] = await db
      .select()
      .from(phoneVerificationAttempts)
      .where(and(eq(phoneVerificationAttempts.memberId, member.id), isNull(phoneVerificationAttempts.confirmedAt)))
      .orderBy(desc(phoneVerificationAttempts.startedAt))
      .limit(1);
    status = attempt ? { kind: "awaiting-code", phone: attempt.phone } : { kind: "start" };
  }
  return c.html(
    <VerifyPhonePage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} status={status} error={c.req.query("error") ?? undefined} />
  );
});

app.post("/verify-phone/start", async (c) => {
  if (!requirePhoneVerification(c)) return c.notFound();
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const phone = String(body.phone ?? "").trim();

  const renderError = (msg: string) =>
    c.html(<VerifyPhonePage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} status={{ kind: "start" }} error={msg} />, 400);
  if (!(await burstAllowed(c.env.PHONE_LIMITER, clientIp(c)))) {
    return renderError("Too many requests. Please wait a minute and try again.");
  }

  if (!E164_RE.test(phone)) {
    return renderError("Enter a phone number in international format, e.g. +15195551234.");
  }
  if (isPhoneVerified(await getPhoneVerifiedAt(db, member.id))) {
    return c.redirect("/verify-phone");
  }

  // App-side rate limit, independent of whatever Twilio Verify itself
  // enforces server-side (community.ts's own comment on this constant).
  const recentAttempts = await db
    .select({ id: phoneVerificationAttempts.id })
    .from(phoneVerificationAttempts)
    .where(and(eq(phoneVerificationAttempts.memberId, member.id), gte(phoneVerificationAttempts.startedAt, ts - DAY_MS)));
  if (recentAttempts.length >= PHONE_VERIFICATION_MAX_ATTEMPTS_PER_DAY) {
    return renderError("Too many verification attempts today. Try again tomorrow.");
  }

  const result = await startPhoneVerification(c.env, phone);
  if (!result.ok) return renderError(result.error);
  await db.insert(phoneVerificationAttempts).values({ memberId: member.id, phone, startedAt: ts, confirmedAt: null });
  return c.redirect("/verify-phone");
});

app.post("/verify-phone/confirm", async (c) => {
  if (!requirePhoneVerification(c)) return c.notFound();
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const code = String(body.code ?? "").trim();

  const [attempt] = await db
    .select()
    .from(phoneVerificationAttempts)
    .where(and(eq(phoneVerificationAttempts.memberId, member.id), isNull(phoneVerificationAttempts.confirmedAt)))
    .orderBy(desc(phoneVerificationAttempts.startedAt))
    .limit(1);
  if (!attempt) {
    return c.redirect("/verify-phone?error=" + encodeURIComponent("Start verification first — enter your phone number below."));
  }

  const result = await checkPhoneVerification(c.env, attempt.phone, code);
  if (!result.ok) {
    return c.redirect("/verify-phone?error=" + encodeURIComponent(result.error));
  }

  // Triarc Membership Code 2.1 — an explicit uniqueness check (Prompt25 Part
  // C.3), not just the members.phone DB constraint, so the rejection reads
  // as a clear governance rule rather than a raw constraint error. The DB
  // constraint (members_phone_unique) stays as the real backstop for the
  // unlikely race between two concurrent confirms of the same number.
  const [existingHolder] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.communityId, community.id), eq(members.phone, attempt.phone), isNotNull(members.phoneVerifiedAt)));
  if (existingHolder && existingHolder.id !== member.id) {
    return c.redirect("/verify-phone?error=" + encodeURIComponent("This phone number is already verified on another account."));
  }

  try {
    await db.update(members).set({ phone: attempt.phone, phoneVerifiedAt: ts }).where(eq(members.id, member.id));
  } catch {
    return c.redirect("/verify-phone?error=" + encodeURIComponent("This phone number is already verified on another account."));
  }
  await db.update(phoneVerificationAttempts).set({ confirmedAt: ts }).where(eq(phoneVerificationAttempts.id, attempt.id));
  // Never the phone number itself — Triarc Membership Code 2.1/3.3.
  await writeRecord(db, community.id, "member", `${member.name} completed phone verification and became a full Member (Triarc Membership Code 2.1).`, member.id, ts);

  const [row] = await db.select({ onboardedAt: members.onboardedAt }).from(members).where(eq(members.id, member.id));
  return c.redirect(row?.onboardedAt ? `/profile/${member.id}` : "/onboarding/sectors");
});

// ================= Dashboard =================

// Prompt24_PathA_PathB_Split.md Part C.2 — moved out of the "/" handler so
// it can be registered at the stable /dashboard path on every deployment
// (the Triarc's nav and landing-page CTAs link here) while "/" itself
// branches per deployment below.
async function dashboardHandler(c: Context<Env>) {
  const member = c.get("member");
  // Guests get real content, not a login wall — the open proposals list is
  // already fully public (Rules of Procedure 2.4). The member-only dashboard
  // (treasury, personalized ranking, founding-progress) stays member-gated
  // below; a guest is routed to the one page built to work without an
  // account, and only meets a sign-in/sign-up prompt when they try to act
  // (vote, delegate, submit, comment as a named member, etc.).
  if (!member) return c.redirect("/proposals");

  const db = c.get("db");
  const community = c.get("community");
  const ts = clockNow(community);

  const progress = await computeFoundingProgress(db, community, ts);
  const sustainabilitySnapshot = await loadSustainabilitySnapshot(db, community.id);
  const [treasury] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));

  // Feed → Dashboard (Part 2 spec): the same ranked blocks already built for
  // /proposals and /opportunities, surfaced in one place. Always additive —
  // full lists remain on their own pages, never replaced here.
  const followedSectorIds = (await db.select().from(memberSectorFollows).where(eq(memberSectorFollows.memberId, member.id))).map((f) => f.sectorId);
  const myContributionSectorIds = await memberContributionSectorTags(db, community.id, member.id);

  const openProposalRows = await db.select().from(proposals).where(and(eq(proposals.communityId, community.id), eq(proposals.stage, "voting")));
  const proposalSectorRows = await db.select().from(proposalSectors);
  const sectorsByProposal = new Map<number, number[]>();
  for (const r of proposalSectorRows) {
    const arr = sectorsByProposal.get(r.proposalId) ?? [];
    arr.push(r.sectorId);
    sectorsByProposal.set(r.proposalId, arr);
  }
  const rankedProposals = openProposalRows
    .map((p) => ({ id: p.id, title: p.title, score: rankScore(followedSectorIds, myContributionSectorIds, sectorsByProposal.get(p.id) ?? [], community.params.rankingWeights) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const oppRows = await db.select().from(opportunities).where(eq(opportunities.communityId, community.id));
  const oppSectorRows = await db.select().from(opportunitySectors);
  const sectorsByOpp = new Map<number, number[]>();
  for (const r of oppSectorRows) {
    const arr = sectorsByOpp.get(r.opportunityId) ?? [];
    arr.push(r.sectorId);
    sectorsByOpp.set(r.opportunityId, arr);
  }
  const rankedOpportunities = oppRows
    .map((o) => ({ id: o.id, title: o.title, score: rankScore(followedSectorIds, myContributionSectorIds, sectorsByOpp.get(o.id) ?? [], community.params.rankingWeights) }))
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return c.html(
    <DashboardPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      progress={progress}
      sustainability={sustainabilitySnapshot}
      criteria={community.params.criteria}
      treasury={{ ops: treasury.opsBalance, dividend: treasury.dividendBalance, reserve: treasury.reserveBalance }}
      nextDividendAt={treasury.lastDividendAt + community.params.periodDays * DAY_MS}
      dividendsPaid={treasury.dividendsPaid}
      rankedProposals={rankedProposals}
      rankedOpportunities={rankedOpportunities}
      phoneVerificationStatus={requirePhoneVerification(c) ? (isPhoneVerified(await getPhoneVerifiedAt(db, member.id)) ? "verified" : "unverified") : null}
    />
  );
}

app.get("/dashboard", dashboardHandler);

// The Triarc (INSTITUTIONAL_LANDING="true" in wrangler.patha.toml) shows its
// own professional landing page at "/", with the live app one click away at
// /dashboard. The var is checked explicitly, so a deployment that does not
// set it lands on the dashboard: "/" IS the dashboard, unchanged from before
// the landing page existed.
app.get("/", async (c) => {
  if (c.env.INSTITUTIONAL_LANDING === "true") {
    return c.html(<TheTriarcLandingPage member={c.get("member")} communityName={communityName(c)} />);
  }
  return dashboardHandler(c);
});

// ================= Proposals =================

// Prompt27_SeatPlaceholderValidation.md — factored out of the "/proposals"
// GET handler so POST /proposals can re-render the same page (with an
// error) on validation failure, same "re-render the form with an error
// prop" pattern RegisterPage/VerifyPhonePage already use, instead of a
// silent redirect that would drop the rejection on the floor.
async function renderProposalsPage(c: Context<Env>, error?: string) {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member");

  const rows = await db.select().from(proposals).where(eq(proposals.communityId, community.id)).orderBy(desc(proposals.submittedAt));
  const nameById = new Map((await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.communityId, community.id))).map((m) => [m.id, m.name]));
  const sectorRows = await db.select().from(sectors).where(and(eq(sectors.communityId, community.id), eq(sectors.active, 1)));
  const sectorNameById = new Map(sectorRows.map((s) => [s.id, s.name]));
  const proposalSectorRows = await db.select().from(proposalSectors);
  const sectorsByProposal = new Map<number, number[]>();
  for (const r of proposalSectorRows) {
    const arr = sectorsByProposal.get(r.proposalId) ?? [];
    arr.push(r.sectorId);
    sectorsByProposal.set(r.proposalId, arr);
  }

  let followedSectorIds: number[] = [];
  let myContributionSectorIds: number[] = [];
  if (member) {
    followedSectorIds = (await db.select().from(memberSectorFollows).where(eq(memberSectorFollows.memberId, member.id))).map((f) => f.sectorId);
    myContributionSectorIds = await memberContributionSectorTags(db, community.id, member.id);
  }

  const out: (ProposalListRow & { rankScore: number })[] = rows.map((p) => {
    const sectorIds = sectorsByProposal.get(p.id) ?? [];
    return {
      id: p.id,
      title: p.title,
      cls: p.cls as ProposalClass,
      byName: nameById.get(p.by) ?? "a member",
      submittedAt: p.submittedAt,
      stage: p.stage as "deliberation" | "voting" | "record",
      voteOpensAt: p.voteOpensAt,
      votingClosesAt: p.votingClosesAt,
      outcome: p.outcome,
      critical: p.critical === 1,
      timeSensitive: p.timeSensitive === 1,
      sectorNames: sectorIds.map((id) => sectorNameById.get(id) ?? "").filter(Boolean),
      targetClauses: resolveStoredClauseChips(p.targetClauseIds),
      rankScore: member ? rankScore(followedSectorIds, myContributionSectorIds, sectorIds, community.params.rankingWeights) : 0,
    };
  });
  const ranked = member
    ? out.filter((p) => p.rankScore > 0).sort((a, b) => b.rankScore - a.rankScore).slice(0, 5)
    : [];

  // Excludes Default-Delegate Mechanism seat placeholders — a seat can never actually hold the
  // Charter's compensated Delegate Position, so it has no business in this
  // Position-decision target-member picker.
  const allMembers = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));

  return c.html(
    <ProposalsPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      proposals={out}
      ranked={ranked}
      sectors={sectorRows.map((s) => ({ id: s.id, name: s.name }))}
      allMembers={allMembers}
      error={error}
      prefill={{
        title: c.req.query("title"),
        why: c.req.query("why"),
        // A pre-filled clause determines its own class the same way the
        // server would at submission (classFloor) — "entrenched" if the
        // pre-filled clause is entrenched, else "amendment," since both
        // pre-fill sources (/documents, /documents/defaults) only ever
        // name a clause in an in-scope document. Falls back to the plain
        // ?cls= query param when nothing is pre-filled, same as before.
        cls: classFloor(c.req.queries("targetClauseIds") ?? []) ?? c.req.query("cls"),
        targetClauseIds: c.req.queries("targetClauseIds"),
      }}
      clausePicker={buildClausePicker()}
    />,
    error ? 400 : 200
  );
}

app.get("/proposals", (c) => renderProposalsPage(c));

app.get("/proposals/:id", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member");
  const ts = clockNow(community);
  const proposalId = Number(c.req.param("id"));

  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!p || p.communityId !== community.id) return c.notFound();

  const nameById = new Map((await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.communityId, community.id))).map((m) => [m.id, m.name]));
  const allSectors = await db.select().from(sectors).where(eq(sectors.communityId, community.id));
  const sectorNameById = new Map(allSectors.map((s) => [s.id, s.name]));
  const sectorTagRows = await db.select({ sectorId: proposalSectors.sectorId }).from(proposalSectors).where(eq(proposalSectors.proposalId, proposalId));
  const proposalSectorIds = sectorTagRows.map((r) => r.sectorId);
  const sectorNames = proposalSectorIds.map((id) => sectorNameById.get(id) ?? "").filter(Boolean);

  let liveTally;
  let myVote: boolean | undefined;
  if (p.stage === "voting") {
    const votingMembers = await loadVotingMembers(db, community.id);
    const directVotes = await db.select().from(votes).where(eq(votes.proposalId, p.id));
    const voteMap: Record<number, boolean> = {};
    for (const v of directVotes) voteMap[v.memberId] = v.value === 1;
    const expiryDays = p.critical ? community.params.delegationExpiryCriticalDays : community.params.delegationExpiryDays;
    const concentrated = await concentrationHolders(db, community.id, community.params, ts, proposalSectorIds);
    const tally = resolveVote(votingMembers, voteMap, ts, expiryDays, proposalSectorIds, concentrated.size ? { targets: concentrated, days: community.params.delegationExpiryCriticalDays } : undefined);
    liveTally = { yes: tally.yes, no: tally.no, participating: tally.participating };
    myVote = member ? voteMap[member.id] : undefined;
  }

  const commentRows = await db.select().from(proposalComments).where(eq(proposalComments.proposalId, proposalId)).orderBy(proposalComments.postedAt);
  const hiddenIds = await hidingMeasureIds(db, community.id, ts);
  const viewerIsModerator = member ? await isModerator(db, community, member.id, ts) : false;
  // Rules of Procedure 6.1 — a Position decision that would install a joint arrangement says so plainly, before and while the vote runs.
  let jointNotice: string | null = null;
  if (p.cls === "position" && p.positionAction === "recognize" && p.stage !== "record" && p.targetMemberId && p.targetSectorId) {
    const preview = await jointArrangementPreview(db, community, p.targetSectorId, p.targetMemberId, ts);
    if (preview) {
      jointNotice = `This would install a joint arrangement, not a single Delegate. The candidate's delegated support is currently within ${Math.round(community.params.delegateTieMargin * 100)}% of ${preview.withName}'s, who already holds this Position. If that is still true when the vote is ratified, both hold it jointly as co-Delegates (Charter 4.10, Rules of Procedure 6.1).`;
    }
  }
  const minorityReportRows = p.critical ? await loadMinorityReports(db, proposalId) : [];

  // Rules of Procedure 1.6 — 10% of Active Members, same figure as the
  // emergency-proposal petition (4.1); must succeed before voting opens.
  let petitionSignatures = 0;
  let petitionNeeded = 0;
  let iSigned = false;
  if (p.stage === "deliberation" && !p.critical) {
    const sigs = await db.select().from(criticalPetitionSignatures).where(eq(criticalPetitionSignatures.proposalId, proposalId));
    petitionSignatures = sigs.length;
    const active = await activeMemberCount(db, community.id, ts, community.params.activeWindowDays);
    petitionNeeded = Math.ceil(active * PETITION_SIGNATURE_SHARE);
    iSigned = member ? sigs.some((s) => s.memberId === member.id) : false;
  }

  // Rules of Procedure 1.3a — same 10%-of-Active-Members mechanic, a
  // distinct petition for a distinct purpose (a shortened timeline, not a
  // reclassification). Only has an effect on Ordinary/Treasury proposals
  // (Position/Amendment/Entrenched already run shorter or equal windows).
  let tsPetitionSignatures = 0;
  let tsPetitionNeeded = 0;
  let iSignedTimeSensitive = false;
  if (p.stage === "deliberation" && !p.timeSensitive && (p.cls === "ordinary" || p.cls === "treasury")) {
    const sigs = await db.select().from(timeSensitivePetitionSignatures).where(eq(timeSensitivePetitionSignatures.proposalId, proposalId));
    tsPetitionSignatures = sigs.length;
    const active = await activeMemberCount(db, community.id, ts, community.params.activeWindowDays);
    tsPetitionNeeded = Math.ceil(active * PETITION_SIGNATURE_SHARE);
    iSignedTimeSensitive = member ? sigs.some((s) => s.memberId === member.id) : false;
  }

  // Rules of Procedure 3.3 — "publishes the resolution with the vote". The
  // resolution has always been computed and stored on proposals.tally; it was
  // never surfaced, so the clause's publication requirement went unmet.
  const resolution: { memberName: string; via: string | null; value: boolean }[] = [];
  if (p.tally) {
    try {
      const stored = JSON.parse(p.tally) as { resolutions?: Record<string, { val: boolean; how: string }> };
      for (const [memberId, r] of Object.entries(stored.resolutions ?? {})) {
        const viaMatch = /^via (\d+)$/.exec(r.how);
        resolution.push({
          memberName: nameById.get(Number(memberId)) ?? `member ${memberId}`,
          via: viaMatch ? nameById.get(Number(viaMatch[1])) ?? `member ${viaMatch[1]}` : null,
          value: r.val,
        });
      }
      resolution.sort((a, b) => a.memberName.localeCompare(b.memberName));
    } catch {
      // A malformed tally blob must not take the page down; the rest of the
      // proposal still renders and the resolution simply shows as unavailable.
    }
  }

  return c.html(
    <ProposalDetailPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      proposal={{
        id: p.id,
        title: p.title,
        why: p.why,
        cost: p.cost,
        amount: p.amount,
        reversal: p.reversal,
        cls: p.cls as ProposalClass,
        byName: nameById.get(p.by) ?? "a member",
        submittedAt: p.submittedAt,
        stage: p.stage as "deliberation" | "voting" | "record",
        voteOpensAt: p.voteOpensAt,
        votingClosesAt: p.votingClosesAt,
        outcome: p.outcome,
        liveTally,
        myVote,
        critical: p.critical === 1,
        sectorNames,
        targetMemberName: p.targetMemberId ? nameById.get(p.targetMemberId) ?? null : null,
        targetSectorName: p.targetSectorId ? sectorNameById.get(p.targetSectorId) ?? null : null,
        positionAction: (p.positionAction as "recognize" | "remove" | "confirm" | "concentration" | null) ?? null,
        jointNotice,
        petitionSignatures,
        petitionNeeded,
        iSigned,
        timeSensitive: p.timeSensitive === 1,
        timeSensitiveDeadlineNote: p.timeSensitiveDeadlineNote,
        tsPetitionSignatures,
        tsPetitionNeeded,
        iSignedTimeSensitive,
        resolution,
        targetClauses: resolveStoredClauseChips(p.targetClauseIds),
      }}
      comments={commentRows.map((cm) => {
        const hidden = cm.hiddenMeasureId !== null && hiddenIds.has(cm.hiddenMeasureId);
        return {
          id: cm.id,
          memberName: cm.memberId ? nameById.get(cm.memberId) ?? "a member" : null,
          displayName: cm.displayName,
          isAnonymous: cm.isAnonymous === 1,
          body: hidden ? REMOVED_NOTICE : cm.body,
          postedAt: cm.postedAt,
          hidden,
          modHref: viewerIsModerator && !hidden && cm.memberId !== null && cm.memberId !== member?.id ? modRemoveHref("proposal-comment", cm.id) : undefined,
        };
      })}
      minorityReports={minorityReportRows.map((r) => ({ id: r.id, memberName: r.memberName, body: r.body, filedAt: r.filedAt }))}
      iFiledMinorityReport={member ? minorityReportRows.some((r) => r.memberId === member.id) : false}
      phoneVerificationBlocked={requirePhoneVerification(c) && !!member && !isPhoneVerified(await getPhoneVerifiedAt(db, member.id))}
      petitionSharePct={Math.round(PETITION_SIGNATURE_SHARE * 100)}
    />
  );
});

app.post("/proposals/:id/minority-report", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const proposalId = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const text = String(body.body ?? "").trim();

  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (p && p.communityId === community.id && p.critical && text) {
    await fileMinorityReport(db, community.id, proposalId, member.id, text, ts);
    await touchMember(db, member.id, ts);
  }
  return c.redirect(`/proposals/${proposalId}`);
});

app.post("/proposals/:id/comments", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member");
  const ts = clockNow(community);
  const proposalId = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const text = String(body.body ?? "").trim();
  const wantsAnonymous = String(body.anonymous ?? "") === "on" || !member;
  const displayNameRaw = String(body.displayName ?? "").trim();

  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  let newId: number | null = null;
  if (p && p.communityId === community.id && text) {
    if (wantsAnonymous) {
      const label = displayNameRaw.slice(0, 40) || "a visitor";
      const [row] = await db
        .insert(proposalComments)
        .values({ proposalId, memberId: null, displayName: label, isAnonymous: 1, body: text, postedAt: ts })
        .returning();
      newId = row.id;
      await writeRecord(db, community.id, "deliberation", `${label} (anonymous) commented on "${p.title}".`, null, ts);
    } else if (member) {
      const [row] = await db
        .insert(proposalComments)
        .values({ proposalId, memberId: member.id, displayName: null, isAnonymous: 0, body: text, postedAt: ts })
        .returning();
      newId = row.id;
      await touchMember(db, member.id, ts);
      await writeRecord(db, community.id, "deliberation", `${member.name} argued on "${p.title}".`, member.id, ts);
    }
  }
  return c.redirect(`/proposals/${proposalId}${newId ? `#c${newId}` : ""}`);
});

app.post("/proposals", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody({ all: true });

  const title = String(body.title ?? "").trim() || "Untitled";
  const why = String(body.why ?? "").trim() || "—";
  const cost = body.cost ? String(body.cost).trim() : null;
  const reversal = body.reversal ? String(body.reversal).trim() : null;
  const clsRaw = String(body.cls ?? "ordinary");
  const submittedCls: ProposalClass = clsRaw in CLASS_CONFIG ? (clsRaw as ProposalClass) : "ordinary";

  // Clause-structured amendments (docs/reviews/clause-amendments-plan.md).
  // The class floor a named clause imposes applies regardless of which
  // class was actually submitted — a tampered or merely naive "ordinary"
  // submission naming an entrenched clause is still raised to
  // "entrenched," never silently trusted. Computed before `cfg` below so
  // the vote's timing/threshold reflect the FINAL class, not the one the
  // client sent.
  const targetClauseIdsRaw = toStringArray(body.targetClauseIds);
  const { cls, targetClauseIds, invalidClauseKeys, errors: clauseErrors } = resolveProposalClassification(submittedCls, targetClauseIdsRaw);
  const cfg = CLASS_CONFIG[cls];

  const amount = (cls === "treasury" || cls === "treasury_reserve") && body.amount ? Math.round(Number(body.amount)) || null : null;
  const targetMemberId = cls === "position" && body.targetMemberId ? Number(body.targetMemberId) || null : null;
  const targetSectorId = cls === "position" && body.targetSectorId ? Number(body.targetSectorId) || null : null;
  const positionActionRaw = String(body.positionAction ?? "");
  const positionAction = cls === "position" && (positionActionRaw === "recognize" || positionActionRaw === "remove") ? positionActionRaw : null;

  // Prompt27_SeatPlaceholderValidation.md — a Position decision's target
  // member must be a real member of this community, not a Default-Delegate
  // Mechanism seat placeholder (members.seatKind non-null — the dropdown at
  // GET /proposals already excludes these, but that's client-facing only;
  // a raw form submission or any non-UI client could still supply one
  // directly) and not a member id belonging to a different community
  // (never checked before this pass either). Rejected here, at creation —
  // same defense-in-depth spirit as the second check in closeOneVote below,
  // which guards the same thing again at ratification time since a
  // placeholder's seatKind is mutable state that can drift between now and
  // then. Same follow-up pass added the target-sector half right below:
  // proposals.targetSectorId is a real FK to sectors.id, so a wholly
  // nonexistent id already threw before this fix — but the FK can't know
  // about community scoping, so a real sector belonging to a different
  // community passed it silently. Both checks run before either can return,
  // so a submission that fails both gets one combined error rather than
  // only ever surfacing the first problem.
  const targetErrors: string[] = [];
  if (targetMemberId !== null) {
    const [target] = await db.select({ communityId: members.communityId, seatKind: members.seatKind, leftAt: members.leftAt }).from(members).where(eq(members.id, targetMemberId));
    if (!isValidPositionTarget(target, community.id) || (target && target.leftAt !== null)) {
      targetErrors.push(
        "Position-decision target must be a real member of this community — not a Default-Delegate Mechanism seat placeholder, and not a member of a different community."
      );
    }
  }
  if (targetSectorId !== null) {
    const [sector] = await db.select({ communityId: sectors.communityId }).from(sectors).where(eq(sectors.id, targetSectorId));
    if (!isValidPositionSector(sector, community.id)) {
      targetErrors.push("Position-decision target sector must be a real sector in this community.");
    }
  }
  // Clause-structured amendments: resolveProposalClassification already
  // decided the final class and which keys are valid (invalidClauseKeys
  // unused here on purpose — a raw POST naming a bad key is rejected via
  // clauseErrors regardless of class, below).
  targetErrors.push(...clauseErrors);
  if (targetErrors.length) {
    return renderProposalsPage(c, targetErrors.join(" "));
  }

  const treasuryBalance = await treasuryTotalBalance(db, community.id);
  const critical = computeCritical(cls, amount, treasuryBalance);

  const voteOpensAt = ts + cfg.delibDays * DAY_MS;
  const voteFreezeAt = voteOpensAt - community.params.voteFreezeHours * 60 * 60 * 1000;
  const votingClosesAt = voteOpensAt + cfg.voteDays * DAY_MS;

  const [row] = await db
    .insert(proposals)
    .values({
      communityId: community.id,
      by: member.id,
      title,
      why,
      cost,
      reversal,
      cls,
      submittedAt: ts,
      voteFreezeAt,
      voteOpensAt,
      votingClosesAt,
      stage: "deliberation",
      critical: critical ? 1 : 0,
      amount,
      targetMemberId,
      targetSectorId,
      positionAction,
      targetClauseIds: targetClauseIds.length > 0 ? JSON.stringify(targetClauseIds) : null,
    })
    .returning();

  await insertSectorTags(db, "proposal", row.id, toIdArray(body.sectorId), community.id);

  await touchMember(db, member.id, ts);
  await writeRecord(db, community.id, "proposal", `${member.name} submitted a ${cls} proposal: "${title}".${critical ? " (critical)" : ""}`, member.id, ts);
  return c.redirect("/proposals");
});

app.post("/proposals/:id/vote", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const proposalId = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const value = String(body.value) === "yes";

  // Triarc Membership Code 2.1/2.3 (Prompt25_PathA_MembershipEnforcement.md
  // Part D.1), the Triarc only. A no-op when the variable is
  // unset — requirePhoneVerification(c) is false, so this block never runs.
  if (requirePhoneVerification(c) && !isPhoneVerified(await getPhoneVerifiedAt(db, member.id))) {
    return c.redirect(`/proposals/${proposalId}`);
  }

  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (p && p.communityId === community.id && p.stage === "voting") {
    await db
      .insert(votes)
      .values({ proposalId, memberId: member.id, value: value ? 1 : 0, castAt: ts })
      .onConflictDoUpdate({ target: [votes.proposalId, votes.memberId], set: { value: value ? 1 : 0, castAt: ts } });
    await touchMember(db, member.id, ts);
    await writeRecord(db, community.id, "vote", `${member.name} voted ${value ? "YES" : "NO"} on "${p.title}".`, member.id, ts);
  }
  return c.redirect(`/proposals/${proposalId}`);
});

app.post("/proposals/:id/petition-critical", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const proposalId = Number(c.req.param("id"));

  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (p && p.communityId === community.id && p.stage === "deliberation" && !p.critical) {
    const existing = await db
      .select()
      .from(criticalPetitionSignatures)
      .where(and(eq(criticalPetitionSignatures.proposalId, proposalId), eq(criticalPetitionSignatures.memberId, member.id)));
    if (!existing.length) {
      await db.insert(criticalPetitionSignatures).values({ proposalId, memberId: member.id, signedAt: ts });
      await touchMember(db, member.id, ts);
    }
    const sigs = await db.select().from(criticalPetitionSignatures).where(eq(criticalPetitionSignatures.proposalId, proposalId));
    const active = await activeMemberCount(db, community.id, ts, community.params.activeWindowDays);
    const needed = Math.ceil(active * PETITION_SIGNATURE_SHARE);
    if (sigs.length >= needed) {
      await db.update(proposals).set({ critical: 1 }).where(eq(proposals.id, proposalId));
      await writeRecord(db, community.id, "record", `"${p.title}" reclassified as critical by community petition (${sigs.length}/${needed} signatures).`, null, ts);
    }
  }
  return c.redirect(`/proposals/${proposalId}`);
});

// Rules of Procedure 1.3a — mirrors petition-critical above (same 10%
// threshold, same "before voting opens" gate) but for a distinct purpose:
// restoring the pre-Aug-2026-amendment 7d/5d Ordinary/Treasury timeline for
// a proposal with a genuine external deadline, instead of reclassifying it
// critical. Independent of the critical petition — a proposal may sign both.
app.post("/proposals/:id/petition-time-sensitive", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const proposalId = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const deadlineNote = body.deadlineNote ? String(body.deadlineNote).trim().slice(0, 300) : "";

  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId));
  if (p && p.communityId === community.id && p.stage === "deliberation" && !p.timeSensitive && (p.cls === "ordinary" || p.cls === "treasury")) {
    const existing = await db
      .select()
      .from(timeSensitivePetitionSignatures)
      .where(and(eq(timeSensitivePetitionSignatures.proposalId, proposalId), eq(timeSensitivePetitionSignatures.memberId, member.id)));
    if (!existing.length) {
      await db.insert(timeSensitivePetitionSignatures).values({ proposalId, memberId: member.id, signedAt: ts });
      await touchMember(db, member.id, ts);
    }
    // Rules of Procedure 1.3a requires the petition to state "the specific
    // deadline" — captured from whichever signer provides one first; later
    // signers may still add one if it's missing.
    if (deadlineNote && !p.timeSensitiveDeadlineNote) {
      await db.update(proposals).set({ timeSensitiveDeadlineNote: deadlineNote }).where(eq(proposals.id, proposalId));
    }

    const sigs = await db.select().from(timeSensitivePetitionSignatures).where(eq(timeSensitivePetitionSignatures.proposalId, proposalId));
    const active = await activeMemberCount(db, community.id, ts, community.params.activeWindowDays);
    const needed = Math.ceil(active * PETITION_SIGNATURE_SHARE);
    const hasDeadlineNote = deadlineNote || p.timeSensitiveDeadlineNote;
    if (sigs.length >= needed && hasDeadlineNote) {
      // Recompute the proposal's windows on the pre-amendment timeline, from
      // its original submission time — the same "before voting opens" gate
      // above stands in for 1.3a's "before deliberation opens" (deliberation
      // already opens at submission in this app; see Prompt23's own note on
      // this tension). If the pre-amendment window would already be in the
      // past by the time the petition succeeds, open voting now instead of
      // backdating it.
      const newVoteOpensAt = Math.max(ts, p.submittedAt + PRE_AMENDMENT_TIMELINE.delibDays * DAY_MS);
      const newVoteFreezeAt = newVoteOpensAt - community.params.voteFreezeHours * 60 * 60 * 1000;
      const newVotingClosesAt = newVoteOpensAt + PRE_AMENDMENT_TIMELINE.voteDays * DAY_MS;
      await db
        .update(proposals)
        .set({ timeSensitive: 1, voteOpensAt: newVoteOpensAt, voteFreezeAt: newVoteFreezeAt, votingClosesAt: newVotingClosesAt })
        .where(eq(proposals.id, proposalId));
      await writeRecord(
        db,
        community.id,
        "record",
        `"${p.title}" reclassified as time-sensitive by community petition (${sigs.length}/${needed} signatures) — voting now opens ${new Date(newVoteOpensAt).toDateString()} on the pre-amendment 7d/5d timeline. Stated deadline: ${hasDeadlineNote}.`,
        null,
        ts
      );
    }
  }
  return c.redirect(`/proposals/${proposalId}`);
});

// ================= Delegation =================

app.get("/delegation", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const ordinaryExpiry = community.params.delegationExpiryDays;
  const criticalExpiry = community.params.delegationExpiryCriticalDays;

  const allMembers = await db.select().from(members).where(eq(members.communityId, community.id));
  const nameById = new Map(allMembers.map((m) => [m.id, m.name]));
  const sectorRows = await db.select().from(sectors).where(and(eq(sectors.communityId, community.id), eq(sectors.active, 1)));
  const sectorNameById = new Map(sectorRows.map((s) => [s.id, s.name]));

  const myRows = await currentDelegationRows(db, member.id);
  // Charter 3.6 — a delegation to a concentrated holder runs on the shorter renewal cycle.
  const concentratedIds = await concentrationHolders(db, community.id, community.params, ts);
  const mine: DelegationRowView[] = myRows.map((d) => {
    const shorter = concentratedIds.has(d.toId);
    const ordinaryDays = shorter ? criticalExpiry : ordinaryExpiry;
    return {
      id: d.id,
      toName: nameById.get(d.toId) ?? "a member",
      scopeName: d.sectorId === null ? "Entire" : sectorNameById.get(d.sectorId) ?? "a sector",
      grantedAt: d.grantedAt,
      ordinaryExpiresAt: d.grantedAt + ordinaryDays * DAY_MS,
      criticalExpiresAt: d.grantedAt + criticalExpiry * DAY_MS,
      live: ts - d.grantedAt <= ordinaryDays * DAY_MS,
      shorterCycle: shorter,
    };
  });

  const dmap = await loadMemberDelegations(db, community.id);
  const held: { name: string; scopeName: string; grantedAt: number }[] = [];
  for (const [memberId, refs] of dmap) {
    for (const d of refs) {
      if (d.toId === member.id && ts - d.grantedAt <= ordinaryExpiry * DAY_MS) {
        held.push({
          name: nameById.get(memberId) ?? "a member",
          scopeName: d.sectorId === null ? "Entire" : sectorNameById.get(d.sectorId) ?? "a sector",
          grantedAt: d.grantedAt,
        });
      }
    }
  }

  const map = allMembers.map((m) => {
    const refs = (dmap.get(m.id) ?? []).filter((d) => ts - d.grantedAt <= ordinaryExpiry * DAY_MS);
    return {
      name: m.name,
      status: refs.length
        ? refs.map((d) => `→ ${nameById.get(d.toId) ?? "a member"} (${d.sectorId === null ? "entire" : sectorNameById.get(d.sectorId) ?? "sector"})`).join(", ")
        : "votes directly",
    };
  });

  // Split the target picker into real members and Default-Delegate Mechanism
  // public seats (Government Adoption Compact §3) so delegating to a seat is
  // a clearly deliberate action, not a member indistinguishable in a single
  // list.
  const others = allMembers.filter((m) => m.id !== member.id);
  const realOtherMembers = others.filter((m) => m.seatKind !== "default_delegate_seat").map((m) => ({ id: m.id, name: m.name }));
  const publicSeats = others.filter((m) => m.seatKind === "default_delegate_seat").map((m) => ({ id: m.id, name: m.name }));

  return c.html(
    <DelegationPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      mine={mine}
      otherMembers={realOtherMembers}
      publicSeats={publicSeats}
      sectors={sectorRows.map((s) => ({ id: s.id, name: s.name }))}
      held={held}
      map={map}
      phoneVerificationBlocked={requirePhoneVerification(c) && !isPhoneVerified(await getPhoneVerifiedAt(db, member.id))}
      delegationExpiryDays={community.params.delegationExpiryDays}
      delegationExpiryCriticalDays={community.params.delegationExpiryCriticalDays}
    />
  );
});

app.post("/delegation", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const toId = Number(body.toId);
  const scopeRaw = String(body.scope ?? "entire");
  const sectorId = scopeRaw === "entire" ? null : Number(scopeRaw) || null;

  // Triarc Membership Code 2.1/2.3 (Prompt25_PathA_MembershipEnforcement.md
  // Part D.1), the Triarc only — an unverified member can neither grant a
  // delegation nor receive one. No-op when the variable is unset
  // (requirePhoneVerification(c) is false). Checked before the target
  // lookup so granting to an unverified target is rejected too, not just an
  // unverified member trying to grant.
  if (requirePhoneVerification(c)) {
    if (!isPhoneVerified(await getPhoneVerifiedAt(db, member.id))) {
      return c.redirect("/delegation");
    }
    if (toId && toId !== member.id && !isPhoneVerified(await getPhoneVerifiedAt(db, toId))) {
      return c.redirect("/delegation");
    }
  }

  if (toId && toId !== member.id) {
    const [target] = await db.select().from(members).where(eq(members.id, toId));
    // A Member who has left (Charter 1.3) can't receive a delegation.
    if (target && target.communityId === community.id && target.leftAt === null) {
      // Charter 3.6 — a concentration review that ended this Member's delegations bars new ones for the bar period.
      if (await concentrationBarred(db, community.id, community.params, toId, sectorId, ts)) {
        return c.text(`A concentration review ended the delegations to ${target.name}, and no new delegation to them may be granted for ${community.params.concentrationBarDays} days after it (Charter 3.6).`, 409);
      }
      // A member holds at most one entire delegation OR several sector-scoped
      // ones, never both — auto-revoke whatever conflicts with the new shape
      // rather than erroring, logged as a Record entry (Charter 3.3).
      const existingRows = await currentDelegationRows(db, member.id);
      const conflicting =
        sectorId === null ? existingRows : existingRows.filter((r) => r.sectorId === null || r.sectorId === sectorId);
      for (const row of conflicting) {
        await db.update(delegations).set({ revokedAt: ts }).where(eq(delegations.id, row.id));
        // Rules of Procedure 3.3 — instant on every open vote. The NEW
        // delegation below is deliberately not added to any snapshot: grants
        // apply to the next vote, only revocations take effect now.
        await revokeOpenVoteSnapshots(db, community.id, member.id, row.toId, row.sectorId, ts);
      }
      if (conflicting.length) {
        await writeRecord(db, community.id, "delegation", `${member.name}'s prior delegation(s) were automatically revoked to grant a new one of a different scope.`, member.id, ts);
      }

      // Charter 3.4 — the database allows one live delegation per scope
      // (delegations_one_live_* indexes). If a second request for the same
      // scope raced this one, it loses here: the first request's delegation
      // stands and this one quietly does nothing more.
      if (!(await insertDelegationOnce(db, { memberId: member.id, toMemberId: toId, sectorId, grantedAt: ts, revokedAt: null }))) {
        return c.redirect("/delegation");
      }
      await touchMember(db, member.id, ts);
      const scopeLabel = sectorId === null ? "entirely" : "for one sector";
      await writeRecord(
        db,
        community.id,
        "delegation",
        `${member.name} delegated their vote to ${target.name} (${scopeLabel}; public, revocable, expires ${new Date(ts + community.params.delegationExpiryDays * DAY_MS).toDateString()} unless renewed — ${community.params.delegationExpiryCriticalDays} days for critical decisions).`,
        member.id,
        ts
      );
    }
  }
  return c.redirect("/delegation");
});

app.post("/delegation/:id/revoke", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(delegations).where(and(eq(delegations.id, id), eq(delegations.memberId, member.id), isNull(delegations.revokedAt)));
  if (row) {
    const [target] = await db.select().from(members).where(eq(members.id, row.toMemberId));
    await db.update(delegations).set({ revokedAt: ts }).where(eq(delegations.id, row.id));
    // Rules of Procedure 3.3 — effective immediately means immediately, on
    // every vote already open, not just on the next one.
    const openVotes = await revokeOpenVoteSnapshots(db, community.id, member.id, row.toMemberId, row.sectorId, ts);
    await touchMember(db, member.id, ts);
    await writeRecord(db, community.id, "delegation", `${member.name} revoked their delegation to ${target?.name ?? "a member"} — effective immediately${openVotes > 0 ? `, including on ${openVotes} vote(s) currently open` : ""}.`, member.id, ts);
  }
  return c.redirect("/delegation");
});

app.post("/delegation/:id/renew", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const [row] = await db.select().from(delegations).where(and(eq(delegations.id, id), eq(delegations.memberId, member.id), isNull(delegations.revokedAt)));
  if (row && ts - row.grantedAt <= community.params.delegationExpiryDays * DAY_MS) {
    const [target] = await db.select().from(members).where(eq(members.id, row.toMemberId));
    await db.update(delegations).set({ revokedAt: ts }).where(eq(delegations.id, row.id));
    if (!(await insertDelegationOnce(db, { memberId: member.id, toMemberId: row.toMemberId, sectorId: row.sectorId, grantedAt: ts, revokedAt: null }))) {
      return c.redirect("/delegation");
    }
    await touchMember(db, member.id, ts);
    await writeRecord(db, community.id, "delegation", `${member.name} renewed their delegation to ${target?.name ?? "a member"}.`, member.id, ts);
  }
  return c.redirect("/delegation");
});

// ================= Contribution =================

app.get("/contribution", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);

  const [treasury] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));
  const rows = await db.select().from(contributions).where(eq(contributions.communityId, community.id)).orderBy(desc(contributions.loggedAt)).limit(30);
  const nameById = new Map((await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.communityId, community.id))).map((m) => [m.id, m.name]));
  const sectorRows = await db.select().from(sectors).where(and(eq(sectors.communityId, community.id), eq(sectors.active, 1)));
  const sectorNameById = new Map(sectorRows.map((s) => [s.id, s.name]));
  const conSectorRows = await db.select().from(contributionSectors);
  const sectorsByContribution = new Map<number, number[]>();
  for (const r of conSectorRows) {
    const arr = sectorsByContribution.get(r.contributionId) ?? [];
    arr.push(r.sectorId);
    sectorsByContribution.set(r.contributionId, arr);
  }

  const out: ContributionRow[] = [];
  for (const con of rows) {
    const atts = await db.select().from(attestations).where(and(eq(attestations.contributionId, con.id), isNull(attestations.voidedAt)));
    const attestorNames = atts.map((a) => nameById.get(a.attestorId) ?? "a member");
    const alreadyAttested = atts.some((a) => a.attestorId === member.id);
    const claimStatus = contributionClaimStatus(con.verifiedAt, con.claimedAt, ts, CONTRIBUTION_CLAIM_WINDOW_DAYS);
    out.push({
      id: con.id,
      memberName: nameById.get(con.memberId) ?? "a member",
      domain: con.domain as Domain,
      description: con.description,
      evidenceLink: con.evidenceLink,
      loggedAt: con.loggedAt,
      verified: con.verifiedAt !== null,
      claimStatus,
      canClaim: claimStatus === "pending" && con.memberId === member.id,
      attestorsRequired: community.params.attestationsRequired,
      attestorNames,
      canAttest: con.verifiedAt === null && con.memberId !== member.id && !alreadyAttested,
      sectorNames: (sectorsByContribution.get(con.id) ?? []).map((id) => sectorNameById.get(id) ?? "").filter(Boolean),
    });
  }

  const creditsMap = await computePeriodCredits(db, community.id, treasury.lastDividendAt, ts);
  const myCredits = creditsMap.get(member.id) ?? { Deliberation: 0, Craft: 0, Stewardship: 0, Attestation: 0 };
  const myCapped = periodCredits(myCredits, community.params.diversityCap);
  const receivedRows = await db.select().from(treasuryLedger).where(and(eq(treasuryLedger.communityId, community.id), eq(treasuryLedger.kind, "dividend"), eq(treasuryLedger.memberId, member.id)));
  const myReceived = receivedRows.reduce((s, r) => s + r.amount, 0);

  // Directory links to a member's Contribution Record via ?member=<name>
  // rather than a separate profile page — minimal scope for this pass.
  const filterMemberName = c.req.query("member");
  const filteredOut = filterMemberName ? out.filter((r) => r.memberName === filterMemberName) : out;

  return c.html(
    <ContributionPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      items={filteredOut}
      filterMemberName={filterMemberName}
      myCredits={myCredits}
      myCapped={myCapped}
      myReceived={myReceived}
      domainShares={community.params.domainShares}
      claimWindowDays={CONTRIBUTION_CLAIM_WINDOW_DAYS}
      diversityCap={community.params.diversityCap}
      sectors={sectorRows.map((s) => ({ id: s.id, name: s.name }))}
      prefill={{
        domain: c.req.query("domain"),
        description: c.req.query("description"),
        evidenceLink: c.req.query("evidenceLink"),
        sectorId: c.req.query("sectorId"),
      }}
    />
  );
});

app.post("/contribution", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody({ all: true });
  const domainRaw = String(body.domain ?? "");
  const domain: Domain = (["Deliberation", "Craft", "Stewardship"] as Domain[]).includes(domainRaw as Domain) ? (domainRaw as Domain) : "Craft";
  const description = String(body.description ?? "").trim() || "(undescribed)";
  const evidenceLink = body.evidenceLink ? String(body.evidenceLink).trim() || null : null;

  const [row] = await db
    .insert(contributions)
    .values({ communityId: community.id, memberId: member.id, domain, description, evidenceLink, loggedAt: ts, verifiedAt: null })
    .returning();
  await insertSectorTags(db, "contribution", row.id, toIdArray(body.sectorId), community.id);

  await touchMember(db, member.id, ts);
  await writeRecord(
    db,
    community.id,
    "contribution",
    `${member.name} logged a ${domain} contribution: "${description}" (awaiting ${community.params.attestationsRequired} attestations).`,
    member.id,
    ts
  );
  return c.redirect("/contribution");
});

app.post("/contribution/:id/attest", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const contributionId = Number(c.req.param("id"));

  const [con] = await db.select().from(contributions).where(eq(contributions.id, contributionId));
  if (con && con.communityId === community.id && con.verifiedAt === null && con.memberId !== member.id) {
    const existing = await db.select().from(attestations).where(and(eq(attestations.contributionId, contributionId), eq(attestations.attestorId, member.id)));
    if (!existing.length) {
      await db.insert(attestations).values({ contributionId, attestorId: member.id, attestedAt: ts, voidedAt: null });
      await touchMember(db, member.id, ts);
      const [contributor] = await db.select().from(members).where(eq(members.id, con.memberId));
      await writeRecord(db, community.id, "attestation", `${member.name} attested ${contributor?.name ?? "a member"}'s ${con.domain} contribution.`, member.id, ts);

      const liveAttestations = await db.select().from(attestations).where(and(eq(attestations.contributionId, contributionId), isNull(attestations.voidedAt)));
      if (liveAttestations.length >= community.params.attestationsRequired) {
        await db.update(contributions).set({ verifiedAt: ts }).where(eq(contributions.id, contributionId));
        await writeRecord(
          db,
          community.id,
          "contribution",
          `Contribution verified — attestors accrued Attestation Marks. ${contributor?.name ?? "a member"} must claim it within ${CONTRIBUTION_CLAIM_WINDOW_DAYS} days (Contribution Code 1.4) before it counts toward standing or the dividend.`,
          null,
          ts
        );
      }
    }
  }
  return c.redirect("/contribution");
});

app.post("/contribution/:id/claim", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const contributionId = Number(c.req.param("id"));

  await claimContribution(db, community.id, member.id, contributionId, ts);
  await touchMember(db, member.id, ts);
  return c.redirect("/contribution");
});

// ================= Opportunities =================

app.get("/opportunities", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;

  const rows = await db.select().from(opportunities).where(eq(opportunities.communityId, community.id)).orderBy(desc(opportunities.postedAt));
  const nameById = new Map((await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.communityId, community.id))).map((m) => [m.id, m.name]));
  const sectorRows = await db.select().from(sectors).where(and(eq(sectors.communityId, community.id), eq(sectors.active, 1)));
  const sectorNameById = new Map(sectorRows.map((s) => [s.id, s.name]));
  const oppSectorRows = await db.select().from(opportunitySectors);
  const sectorsByOpp = new Map<number, number[]>();
  for (const r of oppSectorRows) {
    const arr = sectorsByOpp.get(r.opportunityId) ?? [];
    arr.push(r.sectorId);
    sectorsByOpp.set(r.opportunityId, arr);
  }

  const followedSectorIds = (await db.select().from(memberSectorFollows).where(eq(memberSectorFollows.memberId, member.id))).map((f) => f.sectorId);
  const myContributionSectorIds = await memberContributionSectorTags(db, community.id, member.id);

  const out: (OpportunityRow & { rankScore: number })[] = rows.map((o) => {
    const sectorIds = sectorsByOpp.get(o.id) ?? [];
    return {
      id: o.id,
      title: o.title,
      description: o.description,
      domain: (o.domain as Domain | null) ?? null,
      postedByName: nameById.get(o.postedBy) ?? "a member",
      postedAt: o.postedAt,
      sectorNames: sectorIds.map((id) => sectorNameById.get(id) ?? "").filter(Boolean),
      sectorIds,
      rankScore: rankScore(followedSectorIds, myContributionSectorIds, sectorIds, community.params.rankingWeights),
    };
  });
  const ranked = out.filter((o) => o.rankScore > 0).sort((a, b) => b.rankScore - a.rankScore).slice(0, 5);

  const filterSectorId = c.req.query("sectorId") ? Number(c.req.query("sectorId")) : null;
  const filtered = filterSectorId ? out.filter((o) => o.sectorIds.includes(filterSectorId)) : out;

  return c.html(
    <OpportunitiesPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      opportunities={filtered}
      ranked={filterSectorId ? [] : ranked}
      sectors={sectorRows.map((s) => ({ id: s.id, name: s.name }))}
      filterSectorId={filterSectorId}
    />
  );
});

app.post("/opportunities", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody({ all: true });
  const title = String(body.title ?? "").trim() || "Untitled";
  const description = String(body.description ?? "").trim() || "—";
  const domainRaw = String(body.domain ?? "");
  const domain = (DOMAINS as readonly string[]).includes(domainRaw) ? domainRaw : null;

  const sectorIds = toIdArray(body.sectorId);
  const [row] = await db.insert(opportunities).values({ communityId: community.id, postedBy: member.id, title, description, domain, postedAt: ts }).returning();
  await insertSectorTags(db, "opportunity", row.id, sectorIds, community.id);

  await touchMember(db, member.id, ts);
  await writeRecord(db, community.id, "record", `${member.name} posted an opportunity: "${title}".`, member.id, ts);

  // Contribution Code 2.4 — notify members following any sector this
  // opportunity is tagged with, excluding the poster themselves. Dedup'd to
  // one notification per member even if they follow several matched sectors.
  if (sectorIds.length > 0) {
    const followerRows = await db.select({ memberId: memberSectorFollows.memberId }).from(memberSectorFollows).where(inArray(memberSectorFollows.sectorId, sectorIds));
    const followerIds = [...new Set(followerRows.map((r) => r.memberId))].filter((fid) => fid !== member.id);
    for (const followerId of followerIds) {
      await notify(db, c.env, community.id, followerId, "opportunity_matching_your_sectors", `${member.name} posted a new opportunity matching a sector you follow: "${title}".`, "/opportunities", ts);
    }
  }

  return c.redirect("/opportunities");
});

// ================= Directory =================

app.get("/directory", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member");
  const ts = clockNow(community);

  const entries = await computeStewardsAndDelegates(db, community, ts);
  const followedSectorIds = member
    ? (await db.select().from(memberSectorFollows).where(eq(memberSectorFollows.memberId, member.id))).map((f) => f.sectorId)
    : [];

  return c.html(<DirectoryPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} entries={entries} followedSectorIds={followedSectorIds} />);
});

app.post("/sectors/:id/follow", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const sectorId = Number(c.req.param("id"));
  const [sector] = await db.select().from(sectors).where(and(eq(sectors.id, sectorId), eq(sectors.communityId, community.id)));
  if (sector) {
    const existing = await db.select().from(memberSectorFollows).where(and(eq(memberSectorFollows.memberId, member.id), eq(memberSectorFollows.sectorId, sectorId)));
    if (!existing.length) {
      await db.insert(memberSectorFollows).values({ memberId: member.id, sectorId, followedAt: ts });
    }
  }
  return c.redirect(c.req.header("Referer") ?? "/directory");
});

app.post("/sectors/:id/unfollow", async (c) => {
  const db = c.get("db");
  const member = c.get("member")!;
  const sectorId = Number(c.req.param("id"));
  await db.delete(memberSectorFollows).where(and(eq(memberSectorFollows.memberId, member.id), eq(memberSectorFollows.sectorId, sectorId)));
  return c.redirect(c.req.header("Referer") ?? "/directory");
});

// ================= Treasury =================

app.get("/treasury", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member");

  const [treasury] = await db.select().from(treasuryState).where(eq(treasuryState.communityId, community.id));
  // Charter 5.3's cap is a multiple of the equal share, so what it works out to
  // depends on how many verified Members there are right now.
  // Treasury Code 9.2 — the equal share is the pool divided by the number of verified Members.
  const memberRows = await db.select({ id: members.id }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  const ledgerRows = await db.select().from(treasuryLedger).where(eq(treasuryLedger.communityId, community.id)).orderBy(desc(treasuryLedger.recordedAt)).limit(30);

  return c.html(
    <TreasuryPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      ops={treasury.opsBalance}
      dividend={treasury.dividendBalance}
      reserve={treasury.reserveBalance}
      periodDays={community.params.periodDays}
      dividendCapMultiple={community.params.dividendCapMultiple}
      dividendCapMemberCount={memberRows.length}
      foundationPoolShare={community.params.foundationPoolShare}
      dividendsPaid={treasury.dividendsPaid}
      nextDividendAt={treasury.lastDividendAt + community.params.periodDays * DAY_MS}
      ledger={ledgerRows.map((l) => ({ day: new Date(l.recordedAt).toDateString(), text: l.source }))}
      reserveMonthsCovered={community.params.criteria.phase2.reserveMonthsCovered}
    />
  );
});

app.post("/treasury/donate", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const amt = Math.round(Number(body.amount));
  // Treasury Code 1.4 — a restricted contribution bypasses the standard
  // 40/40/20 split entirely and flows 100% to its stated purpose.
  // "institutional" covers 1.4's own example (the Triarc and other
  // institutional contributors — never to the dividend pool); "reserve" is
  // a plain purpose-restricted gift to the reserve. Blank/absent is today's
  // unchanged default behavior. Deliberately narrower than the full clause
  // for this pass: 1.4 also allows restricting to "a specific ratified
  // project," which isn't offered here — that requires resolving which
  // ratified proposal the restriction attaches to, a separate piece of
  // work, not a UI checkbox.
  const restrictionRaw = String(body.restriction ?? "").trim();
  const restriction: "institutional" | "reserve" | null = restrictionRaw === "institutional" || restrictionRaw === "reserve" ? restrictionRaw : null;
  if (amt > 0) {
    const { ops, dividend: div, reserve: res } = computeDonationSplit(amt, community.params.split, restriction);
    const text =
      restriction === "institutional"
        ? `${member.name} donated $${amt}, restricted to Operations — Treasury Code 1.4, institutional contribution, never reaches the dividend pool.`
        : restriction === "reserve"
          ? `${member.name} donated $${amt}, restricted to Reserve — Treasury Code 1.4 purpose restriction, bypasses the standard split.`
          : `${member.name} donated: +$${amt} → ops $${ops} · dividend $${div} · reserve $${res} (split 40/40/20 per Treasury Code §2).`;

    await addToTreasury(db, community.id, { ops, dividend: div, reserve: res });

    await db.insert(treasuryLedger).values({ communityId: community.id, kind: "donation", amount: amt, source: text, restriction, memberId: member.id, recordedAt: ts });
    await writeRecord(db, community.id, "treasury", text, member.id, ts);
  }
  return c.redirect("/treasury");
});

// A member voluntarily returning their own already-received dividend is
// just their own money donated back — same 40/40/20 split as any donation
// (Treasury Code §1.1/§2). Distinct from residue reallocation below, which
// is about undistributed pool money, not a member's choice about their own.
app.post("/contribution/return-dividend", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const amt = Math.round(Number(body.amount));
  if (amt > 0) {
    const { ops: opsShare, dividend: divShare } = community.params.split;
    const ops = Math.round(amt * opsShare);
    const div = Math.round(amt * divShare);
    const res = amt - ops - div;

    await addToTreasury(db, community.id, { ops, dividend: div, reserve: res });

    const text = `${member.name} returned $${amt} of their Civic Dividend to the treasury → ops $${ops} · dividend $${div} · reserve $${res} (split 40/40/20 per Treasury Code §2).`;
    await db.insert(treasuryLedger).values({ communityId: community.id, kind: "dividend-return", amount: amt, source: text, memberId: member.id, recordedAt: ts });
    await writeRecord(db, community.id, "treasury", text, member.id, ts);
  }
  return c.redirect("/contribution");
});

// ================= Record =================

app.get("/record", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member");
  const rows = await db.select().from(recordTable).where(eq(recordTable.communityId, community.id)).orderBy(desc(recordTable.occurredAt)).limit(200);
  return c.html(<RecordPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} entries={rows.map((r) => ({ kind: r.kind, text: r.text, occurredAt: r.occurredAt }))} />);
});

// ================= Sign-up status and the public tour (launch readiness) =================

// Public and read-only: whether sign-ups are open or briefly paced, the cap in force, and how many
// people joined in the last rolling hour. Aggregate only; nothing about any person.
app.get("/status", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const cap = parseRegistrationHourlyCap(c.env.REGISTRATION_HOURLY_CAP);
  const state = await registrationThrottle(db, community.id, cap, clockNow(community));
  return c.html(
    <StatusPage member={c.get("member")} adminDebug={adminDebug(c)} communityName={communityName(c)} cap={state.cap} recent={state.recent} throttled={state.throttled} retryMinutes={throttleMinutes(state.retryAfterMs)} />
  );
});

// "Look around before you join": a curated page built only from routes that are already public.
// Reads nothing from the database and exposes nothing a logged-out visitor cannot already open.
app.get("/tour", (c) => c.html(<TourPage member={c.get("member")} adminDebug={adminDebug(c)} communityName={communityName(c)} requirePhoneVerification={requirePhoneVerification(c)} />));

// ================= Governance-health dashboard (Rules of Procedure 7) =================

app.get("/governance-health", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member");
  const ts = clockNow(community);
  const health = await computeGovernanceHealth(db, community, ts);
  return c.html(
    <GovernanceHealthPage
      member={member}
      adminDebug={adminDebug(c)}
      communityName={communityName(c)}
      health={health}
      domainIssuanceCapEnabled={community.params.domainIssuanceCapEnabled}
      maxDelegateShare={community.params.criteria.phase2.maxDelegateShare}
      unaccountedDefaults={[
        ...documentsData.unaccountedDefaults.map((u) => `${documentsData.documents.find((d) => d.slug === u.documentSlug)?.title ?? u.documentSlug} ${u.clauseId} — ${u.note}`),
        ...DEFAULTS_REGISTRY.filter((e) => e.paramsPath === null).map((e) => `${documentsData.documents.find((d) => d.slug === e.documentSlug)?.title ?? e.documentSlug} ${e.clauseId} — ${e.label} (${e.currentAppValue(community.params)})`),
      ]}
    />
  );
});

// ================= Documents area (Phase 2 — docs/briefs/2026-10-11_app-review-and-documents.md) =================
// Pure reads over the generated module — no DB query beyond the existing
// member/session middleware every page already has, except the Reader's
// live-values fetch below.

app.get("/documents", async (c) => {
  const member = c.get("member");
  const q = c.req.query("q");
  // Stage A — public document search, lives on the Library page itself so
  // it needs no new route and no new public-access rule (GET /documents is
  // already public); the existing /search stays member-only, untouched.
  const search = q !== undefined ? { q, ...searchDocuments(q) } : undefined;
  return c.html(<DocumentsLibraryPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} search={search} />);
});

// Phase 2 stage 6 — must be registered before "/documents/:slug" below,
// or Hono's first-match routing would send "defaults" into the slug
// handler and 404 (no founding document is named "defaults").
app.get("/documents/defaults", async (c) => {
  const member = c.get("member");
  const community = c.get("community");
  const rows: DefaultsPageRow[] = DEFAULTS_REGISTRY.map((entry) => {
    const defaultValue = entry.currentAppValue(DEFAULT_PARAMS);
    const liveValueRaw = entry.paramsPath === null ? defaultValue : entry.currentAppValue(community.params);
    return {
      id: entry.id,
      documentSlug: entry.documentSlug,
      clauseId: entry.clauseId,
      scheduleClauseId: entry.scheduleClauseId,
      label: entry.label,
      defaultValue,
      liveValue: liveValueRaw === defaultValue ? null : liveValueRaw,
      isEntrenched: isDefaultEntrenched(entry, documentsData.entrenchedClauseIds),
    };
  });
  return c.html(<DocumentsDefaultsPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} rows={rows} unaccountedGac={documentsData.unaccountedDefaults} />);
});

app.get("/documents/:slug", async (c) => {
  const member = c.get("member");
  const doc = documentsData.documents.find((d) => d.slug === c.req.param("slug"));
  if (!doc) return c.notFound();
  // Phase 2 stage 4 — clause reading must never depend on this succeeding.
  // A fresh or mid-migration local DB (no tables yet), a signed-out visitor
  // on a brand-new community, or any other live-data hiccup falls back to
  // null — the Reader then shows each clause's own stated text with no
  // "Live in this community" box, never an error page and never a zero
  // that looks like a real answer.
  let live: Awaited<ReturnType<typeof computeLiveValues>> | null = null;
  try {
    live = await computeLiveValues(c.get("db"), c.get("community"));
  } catch {
    live = null;
  }
  return c.html(<DocumentsReaderPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} doc={doc} live={live} />);
});

// ================= Activity (Phase 1 — "Activity log") =================

app.get("/activity", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const rows = await db
    .select()
    .from(recordTable)
    .where(and(eq(recordTable.communityId, community.id), eq(recordTable.memberId, member.id)))
    .orderBy(desc(recordTable.occurredAt))
    .limit(200);
  return c.html(<ActivityPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} entries={rows.map((r) => ({ kind: r.kind, text: r.text, occurredAt: r.occurredAt }))} />);
});

// ================= Positions & Supporting Nominees (Contribution Code 8 / Phase 2) =================

app.post("/positions/:delegateRecognitionId/nominate", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const delegateRecognitionId = Number(c.req.param("delegateRecognitionId"));
  const body = await c.req.parseBody();
  const nomineeMemberId = Number(body.nomineeMemberId);
  const title = String(body.title ?? "").trim() || "Supporting Nominee";

  const [dr] = await db.select().from(delegateRecognitions).where(and(eq(delegateRecognitions.id, delegateRecognitionId), eq(delegateRecognitions.communityId, community.id)));
  if (dr && dr.memberId === member.id && dr.revokedAt === null && (await jointPositionOfMember(db, community.id, member.id, dr.sectorId))) {
    return c.text("This Position is held jointly. Nominating needs both co-Delegates — propose it on the team page and the other co-Delegate agrees or declines (Rules of Procedure 6.3).", 409);
  }
  if (dr && dr.memberId === member.id && dr.revokedAt === null && nomineeMemberId) {
    // Same class of gap already fixed for a Position decision's
    // targetMemberId/targetSectorId (mechanics.ts's isValidPositionTarget/
    // isValidPositionSector) — the nominee must actually belong to this
    // community. Checked before the eligibility lookup, same position as
    // the dr.communityId check just above: no point computing standing for
    // a candidate that can't be nominated regardless of what it finds.
    const [candidate] = await db.select({ communityId: members.communityId }).from(members).where(eq(members.id, nomineeMemberId));
    if (isValidPositionMember(candidate, community.id)) {
      const standing = await sectorStandingCredits(db, community.id, dr.sectorId, ts, community.params.standingWindowDays);
      if (nomineeEligible(standing.get(nomineeMemberId) ?? 0)) {
        await db.insert(supportingNominees).values({ communityId: community.id, delegateRecognitionId, nomineeMemberId, title, nominatedAt: ts });
        const [nominee] = await db.select().from(members).where(eq(members.id, nomineeMemberId));
        await touchMember(db, member.id, ts);
        await writeRecord(db, community.id, "record", `${member.name} nominated ${nominee?.name ?? "a member"} as ${title}.`, nomineeMemberId, ts);
      }
    }
  }
  return c.redirect(c.req.header("Referer") ?? "/directory");
});


// Rules of Procedure 6 — co-Delegate joint authority.
app.post("/sectors/:id/joint", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const sectorId = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const result = await proposeJointAction(db, community, member.id, sectorId, String(body.kind ?? ""), body as Record<string, unknown>, clockNow(community));
  if (!result.ok) {
    const message: Record<string, string> = {
      "not-a-co-delegate": "Only a co-Delegate of a jointly held Position can do this.",
      "invalid-nominee": "That Member cannot be nominated.",
      "nominee-not-eligible": "That Member does not yet have the earned Contribution Record in this sector that a nominee needs (Contribution Code 8.3).",
      "already-nominated": "That Member is already a Supporting Nominee of this Position.",
      "no-such-nomination": "That nomination is not one of this Position's.",
      "invalid-share": "Choose a whole-number share from 1 to 99.",
      "invalid-kind": "Unknown joint matter.",
      "already-open": "That request is already open.",
    };
    return c.text(message[result.reason] ?? "That could not be done.", result.reason === "not-a-co-delegate" ? 403 : 400);
  }
  return c.redirect(`/sectors/${sectorId}/team`);
});

app.post("/joint/:id/respond", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const body = await c.req.parseBody();
  const [action] = await db.select({ sectorId: jointActions.sectorId }).from(jointActions).where(eq(jointActions.id, Number(c.req.param("id"))));
  const result = await respondJointAction(db, community, member.id, Number(c.req.param("id")), String(body.decision ?? "") === "accept", clockNow(community));
  if (!result.ok) return c.text(result.reason === "not-found" ? "Not found." : result.reason === "not-pending" ? "That request has already been answered." : "Only the other co-Delegate can answer it.", result.reason === "not-found" ? 404 : 403);
  return c.redirect(`/sectors/${action?.sectorId ?? 0}/team`);
});

app.post("/joint/:id/withdraw", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const [action] = await db.select({ sectorId: jointActions.sectorId }).from(jointActions).where(eq(jointActions.id, Number(c.req.param("id"))));
  const result = await withdrawJointAction(db, community, member.id, Number(c.req.param("id")), clockNow(community));
  if (!result.ok) return c.text("That request is not yours to withdraw, or has already been answered.", 403);
  return c.redirect(`/sectors/${action?.sectorId ?? 0}/team`);
});

app.post("/joint/:id/refer", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const [action] = await db.select({ sectorId: jointActions.sectorId }).from(jointActions).where(eq(jointActions.id, Number(c.req.param("id"))));
  const result = await referJointAction(db, community, member.id, Number(c.req.param("id")), clockNow(community));
  if (!result.ok) return c.text(result.reason === "not-deadlocked" ? "Only a declined request can be referred." : result.reason === "not-referable" ? "Only nominating or ending a nomination goes to a community vote (Rules of Procedure 6.5)." : "Only a co-Delegate of this Position can refer it.", 403);
  return c.redirect(`/proposals/${result.proposalId}`);
});

app.post("/nominations/:id/revoke", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));

  const [nominee] = await db.select().from(supportingNominees).where(and(eq(supportingNominees.id, id), eq(supportingNominees.communityId, community.id)));
  if (nominee && nominee.revokedAt === null) {
    const [dr] = await db.select().from(delegateRecognitions).where(eq(delegateRecognitions.id, nominee.delegateRecognitionId));
    if (dr && dr.memberId === member.id && (await jointPositionOfMember(db, community.id, member.id, dr.sectorId))) {
      return c.text("This Position is held jointly. Ending a nomination needs both co-Delegates — propose it on the team page (Rules of Procedure 6.3).", 409);
    }
    if (dr && dr.memberId === member.id) {
      await db.update(supportingNominees).set({ revokedAt: ts }).where(eq(supportingNominees.id, id));
      await writeRecord(db, community.id, "record", `${member.name} ended a nomination (${nominee.title}).`, nominee.nomineeMemberId, ts);
    }
  }
  return c.redirect(c.req.header("Referer") ?? "/directory");
});

app.post("/nominations/:id/challenge", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const kind = String(body.kind ?? "") === "conduct" ? "conduct" : "fit";

  const [nominee] = await db.select().from(supportingNominees).where(and(eq(supportingNominees.id, id), eq(supportingNominees.communityId, community.id)));
  if (nominee && nominee.revokedAt === null) {
    // Fetched once up front (not just inside the "conduct" branch below) —
    // both branches need it: it identifies the Delegate who made the
    // original nomination (Contribution Code 8), who's notified after
    // either branch below.
    const [dr] = await db.select().from(delegateRecognitions).where(eq(delegateRecognitions.id, nominee.delegateRecognitionId));
    if (kind === "conduct") {
      // Parties to the dispute (Dispute Procedure Code 2.2): the complainant,
      // the challenged nominee, and the Delegate who made the nomination.
      const parties: DrawParty[] = [
        { memberId: member.id, role: "complainant" },
        { memberId: nominee.nomineeMemberId, role: "accused" },
      ];
      if (dr?.memberId && dr.memberId !== member.id && dr.memberId !== nominee.nomineeMemberId) parties.push({ memberId: dr.memberId, role: "subject" });
      await touchMember(db, member.id, ts);
      await db.insert(nominationChallenges).values({ communityId: community.id, supportingNomineeId: id, filedBy: member.id, kind: "conduct", disputePanelId: null, filedAt: ts });
      await writeRecord(
        db,
        community.id,
        "record",
        `${member.name} filed a conduct challenge against a nomination (${nominee.title}) — a Dispute Panel will be drawn (Dispute Procedure Code 3.1).`,
        nominee.nomineeMemberId,
        ts
      );
      // Queued, then drawn at once if the pool allows; otherwise it waits in the
      // queue and tick() draws it as soon as it can (Dispute Procedure Code 2.1).
      await requestPanelDraw(db, community.id, { subjectKind: "supporting-nominee-conduct", subjectId: id, seq: 0, seats: DISPUTE_PANEL_SIZE, parties }, ts);
      await processDrawRequestsPromptly(db, community, ts);
    } else {
      const cfg = CLASS_CONFIG.position;
      const voteOpensAt = ts + cfg.delibDays * DAY_MS;
      const voteFreezeAt = voteOpensAt - community.params.voteFreezeHours * 60 * 60 * 1000;
      const votingClosesAt = voteOpensAt + cfg.voteDays * DAY_MS;
      const [proposal] = await db
        .insert(proposals)
        .values({
          communityId: community.id,
          by: member.id,
          title: `Challenge nomination: ${nominee.title}`,
          why: `Filed by ${member.name}: this specific nomination is a poor fit.`,
          cls: "position",
          submittedAt: ts,
          voteFreezeAt,
          voteOpensAt,
          votingClosesAt,
          stage: "deliberation",
          critical: 1,
          positionAction: "challenge_nomination",
          targetSupportingNomineeId: id,
        })
        .returning();
      await db.insert(nominationChallenges).values({ communityId: community.id, supportingNomineeId: id, filedBy: member.id, kind: "fit", proposalId: proposal.id, filedAt: ts });
      await touchMember(db, member.id, ts);
      await writeRecord(db, community.id, "proposal", `${member.name} filed a "poor fit" challenge against a nomination (${nominee.title}) — a Position decision.`, nominee.nomineeMemberId, ts);
    }
    if (dr) {
      await notify(
        db,
        c.env,
        community.id,
        dr.memberId,
        "nomination_challenge_filed",
        `${member.name} filed a ${kind === "conduct" ? "conduct" : "poor fit"} challenge against your nomination (${nominee.title}).`,
        `/sectors/${dr.sectorId}/team`,
        ts
      );
    }
  }
  return c.redirect(c.req.header("Referer") ?? "/directory");
});

// ================= Dispute pool + response window (Dispute Procedure Code 2.1, 4.2) =================

// 2.1 — "Any Active Member may volunteer for the panel pool." Volunteering is
// an act, not a default: before this route existed the draw treated every
// Active Member as already in the pool.
app.post("/profile/dispute-pool", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const joining = String(body.join) === "yes";
  await db
    .update(members)
    .set({ disputePoolOptInAt: joining ? ts : null })
    .where(eq(members.id, member.id));
  await touchMember(db, member.id, ts);
  await writeRecord(
    db,
    community.id,
    "record",
    joining
      ? `${member.name} volunteered for the Dispute Panel pool (Dispute Procedure Code 2.1).`
      : `${member.name} withdrew from the Dispute Panel pool (Dispute Procedure Code 2.1).`,
    member.id,
    ts
  );
  return c.redirect(c.req.header("Referer") ?? "/profile");
});

// ================= Disputes (Article VI; Dispute Procedure Code) =================

async function describeDisputeSubject(db: Db, panel: { subjectKind: string; subjectId: number }): Promise<{ title: string; summary: string }> {
  if (panel.subjectKind === "supporting-nominee-conduct") {
    const [n] = await db.select().from(supportingNominees).where(eq(supportingNominees.id, panel.subjectId));
    return {
      title: `Conduct challenge to a nomination${n ? `: ${n.title}` : ""}`,
      summary: "A Member has challenged a Supporting Nominee's conduct. If the panel upholds the challenge the nomination ends (Contribution Code 8).",
    };
  }
  if (panel.subjectKind === "conduct-report") {
    const [r] = await db.select().from(conductReports).where(eq(conductReports.id, panel.subjectId));
    if (r) {
      const nm = await db.select({ id: members.id, name: members.name }).from(members).where(inArray(members.id, [r.reportedBy, r.accusedId]));
      const accusedName = nm.find((x) => x.id === r.accusedId)?.name ?? "a Member";
      return {
        title: `Code of Conduct ${r.provision} (${provisionName(r.provision)}): report about ${accusedName}`,
        summary: "A Member has reported a violation of the Code of Conduct. The accused answers on the record; eleven volunteers drawn by verifiable public randomness decide.",
      };
    }
  }
  return { title: "Dispute", summary: "" };
}

app.get("/disputes", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member") ?? null;
  const panels = await db.select().from(disputePanels).where(eq(disputePanels.communityId, community.id)).orderBy(desc(disputePanels.filedAt));
  const ts = clockNow(community);
  const seatRows = await db.select().from(disputePanelMembers).where(isNull(disputePanelMembers.declinedAt));
  const partyRows = await db.select().from(disputePanelParties);
  const items: DisputeListItem[] = [];
  for (const pn of panels) {
    const d = await describeDisputeSubject(db, pn);
    const seated = seatRows.filter((r) => r.panelId === pn.id).length;
    const responseOpen = pn.decision === null && ts < pn.respondBy && pn.respondedAt === null && pn.responseWaivedAt === null;
    items.push({
      panelId: pn.id,
      title: d.title,
      filedAt: pn.filedAt,
      status: pn.decision !== null ? "decided" : responseOpen ? "awaiting-response" : "deliberating",
      decision: pn.decision,
      seated,
      seats: DISPUTE_PANEL_SIZE,
    });
  }
  const mineIds = new Set(member ? seatRows.filter((r) => r.memberId === member.id).map((r) => r.panelId) : []);
  const involvedIds = new Set(member ? partyRows.filter((r) => r.memberId === member.id).map((r) => r.panelId) : []);
  const queuedRows = await db
    .select()
    .from(disputeDrawRequests)
    .where(and(eq(disputeDrawRequests.communityId, community.id), isNull(disputeDrawRequests.completedAt), isNull(disputeDrawRequests.panelId)));
  const queued: QueuedDraw[] = [];
  for (const q of queuedRows) {
    const d = await describeDisputeSubject(db, q);
    queued.push({ title: d.title, requestedAt: q.requestedAt, reason: q.deferralReason });
  }
  const pool = await eligiblePanelPool(db, community.id, [], DISPUTE_PANEL_SIZE, ts, community.params.activeWindowDays, null, [], true);
  const me = member ? (await db.select({ at: members.disputePoolOptInAt }).from(members).where(eq(members.id, member.id)))[0] : undefined;

  const moderatorList = await listModerators(db, community, ts);
  const iAmModerator = member ? await isModerator(db, community, member.id, ts) : false;
  const iAmFounder = member !== null && community.founderId === member.id;
  const phaseOne = await phaseOneActive(db, community, ts);
  const measureRows = await db.select().from(interimMeasures).where(eq(interimMeasures.communityId, community.id)).orderBy(desc(interimMeasures.takenAt)).limit(50);
  const nameRows = await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.communityId, community.id));
  const names = new Map(nameRows.map((r) => [r.id, r.name]));
  const approvalRows = measureRows.length ? await db.select().from(interimMeasureApprovals).where(inArray(interimMeasureApprovals.measureId, measureRows.map((m) => m.id))) : [];
  const reportRows = measureRows.length ? await db.select({ id: conductReports.id, panelId: conductReports.panelId }).from(conductReports).where(inArray(conductReports.id, measureRows.map((m) => m.reportId))) : [];
  const measures: MeasureView[] = [];
  for (const m of measureRows) {
    const panelId = reportRows.find((r) => r.id === m.reportId)?.panelId ?? null;
    const seated = panelId ? await seatedPanelistIds(db, panelId) : [];
    const approvals = approvalRows.filter((a) => a.measureId === m.id && seated.includes(a.memberId));
    const inForce = m.endedAt === null && (m.extendedAt !== null || ts < m.lapsesAt);
    measures.push({
      id: m.id,
      moderatorName: names.get(m.moderatorId) ?? "a moderator",
      targetName: names.get(m.targetMemberId) ?? "a Member",
      kind: m.kind as MeasureView["kind"],
      contentKind: m.contentKind,
      reason: m.reason,
      takenAt: m.takenAt,
      lapsesAt: m.lapsesAt,
      status: m.endedAt !== null || !inForce ? "ended" : m.extendedAt !== null ? "kept by the panel" : "in force",
      endedAt: m.endedAt ?? (inForce ? null : m.lapsesAt),
      reportPanelId: panelId,
      approvals: approvals.length,
      seats: DISPUTE_PANEL_SIZE,
      canApprove: inForce && m.extendedAt === null && member !== null && seated.includes(member.id) && !approvals.some((a) => a.memberId === member.id),
    });
  }
  const appointable = iAmFounder && phaseOne
    ? nameRows.filter((r) => !moderatorList.some((x) => x.memberId === r.id))
    : [];
  return c.html(
    <DisputesPage
      moderators={moderatorList}
      measures={measures}
      isModerator={iAmModerator}
      isFounder={iAmFounder}
      phaseOneActive={phaseOne}
      appointable={appointable}
      member={member}
      adminDebug={adminDebug(c)}
      communityName={communityName(c)}
      cases={items}
      mine={items.filter((i) => mineIds.has(i.panelId))}
      involved={items.filter((i) => involvedIds.has(i.panelId))}
      queued={queued}
      poolSize={pool.poolSize}
      poolMinimum={DISPUTE_PANEL_POOL_MINIMUM}
      isVolunteer={me?.at != null}
    />
  );
});

// Code of Conduct 4.1 — any Member may report a violation. Registered before
// /disputes/:id so "report" is never read as a case number.
app.get("/disputes/report", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const accusedId = Number(c.req.query("accused") ?? 0);
  const allMembers = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  const accused = accusedId && accusedId !== member.id ? allMembers.find((m) => m.id === accusedId) ?? null : null;
  const entries = accused
    ? await db
        .select({ id: contributions.id, description: contributions.description })
        .from(contributions)
        .where(and(eq(contributions.memberId, accused.id), isNotNull(contributions.verifiedAt)))
        .orderBy(desc(contributions.loggedAt))
        .limit(50)
    : [];
  return c.html(
    <FileReportPage
      member={member}
      adminDebug={adminDebug(c)}
      communityName={communityName(c)}
      members={allMembers.filter((m) => m.id !== member.id)}
      accused={accused}
      contributions={entries}
    />
  );
});

app.post("/disputes/report", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody({ all: true });
  const accusedId = Number(body.accusedId);
  const rawIds = body.contribution === undefined ? [] : Array.isArray(body.contribution) ? body.contribution : [body.contribution];
  const result = await fileConductReport(
    db,
    community,
    member.id,
    {
      accusedId,
      provision: String(body.provision ?? ""),
      statement: String(body.statement ?? ""),
      evidenceLink: String(body.evidenceLink ?? ""),
      contributionIds: rawIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0),
    },
    ts
  );
  if (!result.ok) {
    const message: Record<typeof result.reason, string> = {
      "invalid-provision": "Choose which provision of the Code of Conduct the report is about.",
      "empty-statement": "A report has to say what happened and what supports it.",
      "statement-too-long": `A report is limited to ${CONDUCT_STATEMENT_MAX_CHARS} characters; link to longer evidence instead.`,
      "self-report": "You cannot report yourself.",
      "accused-not-member": "That Member could not be found.",
      "already-open": "You already have an undecided report about this Member. The accused answers a report once, not repeatedly.",
      "bad-evidence-link": "The evidence link must start with http:// or https://.",
      "contributions-not-theirs": "One of the contribution entries named is not theirs.",
    };
    const allMembers = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
    const accused = allMembers.find((m) => m.id === accusedId && m.id !== member.id) ?? null;
    return c.html(
      <FileReportPage
        member={member}
        adminDebug={adminDebug(c)}
        communityName={communityName(c)}
        members={allMembers.filter((m) => m.id !== member.id)}
        accused={accused}
        contributions={[]}
        error={message[result.reason]}
      />,
      400
    );
  }
  await touchMember(db, member.id, ts);
  await processDrawRequestsPromptly(db, community, ts);
  const [report] = await db.select().from(conductReports).where(eq(conductReports.id, result.reportId));
  return c.redirect(report?.panelId ? `/disputes/${report.panelId}` : "/disputes");
});


// Code of Conduct 4.3 / Charter 9.2 — moderators and 72-hour interim measures.
// Registered before /disputes/:id so "interim" is never read as a case number.
app.post("/moderators/appoint", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const body = await c.req.parseBody();
  const result = await appointModerator(db, community, member.id, Number(body.memberId), clockNow(community));
  if (!result.ok) {
    const message = {
      "not-founder": "Only the founder can appoint interim moderators.",
      "phase-over": "The founder's power to appoint moderators lapsed with Phase I.",
      "not-a-member": "That Member could not be found.",
      "already-moderator": "That Member is already a moderator.",
      "not-found": "Not found.",
    }[result.reason];
    return c.text(message, result.reason === "not-founder" ? 403 : 400);
  }
  return c.redirect("/disputes");
});

// Charter 1.1 — close an account whose holder is under the minimum age.
app.post("/members/close-underage", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const body = await c.req.parseBody();
  const result = await closeUnderageAccount(db, community, member.id, String(body.name ?? ""), clockNow(community));
  if (!result.ok) {
    const message = {
      "not-authorised": "Only the founder can close an account under the minimum age.",
      "not-found": "No Member with that username was found.",
      "already-left": "That account is already closed.",
    }[result.reason];
    return c.text(message, result.reason === "not-authorised" ? 403 : 400);
  }
  return c.redirect("/disputes");
});

app.post("/moderators/:id/remove", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const result = await removeModerator(db, community, member.id, Number(c.req.param("id")), clockNow(community));
  if (!result.ok) return c.text(result.reason === "not-founder" ? "Only the founder can remove an interim moderator." : "Not found.", result.reason === "not-founder" ? 403 : 404);
  return c.redirect("/disputes");
});

async function interimContent(db: ReturnType<typeof makeDb>, kind: string, id: number): Promise<{ authorId: number; authorName: string; excerpt: string } | null> {
  if (!isInterimContentKind(kind) || !Number.isInteger(id) || id <= 0) return null;
  const rows =
    kind === "proposal-comment"
      ? await db.select({ memberId: proposalComments.memberId, body: proposalComments.body }).from(proposalComments).where(eq(proposalComments.id, id))
      : kind === "sector-post"
        ? await db.select({ memberId: sectorPosts.memberId, body: sectorPosts.body }).from(sectorPosts).where(eq(sectorPosts.id, id))
        : await db.select({ memberId: sectorPostComments.memberId, body: sectorPostComments.body }).from(sectorPostComments).where(eq(sectorPostComments.id, id));
  const row = rows[0];
  if (!row || row.memberId === null) return null;
  const [author] = await db.select({ name: members.name }).from(members).where(eq(members.id, row.memberId));
  return { authorId: row.memberId, authorName: author?.name ?? "a Member", excerpt: row.body.slice(0, 400) };
}

app.get("/disputes/interim/new", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const kind = c.req.query("kind") === "remove-content" ? "remove-content" : "freeze-account";
  const allMembers = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  let content;
  if (kind === "remove-content") {
    const contentKind = c.req.query("contentKind") ?? "";
    const contentId = Number(c.req.query("contentId") ?? 0);
    const found = await interimContent(db, contentKind, contentId);
    if (!found) return c.notFound();
    content = { contentKind, contentId, ...found };
  }
  const authority = kind === "freeze-account" ? ((await isModerator(db, community, member.id, ts)) ? "moderator" : null) : await interimAuthority(db, community, member.id, content?.contentKind, content?.contentId, ts);
  if (!authority) return c.text("Only a moderator can take an interim measure — or, on a post in their own Position's sector, either co-Delegate of a jointly held Position (Rules of Procedure 6.4).", 403);
  return c.html(
    <InterimMeasurePage
      member={member}
      adminDebug={adminDebug(c)}
      communityName={communityName(c)}
      kind={kind}
      members={allMembers.filter((m) => m.id !== member.id)}
      content={content}
      coDelegate={authority === "co-delegate"}
    />
  );
});

app.post("/disputes/interim", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const kind = String(body.kind ?? "");
  const result = await takeInterimMeasure(
    db,
    community,
    member.id,
    {
      targetMemberId: Number(body.targetMemberId),
      kind,
      contentKind: body.contentKind ? String(body.contentKind) : null,
      contentId: body.contentId ? Number(body.contentId) : null,
      provision: String(body.provision ?? ""),
      reason: String(body.reason ?? ""),
      otherUnreachable: String(body.otherUnreachable ?? "") === "on",
    },
    ts
  );
  if (!result.ok) {
    const message: Record<typeof result.reason, string> = {
      "must-state-unreachable": "A co-Delegate may act alone only when the other co-Delegate is unreachable (Rules of Procedure 6.4). Tick the box to say so.",
      "not-moderator": "Only a moderator can take an interim measure.",
      "invalid-target": "That Member could not be found, or is you.",
      "empty-reason": "Say what the active harm is and why it cannot wait for a panel.",
      "invalid-kind": "Unknown measure.",
      "content-not-theirs": "That content does not exist or is not by that Member.",
      "already-frozen": "That account is already frozen.",
      "invalid-provision": "Choose which provision of the Code of Conduct the conduct violates.",
      "report-failed": "The report that gives the measure a reviewing panel could not be filed.",
    };
    return c.text(message[result.reason], result.reason === "not-moderator" ? 403 : 400);
  }
  await processDrawRequestsPromptly(db, community, ts);
  return c.redirect("/disputes");
});

app.post("/disputes/interim/:id/approve", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const result = await approveInterimMeasure(db, community, member.id, Number(c.req.param("id")), clockNow(community));
  if (!result.ok) {
    return c.text(
      result.reason === "not-reviewing-panelist" ? "Only a seated member of the reviewing panel can keep an interim measure in force." : result.reason === "no-longer-in-force" ? "That measure has already lapsed or ended." : "Not found.",
      result.reason === "not-found" ? 404 : 403
    );
  }
  return c.redirect("/disputes");
});

app.get("/disputes/:id", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member") ?? null;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const [panel] = await db.select().from(disputePanels).where(and(eq(disputePanels.id, id), eq(disputePanels.communityId, community.id)));
  if (!panel) return c.notFound();
  const subject = await describeDisputeSubject(db, panel);
  const partyRows = await db.select().from(disputePanelParties).where(eq(disputePanelParties.panelId, id));
  const seatRows = await db.select().from(disputePanelMembers).where(eq(disputePanelMembers.panelId, id));
  const voteRows = await db.select().from(disputePanelVotes).where(eq(disputePanelVotes.panelId, id));
  const drawRows = await db.select().from(disputePanelDraws).where(eq(disputePanelDraws.panelId, id)).orderBy(disputePanelDraws.id);

  const idsNeeded = new Set<number>([...partyRows.map((r) => r.memberId), ...seatRows.map((r) => r.memberId)]);
  const draws: CaseDraw[] = [];
  for (const d of drawRows) {
    const poolIds = JSON.parse(d.poolJson) as number[];
    const drawnIds = JSON.parse(d.drawnJson) as number[];
    poolIds.forEach((x) => idsNeeded.add(x));
    drawnIds.forEach((x) => idsNeeded.add(x));
    draws.push({
      kind: d.kind,
      method: d.method,
      beaconChain: d.beaconChain,
      beaconRound: d.beaconRound,
      beaconRandomness: d.beaconRandomness,
      caseKey: d.caseKey,
      seed: d.seed,
      poolIds,
      drawnIds,
      drawnAt: d.drawnAt,
      verified: await verifyDraw({
        method: d.method,
        beaconChain: d.beaconChain,
        beaconRound: d.beaconRound,
        beaconRandomness: d.beaconRandomness,
        caseKey: d.caseKey,
        poolIds,
        size: drawnIds.length,
        seed: d.seed,
        drawnIds,
      }),
    });
  }

  // Conduct reports carry their own details and ladder.
  let conduct: ConductView | undefined;
  if (panel.subjectKind === "conduct-report") {
    const [r] = await db.select().from(conductReports).where(eq(conductReports.id, panel.subjectId));
    if (r) {
      idsNeeded.add(r.reportedBy);
      idsNeeded.add(r.accusedId);
      const entryIds: number[] = r.contributionIdsJson ? JSON.parse(r.contributionIdsJson) : [];
      const entries = entryIds.length ? await db.select({ id: contributions.id, description: contributions.description }).from(contributions).where(inArray(contributions.id, entryIds)) : [];
      const prior = await priorSanctionSteps(db, community.id, r.accusedId);
      conduct = {
        provision: r.provision,
        provisionName: provisionName(r.provision),
        reporterName: "",
        accusedName: "",
        statement: r.statement,
        evidenceLink: r.evidenceLink,
        contributions: entries,
        allowedSteps: allowedSteps(r.provision, prior),
        sanctionStep: panel.sanctionStep,
        badFaith: panel.badFaithFinding === 1,
      };
      const nm = await db.select({ id: members.id, name: members.name }).from(members).where(inArray(members.id, [r.reportedBy, r.accusedId]));
      conduct.reporterName = nm.find((x) => x.id === r.reportedBy)?.name ?? "a Member";
      conduct.accusedName = nm.find((x) => x.id === r.accusedId)?.name ?? "a Member";
    }
  }

  const nameRows = idsNeeded.size ? await db.select({ id: members.id, name: members.name }).from(members).where(inArray(members.id, [...idsNeeded])) : [];
  const nameById: Record<number, string> = Object.fromEntries(nameRows.map((r) => [r.id, r.name]));

  const decided = panel.decision !== null;
  const stepLabel = (st: number | null, upheld: number) =>
    st === null ? (upheld === 1 ? "uphold" : "dismiss") : st === 0 ? "dismiss" : SANCTION_STEPS.find((x) => x.step === st)?.label.toLowerCase() ?? `step ${st}`;
  const panelists: CasePanelist[] = seatRows.map((r) => {
    const v = voteRows.find((x) => x.memberId === r.memberId);
    return {
      id: r.memberId,
      name: nameById[r.memberId] ?? "member",
      declined: r.declinedAt !== null,
      drawnAt: r.drawnAt,
      vote: decided && v ? stepLabel(v.step, v.upheld) : decided ? "did not vote" : null,
      reasoning: decided && v ? v.reasoning : null,
    };
  });
  const mySeat = member ? seatRows.find((r) => r.memberId === member.id && r.declinedAt === null) : undefined;
  const responseWindowOpen = !decided && ts < panel.respondBy && panel.respondedAt === null && panel.responseWaivedAt === null;
  const [outstanding] = await db
    .select({ id: disputeDrawRequests.id })
    .from(disputeDrawRequests)
    .where(and(eq(disputeDrawRequests.panelId, id), isNull(disputeDrawRequests.completedAt)))
    .limit(1);
  const [openOverturn] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.overturnsPanelId, id), sql`${proposals.stage} != 'record'`))
    .limit(1);
  const overturnMessages: Record<string, string> = {
    "empty-reasons": "Say why the decision should be overturned.",
    "already-open": "An overturn proposal for this decision is already open.",
    "nothing-to-overturn": "Only an upheld decision can be overturned.",
    "already-overturned": "This decision has already been overturned.",
    "no-such-decision": "That decision could not be found.",
  };
  const myVote = member ? voteRows.find((x) => x.memberId === member.id) : undefined;
  const declineBy = mySeat ? mySeat.drawnAt + PANEL_DECLINE_WINDOW_HOURS * 60 * 60 * 1000 : null;
  return c.html(
    <DisputeCasePage
      member={member}
      adminDebug={adminDebug(c)}
      communityName={communityName(c)}
      c={{
        panelId: id,
        title: subject.title,
        summary: subject.summary,
        filedAt: panel.filedAt,
        decision: panel.decision,
        decidedAt: panel.decidedAt,
        respondBy: panel.respondBy,
        respondedAt: panel.respondedAt,
        responseWaivedAt: panel.responseWaivedAt,
        decidesBy: panel.decidesBy,
        parties: partyRows.map((r) => ({ memberId: r.memberId, name: nameById[r.memberId] ?? "member", role: r.role })),
        panelists,
        seats: DISPUTE_PANEL_SIZE,
        replacementPending: outstanding !== undefined,
        draws,
        nameById,
        votesCast: voteRows.filter((v) => seatRows.some((s) => s.memberId === v.memberId && s.declinedAt === null)).length,
        conduct,
        overturnedAt: panel.overturnedAt,
        revocation: panel.revocationEffectiveAt !== null ? { effectiveAt: panel.revocationEffectiveAt, completedAt: panel.revocationCompletedAt } : undefined,
        overturnProposalId: openOverturn?.id ?? null,
      }}
      canOverturn={!!member && panel.decision === "upheld" && panel.overturnedAt === null && !openOverturn}
      overturnError={c.req.query("overturn") ? overturnMessages[c.req.query("overturn") as string] : undefined}
      isPanelist={mySeat !== undefined}
      canDecline={mySeat !== undefined && !decided && declineBy !== null && ts <= declineBy}
      declineBy={declineBy}
      isAccused={member ? partyRows.some((r) => r.memberId === member.id && r.role === "accused") : false}
      canVote={mySeat !== undefined && !decided && !responseWindowOpen}
      myVote={myVote ? stepLabel(myVote.step, myVote.upheld) : null}
      responseWindowOpen={responseWindowOpen}
    />
  );
});

// 4.2 — the accused responds on the record, or waives the window. Only the
// accused may do either; a waiver is the clause's one stated exception.
app.post("/disputes/:id/respond", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const waive = String(body.waive) === "yes";
  const text = String(body.response ?? "").trim();

  const [panel] = await db.select().from(disputePanels).where(and(eq(disputePanels.id, id), eq(disputePanels.communityId, community.id)));
  const [accused] = await db
    .select()
    .from(disputePanelParties)
    .where(and(eq(disputePanelParties.panelId, id), eq(disputePanelParties.memberId, member.id), eq(disputePanelParties.role, "accused")));
  if (accused && panel && panel.decision === null) {
    if (waive) {
      await db.update(disputePanels).set({ responseWaivedAt: ts }).where(eq(disputePanels.id, id));
      await writeRecord(db, community.id, "record", `${member.name} waived the Dispute Procedure Code 4.2 response window.`, member.id, ts);
    } else if (text) {
      await db.update(disputePanels).set({ respondedAt: ts }).where(eq(disputePanels.id, id));
      // 4.5 — the response enters the permanent public record, like everything else.
      await writeRecord(db, community.id, "record", `${member.name} responded to a Dispute Panel (Dispute Procedure Code 4.2): ${text}`, member.id, ts);
    }
    await touchMember(db, member.id, ts);
  }
  return c.redirect(`/disputes/${id}`);
});

app.post("/disputes/:id/vote", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();

  const [panel] = await db.select().from(disputePanels).where(and(eq(disputePanels.id, id), eq(disputePanels.communityId, community.id)));
  const [seat] = await db
    .select()
    .from(disputePanelMembers)
    .where(and(eq(disputePanelMembers.panelId, id), eq(disputePanelMembers.memberId, member.id), isNull(disputePanelMembers.declinedAt)));
  const responseWindowOpen = panel !== undefined && ts < panel.respondBy && panel.respondedAt === null && panel.responseWaivedAt === null;
  if (!(seat && panel && panel.decision === null && !responseWindowOpen)) return c.redirect(`/disputes/${id}`);

  if (panel.subjectKind === "conduct-report") {
    const [report] = await db.select().from(conductReports).where(eq(conductReports.id, panel.subjectId));
    const step = Number(body.step);
    const reasoning = String(body.reasoning ?? "").trim().slice(0, 2000);
    if (report && Number.isInteger(step) && reasoning) {
      const prior = await priorSanctionSteps(db, community.id, report.accusedId);
      if (stepAllowed(report.provision, step, prior)) {
        const badFaith = String(body.badFaith ?? "") === "on" ? 1 : 0;
        const values = { upheld: step > 0 ? 1 : 0, step, reasoning, badFaith, votedAt: ts };
        await db
          .insert(disputePanelVotes)
          .values({ panelId: id, memberId: member.id, ...values })
          .onConflictDoUpdate({ target: [disputePanelVotes.panelId, disputePanelVotes.memberId], set: values });
        await touchMember(db, member.id, ts);
      }
    }
    return c.redirect(`/disputes/${id}`);
  }

  const upheld = String(body.upheld) === "yes";
  await db
    .insert(disputePanelVotes)
    .values({ panelId: id, memberId: member.id, upheld: upheld ? 1 : 0, votedAt: ts })
    .onConflictDoUpdate({ target: [disputePanelVotes.panelId, disputePanelVotes.memberId], set: { upheld: upheld ? 1 : 0, votedAt: ts } });
  await touchMember(db, member.id, ts);
  return c.redirect(`/disputes/${id}`);
});

// Dispute Procedure Code 6.1 — any Member may bring a proposal to overturn a
// panel decision. Deliberately NOT subject to the participation-suspension
// guard: an appeal is a due-process right, and a sanctioned Member must still
// be able to start one.
app.post("/disputes/:id/overturn", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const [panel] = await db.select().from(disputePanels).where(and(eq(disputePanels.id, id), eq(disputePanels.communityId, community.id)));
  if (!panel) return c.notFound();
  const subject = await describeDisputeSubject(db, panel);
  const result = await fileOverturnProposal(db, community, member.id, id, String(body.reasons ?? ""), subject.title, ts);
  if (!result.ok) return c.redirect(`/disputes/${id}?overturn=${result.reason}`);
  await touchMember(db, member.id, ts);
  return c.redirect(`/proposals/${result.proposalId}`);
});

// 3.2 — a drawn panelist may decline within 48 hours, no reasons needed.
app.post("/disputes/:id/decline", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const result = await declinePanelSeat(db, community, id, member.id, ts);
  if (result.ok) {
    await touchMember(db, member.id, ts);
    await processDrawRequestsPromptly(db, community, ts);
  }
  return c.redirect(`/disputes/${id}`);
});

// ================= Team / org chart (Phase 3) =================

app.get("/sectors/:id/team", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const sectorId = Number(c.req.param("id"));

  const [sector] = await db.select().from(sectors).where(and(eq(sectors.id, sectorId), eq(sectors.communityId, community.id)));
  if (!sector) return c.notFound();

  const directory = await computeStewardsAndDelegates(db, community, ts);
  const entry = directory.find((d) => d.sectorId === sectorId);
  const nomineeIds = entry?.delegates.flatMap((d) => d.nominees.map((n) => n.id)) ?? [];
  const pendingChallenges = nomineeIds.length ? await db.select().from(nominationChallenges).where(eq(nominationChallenges.communityId, community.id)) : [];
  // Excludes Default-Delegate Mechanism seat placeholders — a seat can never
  // pass Contribution Code 8.3's nominee-eligibility check (no login, no
  // verified contribution), so it has no business in this nominate picker.
  const allMembers = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  const jp = await jointPositionOfMember(db, community.id, member.id, sectorId);
  const jointRows = await listJointActions(db, community.id, sectorId);
  const nameOf = new Map(allMembers.map((m) => [m.id, m.name]));
  const jointViews: JointActionView[] = jointRows.map((a) => ({
    id: a.id,
    kind: a.kind,
    summary: a.summary,
    status: a.status,
    proposedByName: nameOf.get(a.proposedBy) ?? "a co-Delegate",
    proposedAt: a.proposedAt,
    referralProposalId: a.referralProposalId,
    canRespond: jp !== null && a.status === "pending" && a.proposedBy !== member.id,
    canWithdraw: a.status === "pending" && a.proposedBy === member.id,
    canRefer: jp !== null && a.status === "declined" && (a.kind === "nominate" || a.kind === "revoke-nomination"),
  }));

  return c.html(
    <TeamPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      sector={{ id: sector.id, name: sector.name }}
      delegates={entry?.delegates ?? []}
      allMembers={allMembers}
      pendingChallengeNomineeIds={pendingChallenges.filter((pc) => nomineeIds.includes(pc.supportingNomineeId)).map((pc) => pc.supportingNomineeId)}
      myMemberId={member.id}
      jointActions={jointViews}
    />
  );
});

// ================= Profile & People (Phase 4) =================

app.get("/profile", (c) => c.redirect(`/profile/${c.get("member")!.id}`));

app.get("/profile/:id", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const targetId = Number(c.req.param("id"));

  const profile = await buildMemberProfile(db, community, targetId, ts);
  return c.html(
    <ProfilePage
      member={member}
      adminDebug={adminDebug(c)}
      communityName={communityName(c)}
      profile={profile}
      isSelf={targetId === member.id}
      requirePhoneVerification={requirePhoneVerification(c)}
    />
  );
});

app.post("/profile/visibility", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const level = String(body.visibilityLevel ?? "open");
  if (["anonymous", "pseudonymous", "open"].includes(level)) {
    await db.update(members).set({ visibilityLevel: level }).where(eq(members.id, member.id));
    await touchMember(db, member.id, ts);
  }
  return c.redirect(`/profile/${member.id}`);
});

app.get("/people", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const q = c.req.query("q")?.trim() ?? "";
  // Default-Delegate Mechanism seat placeholders (Government Adoption
  // Compact §3) are not people — /delegation's "public seats" group is the
  // only place they're listed.
  const rows = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  const filtered = q ? rows.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())) : rows;
  return c.html(<PeoplePage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} people={filtered} q={q} />);
});

// ================= Sectors hub + discussion wall (Phase 5) =================

app.get("/sectors", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const rows = await db.select().from(sectors).where(and(eq(sectors.communityId, community.id), eq(sectors.active, 1))).orderBy(sectors.name);
  const followedSectorIds = (await db.select().from(memberSectorFollows).where(eq(memberSectorFollows.memberId, member.id))).map((f) => f.sectorId);
  return c.html(<SectorsIndexPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} sectors={rows.map((s) => ({ id: s.id, name: s.name }))} followedSectorIds={followedSectorIds} />);
});

app.get("/sectors/:id", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const sectorId = Number(c.req.param("id"));
  const [sector] = await db.select().from(sectors).where(and(eq(sectors.id, sectorId), eq(sectors.communityId, community.id)));
  if (!sector) return c.notFound();

  const nameById = new Map((await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.communityId, community.id))).map((m) => [m.id, m.name]));

  const propRows = await db.select({ proposalId: proposalSectors.proposalId }).from(proposalSectors).where(eq(proposalSectors.sectorId, sectorId));
  const proposalIds = propRows.map((r) => r.proposalId);
  const openProposals = proposalIds.length
    ? (await db.select().from(proposals).where(eq(proposals.communityId, community.id))).filter((p) => proposalIds.includes(p.id) && p.stage !== "record")
    : [];

  const oppRows = await db.select({ opportunityId: opportunitySectors.opportunityId }).from(opportunitySectors).where(eq(opportunitySectors.sectorId, sectorId));
  const opportunityIds = oppRows.map((r) => r.opportunityId);
  const sectorOpportunities = opportunityIds.length
    ? (await db.select().from(opportunities).where(eq(opportunities.communityId, community.id))).filter((o) => opportunityIds.includes(o.id))
    : [];

  const posts = await db.select().from(sectorPosts).where(eq(sectorPosts.sectorId, sectorId)).orderBy(desc(sectorPosts.postedAt)).limit(30);
  const hiddenIds = await hidingMeasureIds(db, community.id, clockNow(community));
  const followed = await db.select().from(memberSectorFollows).where(and(eq(memberSectorFollows.memberId, member.id), eq(memberSectorFollows.sectorId, sectorId)));

  return c.html(
    <SectorHubPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      sector={{ id: sector.id, name: sector.name }}
      following={followed.length > 0}
      openProposals={openProposals.map((p) => ({ id: p.id, title: p.title, stage: p.stage as "deliberation" | "voting" | "record" }))}
      opportunities={sectorOpportunities.map((o) => ({ id: o.id, title: o.title }))}
      posts={posts.map((p) => ({
        id: p.id,
        title: p.hiddenMeasureId !== null && hiddenIds.has(p.hiddenMeasureId) ? "[Removed by a moderator]" : p.title,
        // A set displayName always wins — covers both an anonymous visitor's
        // chosen name and a real, attributed member's byline override (e.g.
        // "Triarc Research"; memberId still
        // set, isAnonymous still 0, just a role byline instead of the raw
        // username). Falls back to the real name, then "a member".
        authorName: p.displayName ?? (p.isAnonymous ? "a visitor" : nameById.get(p.memberId ?? -1) ?? "a member"),
        postedAt: p.postedAt,
      }))}
    />
  );
});

// Tell Members who follow a sector (and have opted in) that its discussion has new activity.
// Never the author, one notification per Member.
async function notifySectorFollowers(db: ReturnType<typeof makeDb>, env: Env["Bindings"], communityId: number, sectorId: number, exceptMemberId: number | null, text: string, link: string, ts: number) {
  const rows = await db.select({ memberId: memberSectorFollows.memberId }).from(memberSectorFollows).where(eq(memberSectorFollows.sectorId, sectorId));
  for (const fid of new Set(rows.map((r) => r.memberId))) {
    if (fid === exceptMemberId) continue;
    await notify(db, env, communityId, fid, "sector_discussion_activity", text, link, ts);
  }
}

app.post("/sectors/:id/posts", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const sectorId = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const title = String(body.title ?? "").trim() || "Untitled";
  const text = String(body.body ?? "").trim();
  const wantsAnonymous = String(body.anonymous ?? "") === "on";
  const displayNameRaw = String(body.displayName ?? "").trim();

  if (text) {
    if (wantsAnonymous) {
      const label = displayNameRaw.slice(0, 40) || "a visitor";
      const [row] = await db
        .insert(sectorPosts)
        .values({ communityId: community.id, sectorId, memberId: null, displayName: label, isAnonymous: 1, title, body: text, postedAt: ts })
        .returning();
      await writeRecord(db, community.id, "record", `${label} (anonymous) started a discussion in a sector.`, null, ts);
      await notifySectorFollowers(db, c.env, community.id, sectorId, null, `${label} started a discussion in a sector you follow: "${title}".`, `/sectors/${sectorId}/posts/${row.id}`, ts);
      return c.redirect(`/sectors/${sectorId}/posts/${row.id}`);
    }
    const [row] = await db
      .insert(sectorPosts)
      .values({ communityId: community.id, sectorId, memberId: member.id, displayName: null, isAnonymous: 0, title, body: text, postedAt: ts })
      .returning();
    await touchMember(db, member.id, ts);
    await writeRecord(db, community.id, "record", `${member.name} started a discussion in a sector: "${title}".`, member.id, ts);
    await notifySectorFollowers(db, c.env, community.id, sectorId, member.id, `${member.name} started a discussion in a sector you follow: "${title}".`, `/sectors/${sectorId}/posts/${row.id}`, ts);
    return c.redirect(`/sectors/${sectorId}/posts/${row.id}`);
  }
  return c.redirect(`/sectors/${sectorId}`);
});

app.get("/sectors/:id/posts/:postId", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const sectorId = Number(c.req.param("id"));
  const postId = Number(c.req.param("postId"));
  const [post] = await db.select().from(sectorPosts).where(and(eq(sectorPosts.id, postId), eq(sectorPosts.sectorId, sectorId)));
  if (!post) return c.notFound();
  const nameById = new Map((await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.communityId, community.id))).map((m) => [m.id, m.name]));
  const comments = await db.select().from(sectorPostComments).where(eq(sectorPostComments.postId, postId)).orderBy(sectorPostComments.postedAt);
  const ts = clockNow(community);
  const hiddenIds = await hidingMeasureIds(db, community.id, ts);
  const viewerIsModerator = (await isModerator(db, community, member.id, ts)) || (await jointPositionOfMember(db, community.id, member.id, sectorId)) !== null; // 6.4: a co-Delegate, in their own sector
  const postHidden = post.hiddenMeasureId !== null && hiddenIds.has(post.hiddenMeasureId);

  return c.html(
    <SectorPostPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      sectorId={sectorId}
      post={{
        id: post.id,
        title: postHidden ? "[Removed by a moderator]" : post.title,
        body: postHidden ? REMOVED_NOTICE : post.body,
        modHref: viewerIsModerator && !postHidden && post.memberId !== null && post.memberId !== member.id ? modRemoveHref("sector-post", post.id) : undefined,
        // Same displayName-wins rule as the sector hub listing above.
        authorName: post.displayName ?? (post.isAnonymous ? "a visitor" : nameById.get(post.memberId ?? -1) ?? "a member"),
        postedAt: post.postedAt,
      }}
      comments={comments.map((cm) => ({
        id: cm.id,
        body: cm.hiddenMeasureId !== null && hiddenIds.has(cm.hiddenMeasureId) ? REMOVED_NOTICE : cm.body,
        modHref: viewerIsModerator && !(cm.hiddenMeasureId !== null && hiddenIds.has(cm.hiddenMeasureId)) && cm.memberId !== null && cm.memberId !== member.id ? modRemoveHref("sector-comment", cm.id) : undefined,
        authorName: cm.isAnonymous ? cm.displayName ?? "a visitor" : nameById.get(cm.memberId ?? -1) ?? "a member",
        postedAt: cm.postedAt,
      }))}
    />
  );
});

app.post("/sectors/:id/posts/:postId/comments", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const postId = Number(c.req.param("postId"));
  const sectorId = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const text = String(body.body ?? "").trim();
  if (text) {
    await db.insert(sectorPostComments).values({ postId, memberId: member.id, displayName: null, isAnonymous: 0, body: text, postedAt: ts });
    await touchMember(db, member.id, ts);
    await writeRecord(db, community.id, "record", `${member.name} commented on a sector discussion.`, member.id, ts);
    await notifySectorFollowers(db, c.env, community.id, sectorId, member.id, `${member.name} replied to a discussion in a sector you follow.`, `/sectors/${sectorId}/posts/${postId}`, ts);
  }
  return c.redirect(`/sectors/${sectorId}/posts/${postId}`);
});

// ================= Business Pages (Government Adoption Compact 5.1 / Phase 7) =================

app.get("/businesses", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const rows = await db.select().from(businessPages).where(eq(businessPages.communityId, community.id)).orderBy(desc(businessPages.createdAt));
  const followedIds = (await db.select().from(businessPageFollows).where(eq(businessPageFollows.memberId, member.id))).map((f) => f.pageId);
  return c.html(<BusinessesPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} pages={rows.map((p) => ({ id: p.id, name: p.name, description: p.description }))} followedPageIds={followedIds} />);
});

app.post("/businesses", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (name) {
    const [row] = await db.insert(businessPages).values({ communityId: community.id, managedByMemberId: member.id, name, description, createdAt: ts }).returning();
    await touchMember(db, member.id, ts);
    await writeRecord(db, community.id, "record", `${member.name} created a business page: "${name}" — non-voting advisory presence (Government Adoption Compact 5.1).`, member.id, ts);
    return c.redirect(`/businesses/${row.id}`);
  }
  return c.redirect("/businesses");
});

app.get("/businesses/:id", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const id = Number(c.req.param("id"));
  const [page] = await db.select().from(businessPages).where(and(eq(businessPages.id, id), eq(businessPages.communityId, community.id)));
  if (!page) return c.notFound();
  const updates = await db.select().from(businessPageUpdates).where(eq(businessPageUpdates.pageId, id)).orderBy(desc(businessPageUpdates.postedAt));
  const [manager] = await db.select({ name: members.name }).from(members).where(eq(members.id, page.managedByMemberId));
  const [following] = await db.select().from(businessPageFollows).where(and(eq(businessPageFollows.memberId, member.id), eq(businessPageFollows.pageId, id)));

  return c.html(
    <BusinessDetailPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      page={{ id: page.id, name: page.name, description: page.description, managerName: manager?.name ?? "a member" }}
      isManager={page.managedByMemberId === member.id}
      following={!!following}
      updates={updates.map((u) => ({ id: u.id, body: u.body, postedAt: u.postedAt }))}
    />
  );
});

app.post("/businesses/:id/updates", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const text = String(body.body ?? "").trim();
  const [page] = await db.select().from(businessPages).where(and(eq(businessPages.id, id), eq(businessPages.communityId, community.id)));
  if (page && page.managedByMemberId === member.id && text) {
    await db.insert(businessPageUpdates).values({ pageId: id, body: text, postedAt: ts });
    await touchMember(db, member.id, ts);
  }
  return c.redirect(`/businesses/${id}`);
});

app.post("/businesses/:id/follow", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const ts = clockNow(community);
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(businessPageFollows).where(and(eq(businessPageFollows.memberId, member.id), eq(businessPageFollows.pageId, id)));
  if (!existing.length) await db.insert(businessPageFollows).values({ memberId: member.id, pageId: id, followedAt: ts });
  return c.redirect(c.req.header("Referer") ?? "/businesses");
});

app.post("/businesses/:id/unfollow", async (c) => {
  const db = c.get("db");
  const member = c.get("member")!;
  const id = Number(c.req.param("id"));
  await db.delete(businessPageFollows).where(and(eq(businessPageFollows.memberId, member.id), eq(businessPageFollows.pageId, id)));
  return c.redirect(c.req.header("Referer") ?? "/businesses");
});

// ================= Search (Phase 8) =================

app.get("/search", async (c) => {
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const section = c.req.query("section") ?? "proposals";
  const qRaw = c.req.query("q") ?? "";
  const q = qRaw.trim().toLowerCase();

  let results: { label: string; href: string }[] = [];
  if (q) {
    if (section === "sectors") {
      const rows = await db.select().from(sectors).where(eq(sectors.communityId, community.id));
      results = rows.filter((s) => s.name.toLowerCase().includes(q)).map((s) => ({ label: s.name, href: `/sectors/${s.id}` }));
    } else if (section === "opportunities") {
      const rows = await db.select().from(opportunities).where(eq(opportunities.communityId, community.id));
      results = rows.filter((o) => o.title.toLowerCase().includes(q) || o.description.toLowerCase().includes(q)).map((o) => ({ label: o.title, href: `/opportunities#o${o.id}` }));
    } else if (section === "people") {
      // Same exclusion as /people — seat placeholders aren't people.
      const rows = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
      results = rows.filter((m) => m.name.toLowerCase().includes(q)).map((m) => ({ label: m.name, href: `/profile/${m.id}` }));
    } else {
      const rows = await db.select().from(proposals).where(eq(proposals.communityId, community.id));
      results = rows.filter((p) => p.title.toLowerCase().includes(q) || p.why.toLowerCase().includes(q)).map((p) => ({ label: p.title, href: `/proposals/${p.id}` }));
    }
  }

  return c.html(<SearchPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} section={section} q={qRaw} results={results} />);
});

// ================= Notification preferences (Phase 9 — storage only, no delivery) =================

app.get("/notifications/preferences", async (c) => {
  const db = c.get("db");
  const member = c.get("member")!;
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.memberId, member.id));
  const enabled = new Set(rows.filter((r) => r.enabled === 1).map((r) => `${r.eventKind}:${r.channel}`));
  return c.html(<NotificationPreferencesPage member={member} adminDebug={adminDebug(c)} communityName={communityName(c)} enabled={enabled} />);
});

app.post("/notifications/preferences", async (c) => {
  const db = c.get("db");
  const member = c.get("member")!;
  const ts = clockNow(c.get("community"));
  const body = await c.req.parseBody({ all: true });
  const rawPref = body.pref;
  const checked = new Set(Array.isArray(rawPref) ? rawPref : rawPref ? [rawPref] : []);

  for (const eventKind of EVENT_KINDS) {
    for (const channel of ["in_app", "email"] as const) {
      const key = `${eventKind}:${channel}`;
      const enabled = checked.has(key) ? 1 : 0;
      await db
        .insert(notificationPreferences)
        .values({ memberId: member.id, eventKind, channel, enabled })
        .onConflictDoUpdate({ target: [notificationPreferences.memberId, notificationPreferences.eventKind, notificationPreferences.channel], set: { enabled } });
    }
  }
  await touchMember(db, member.id, ts);
  return c.redirect("/notifications/preferences");
});

// ================= Notification inbox (Phase 2 — the delivery half) =================

app.get("/notifications/inbox", async (c) => {
  const db = c.get("db");
  const member = c.get("member")!;
  const rows = await db.select().from(inAppNotifications).where(eq(inAppNotifications.memberId, member.id)).orderBy(desc(inAppNotifications.createdAt)).limit(100);
  return c.html(
    <NotificationsInboxPage
      member={member}
      adminDebug={adminDebug(c)} communityName={communityName(c)}
      notifications={rows.map((r) => ({ id: r.id, eventKind: r.eventKind, text: r.text, link: r.link, createdAt: r.createdAt, read: r.readAt !== null }))}
    />
  );
});

app.post("/notifications/inbox/mark-all-read", async (c) => {
  const db = c.get("db");
  const member = c.get("member")!;
  const ts = clockNow(c.get("community"));
  await db.update(inAppNotifications).set({ readAt: ts }).where(and(eq(inAppNotifications.memberId, member.id), isNull(inAppNotifications.readAt)));
  return c.redirect("/notifications/inbox");
});

// ================= Admin (debug clock, member switch, sectors) =================

app.post("/admin/advance", async (c) => {
  if (!adminDebug(c)) return c.text("Not available", 404);
  const db = c.get("db");
  const community = c.get("community");
  const body = await c.req.parseBody();
  const days = Math.max(0, Number(body.days) || 0);
  await db.update(communities).set({ clockOffsetMs: community.clockOffsetMs + days * DAY_MS }).where(eq(communities.id, community.id));
  await tick(db, { ...community, clockOffsetMs: community.clockOffsetMs + days * DAY_MS }, requirePhoneVerification(c));
  await logAdminAction(c, `advanced the dev clock by ${days} day(s)`);
  return c.redirect(c.req.header("Referer") ?? "/");
});

app.get("/admin/switch", async (c) => {
  if (!adminDebug(c)) return c.text("Not available", 404);
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  // Excludes Default-Delegate Mechanism seat placeholder rows
  // (seatKind="default_delegate_seat") — same reasoning as POST /login:
  // these rows are never meant to be logged into, dev convenience tool or
  // not.
  const allMembers = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.communityId, community.id), REAL_MEMBER));
  await logAdminAction(c, "viewed the switch-member picker");

  return c.html(
    <Layout title="Switch member" member={member} adminDebug={true} communityName={communityName(c)}>
      <h2 class="pagetitle">Dev: switch active member</h2>
      <p class="muted small" style="margin-bottom:1rem">
        Instantly become any seeded member, no password needed. Dev-only — gated behind ADMIN_DEBUG, never available
        in a real deployment.
      </p>
      <div class="card">
        {allMembers.map((m) => (
          <div class="row">
            <span>
              {m.name} {m.id === member.id && <span class="pill green">current</span>}
            </span>
            <form method="post" action="/admin/switch-member">
              <input type="hidden" name="memberId" value={m.id} />
              <button class="primary" type="submit">
                Become {m.name}
              </button>
            </form>
          </div>
        ))}
      </div>
    </Layout>
  );
});

app.post("/admin/switch-member", async (c) => {
  // Belt-and-suspenders beyond adminDebug(c) alone — see isLocalRequest's
  // own comment. This route specifically (passwordless login as any
  // Member) is unreachable on any host but localhost/127.0.0.1, regardless
  // of ADMIN_DEBUG.
  if (!adminDebug(c) || !isLocalRequest(c)) return c.text("Not available", 404);
  const db = c.get("db");
  const community = c.get("community");
  const body = await c.req.parseBody();
  const memberId = Number(body.memberId);

  const [target] = await db.select().from(members).where(eq(members.id, memberId));
  // Same exclusion as the GET /admin/switch listing above — belt and
  // suspenders in case this route is ever hit directly with a seat's
  // memberId rather than through the (already-filtered) picker.
  if (target && target.communityId === community.id && target.seatKind === null) {
    const token = newSessionToken();
    const ts = clockNow(community);
    await db.insert(sessions).values({ token, memberId: target.id, expiresAt: ts + SESSION_TTL_MS });
    setSessionCookie(c, token);
    await logAdminAction(c, `switched active session to memberId=${target.id} (${target.name})`);
  } else {
    await logAdminAction(c, `blocked switch attempt: memberId=${memberId} (not found, wrong community, or a Default-Delegate Mechanism seat placeholder)`);
  }
  return c.redirect("/");
});

app.get("/admin/sectors", async (c) => {
  if (!adminDebug(c)) return c.text("Not available", 404);
  const db = c.get("db");
  const community = c.get("community");
  const member = c.get("member")!;
  const rows = await db.select().from(sectors).where(eq(sectors.communityId, community.id)).orderBy(sectors.name);
  await logAdminAction(c, "viewed sector management");

  return c.html(
    <Layout title="Manage sectors" member={member} adminDebug={true} communityName={communityName(c)}>
      <h2 class="pagetitle">Dev: manage sectors</h2>
      <p class="muted small" style="margin-bottom:1rem">
        Contribution Code 2.2/2.3 — sectors are community-maintained and amendable by ordinary proposal. There's no
        proposal-effect-execution engine in this app (nothing ratified auto-mutates state anywhere), so this
        direct-management path stands in for "a ratified ordinary proposal changed the sector list" — the same
        convention as every other dev tool here. Dev-only — gated behind ADMIN_DEBUG, never available in a real
        deployment.
      </p>
      <div class="card">
        {rows.map((s) => (
          <div class="row">
            <span>
              {s.name} {s.active ? <span class="pill green">active</span> : <span class="pill gray">inactive</span>}
            </span>
            <form method="post" action={`/admin/sectors/${s.id}/toggle`}>
              <button type="submit">{s.active ? "Deactivate" : "Activate"}</button>
            </form>
          </div>
        ))}
      </div>
      <form method="post" action="/admin/sectors" class="formgrid" style="grid-template-columns:1fr auto;margin-top:1rem">
        <input name="name" placeholder="New sector name" required />
        <button class="primary" type="submit">
          Add sector
        </button>
      </form>
    </Layout>
  );
});

app.post("/admin/sectors", async (c) => {
  if (!adminDebug(c)) return c.text("Not available", 404);
  const db = c.get("db");
  const community = c.get("community");
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  if (name) {
    await db.insert(sectors).values({ communityId: community.id, name, active: 1, createdAt: Date.now() });
    await logAdminAction(c, `added sector: "${name}"`);
  }
  return c.redirect("/admin/sectors");
});

app.post("/admin/sectors/:id/toggle", async (c) => {
  if (!adminDebug(c)) return c.text("Not available", 404);
  const db = c.get("db");
  const community = c.get("community");
  const id = Number(c.req.param("id"));
  const [sector] = await db.select().from(sectors).where(and(eq(sectors.id, id), eq(sectors.communityId, community.id)));
  if (sector) {
    await db.update(sectors).set({ active: sector.active ? 0 : 1 }).where(eq(sectors.id, id));
    await logAdminAction(c, `toggled sector "${sector.name}" (id=${id}) to ${sector.active ? "inactive" : "active"}`);
  }
  return c.redirect("/admin/sectors");
});

// ================= Errors (Enterprise_and_Community_Roadmap.md Phase 1) =================
// Never leak a stack trace, raw error message, or internal path to the
// client — the real error is logged server-side only (console.error reaches
// the Workers dashboard). Reuses Layout so an error page still looks like
// the app rather than a bare text dump; member/adminDebug are read
// defensively since a failure early in the middleware chain (before the
// session/community middleware has run) may mean neither was ever set.

app.notFound((c) => {
  return c.html(
    <Layout title="Not found" member={c.get("member") ?? null} adminDebug={adminDebug(c)} communityName={communityName(c)}>
      <h2 class="pagetitle">Page not found</h2>
      <p class="muted">This page doesn't exist, or you don't have access to it.</p>
      <p class="small" style="margin-top:1rem">
        <a href="/dashboard">Back to the dashboard</a>
      </p>
    </Layout>,
    404
  );
});

app.onError((err, c) => {
  console.error(err);
  return c.html(
    <Layout title="Something went wrong" member={c.get("member") ?? null} adminDebug={adminDebug(c)} communityName={communityName(c)}>
      <h2 class="pagetitle">Something went wrong</h2>
      <p class="muted">An unexpected error occurred on our end. Try again, or head back to the dashboard.</p>
      <p class="small" style="margin-top:1rem">
        <a href="/dashboard">Back to the dashboard</a>
      </p>
    </Layout>,
    500
  );
});

// ================= Scheduled (Enterprise_and_Community_Roadmap.md Phase 2) =================
// A real Cloudflare Cron Trigger — see wrangler.patha.toml's [triggers] block
// (a real deploy-config change made in this pass, not incidental). Runs
// once daily; drives the two time-based notification kinds nothing browses
// to a page daily to trigger on its own (followed_sector_vote_closing_soon,
// delegation_expiring_soon — see runDailyNotificationScan in community.ts),
// and the same upkeep tick() does on every page load (see
// runScheduledMaintenance), so none of it waits for a visitor.
// Locally, `wrangler dev --test-scheduled` exposes a manual trigger
// endpoint (GET /cdn-cgi/handler/scheduled) so this is exercisable without
// waiting for a real cron fire.
async function handleScheduled(env: Env["Bindings"]) {
  const db = makeDb(env.DB);
  const community = await ensureCommunity(db, env.TRIARC_OPERATING_SECTORS === "true", env.CIVIC_SECTORS === "true");
  await runScheduledMaintenance(db, community, env.REQUIRE_PHONE_VERIFICATION === "true", { RESEND_API_KEY: env.RESEND_API_KEY, PUBLIC_BASE_URL: env.PUBLIC_BASE_URL });
}

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env["Bindings"], ctx: ExecutionContext) => {
    ctx.waitUntil(handleScheduled(env));
  },
};
