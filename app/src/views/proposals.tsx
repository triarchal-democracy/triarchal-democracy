import { Layout } from "./layout";
import { CLASS_CONFIG, CLASS_LABEL, type ProposalClass } from "../lib/params";
import type { ClausePickerDocument, TargetClauseChip } from "../lib/clauseAmendments";

export interface ProposalListRow {
  id: number;
  title: string;
  cls: ProposalClass;
  byName: string;
  submittedAt: number;
  stage: "deliberation" | "voting" | "record";
  voteOpensAt: number;
  votingClosesAt: number;
  outcome: string | null;
  critical: boolean;
  timeSensitive: boolean;
  sectorNames: string[];
  // Clause-structured amendments — resolved at render time against the
  // current documents, not stored text (see resolveStoredClauseChips).
  targetClauses: TargetClauseChip[];
}

function ProposalRow(pr: ProposalListRow) {
  let stateLine;
  if (pr.stage === "deliberation") stateLine = <span class="pill">Deliberation until {new Date(pr.voteOpensAt).toDateString()}</span>;
  else if (pr.stage === "voting") stateLine = <span class="pill green">Voting until {new Date(pr.votingClosesAt).toDateString()}</span>;
  else stateLine = <span class="pill gray">{pr.outcome}</span>;

  // Only an amendment/entrenched proposal ever had a target clause to
  // begin with — showing "clause not recorded" on every ordinary/treasury
  // proposal that never needed one would read as an error where there
  // isn't one.
  const showClauseRow = pr.cls === "amendment" || pr.cls === "entrenched" || pr.targetClauses.length > 0;

  return (
    <div class="row">
      <div style="flex:1;min-width:230px">
        <a href={`/proposals/${pr.id}`}>
          <b>{pr.title}</b>
        </a>{" "}
        {pr.critical && <span class="pill">critical</span>}{" "}
        {pr.timeSensitive && <span class="pill">time-sensitive</span>}{" "}
        <span class="small muted">
          · {CLASS_LABEL[pr.cls]} · by {pr.byName} · {new Date(pr.submittedAt).toDateString()}
          {pr.sectorNames.length > 0 && <> · {pr.sectorNames.join(", ")}</>}
        </span>
        {showClauseRow && (
          <div class="small muted" style="margin-top:.2rem">
            {pr.targetClauses.length > 0 ? (
              pr.targetClauses.map((chip) => (
                <a class="pill gray" href={chip.href} style="margin:0 .3rem .2rem 0;text-decoration:none;display:inline-block">
                  {chip.label}
                </a>
              ))
            ) : (
              <span>clause not recorded</span>
            )}
          </div>
        )}
        <div style="margin-top:.3rem">{stateLine}</div>
      </div>
      <a class="btnlink" href={`/proposals/${pr.id}`}>
        View &amp; discuss →
      </a>
    </div>
  );
}

