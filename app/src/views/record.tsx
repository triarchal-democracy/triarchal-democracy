import { Layout } from "./layout";

const KIND_LABEL: Record<string, string> = {
  proposal: "Proposal",
  deliberation: "Deliberation",
  vote: "Vote",
  delegation: "Delegation",
  contribution: "Contribution",
  attestation: "Attestation",
  treasury: "Treasury",
  member: "Membership",
  record: "Decision",
  system: "System",
};

export const RecordPage = (p: {
  member: { id: number; name: string } | null;
  adminDebug: boolean; communityName: string;
  entries: { kind: string; text: string; occurredAt: number }[];
}) => (
  <Layout title="The Record" tab="record" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">The Record — permanent, public, append-only</h2>
    <div class="card">
      <div class="log">
        {p.entries.length === 0 && <p class="muted">Nothing yet.</p>}
        {p.entries.map((r) => (
          <div class="row">
            <span class="pill gray" style="min-width:10rem;text-align:center">
              {KIND_LABEL[r.kind] ?? r.kind} · {new Date(r.occurredAt).toLocaleDateString()}
            </span>
            <span style="flex:1">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
    <p class="muted small" style="margin-top:.8rem;font-style:italic">
      Nothing here can be edited in place. Errors are corrected by correction entries. Losing an argument never means
      being erased from it.
    </p>
  </Layout>
);
