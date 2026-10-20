import { Layout } from "./layout";
import { DOMAINS, type Domain } from "../lib/params";

export interface ContributionRow {
  id: number;
  memberName: string;
  domain: Domain;
  description: string;
  evidenceLink: string | null;
  loggedAt: number;
  verified: boolean;
  // Contribution Code 1.4-1.6 — "unverified" (still gathering attestations),
  // "pending" (verified, awaiting the member's own claim, within the
  // window), "claimed" (counts toward standing/dividend), or "lapsed"
  // (verified, still unclaimed, past the window — stays on the record,
  // never counts).
  claimStatus: "unverified" | "pending" | "claimed" | "lapsed";
  canClaim: boolean; // the viewing member's own contribution, still pending
  attestorsRequired: number;
  attestorNames: string[];
  canAttest: boolean;
  sectorNames: string[];
}

export interface ContributionProps {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  items: ContributionRow[];
  myCredits: Record<Domain, number>;
  myCapped: number;
  myReceived: number;
  domainShares: Record<Domain, number>;
  claimWindowDays: number;
  diversityCap: number;
  sectors: { id: number; name: string }[];
  prefill?: { domain?: string; description?: string; evidenceLink?: string; sectorId?: string };
  filterMemberName?: string;
}

export const ContributionPage = (p: ContributionProps) => (
  <Layout title="Contribution" tab="contribution" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Contribution — fitted to the time people actually have</h2>
    <div class="grid cols2">
      <div class="card">
        <span class="label">Log a contribution ({p.member.name})</span>
        <form method="post" action="/contribution" class="formgrid">
          <label class="sr-only" for="contribution-domain">Domain</label>
          <select id="contribution-domain" name="domain">
            {["Deliberation", "Craft", "Stewardship"].map((d) => (
              <option selected={p.prefill?.domain === d}>{d}</option>
            ))}
          </select>
          <input name="description" placeholder="What did you do?" value={p.prefill?.description ?? ""} required />
          <input name="evidenceLink" placeholder="Link to the evidence (a doc, a diff, a thread)" value={p.prefill?.evidenceLink ?? ""} />
          <div class="small muted">Sector tags (optional, any number) — Contribution Code 2.2:</div>
          <div style="display:flex;gap:.8rem;flex-wrap:wrap">
            {p.sectors.map((s) => (
              <label class="small sans" style="display:flex;gap:.3rem;align-items:center">
                <input type="checkbox" name="sectorId" value={s.id} checked={p.prefill?.sectorId === String(s.id)} /> {s.name}
              </label>
            ))}
          </div>
          <button class="primary" type="submit" style="justify-self:start">
            Log it
          </button>
        </form>
        <p class="muted small" style="margin-top:.5rem">
          Verifies at {p.items[0]?.attestorsRequired ?? 2} peer attestations from Members who didn't collaborate on
          it. Attesting is itself Marked work — and stakes your standing on what you attest. Once verified, claim it
          yourself within {p.claimWindowDays} days (Contribution Code 1.4) — it only counts toward standing or the
          dividend once claimed.
        </p>
      </div>
      <div class="card">
        <span class="label">Your period Marks ({p.member.name})</span>
        {DOMAINS.map((d) => (
          <div class="row">
            <span class="small sans">
              {d} <span class="muted">({Math.round(p.domainShares[d] * 100)}% share)</span>
            </span>
            <b>{Math.round(p.myCredits[d] ?? 0)}</b>
          </div>
        ))}
        <div class="row">
          <span class="small sans">
            <b>Counted toward dividend</b> <span class="muted">({Math.round(p.diversityCap * 100)}% diversity cap)</span>
          </span>
          <b>{Math.round(p.myCapped)}</b>
        </div>
        <div class="row">
          <span class="small sans">
            <b>Dividends received to date</b>
          </span>
          <b class="ok">${p.myReceived}</b>
        </div>
        {p.myReceived > 0 && (
          <form method="post" action="/contribution/return-dividend" style="display:flex;gap:.5rem;margin-top:.6rem;align-items:center">
            <label class="sr-only" for="contribution-return-amount">Amount to return to treasury, dollars</label>
            <input id="contribution-return-amount" name="amount" type="number" min="1" max={p.myReceived} placeholder="Amount" style="flex:1" />
            <button type="submit">Return to treasury</button>
          </form>
        )}
        <p class="muted small" style="margin-top:.4rem">
          Your dividend is yours — this is a voluntary donation back, not a deduction. Split 40/40/20 like any other
          donation.
        </p>
      </div>
      <div class="card" style="grid-column:1/-1">
        <span class="label">
          The contribution ledger — public and permanent
          {p.filterMemberName && (
            <>
              {" "}
              · showing <b>{p.filterMemberName}</b> only — <a href="/contribution">clear</a>
            </>
          )}
        </span>
        {p.items.length === 0 && <p class="muted">No contributions logged yet.</p>}
        {p.items.map((c) => (
          <div class="row">
            <div style="flex:1;min-width:230px">
              <b>{c.memberName}</b> · {c.domain} · {new Date(c.loggedAt).toDateString()}
              {c.sectorNames.length > 0 && <span class="small muted"> · {c.sectorNames.join(", ")}</span>}
              <div class="small muted">
                "{c.description}"{" "}
                {c.evidenceLink && (
                  <a href={c.evidenceLink} target="_blank" rel="noopener">
                    evidence
                  </a>
                )}
              </div>
              <div style="margin-top:.25rem">
                {!c.verified && (
                  <span class="pill">
                    {c.attestorNames.length}/{c.attestorsRequired} attestations
                  </span>
                )}
                {c.claimStatus === "pending" && <span class="pill">verified — awaiting claim</span>}
                {c.claimStatus === "claimed" && <span class="pill green">claimed</span>}
                {c.claimStatus === "lapsed" && <span class="pill gray">lapsed — unclaimed (on the record, doesn't count)</span>}
                {c.attestorNames.length > 0 && (
                  <span class="small muted"> attested by {c.attestorNames.join(", ")}</span>
                )}
              </div>
            </div>
            {c.canAttest && (
              <form method="post" action={`/contribution/${c.id}/attest`}>
                <button type="submit">Attest</button>
              </form>
            )}
            {c.canClaim && (
              <form method="post" action={`/contribution/${c.id}/claim`}>
                <button class="primary" type="submit">Claim</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  </Layout>
);
