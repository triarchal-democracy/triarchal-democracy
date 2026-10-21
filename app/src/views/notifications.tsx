import { Layout } from "./layout";

// Preference storage only — no delivery infrastructure yet (parked for its
// own scoping pass, same as ZK-identity and the on-chain ledger). No push
// channel at all: push needs client-side JavaScript, which this app
// deliberately doesn't have.
export const EVENT_KINDS = [
  "followed_sector_vote_closing_soon",
  "opportunity_matching_your_sectors",
  "sector_discussion_activity",
  "nomination_challenge_filed",
  "delegation_expiring_soon",
] as const;

const EVENT_LABEL: Record<(typeof EVENT_KINDS)[number], string> = {
  followed_sector_vote_closing_soon: "A vote closes soon in a sector you follow",
  opportunity_matching_your_sectors: "A new opportunity matches your sectors",
  sector_discussion_activity: "A new discussion or reply appears in a sector you follow",
  nomination_challenge_filed: "A challenge was filed against a nomination you made",
  delegation_expiring_soon: "A delegation you hold is about to expire",
};

export const NotificationPreferencesPage = (p: { member: { id: number; name: string }; adminDebug: boolean; communityName: string; enabled: Set<string> }) => (
  <Layout title="Notification preferences" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <p class="small muted" style="margin-bottom:.6rem">
      <a href={`/profile/${p.member.id}`}>← Your profile</a> · <a href="/notifications/inbox">Inbox</a>
    </p>
    <h2 class="pagetitle">Notification preferences</h2>
    <p class="muted small" style="margin-bottom:1rem">
      Everything here is opt-in and off by default — nothing is ever turned on for you. In-app delivery is live, to
      the inbox above. Email delivery is not built yet — checking "Email" below stores your preference for when it
      is, but nothing is sent today. There is no push channel, since push requires client-side JavaScript this
      platform deliberately doesn't run. No engineered urgency — just what you've explicitly asked to hear about.
    </p>
    <form method="post" action="/notifications/preferences">
      <div class="card">
        <div class="row" style="border:none;font-weight:600">
          <span class="small sans">Event</span>
          <span class="small sans" style="display:flex;gap:1.5rem">
            <span style="width:4rem;text-align:center">In-app</span>
            <span style="width:4rem;text-align:center">Email (not sent yet)</span>
          </span>
        </div>
        {EVENT_KINDS.map((kind) => (
          <div class="row">
            <span class="small">{EVENT_LABEL[kind]}</span>
            <span style="display:flex;gap:1.5rem">
              <span style="width:4rem;text-align:center">
                <input type="checkbox" name="pref" value={`${kind}:in_app`} checked={p.enabled.has(`${kind}:in_app`)} />
              </span>
              <span style="width:4rem;text-align:center">
                <input type="checkbox" name="pref" value={`${kind}:email`} checked={p.enabled.has(`${kind}:email`)} />
              </span>
            </span>
          </div>
        ))}
      </div>
      <button class="primary" type="submit" style="margin-top:1rem">
        Save preferences
      </button>
    </form>
  </Layout>
);

export interface InboxNotification {
  id: number;
  eventKind: string;
  text: string;
  link: string | null;
  createdAt: number;
  read: boolean;
}

export const NotificationsInboxPage = (p: { member: { id: number; name: string }; adminDebug: boolean; communityName: string; notifications: InboxNotification[] }) => {
  const anyUnread = p.notifications.some((n) => !n.read);
  return (
    <Layout title="Inbox" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <p class="small muted" style="margin-bottom:.6rem">
        <a href={`/profile/${p.member.id}`}>← Your profile</a> · <a href="/notifications/preferences">Notification preferences</a>
      </p>
      <div class="row" style="border:none;align-items:center;margin-bottom:1rem">
        <h2 class="pagetitle" style="margin:0">Inbox</h2>
        {anyUnread && (
          <form method="post" action="/notifications/inbox/mark-all-read">
            <button type="submit">Mark all read</button>
          </form>
        )}
      </div>
      <div class="card">
        <div class="log">
          {p.notifications.length === 0 && <p class="muted">No notifications yet — nothing has fired since you opted in to anything above.</p>}
          {p.notifications.map((n) => (
            <div class="row">
              <span style={n.read ? "" : "font-weight:600"}>
                {!n.read && <span class="pill" style="margin-right:.4rem">new</span>}
                {n.link ? <a href={n.link}>{n.text}</a> : n.text}
              </span>
              <span class="small muted">{new Date(n.createdAt).toDateString()}</span>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};
