import { Layout } from "./layout";
import type { MemberProfile } from "../lib/community";

export const ProfilePage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean;
  communityName: string;
  profile: MemberProfile;
  isSelf: boolean;
  // Triarc Membership Code 2.1 (Prompt25_PathA_MembershipEnforcement.md) —
  // the Triarc only; the verification card below never renders when false.
  requirePhoneVerification: boolean;
}) => {
  const pr = p.profile;
  const reduced = !p.isSelf && pr.visibilityLevel !== "open";
  return (
    <Layout title={pr.name} member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <h2 class="pagetitle">{pr.name}</h2>
      {pr.leftAt !== null && (
        <p class="muted small" style="margin-bottom:.8rem">
          This Member has left {p.communityName}. Their Contribution Record remains part of the public history (Charter 1.3).
        </p>
      )}
      {pr.sanctions.length > 0 && (
        <div class="card" style="margin-bottom:1rem">
          <h3>Dispute Panel findings</h3>
          <p class="muted small">Public by design (Code of Conduct 4.4): sanctions expire; the record does not.</p>
          {pr.sanctions.map((x) => {
            const label =
              x.kind === "notice"
                ? "Public notice"
                : x.kind === "accrual-suspension"
                  ? "Accrual suspension"
                  : x.kind === "participation-suspension"
                    ? "Participation suspension"
                    : x.kind === "voidance"
                      ? "Contribution voidance"
                      : "Public notice — a report was found brought in bad faith";
            const inForce = x.endsAt !== null && Date.now() >= x.startsAt && Date.now() < x.endsAt;
            return (
              <div class="row">
                <span style="flex:1">
                  {label}
                  {x.endsAt !== null ? ` · ${new Date(x.startsAt).toDateString()} to ${new Date(x.endsAt).toDateString()}` : ` · ${new Date(x.startsAt).toDateString()}`}
                </span>
                {x.overturnedAt !== null && <span class="pill gray">overturned by community vote</span>}
                {inForce && x.overturnedAt === null && <span class="pill gray">in force</span>}
                <a href={`/disputes/${x.panelId}`}>the case</a>
              </div>
            );
          })}
        </div>
      )}
      <div class="grid cols2">
        <div class="card">
          <span class="label">Positions held</span>
          {pr.positions.length === 0 && <p class="muted small">None yet.</p>}
          {pr.positions.map((pos) => (
            <div class="row">
              <span>
                {pos.kind === "steward" && "Civic Steward"}
                {pos.kind === "delegate" && "Delegate"}
                {pos.kind === "nominee" && pos.title}
              </span>
              <span class="small muted">{pos.sectorName}</span>
            </div>
          ))}
        </div>
        <div class="card">
          <span class="label">Delegation status</span>
          <div class="row">
            <span class="small sans">Delegating to</span>
            <b>{pr.myDelegations.length}</b>
          </div>
          {pr.myDelegations.map((d) => (
            <div class="row">
              <span class="small">{d.toName}</span>
              <span class="small muted">{d.scopeName}</span>
            </div>
          ))}
          {!reduced && (
            <div class="row">
              <span class="small sans">Members currently delegating to {p.isSelf ? "you" : "them"}</span>
              <b>{pr.heldByCount}</b>
            </div>
          )}
        </div>

        {p.isSelf && p.requirePhoneVerification && (
          <div class="card" style="grid-column:1/-1">
            <span class="label">Membership verification — Triarc Membership Code 2.1</span>
            {pr.phoneVerifiedAt !== null ? (
              <p class="ok small">Your phone is verified. You're a full Member — voting and delegation are open to you.</p>
            ) : (
              <p class="small">
                Your account is registered but not yet a full Member — reading, deliberating, and logging
                contributions all work already. Voting and delegation open once your phone is verified.{" "}
                <a href="/verify-phone">Verify your phone →</a>
              </p>
            )}
          </div>
        )}

        {p.isSelf && (
          <div class="card" style="grid-column:1/-1">
            <span class="label">Display visibility</span>
            <p class="muted small" style="margin-bottom:.5rem">
              A persistent, switchable setting for how you're generally shown across the platform — distinct from the
              per-comment lower-visibility option in deliberation threads. This never changes what's structurally
              public: your votes, delegations, and contributions stay attributed to this handle either way (Charter
              7.1/7.2) — "open" shows your full activity to other Members by default; "pseudonymous"/"anonymous"
              reduce what a visitor sees on this page without hiding your handle from the record itself.
            </p>
            <form method="post" action="/profile/visibility" style="display:flex;gap:.5rem;align-items:center">
              <select name="visibilityLevel">
                {["open", "pseudonymous", "anonymous"].map((lvl) => (
                  <option value={lvl} selected={pr.visibilityLevel === lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
              <button class="primary" type="submit">
                Save
              </button>
            </form>
          </div>
        )}

        {p.isSelf && (
          <div class="card" style="grid-column:1/-1">
            <span class="label">Dispute Panel pool</span>
            <p class="muted small" style="margin-bottom:.5rem">
              Dispute Procedure Code 2.1: any Active Member may volunteer for the panel pool, and service accrues
              Stewardship Marks under the Contribution Code. Volunteering is a choice, not a default — panels are
              drawn only from Members who have opted in. Members with a delegation relationship to a party, an
              attestation on the disputed contribution, a pending dispute against a party, or a panel with the same
              parties in the last 180 days are excluded from that particular draw automatically (2.2). You can
              withdraw at any time; withdrawing never affects a panel you are already seated on.
            </p>
            <form method="post" action="/profile/dispute-pool" style="display:flex;gap:.5rem;align-items:center">
              <input type="hidden" name="join" value={pr.disputePoolOptInAt === null ? "yes" : "no"} />
              <button class="primary" type="submit">
                {pr.disputePoolOptInAt === null ? "Volunteer for the panel pool" : "Withdraw from the panel pool"}
              </button>
              <span class="muted small">
                {pr.disputePoolOptInAt === null ? "You are not currently in the pool." : "You are in the pool."}
              </span>
            </form>
          </div>
        )}

        <div class="card" style="grid-column:1/-1">
          <span class="label">Contribution Record{pr.contributions.length > 0 && <> — recent</>}</span>
          {reduced ? (
            <p class="muted small">This Member has set a reduced display visibility. Verified contributions remain part of the public record — see <a href={`/contribution?member=${encodeURIComponent(pr.name)}`}>the full ledger</a>.</p>
          ) : (
            <>
              {pr.contributions.length === 0 && <p class="muted small">No contributions logged yet.</p>}
              {pr.contributions.map((con) => (
                <div class="row">
                  <span class="small">
                    {con.domain} — {con.description}
                    {con.sectorNames.length > 0 && <span class="small muted"> · {con.sectorNames.join(", ")}</span>}
                  </span>
                  <span>{con.verified ? <span class="pill green">Verified</span> : <span class="pill gray">pending</span>}</span>
                </div>
              ))}
              <p class="muted small" style="margin-top:.5rem">
                <a href={`/contribution?member=${encodeURIComponent(pr.name)}`}>Full ledger →</a>
              </p>
            </>
          )}
        </div>

        {p.isSelf && (
          <div class="card" style="grid-column:1/-1">
            <span class="label">More</span>
            <p class="small">
              <a href="/activity">Your full activity log →</a> · <a href="/notifications/preferences">Notification preferences →</a> · <a href="/membership/leave">Leave {p.communityName} →</a>
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};


export const LeaveMembershipPage = (p: { member: { id: number; name: string }; adminDebug: boolean; communityName: string; error?: string }) => (
  <Layout title="Leave" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <div class="card authcard">
      <h2 class="pagetitle">Leave {p.communityName}</h2>
      <p class="small">A Member may leave at any time (Charter 1.3). Here is exactly what happens:</p>
      <ul class="small" style="margin:.5rem 0 .8rem 1.2rem">
        <li>Your Contribution Record stays in the public history, under your username.</li>
        <li>Your standing lapses immediately, and every delegation you hold or have granted is revoked.</li>
        <li>You stop counting as a Member and can no longer sign in.</li>
        <li>Your email address and phone number are removed from this account.</li>
        <li>Leaving is final for this account. To return you would join again as a new Member, starting from nothing.</li>
      </ul>
      <form method="post" action="/membership/leave" class="formgrid">
        <label class="small sans" for="leave-confirm" style="display:flex;gap:.5rem;align-items:flex-start">
          <input id="leave-confirm" type="checkbox" name="confirm" required style="margin-top:.2rem" />
          <span>I understand this is final.</span>
        </label>
        <label class="sr-only" for="leave-name">Type your username to confirm</label>
        <input id="leave-name" type="text" name="confirmName" placeholder={`Type ${p.member.name} to confirm`} required autocomplete="off" />
        <button class="primary" type="submit">
          Leave {p.communityName}
        </button>
      </form>
      {p.error && <p class="error">{p.error}</p>}
      <p class="muted small" style="margin-top:1rem">
        <a href={`/profile/${p.member.id}`}>Cancel and go back</a>
      </p>
    </div>
  </Layout>
);

export const LeftMembershipPage = (p: { communityName: string }) => (
  <Layout title="You have left" member={null} communityName={p.communityName}>
    <div class="card authcard">
      <h2 class="pagetitle">You have left {p.communityName}</h2>
      <p class="small">Your Contribution Record remains part of the public history, as the Charter provides. Thank you for the time you spent here.</p>
      <p class="muted small" style="margin-top:1rem">
        <a href="/proposals">Read the open proposals</a>
      </p>
    </div>
  </Layout>
);
