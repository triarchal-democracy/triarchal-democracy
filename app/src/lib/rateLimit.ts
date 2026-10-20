// Launch-readiness rate limits (viral-launch plan, gate "rate limits").
//
// Three layers, cheapest first:
//   1. Burst limiter: a Cloudflare Workers Rate Limiting binding (wrangler.patha.toml
//      [[ratelimits]]). Costs no D1 reads or writes, so a flood is turned away before it
//      touches the database. It is per-location and approximate by design. FAILS OPEN: if a
//      binding is absent (local dev, tests) or errors, the request goes on.
//   2. Per-network registration cap: successful registrations from one IP in the last hour,
//      counted from security_events (kind "register").
//   3. Per-network failed-login cap: failed logins from one IP in the login window, counted
//      from login_attempts. The existing per-email lockout in POST /login stays as it was; this
//      adds the dimension it lacks (one network trying many emails).
//   4. Community-wide registration throttle (the "valve"): successful registrations from anyone
//      in the last rolling hour, counted from the same security_events rows. See the block at
//      the foot of this file for why it is a throttle and not a gate.
//
// What this does and does not do: it blunts a lazy script and a stuck client. It does not stop
// a determined attacker with many IPs; for that the defences are phone verification at the
// door (Membership Code 2.1) and, if needed, Cloudflare Turnstile or a WAF rule in front.
// Caps are per IP, and an IP can be a whole school or mobile carrier, so they are generous and
// the message says to try again later rather than accusing anyone.
import { and, asc, eq, gt, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { loginAttempts, securityEvents } from "../db/schema";

export const REGISTER_EVENT_KIND = "register";
export const REGISTRATIONS_PER_IP_PER_HOUR = 60;
export const FAILED_LOGINS_PER_IP_PER_WINDOW = 30;
const HOUR_MS = 60 * 60 * 1000;

/** The shape of a Workers Rate Limiting binding, declared here so tests need no Cloudflare types. */
export interface BurstLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** True when the request may proceed. Fails open on a missing binding or any error. */
export async function burstAllowed(limiter: BurstLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch {
    return true;
  }
}

/** "unknown" is local dev with no edge header; never limit on it, or everyone shares one bucket. */
function limitable(ip: string): boolean {
  return ip !== "unknown" && ip !== "";
}

export async function registrationCapReached(db: Db, communityId: number, ip: string, ts: number): Promise<boolean> {
  if (!limitable(ip)) return false;
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(securityEvents)
    .where(and(eq(securityEvents.communityId, communityId), eq(securityEvents.kind, REGISTER_EVENT_KIND), eq(securityEvents.ip, ip), gte(securityEvents.occurredAt, ts - HOUR_MS)));
  return Number(row?.n ?? 0) >= REGISTRATIONS_PER_IP_PER_HOUR;
}

export async function failedLoginCapReached(db: Db, ip: string, ts: number, windowMs: number): Promise<boolean> {
  if (!limitable(ip)) return false;
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, 0), gte(loginAttempts.attemptedAt, ts - windowMs)));
  return Number(row?.n ?? 0) >= FAILED_LOGINS_PER_IP_PER_WINDOW;
}

// ---------- Community-wide registration throttle (the "valve") ----------
// Purpose: if a traffic spike or a bot wave arrives, protect moderation and cost without ever
// excluding anyone for good. Charter 1.1 says any person aged eighteen or older may become a
// Member, so this is deliberately a transparent, TEMPORARY throttle on the pace of sign-ups,
// never a closure and never a test of who may join:
//   - it counts only successful registrations (kind "register"), so a refused attempt adds
//     nothing and cannot prolong the pause;
//   - the window is rolling, so capacity returns on its own as the oldest registrations age out,
//     and the refusal says roughly how many minutes that is;
//   - the cap and the current count are public at GET /status;
//   - REGISTRATION_HOURLY_CAP unset, empty, zero or not a positive number means NO throttle
//     (tests and local dev are unaffected).
// It is approximate by design: the count and the insert are not atomic, so a burst can overshoot
// the cap by a few. It is not an abuse defence by itself (phone verification and, if needed,
// Turnstile are); it only keeps the arrival rate inside what moderation can welcome properly.

/** Parses the REGISTRATION_HOURLY_CAP var. Anything other than a positive number means no throttle (0). */
export function parseRegistrationHourlyCap(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  const n = Math.floor(Number(String(raw).trim()));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface RegistrationThrottle {
  /** The cap in force; 0 means no throttle is configured. */
  cap: number;
  /** Successful registrations in the last rolling hour. */
  recent: number;
  /** True when a new sign-up would be paused right now. Always false when cap is 0. */
  throttled: boolean;
  /** When throttled: ms until enough registrations age out for one more to fit; otherwise 0. */
  retryAfterMs: number;
}

/**
 * Where the community stands against the hourly cap at time ts. A registration counts while it is
 * less than an hour old (occurredAt > ts - 1h). When throttled, the wait is until the registration
 * that stands (recent - cap) places from the oldest ages out, which is the oldest one exactly when
 * recent equals cap, and later if the cap was lowered below the current count.
 */
export async function registrationThrottle(db: Db, communityId: number, cap: number, ts: number): Promise<RegistrationThrottle> {
  const since = ts - HOUR_MS;
  const where = and(eq(securityEvents.communityId, communityId), eq(securityEvents.kind, REGISTER_EVENT_KIND), gt(securityEvents.occurredAt, since));
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(securityEvents).where(where);
  const recent = Number(row?.n ?? 0);
  if (cap <= 0 || recent < cap) return { cap: Math.max(0, cap), recent, throttled: false, retryAfterMs: 0 };
  const [pivot] = await db.select({ at: securityEvents.occurredAt }).from(securityEvents).where(where).orderBy(asc(securityEvents.occurredAt)).limit(1).offset(recent - cap);
  const retryAfterMs = Math.max(1000, (pivot?.at ?? ts) + HOUR_MS - ts);
  return { cap, recent, throttled: true, retryAfterMs };
}

/** Whole minutes to wait, rounded up, never below one. */
export function throttleMinutes(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 60_000));
}

/** The plain refusal shown on POST /register while the throttle is in force. No urgency, no blame. */
export function throttleMessage(retryAfterMs: number): string {
  const n = throttleMinutes(retryAfterMs);
  return `Many people are joining right now. To keep moderation able to welcome everyone properly, new sign-ups are paused for a short while. Please try again in about ${n} minute${n === 1 ? "" : "s"}; nothing is lost and no one is turned away permanently.`;
}
