import { Layout, critBar } from "./layout";
import type { FoundingProgress, SustainabilityProgress } from "../lib/mechanics";
import type { CharterParams } from "../lib/params";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// A small yes/not-yet/not-computed pill — the third state Phase I's own
// boolean rows never needed, since nothing in Phase I is ever uncomputable.
function statusPill(status: "met" | "not-met" | "not-computed", notComputedLabel?: string) {
  if (status === "met") return <span class="pill green">yes</span>;
  if (status === "not-met") return <span class="pill gray">not yet</span>;
  return <span class="pill gray">{notComputedLabel ?? "not computed"}</span>;
}

export interface DashboardProps {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  progress: FoundingProgress;
  // Cached once/day by tick() (Charter 9.3, decision 6) — null only before
  // the very first computation has ever run on this community.
  sustainability: { computedAt: number; progress: SustainabilityProgress } | null;
  criteria: CharterParams["criteria"];
  treasury: { ops: number; dividend: number; reserve: number };
  nextDividendAt: number;
  dividendsPaid: number;
  rankedProposals: { id: number; title: string; score: number }[];
  rankedOpportunities: { id: number; title: string; score: number }[];
  // Triarc Membership Code 2.1 (Prompt25_PathA_MembershipEnforcement.md) —
  // null when this deployment doesn't run the phone-verification floor at
  // all (the variable is unset). Calm, factual — no manufactured urgency (Rules of
  // Procedure 4.3), same discipline as the Contribution Mark claiming banner.
  phoneVerificationStatus: "verified" | "unverified" | null;
}

