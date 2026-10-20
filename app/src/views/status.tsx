import { Layout } from "./layout";

// GET /status - public, read-only. States plainly whether new sign-ups are open or briefly paced,
// the cap in force, and how many people joined in the last hour. The cap is a throttle on how fast
// people may arrive (lib/rateLimit.ts), never a test of who may join (Charter 1.1), and the page
// says so. Rules of Procedure 4.3: no countdowns, no scarcity, no urgency - when sign-ups are
// paused the page gives a rough wait in plain words and nothing that pushes anyone to hurry.
export const StatusPage = (p: {
  member: { id: number; name: string; unreadCount?: number } | null;
  adminDebug: boolean;
  communityName: string;
  /** The hourly cap in force; 0 when no cap is configured. */
  cap: number;
  /** Successful registrations in the last rolling hour. */
  recent: number;
  throttled: boolean;
  /** Rough minutes until sign-ups reopen; only meaningful when throttled. */
  retryMinutes: number;
}) => (
  <Layout title="Sign-up status" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Sign-up status</h2>
    <div class="grid cols2">
      <div class="card">
        <span class="label">Sign-ups right now</span>
        <p class="stat" style="margin-bottom:.5rem">{p.throttled ? "Briefly paused" : "Open"}</p>
        {p.throttled ? (
          <p>
            Many people are joining right now, so new sign-ups are paused for a short while. Please try again in about{" "}
            {p.retryMinutes} minute{p.retryMinutes === 1 ? "" : "s"}. Nothing is lost, and no one is turned away permanently.
          </p>
        ) : (
          <p>Anyone aged eighteen or older can join {p.communityName} now.</p>
        )}
        {!p.throttled && !p.member && (
          <p class="small" style="margin-top:.8rem">
            <a href="/register">Go to the sign-up form</a> or <a href="/tour">look around first</a>.
          </p>
        )}
      </div>
      <div class="card">
        <div class="statrow">
          <div>
            <span class="label">Cap in force</span>
            <p class="stat">{p.cap > 0 ? p.cap : "None"}</p>
            <p class="muted small">{p.cap > 0 ? "new Members per rolling hour" : "no hourly cap is set"}</p>
          </div>
          <div>
            <span class="label">Joined in the last hour</span>
            <p class="stat">{p.recent}</p>
            <p class="muted small">successful sign-ups</p>
          </div>
        </div>
      </div>
    </div>
    <p style="margin-top:1rem;max-width:44rem">
      Why this exists: a cap on how fast new Members can join keeps moderation able to welcome everyone properly if a rush
      arrives, and it only slows the pace; it never decides who may join (Charter 1.1).
    </p>
    <p class="muted small" style="margin-top:.8rem;font-style:italic">
      Read-only and public. This page can be up to half a minute behind.
    </p>
  </Layout>
);