export const ProposalsPage = (p: {
  member: { id: number; name: string } | null;
  adminDebug: boolean; communityName: string;
  proposals: ProposalListRow[];
  ranked: ProposalListRow[];
  sectors: { id: number; name: string }[];
  allMembers: { id: number; name: string }[];
  // Prompt27_SeatPlaceholderValidation.md — set when a submission was just
  // rejected (e.g. a Position-decision target that isn't a real member of
  // this community). Same "re-render the form with an error" pattern as
  // RegisterPage/VerifyPhonePage.
  error?: string;
  // Phase 2 stage 6 — the Defaults page's "Propose a change" link pre-fills
  // these three existing fields via query params, the same convention
  // ContributionPage's `prefill` already uses. No new field and no schema
  // change: there is nowhere to submit a target clause id, so the
  // entrenched-threshold note lives on the Defaults page itself, not here.
  prefill?: { title?: string; why?: string; cls?: string; targetClauseIds?: string[] };
  // Clause-structured amendments — every clause of every in-scope document
  // (Charter, plus any document containing an entrenched clause), grouped
  // by document then by the document's own section/Article heading. Static
  // for the whole community (derived from documents.ts, not live DB state).
  clausePicker: ClausePickerDocument[];
}) => {
  // renderProposalsPage always passes a `prefill` object (it reads three
  // query params that are usually all absent) — checking the object's
  // truthiness alone would keep the details panel open on every visit.
  const hasPrefill = !!(p.prefill?.title || p.prefill?.why || p.prefill?.cls || (p.prefill?.targetClauseIds && p.prefill.targetClauseIds.length > 0));
  return (
  <Layout title="Proposals" tab="proposals" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Proposals</h2>
    <div class="grid cols2">
      {p.member && p.ranked.length > 0 && (
        <div class="card" style="grid-column:1/-1">
          <span class="label">Recommended for you — by sectors you follow &amp; have contributed to (Rules of Procedure 4.4)</span>
          {p.ranked.map((pr) => ProposalRow(pr))}
        </div>
      )}

      <div class="card" style="grid-column:1/-1">
        <span class="label">All proposals</span>
        {p.proposals.length === 0 && <p class="muted">No proposals yet.</p>}
        {p.proposals.map((pr) => ProposalRow(pr))}
      </div>

      {p.member ? (
        <div class="card" style="grid-column:1/-1">
          <details open={p.error || hasPrefill ? true : undefined}>
            <summary class="label" style="cursor:pointer;margin-bottom:0">
              Submit a proposal (Right VIII — never gatekept by content)
            </summary>
            {p.error && <p class="error" style="margin-top:.6rem">{p.error}</p>}
            <form method="post" action="/proposals" class="formgrid" style="margin-top:.8rem">
              <label class="sr-only" for="proposal-title">Title</label>
              <input id="proposal-title" name="title" placeholder="Title — what does it change?" value={p.prefill?.title ?? ""} required />
              <label class="sr-only" for="proposal-why">Why</label>
              <textarea id="proposal-why" name="why" rows={2} placeholder="Why?" required>{p.prefill?.why ?? ""}</textarea>
              <label class="sr-only" for="proposal-cost">Cost, if anything</label>
              <input id="proposal-cost" name="cost" placeholder="What does it cost, if anything?" />
              <label class="sr-only" for="proposal-reversal">How it's reversed if it proves wrong</label>
              <textarea id="proposal-reversal" name="reversal" rows={2} placeholder="How is it reversed if it proves wrong?"></textarea>
              <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
                <label class="sr-only" for="proposal-cls">Proposal class</label>
                <select id="proposal-cls" name="cls">
                  {(Object.keys(CLASS_CONFIG) as ProposalClass[]).map((c) => (
                    <option value={c} selected={c === p.prefill?.cls ? true : undefined}>{CLASS_LABEL[c]}</option>
                  ))}
                </select>
                <label class="sr-only" for="proposal-amount">Amount, dollars — treasury allocations and reserve spending only</label>
                <input id="proposal-amount" name="amount" type="number" min="0" placeholder="Amount ($, treasury/reserve only)" style="width:16rem" />
              </div>
              <div class="small muted" style="margin-top:.2rem">
                Position decision only (Charter 4.3) — recognize or remove a Delegate for a sector:
              </div>
              <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
                <label class="sr-only" for="proposal-target-member">Target member</label>
                <select id="proposal-target-member" name="targetMemberId">
                  <option value="">— target member —</option>
                  {p.allMembers.map((m) => (
                    <option value={m.id}>{m.name}</option>
                  ))}
                </select>
                <label class="sr-only" for="proposal-target-sector">Target sector</label>
                <select id="proposal-target-sector" name="targetSectorId">
                  <option value="">— sector —</option>
                  {p.sectors.map((s) => (
                    <option value={s.id}>{s.name}</option>
                  ))}
                </select>
                <label class="sr-only" for="proposal-position-action">Position action</label>
                <select id="proposal-position-action" name="positionAction">
                  <option value="">— action —</option>
                  <option value="recognize">Recognize as Delegate</option>
                  <option value="remove">Remove Delegate recognition</option>
                </select>
              </div>
              <div class="small muted" style="margin-top:.4rem;max-width:40rem">
                <b>Target clause(s)</b> — required only for a Charter or Entrenched-amendment proposal; leave
                everything unchecked for any other class. Naming an entrenched clause classes the whole
                proposal Entrenched automatically — you cannot choose a lower class once you do.
              </div>
              {p.clausePicker.map((doc) => {
                const hasChecked = doc.groups.some((g) => g.clauses.some((c) => p.prefill?.targetClauseIds?.includes(c.key)));
                return (
                  <details open={hasChecked ? true : undefined} style="margin-top:.3rem">
                    <summary class="small sans" style="cursor:pointer;font-weight:600">
                      {doc.documentTitle}
                    </summary>
                    {doc.groups.map((group) => (
                      <div style="margin:.4rem 0 .4rem 1rem">
                        <div class="small muted">{group.heading}</div>
                        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.2rem">
                          {group.clauses.map((clause) => (
                            <label class="small sans" style="display:flex;gap:.3rem;align-items:center">
                              <input type="checkbox" name="targetClauseIds" value={clause.key} checked={p.prefill?.targetClauseIds?.includes(clause.key) ? true : undefined} />
                              {clause.id}
                              {clause.isEntrenched && <span class="pill" style="margin-left:.2rem">entrenched</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </details>
                );
              })}
              <div class="small muted" style="margin-top:.2rem">Sector tags (optional, any number):</div>
              <div style="display:flex;gap:.8rem;flex-wrap:wrap">
                {p.sectors.map((s) => (
                  <label class="small sans" style="display:flex;gap:.3rem;align-items:center">
                    <input type="checkbox" name="sectorId" value={s.id} /> {s.name}
                  </label>
                ))}
              </div>
              <button class="primary" type="submit" style="justify-self:start">
                Submit
              </button>
            </form>
          </details>
        </div>
      ) : (
        <div class="card" style="grid-column:1/-1">
          <p class="muted small">
            <a href="/login">Sign in</a> to submit proposals, vote, or delegate. Reading and low-commitment
            deliberation are open to everyone — Rules of Procedure 2.4.
          </p>
        </div>
      )}
    </div>
  </Layout>
  );
};