export const DashboardPage = (p: DashboardProps) => {
  const c1 = p.criteria.phase1;
  const c2 = p.criteria.phase2;
  return (
    <Layout title="Dashboard" tab="dashboard" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <h2 class="pagetitle">A community governing itself by the model it proposes</h2>
      {p.phoneVerificationStatus === "unverified" && (
        <div class="card" style="margin-bottom:1rem">
          <p class="small">
            Your account is registered but not yet a full Member (Triarc Membership Code 2.1) — reading, deliberating,
            and logging contributions all work already. Voting and delegation open once your phone is verified.{" "}
            <a href="/verify-phone">Verify your phone →</a>
          </p>
        </div>
      )}
      <div class="grid cols2">
        {(p.rankedProposals.length > 0 || p.rankedOpportunities.length > 0) && (
          <div class="card" style="grid-column:1/-1">
            <span class="label">For you — by sectors you follow &amp; have contributed to (Rules of Procedure 4.4)</span>
            {p.rankedProposals.map((r) => (
              <div class="row">
                <a href={`/proposals/${r.id}`}>{r.title}</a>
                <span class="small muted">open for voting</span>
              </div>
            ))}
            {p.rankedOpportunities.map((r) => (
              <div class="row">
                <a href={`/opportunities#o${r.id}`}>{r.title}</a>
                <span class="small muted">opportunity</span>
              </div>
            ))}
            <p class="muted small" style="margin-top:.4rem">
              This is additive, never a replacement — the complete list of everything open is always on{" "}
              <a href="/proposals">Proposals</a> and <a href="/opportunities">Opportunities</a>.
            </p>
          </div>
        )}
        <div class="card">
          <span class="label">The community</span>
          <div class="statrow">
            <div>
              <div class="stat">{p.progress.members}</div>
              <div class="muted small">verified members</div>
            </div>
            <div>
              <div class="stat">{p.progress.active}</div>
              <div class="muted small">active (90-day)</div>
            </div>
            <div>
              <div class="stat">{p.progress.liveDelegations}</div>
              <div class="muted small">live delegations</div>
            </div>
            <div>
              <div class="stat">{p.progress.proposalsCompleted}</div>
              <div class="muted small">decisions on record</div>
            </div>
          </div>
        </div>
        <div class="card">
          <span class="label">Foundation Criteria — Phase I (charter 9.2)</span>
          {critBar("Verified members", p.progress.members, c1.members)}
          {critBar("Active members", p.progress.active, c1.active)}
          {critBar("Proposals through full lifecycle", p.progress.proposalsCompleted, c1.proposals)}
          {critBar("Active delegations", p.progress.liveDelegations, c1.delegations)}
          {critBar("Delegations revoked or lapsed-and-renewed", p.progress.delegationsRenewedOrRevoked, c1.delegationsRenewedOrRevoked)}
          <div class="row" style="border:none;padding:.1rem 0">
            <span class="small sans">Minimum participation met in a majority of votes (trailing {c1.minParticipationWindowDays}d)</span>
            <span class="small sans">
              {p.progress.majorityMinParticipationOver90d ? <span class="pill green">yes</span> : <span class="pill gray">not yet</span>}
            </span>
          </div>
          <div class="row" style="border:none;padding:.1rem 0">
            <span class="small sans">Contributions verified in all four domains</span>
            <span class="small sans">
              {p.progress.allDomainsHaveVerifiedContribution ? <span class="pill green">yes</span> : <span class="pill gray">not yet</span>}
            </span>
          </div>
          <p class="muted small" style="margin-top:.5rem">
            Transitions compute automatically from the record — the founder plays no role in declaring them met, and
            the community can eject founding authority at any time (charter 9.5).
          </p>
        </div>
        <div class="card" style="grid-column:1/-1">
          <span class="label">Sustainability Criteria — Phase II (charter 9.3)</span>
          {p.sustainability === null ? (
            <p class="muted small">Not computed yet — the first daily computation runs automatically on the next page load.</p>
          ) : (
            (() => {
              const sp = p.sustainability.progress;
              return (
                <>
                  {!sp.hasFullWindowHistory && (
                    <p class="muted small" style="margin-bottom:.6rem">
                      The window needs {sp.windowDays} days of history; this community has {Math.max(0, sp.historyDays)}.
                      Current values below are real; "met/not yet" judgments that depend on the full window are withheld
                      until then.
                    </p>
                  )}
                  <p class="muted small" style="margin-bottom:.4rem">As of {new Date(p.sustainability.computedAt).toDateString()}.</p>

                  <p class="small sans" style="margin-top:.6rem;margin-bottom:.2rem"><b>1. Membership</b></p>
                  {critBar("Verified members", sp.members, c2.members)}
                  {critBar("Active members", sp.active, c2.active)}
                  <div class="row" style="border:none;padding:.1rem 0">
                    <span class="small sans">Non-declining across the window (net, not day-by-day)</span>
                    <span class="small sans">{statusPill(sp.membershipNonDeclining ? "met" : "not-met")}</span>
                  </div>
                  <div class="row" style="border:none;padding:.1rem 0">
                    <span class="small sans">Both floors held at every daily sample in the window</span>
                    <span class="small sans">{statusPill(sp.membershipFloorHeldEveryDay ? "met" : "not-met")}</span>
                  </div>

                  <p class="small sans" style="margin-top:.8rem;margin-bottom:.2rem"><b>2. Governance cadence</b></p>
                  {critBar("Proposals/month (trailing window)", Math.round(sp.proposalsPerMonth * 10) / 10, c2.proposalsPerMonth)}
                  <div class="row" style="border:none;padding:.1rem 0">
                    <span class="small sans">
                      Minimum participation met in ≥{Math.round(c2.participationRate * 100)}% of votes closing in the window
                      {sp.participationSampleCount > 0 ? ` (${pct(sp.participationRate)} of ${sp.participationSampleCount})` : " (none closed in window yet)"}
                    </span>
                    <span class="small sans">{statusPill(sp.participationSampleCount > 0 && sp.participationRate >= c2.participationRate ? "met" : "not-met")}</span>
                  </div>

                  <p class="small sans" style="margin-top:.8rem;margin-bottom:.2rem"><b>3. Delegation health</b></p>
                  <div class="row" style="border:none;padding:.1rem 0">
                    <span class="small sans">No Member over {Math.round(c2.maxDelegateShare * 100)}% of delegated votes, at every daily sample</span>
                    <span class="small sans">
                      {pct(sp.currentMaxDelegateShare)} now · {statusPill(sp.maxDelegateShareHeldEveryDay ? "met" : "not-met")}
                    </span>
                  </div>
                  <div class="row" style="border:none;padding:.1rem 0">
                    <span class="small sans">Renewals functioning (at least one lapsed/revoked delegation renewed in the window)</span>
                    <span class="small sans">{statusPill(sp.renewalsFunctioning ? "met" : "not-met")}</span>
                  </div>

                  <p class="small sans" style="margin-top:.8rem;margin-bottom:.2rem"><b>4. Treasury self-sustaining</b></p>
                  {critBar("Consecutive on-time Civic Dividend runs", sp.consecutiveOnTimeDividendRunsCount, c2.consecutiveDividendRuns)}
                  <div class="row" style="border:none;padding:.1rem 0">
                    <span class="small sans">Reserve covers ≥{c2.reserveMonthsCovered} months at the current operating rate</span>
                    <span class="small sans">{statusPill("not-computed", "not computed — no operating expenditure has ever been recorded")}</span>
                  </div>

                  <p class="small sans" style="margin-top:.8rem;margin-bottom:.2rem"><b>5. Dispute system exercised</b></p>
                  {critBar("Panels convened and resolved within their windows (trailing window)", sp.disputePanelsResolvedInWindow, c2.disputePanels)}

                  <p class="small sans" style="margin-top:.8rem;margin-bottom:.2rem"><b>6. Leadership depth</b></p>
                  {critBar("Civic Stewards", sp.currentStewardCount, c2.stewardsMin)}
                  {critBar("Sectors with at least one Steward", sp.currentSectorsWithStewardship, c2.stewardSectorsMin)}
                  <div class="row" style="border:none;padding:.1rem 0">
                    <span class="small sans">Both held at every daily sample in the window</span>
                    <span class="small sans">{statusPill(sp.stewardDepthHeldEveryDay ? "met" : "not-met")}</span>
                  </div>

                  <p class="small sans" style="margin-top:.8rem;margin-bottom:.2rem"><b>7. Runs without its founder</b></p>
                  <div class="row" style="border:none;padding:.1rem 0">
                    <span class="small sans">Founder-authored proposals under {Math.round(c2.maxFounderProposalShare * 100)}% of those completed in the window</span>
                    <span class="small sans">
                      {sp.founderProposalShareInWindow === null
                        ? sp.founderId === null
                          ? statusPill("not-computed", "not computed — founder not recorded")
                          : statusPill("not-computed", "no proposals have completed in the window yet")
                        : <>{pct(sp.founderProposalShareInWindow)} · {statusPill(sp.founderProposalShareInWindow < c2.maxFounderProposalShare ? "met" : "not-met")}</>}
                    </span>
                  </div>

                  <p class="muted small" style="margin-top:.6rem">
                    Measurement only — nothing here closes Phase II automatically, whatever the rows above show.
                  </p>
                </>
              );
            })()
          )}
        </div>
        <div class="card">
          <span class="label">Treasury at a glance</span>
          <div class="statrow">
            <div>
              <div class="stat">${p.treasury.ops}</div>
              <div class="muted small">operations</div>
            </div>
            <div>
              <div class="stat">${p.treasury.dividend}</div>
              <div class="muted small">dividend pool</div>
            </div>
            <div>
              <div class="stat">${p.treasury.reserve}</div>
              <div class="muted small">reserve</div>
            </div>
          </div>
          <p class="muted small" style="margin-top:.5rem">
            Next dividend distribution (Foundation + Civic): {new Date(p.nextDividendAt).toDateString()} · distributions so far: {p.dividendsPaid}
          </p>
        </div>
        <div class="card">
          <span class="label">How to explore</span>
          <p class="small">
            Submit a proposal, log a contribution and get it attested, delegate your vote, follow a sector, post an
            opportunity — everything you do lands on the permanent public record below.
          </p>
        </div>
      </div>
    </Layout>
  );
};
