// Notification dispatch — Enterprise_and_Community_Roadmap.md Phase 2.
// Checks the member's own stored preference (notificationPreferences; both
// channels off by default, never assumed on) and delivers accordingly:
// in-app writes a row (app/src/views/notifications.tsx's inbox reads it
// back), email sends via Resend's plain REST API — no SDK, matching
// auth.ts's existing no-external-dependency philosophy.
//
// Never throws: a misconfigured or momentarily-down email provider must
// never break the write action (proposal submission, opportunity posting,
// etc.) that triggered the notification. Every failure mode here logs a
// warning and returns.

import { eq, and } from "drizzle-orm";
import type { Db } from "../db/client";
import { notificationPreferences, inAppNotifications, members } from "../db/schema";

// Only the two bindings notify() itself needs — deliberately narrower than
// the full Env.Bindings type so this file doesn't import ./types and create
// a dependency cycle risk with index.tsx.
export interface NotifyEnv {
  RESEND_API_KEY?: string;
  // Non-secret; set in wrangler.patha.toml [vars]. Emails need an absolute URL —
  // there's no request context to derive one from inside the scheduled()
  // cron handler. Falls back to the known production URL if unset (e.g. in
  // local dev), so a missing var never breaks the email body, just its link.
  PUBLIC_BASE_URL?: string;
}

// Fallback only — every deployed config sets PUBLIC_BASE_URL explicitly.
// Repointed Aug 31 2026: this used to default to a Worker that has since
// been retired, so an unset var would have produced dead links in emails.
const DEFAULT_BASE_URL = "https://triarchalframework.triarchal-democracy.workers.dev";

/**
 * db, communityId, memberId, eventKind, text, link, ts — matches the shape
 * of every other write-side helper in community.ts (writeRecord, etc.);
 * `env` is appended because Workers bindings/secrets are only readable from
 * the request-scoped `c.env`, never ambiently, and `ts` is explicit rather
 * than Date.now() so this respects the same dev-clock convention
 * (community.now()) every other timestamped write in this app already does.
 */
export async function notify(
  db: Db,
  env: NotifyEnv,
  communityId: number,
  memberId: number,
  eventKind: string,
  text: string,
  link: string | null,
  ts: number
): Promise<void> {
  const prefs = await db
    .select({ channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.memberId, memberId), eq(notificationPreferences.eventKind, eventKind)));
  const inAppOn = prefs.some((p) => p.channel === "in_app" && p.enabled === 1);
  const emailOn = prefs.some((p) => p.channel === "email" && p.enabled === 1);
  if (!inAppOn && !emailOn) return;

  if (inAppOn) {
    await db.insert(inAppNotifications).values({ communityId, memberId, eventKind, text, link, createdAt: ts, readAt: null });
  }

  if (emailOn) {
    await sendEmail(db, env, memberId, text, link);
  }
}

async function sendEmail(db: Db, env: NotifyEnv, memberId: number, text: string, link: string | null): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[notify] RESEND_API_KEY not set — skipping email delivery for memberId=${memberId}`);
    return;
  }
  try {
    const [m] = await db.select({ email: members.email }).from(members).where(eq(members.id, memberId));
    if (!m) return;
    const base = env.PUBLIC_BASE_URL ?? DEFAULT_BASE_URL;
    const body = link ? `${text}\n\n${base}${link}` : text;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Resend's own shared test domain until a real sending domain is
        // verified — see CLAUDE.md-style "open thread" note in the Phase 2
        // build summary. Swap once the founder verifies a real domain.
        // "Triarchal Framework" rather than a deployment name
        // (_archive/prompts/Prompt24_PathA_PathB_Split.md, renamed from
        // "Statera" in Prompt30 — see "Four names, not interchangeable" in
        // CLAUDE.md) — this file's fetch()
        // call has no per-request community row to read a
        // deployment-specific name from, and "Triarchal Framework" is
        // accurate email branding for a notification from any
        // deployment.
        from: "Triarchal Framework <onboarding@resend.dev>",
        to: [m.email],
        subject: "Triarchal Framework — new notification",
        text: body,
      }),
    });
    if (!res.ok) {
      console.warn(`[notify] Resend API returned ${res.status} for memberId=${memberId}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[notify] email delivery failed for memberId=${memberId}:`, err);
  }
}
