import { Layout } from "./layout";

export const ActivityPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  entries: { kind: string; text: string; occurredAt: number }[];
}) => (
  <Layout title="My activity" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <p class="small muted" style="margin-bottom:.6rem">
      <a href={`/profile/${p.member.id}`}>← Your profile</a>
    </p>
    <h2 class="pagetitle">Your activity — {p.member.name}</h2>
    <div class="card">
      <div class="log">
        {p.entries.length === 0 && <p class="muted">Nothing yet.</p>}
        {p.entries.map((r) => (
          <div class="row">
            <span class="pill gray" style="min-width:8rem;text-align:center">
              {r.kind} · {new Date(r.occurredAt).toLocaleDateString()}
            </span>
            <span style="flex:1">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
    <p class="muted small" style="margin-top:.8rem">
      Visible to you by default. Every entry is also part of the permanent public <a href="/record">Record</a> —
      sharing any of it beyond that is your own choice, not something this page does for you.
    </p>
  </Layout>
);
