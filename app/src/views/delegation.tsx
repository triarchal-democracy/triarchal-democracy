import { Layout } from "./layout";
import { ClauseChip } from "./clauseChip";

export interface DelegationRowView {
  id: number;
  toName: string;
  scopeName: string;
  grantedAt: number;
  ordinaryExpiresAt: number;
  criticalExpiresAt: number;
  live: boolean;
  // Charter 3.6 — the holder is concentrated, so this delegation runs on the shorter renewal cycle.
  shorterCycle?: boolean;
}

export interface DelegationProps {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  mine: DelegationRowView[];
  otherMembers: { id: number; name: string }[];
  // Government Adoption Compact §3 — Default-Delegate Mechanism public seats
  // (renamed from "Path A" in the Aug 2026 documentation amendment — see
  // CLAUDE.md's Naming section), kept in their own group in the target
  // picker so delegating to a seat reads as a clearly deliberate action,
  // distinct from delegating to a member.
  publicSeats: { id: number; name: string }[];
  sectors: { id: number; name: string }[];
  held: { name: string; scopeName: string; grantedAt: number }[];
  map: { name: string; status: string }[];
  // Triarc Membership Code 2.1 (Prompt25_PathA_MembershipEnforcement.md) —
  // true when this Member can't yet grant or receive a delegation for lack
  // of phone verification. The Triarc only; always false when that variable is unset.
  phoneVerificationBlocked?: boolean;
  delegationExpiryDays: number;
  delegationExpiryCriticalDays: number;
}

export const DelegationPage = (p: DelegationProps) => (
  <Layout title="Delegation" tab="delegation" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Delegation — public, specific, revocable, renewed</h2>
    {p.phoneVerificationBlocked && (
      <p class="error" style="margin-bottom:.8rem">
        Delegating (granting or receiving) requires phone verification — your account isn't a full Member yet (Triarc
        Membership Code 2.1). <a href="/verify-phone">Verify your phone →</a>
      </p>
    )}
    <div class="grid cols2">
      <div class="card">
        <span class="label">Your delegations ({p.member.name})</span>
        {p.mine.length > 0 ? (
          p.mine.map((d) => (
            <div class="row">
              <div>
                <b>{d.toName}</b> <span class="small muted">({d.scopeName})</span>
                <div class="small muted">
                  granted {new Date(d.grantedAt).toDateString()} · expires {new Date(d.ordinaryExpiresAt).toDateString()} (critical
                  decisions need renewal by {new Date(d.criticalExpiresAt).toDateString()})
                </div>
                {d.shorterCycle && (
                  <div class="small muted">
                    {d.toName} holds a large share of delegated support, so every delegation to them runs on the shorter renewal cycle (Charter 3.6).
                  </div>
                )}
              </div>
              <div style="display:flex;gap:.4rem">
                <form method="post" action={`/delegation/${d.id}/renew`}>
                  <button type="submit">Renew</button>
                </form>
                <form method="post" action={`/delegation/${d.id}/revoke`}>
                  <button class="primary" type="submit">
                    Revoke — instant
                  </button>
                </form>
              </div>
            </div>
          ))
        ) : (
          <p class="muted">You vote directly on everything.</p>
        )}
        <form method="post" action="/delegation" style="display:flex;gap:.5rem;margin-top:.8rem;flex-wrap:wrap">
          <label class="sr-only" for="delegation-to">Delegate to</label>
          <select id="delegation-to" name="toId">
            <optgroup label="Members">
              {p.otherMembers.map((m) => (
                <option value={m.id}>{m.name}</option>
              ))}
            </optgroup>
            {p.publicSeats.length > 0 && (
              <optgroup label="Public seats — Default-Delegate Mechanism (Government Adoption Compact §3)">
                {p.publicSeats.map((m) => (
                  <option value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <label class="sr-only" for="delegation-scope">Scope of the delegation</label>
          <select id="delegation-scope" name="scope">
            <option value="entire">Entire — every decision</option>
            {p.sectors.map((s) => (
              <option value={s.id}>{s.name} only</option>
            ))}
          </select>
          <button class="primary" type="submit">
            Delegate
          </button>
        </form>
        <p class="muted small" style="margin-top:.6rem">
          A delegation persists because you still choose it — not because you stopped paying attention. Granting an
          entire delegation, or a new sector-scoped one that overlaps an existing one, automatically revokes whatever
          conflicts (Charter 3.3). <ClauseChip clauseKey="charter#3.3" /> Ordinary decisions renew every {p.delegationExpiryDays} days; critical decisions
          (Charter amendments, Entrenched amendments, Position decisions, large Treasury allocations) need renewal
          every {p.delegationExpiryCriticalDays} days. Your direct vote always overrides.
        </p>
      </div>
      <div class="card">
        <span class="label">Trust held by {p.member.name}</span>
        {p.held.length ? (
          p.held.map((h) => (
            <div class="row">
              <span>
                {h.name} <span class="small muted">({h.scopeName})</span>
              </span>
              <span class="small muted">since {new Date(h.grantedAt).toDateString()}</span>
            </div>
          ))
        ) : (
          <p class="muted">No one currently delegates to you. Standing is earned; it cannot be bought.</p>
        )}
      </div>
      <div class="card" style="grid-column:1/-1">
        <span class="label">The delegation map — public by design</span>
        {p.map.map((row) => (
          <div class="row">
            <span>{row.name}</span>
            <span class="small muted">{row.status}</span>
          </div>
        ))}
      </div>
    </div>
  </Layout>
);
