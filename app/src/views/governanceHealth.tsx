import { Layout } from "./layout";
import type { GovernanceHealth } from "../lib/community";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export const GovernanceHealthPage = (p: {
  member: { id: number; name: string } | null;
  adminDebug: boolean;
  communityName: string;
  health: GovernanceHealth;
  // Prompt32 Part A — whether Contribution Code 2.1's domain issuance cap
  // is actually enforced right now, or reporting-only. The card below
  // always renders (reporting is always-on); this only changes its label.
  domainIssuanceCapEnabled: boolean;
  // Charter 9.3's Sustainability Criterion — params.criteria.phase2.maxDelegateShare.
  maxDelegateShare: number;
  // Phase 2 stage 6 — Charter 2.4a's "accounted for" list and what it
  // doesn't yet cover: Government Adoption Compact defaults with no
  // schedule-of-defaults clause, and defaultsRegistry.ts entries with no
  // CharterParams field behind them. A plain list, not a warning — most of
  // these are implemented as code constants, just not as a per-community,
  // ordinary-proposal-amendable parameter yet.
  unaccountedDefaults: string[];
}) => {
  const h = p.health;
  return (
    <Layout title="Governance health" tab="governance-health" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <p class="small muted" style="margin-bottom:.6rem">
        <a href="/">← Dashboard</a>
      </p>
      <h2 class="pagetitle">Governance-health dashboard</h2>
      <p class="muted small" style="margin-bottom:1rem;max-width:52rem">
        Public, read-only, and computed live from the permanent record — Rules of Procedure 7. Nothing here
        automatically restricts or blocks anything; it exists so the community can see its own structure clearly.
        The methodology is a parameter, not a principle: community-amendable by ordinary proposal, the same rule
        Contribution Code 2.1 applies to domain weighting. Computed {new Date(h.computedAt).toLocaleString()}.
      </p>

      <div class="grid cols2">
        <div class="card">
          <span class="label">Delegation concentration</span>
          <div class="statrow">
            <div>
              <div class="stat">{pct(h.delegation.largestRecipientShare)}</div>
              <div class="muted small">largest recipient's share</div>
            </div>
            <div>
              <div class="stat">{pct(h.delegation.top5Share)}</div>
              <div class="muted small">top-5 share</div>
            </div>
            <div>
              <div class="stat">{pct(h.delegation.top10Share)}</div>
              <div class="muted small">top-10 share</div>
            </div>
          </div>
          <p class="muted small" style="margin-top:.6rem">
            {h.delegation.totalLiveDelegations} live delegations across the community · {pct(h.delegation.pctMembersWithNoOutgoingDelegation)} of
            Members hold no outgoing delegation at all (voting directly on everything). Charter 9.3's own Sustainability
            Criterion caps any one Member at {pct(p.maxDelegateShare)} of all delegated votes.
          </p>
        </div>

        <div class="card">
          <span class="label">Contribution distribution</span>
          <div class="statrow">
            <div>
              <div class="stat">{pct(h.contribution.top5CreditShare)}</div>
              <div class="muted small">top-5 share of verified Marks</div>
            </div>
            <div>
              <div class="stat">{pct(h.contribution.top5AttestorShare)}</div>
              <div class="muted small">top-5 share of attestations made</div>
            </div>
          </div>
          <p class="muted small" style="margin-top:.6rem;margin-bottom:.3rem">Domain shares, observed vs. Contribution Code 2 target:</p>
          {(["Deliberation", "Craft", "Stewardship", "Attestation"] as const).map((d) => (
            <div class="row" style="border:none;padding:.15rem 0">
              <span class="small sans">{d}</span>
              <span class="small sans">{pct(h.contribution.domainShares[d])}</span>
            </div>
          ))}
        </div>

        <div class="card" style="grid-column:1/-1">
          <span class="label">Domain issuance pool — Contribution Code 2.1</span>
          <p class="muted small" style="margin-bottom:.6rem">
            {p.domainIssuanceCapEnabled
              ? "Enforcement is ON — an over-cap domain's claimed Marks below were already scaled down to its cap before this period's dividend/standing figures."
              : "Reporting only — this shows what a hard cap would currently do for the period in progress; nothing below has actually reduced anyone's Marks. Enforcement (domainIssuanceCapEnabled) is off."}
          </p>
          {(["Deliberation", "Craft", "Stewardship", "Attestation"] as const).map((d) => {
            const r = h.contribution.domainIssuanceCap;
            const over = r.overage[d] > 0;
            return (
              <div class="row" style="border:none;padding:.15rem 0">
                <span class="small sans">{d}</span>
                <span class="small sans">
                  {r.raw[d].toFixed(1)} raw · cap {r.cap[d].toFixed(1)} ·{" "}
                  {over ? <span class="warn">OVER by {r.overage[d].toFixed(1)}</span> : <span>residue {r.residue[d].toFixed(1)}</span>}
                </span>
              </div>
            );
          })}
          <p class="muted small" style="margin-top:.6rem">
            Per 2.1, unused headroom "rolls to the treasury" — logged each period as a public Record entry, never
            redistributed to other domains within the period. Raw claimed Marks for the period so far, before any
            cap; cap is each domain's target share (Contribution Code §2) of the period's total raw issuance.
          </p>
        </div>

        <div class="card">
          <span class="label">Institutional concentration</span>
          <div class="statrow">
            <div>
              <div class="stat">{h.institutional.distinctHolders}</div>
              <div class="muted small">distinct people holding a Position or Nominee role</div>
            </div>
            <div>
              <div class="stat">{h.institutional.totalSeats}</div>
              <div class="muted small">total active seats</div>
            </div>
            <div>
              <div class="stat">{pct(h.institutional.concentrationShare)}</div>
              <div class="muted small">concentration (0% = every seat a different person)</div>
            </div>
          </div>
          <p class="muted small" style="margin-top:.6rem">
            {h.institutional.disputePanelPoolSize} distinct Members have ever been drawn to a Dispute Panel — the
            volunteer pool Dispute Procedure Code 2.1 draws from. This build has no separate moderator role to track.
          </p>
        </div>

        <div class="card">
          <span class="label">Pluralism indicators</span>
          <div class="statrow">
            <div>
              <div class="stat">{h.pluralism.distinctActiveLeaders}</div>
              <div class="muted small">distinct Stewards/Delegates, any sector</div>
            </div>
            <div>
              <div class="stat">{h.pluralism.sectorsWithLeadership}</div>
              <div class="muted small">sectors with any recognized leadership</div>
            </div>
            <div>
              <div class="stat">{pct(h.pluralism.top5ProposalAuthorShare)}</div>
              <div class="muted small">top-5 share of proposal authorship</div>
            </div>
          </div>
          <p class="muted small" style="margin-top:.6rem">
            "Independent active leadership networks" is approximated here as distinct people currently holding
            recognized standing — a lower bound, not a social-graph analysis.
          </p>
        </div>

        <div class="card">
          <span class="label">Resilience</span>
          <div class="statrow">
            <div>
              <div class="stat">{h.resilience.civicStewardCount}</div>
              <div class="muted small">people the community's leadership bench could currently draw from</div>
            </div>
            <div>
              <div class="stat">{h.resilience.founderProposalShareInWindow === null ? "—" : pct(h.resilience.founderProposalShareInWindow)}</div>
              <div class="muted small">founder-authored share of proposals completing the full lifecycle (trailing window)</div>
            </div>
          </div>
          <p class="muted small" style="margin-top:.6rem">
            {h.resilience.founderProposalShareInWindow === null
              ? h.resilience.founderRecorded
                ? "No proposals have completed the full lifecycle in the trailing window yet (Charter 9.3). The founder's identity itself is never shown publicly; only this share is."
                : "Not computed — founder not recorded (Charter 9.3). The founder's identity itself is never shown publicly; only this share is."
              : "Charter 9.3's founder-independence figure — the founder's identity itself is never shown publicly; only this share is."}
          </p>
        </div>

        <div class="card" style="grid-column:1/-1">
          <span class="label">Unaccounted defaults — Charter 2.4a</span>
          <p class="muted small" style="margin-bottom:.5rem">
            Every community-set default should be accounted for as derived or chosen, at its clause or in that
            document's schedule of defaults (<a href="/documents/defaults">see the full accounting</a>). These
            aren't yet, either because the governing document has no schedule of defaults to point to, or because
            nothing in <code>params.ts</code> exposes them as a per-community, amendable field.
          </p>
          {p.unaccountedDefaults.length === 0 ? (
            <p class="muted small">None currently.</p>
          ) : (
            <ul style="margin:0 0 0 1.2rem">
              {p.unaccountedDefaults.map((u) => (
                <li class="small muted">{u}</li>
              ))}
            </ul>
          )}
        </div>

        <div class="card">
          <span class="label">Delegated-Authority Mechanism metrics</span>
          <p class="muted small">
            Not applicable — no government has ratified a Delegated-Authority Mechanism agreement yet (the
            Delegated-Authority Mechanism of the Government Adoption Compact §4 — see CLAUDE.md's Naming section for
            the full renaming history). Once one does, this section reports delegated-authority-exercised and
            implementation/override rates under Compact 4.7 and 4.8's fidelity metric.
          </p>
        </div>
      </div>
    </Layout>
  );
};
