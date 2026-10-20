import type { Db } from "./db/client";
import type { Community } from "./lib/community";

export interface Env {
  Bindings: {
    DB: D1Database;
    ADMIN_DEBUG: string;
    // Notification delivery (Enterprise_and_Community_Roadmap.md Phase 2) —
    // RESEND_API_KEY is a secret (`wrangler secret put RESEND_API_KEY`),
    // never set in wrangler.patha.toml; both are optional so local dev and any
    // deploy made before the founder hands over a key still run cleanly —
    // see app/src/lib/notify.ts, which skips email delivery (logging a
    // warning) rather than throwing when the key is absent.
    RESEND_API_KEY?: string;
    PUBLIC_BASE_URL?: string;
    // Triarc_Operations_Code.md (Proposal Ten) — Triarc-only. Selects
    // TRIARC_SECTORS over CORE_SECTORS at seed time. Leave unset (or
    // "false") on any other deployment.
    TRIARC_OPERATING_SECTORS?: string;
    // Contribution Code 2.3 (10 Oct 2026) — selects CIVIC_SECTORS for a
    // deployment governing a municipality. Unset in the Triarc's config.
    CIVIC_SECTORS?: string;
    // When "true" (the Triarc only), "/" renders TheTriarcLandingPage
    // instead of the dashboard; the dashboard itself stays reachable at
    // /dashboard either way. Unset (any other deployment, and any deploy
    // predating this var) preserves the original behavior: "/" IS the
    // dashboard.
    INSTITUTIONAL_LANDING?: string;
    // Prompt25_PathA_MembershipEnforcement.md — Triarc Membership Code 2.1's
    // phone-verification floor. "true" only in wrangler.patha.toml; unset
    // means a complete no-op (Part D.4) — every enforcement point checks this
    // var directly, never infers the deployment from phone/phoneVerifiedAt
    // happening to be null.
    REQUIRE_PHONE_VERIFICATION?: string;
    // Twilio Verify credentials (Prompt25 Part A) — secrets, set only via
    // `wrangler secret put ... -c wrangler.patha.toml`, never in [vars]. All three optional: absent means real signup
    // hasn't happened yet, and app/src/lib/twilioVerify.ts fails every call
    // gracefully ("temporarily unavailable") rather than crashing when
    // they're unset — see that file's header.
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_VERIFY_SERVICE_SID?: string;
    // Workers Rate Limiting bindings (wrangler.patha.toml [[ratelimits]]); optional and
    // fail-open everywhere (lib/rateLimit.ts burstAllowed), so absent in local dev and tests.
    REGISTER_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
    LOGIN_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
    PHONE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
    // Community-wide registration throttle (lib/rateLimit.ts, public at GET /status): the most
    // successful registrations allowed per rolling hour. A decimal string like every other var.
    // Unset, empty, "0" or anything that is not a positive number means NO throttle, so tests,
    // local dev are unaffected. A temporary pacing valve, never a gate on who
    // may join (Charter 1.1).
    REGISTRATION_HOURLY_CAP?: string;
  };
  Variables: {
    db: Db;
    community: Community;
    // unreadCount is resolved once, in the session-resolution middleware,
    // from in_app_notifications — carried on `member` itself (rather than a
    // separate Variable) so it reaches layout.tsx's header for free through
    // every existing `member={member}` prop chain already threaded through
    // ~40 routes and every Page component, with no new prop to plumb
    // through each one individually.
    member: { id: number; name: string; unreadCount: number } | null;
  };
}
