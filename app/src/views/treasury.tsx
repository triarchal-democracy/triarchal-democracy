import { Layout } from "./layout";
import { ClauseChip } from "./clauseChip";

export interface TreasuryProps {
  member: { id: number; name: string } | null;
  adminDebug: boolean; communityName: string;
  ops: number;
  dividend: number;
  reserve: number;
  periodDays: number;
  dividendCapMultiple: number;
  dividendCapMemberCount: number;
  foundationPoolShare: number;
  dividendsPaid: number;
  nextDividendAt: number;
  ledger: { day: string; text: string }[];
  reserveMonthsCovered: number;
}

export const TreasuryPage = (p: TreasuryProps) => (
  <Layout title="Treasury" tab="treasury" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Treasury — the ledger is the audit</h2>
    <div class="grid cols2">
      <div class="card">
        <span class="label">Balances</span>
        <div class="row">
          <span>Operations</span>
          <b>${p.ops}</b>
        </div>
        <div class="row">
          <span>
            Dividend pool <span class="muted small">(community money only)</span>
          </span>
          <b>${p.dividend}</b>
        </div>
        <div class="row">
          <span>
            Reserve <span class="muted small">(target: {p.reserveMonthsCovered} months ops)</span> <ClauseChip clauseKey="treasury-code#2.1" />
          </span>
          <b>${p.reserve}</b>
        </div>
        {p.member ? (
          <form method="post" action="/treasury/donate" class="formgrid" style="grid-template-columns:1fr 1fr auto;margin-top:.8rem;align-items:end">
            <div>
              <label class="sr-only" for="treasury-donate-amount">Donation amount, dollars</label>
              <input id="treasury-donate-amount" name="amount" type="number" placeholder="Amount" min="1" required />
            </div>
            <div>
              <label class="sr-only" for="treasury-donate-restriction">Purpose restriction</label>
              <select id="treasury-donate-restriction" name="restriction">
                <option value="">Standard split (40/40/20)</option>
                <option value="institutional">Institutional contribution — 100% to Operations (Treasury Code 1.4)</option>
                <option value="reserve">Restrict to Reserve — 100%</option>
              </select>
            </div>
            <button class="primary" type="submit">
              Donate
            </button>
          </form>
        ) : (
          <p class="small muted" style="margin-top:.8rem">
            <a href="/register">Join {p.communityName}</a> to donate.
          </p>
        )}
        <p class="muted small" style="margin-top:.5rem">
          Per Treasury Code §1.4, institutional money — including the Triarc's own — reaches operations
          only, never the dividends. Choosing "Institutional contribution" or "Restrict to Reserve" above routes
          100% of the gift to that purpose instead of the standard split; leaving it as "Standard split" is
          unchanged, ordinary donation behavior. The dividends are the community's own money.
        </p>
      </div>
      <div class="card">
        <span class="label">Dividend mechanics — two tiers, every cycle</span>
        <p class="small">
          Every {p.periodDays} days, <b>{Math.round(p.foundationPoolShare * 100)}%</b> of the dividend pool is set aside
          first as the <b>Foundation Dividend</b> and divided equally among every verified Member, unconditionally
          (Treasury Code 5.4). It is a share of the pool rather than a fixed amount, so it scales with the community at
          every size and never has to be scaled down. Neither tier distributes until the deployment activates — 30
          verified Members with every Delegate Position filled (Treasury Code 5.1) — and the pool may be very small
          after that. <ClauseChip clauseKey="treasury-code#5.1" /> <ClauseChip clauseKey="charter#5.4" />
        </p>
        <p class="small">
          What's left funds the <b>Civic Dividend</b>, pro-rata to period Marks, capped at{" "}
          {p.dividendCapMultiple}× the equal share per member — {Math.round(Math.min(1, p.dividendCapMultiple / Math.max(1, p.dividendCapMemberCount)) * 100)}% at {p.dividendCapMemberCount} member(s), tightening as the community grows (§4). <ClauseChip clauseKey="charter#5.3" /> Whatever the cap holds back, and any rounding,
          joins the next cycle's Foundation Dividend and is divided equally (Treasury Code 4.3, 5.5); it never raises the
          next cycle's cap, and it never piles up unpaid. <ClauseChip clauseKey="treasury-code#4.3" /> Marks that lapse unclaimed create no residue at all. Distributions never
          pause by discretion — only by ratified proposal. Members may also return a dividend they've already
          received, from the Contribution page.
        </p>
        <p class="small">
          Every verified Member is entitled to the dividend, and the equal share is the pool divided by the number of verified Members
          (Treasury Code 9.1–9.2). Governance rights and dividend entitlement are not conditioned on each other (9.3).
        </p>
        <p class="small muted">
          Distributions completed: <b>{p.dividendsPaid}</b> · next at {new Date(p.nextDividendAt).toDateString()}.
        </p>
      </div>
      <div class="card" style="grid-column:1/-1">
        <span class="label">Public ledger</span>
        <div class="log">
          {p.ledger.length === 0 && <p class="muted">No movements yet.</p>}
          {p.ledger.map((l) => (
            <div class="row">
              <span>{l.day}</span>
              <span style="flex:1;text-align:right">{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Layout>
);
