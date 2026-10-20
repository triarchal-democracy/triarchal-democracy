import { Layout } from "./layout";
import { CLASS_LABEL, type ProposalClass } from "../lib/params";
import type { TargetClauseChip } from "../lib/clauseAmendments";
import { ClauseChip } from "./clauseChip";

export interface CommentRow {
  id: number;
  memberName: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  body: string;
  postedAt: number;
  hidden?: boolean;
  modHref?: string;
}

export interface MinorityReportRow {
  id: number;
  memberName: string;
  body: string;
  filedAt: number;
}

export interface ProposalDetail {
  id: number;
  title: string;
  why: string;
  cost: string | null;
  amount: number | null;
  reversal: string | null;
  cls: ProposalClass;
  byName: string;
  submittedAt: number;
  stage: "deliberation" | "voting" | "record";
  voteOpensAt: number;
  votingClosesAt: number;
  outcome: string | null;
  liveTally?: { yes: number; no: number; participating: number };
  myVote?: boolean;
  critical: boolean;
  sectorNames: string[];
  targetMemberName: string | null;
  targetSectorName: string | null;
  positionAction: "recognize" | "remove" | "confirm" | "concentration" | null;
  jointNotice?: string | null;
  petitionSignatures: number;
  petitionNeeded: number;
  iSigned: boolean;
  timeSensitive: boolean;
  timeSensitiveDeadlineNote: string | null;
  tsPetitionSignatures: number;
  tsPetitionNeeded: number;
  iSignedTimeSensitive: boolean;
  // Rules of Procedure 3.3 — the published resolution: for each Member whose
  // vote counted, whether it was cast directly or arrived through delegation
  // and from whom. Empty until the vote closes.
  resolution: { memberName: string; via: string | null; value: boolean }[];
  // Clause-structured amendments — resolved at render time against the
  // current documents, not stored text (see resolveStoredClauseChips).
  targetClauses: TargetClauseChip[];
}

export const ProposalDetailPage = (p: {
  member: { id: number; name: string } | null;
  adminDebug: boolean; communityName: string;
  proposal: ProposalDetail;
  comments: CommentRow[];
  minorityReports: MinorityReportRow[];
  iFiledMinorityReport: boolean;
  // Triarc Membership Code 2.1 (Prompt25_PathA_MembershipEnforcement.md) —
  // true when this Member hasn't verified their phone yet, so voting is
  // blocked (the Triarc only; index.tsx's GET handler computes this fresh
  // rather than relying on a redirect flag, so it's shown on any visit, not
  // just right after a rejected attempt).
  phoneVerificationBlocked?: boolean;
  // Rules of Procedure 1.6/1.3a — params.ts's PETITION_SIGNATURE_SHARE,
  // as a whole-number percentage ready to interpolate into copy.
  petitionSharePct: number;
}) => {
  const pr = p.proposal;
  // Stage B polish — never show the same clause chip twice. The class-rule
  // chip (Charter 8.1 for amendment, 8.2 for Entrenched) is dropped from
  // the class line exactly when that same clause is already one of the
  // proposal's own targeted clauses, shown once in the targeted-clauses
  // area instead. Rules of Procedure 1.3 always stays on the class line —
  // it's never a targetable clause, so it can never collide.
  const classRuleClauseKey = pr.cls === "amendment" ? "charter#8.1" : pr.cls === "entrenched" ? "charter#8.2" : null;
  const classRuleAlreadyTargeted = classRuleClauseKey !== null && pr.targetClauses.some((c) => c.key === classRuleClauseKey);
  let stateLine;
  if (pr.stage === "deliberation")
    stateLine = <span class="pill">Deliberation until {new Date(pr.voteOpensAt).toDateString()}</span>;
  else if (pr.stage === "voting")
    stateLine = (
      <>
        <span class="pill green">Voting until {new Date(pr.votingClosesAt).toDateString()}</span>{" "}
        <span class="small muted">
          {pr.liveTally?.yes ?? 0} yes · {pr.liveTally?.no ?? 0} no · {pr.liveTally?.participating ?? 0} participating
        </span>
      </>
    );
  else stateLine = <span class="pill gray">{pr.outcome}</span>;

  return (
    <Layout title={pr.title} tab="proposals" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <p class="small muted" style="margin-bottom:.6rem">
        <a href="/proposals">← All proposals</a>
      </p>
      <h2 class="pagetitle">{pr.title}</h2>
      <div class="grid cols2">
        <div class="card" style="grid-column:1/-1">
          <span class="small muted">
            {CLASS_LABEL[pr.cls]} <ClauseChip clauseKey="rules-of-procedure#1.3" />{" "}
            {classRuleClauseKey && !classRuleAlreadyTargeted && <ClauseChip clauseKey={classRuleClauseKey} />}
            {pr.critical && <span class="pill">critical</span>}{" "}
            {pr.timeSensitive && <span class="pill">time-sensitive</span>} · by {pr.byName} · {new Date(pr.submittedAt).toDateString()}
            {pr.sectorNames.length > 0 && <> · {pr.sectorNames.join(", ")}</>}
          </span>
          {(pr.cls === "amendment" || pr.cls === "entrenched" || pr.targetClauses.length > 0) && (
            <div class="small muted" style="margin-top:.4rem">
              <b>Target clause(s):</b>{" "}
              {pr.targetClauses.length > 0 ? (
                pr.targetClauses.map((chip) => (
                  <a class="pill gray" href={chip.href} style="margin:0 .3rem .2rem 0;text-decoration:none;display:inline-block">
                    {chip.label}
                  </a>
                ))
              ) : (
                <span>clause not recorded</span>
              )}
              {pr.cls === "entrenched" && pr.targetClauses.some((c) => c.isEntrenched) && (
                <div class="muted" style="margin-top:.3rem">
                  Classed Entrenched automatically — this proposal names{" "}
                  {pr.targetClauses
                    .filter((c) => c.isEntrenched)
                    .map((c) => c.label)
                    .join(", ")}
                  , one of the seven provisions Charter 8.2 protects.
                </div>
              )}
            </div>
          )}
          <p style="margin-top:.5rem">{pr.why}</p>
          {pr.timeSensitive && pr.timeSensitiveDeadlineNote && (
            <p class="small muted" style="margin-top:.4rem">
              <b>Stated deadline (Rules of Procedure 1.3a):</b> {pr.timeSensitiveDeadlineNote}
            </p>
          )}
          {pr.cost && (
            <p class="small muted" style="margin-top:.4rem">
              <b>Cost:</b> {pr.cost}
            </p>
          )}
          {pr.amount !== null && (
            <p class="small muted" style="margin-top:.2rem">
              <b>Amount:</b> ${pr.amount}
            </p>
          )}
          {pr.reversal && (
            <p class="small muted" style="margin-top:.2rem">
              <b>Reversal:</b> {pr.reversal}
            </p>
          )}
          {pr.cls === "position" && (
            <p class="small muted" style="margin-top:.2rem">
              <b>Position decision:</b> {pr.positionAction === "recognize" ? "Recognize" : pr.positionAction === "confirm" ? "Confirm (Delegate keeps the Position only if this is ratified)" : pr.positionAction === "concentration" ? "Concentration review (delegations to this Member in the sector continue only if this is ratified)" : "Remove"}{" "}
              {pr.positionAction === "concentration" ? `${pr.targetMemberName ?? "a member"} in ${pr.targetSectorName ?? "a sector"}.` : `${pr.targetMemberName ?? "a member"} as Delegate for ${pr.targetSectorName ?? "a sector"}.`}
            </p>
          )}
          {pr.jointNotice && (
            <p class="small" style="margin-top:.2rem">
              <b>Joint arrangement:</b> {pr.jointNotice}
            </p>
          )}
          <div style="margin-top:.6rem">{stateLine}</div>
          {pr.resolution.length > 0 && (
            <details style="margin-top:.6rem">
              <summary class="small muted">
                How this vote resolved — {pr.resolution.length} vote(s), directly or by delegation (Rules of Procedure 3.3)
              </summary>
              <p class="small muted" style="margin-top:.4rem">
                Delegation was resolved from the snapshot taken when voting opened. A delegation granted after that
                moment applies to the next vote; a revocation took effect immediately.
              </p>
              <ul class="small" style="margin-top:.4rem">
                {pr.resolution.map((r) => (
                  <li>
                    {r.memberName} — {r.value ? "yes" : "no"}
                    {r.via ? <> , via {r.via}</> : <> , directly</>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {p.phoneVerificationBlocked && (
            <p class="error" style="margin-top:.6rem">
              Voting requires phone verification — your account isn't a full Member yet (Triarc Membership Code 2.1).
              Reading and deliberating still work. <a href="/verify-phone">Verify your phone →</a>
            </p>
          )}
          {pr.stage === "voting" && p.member && (
            <div class="votebtns" style="margin-top:.7rem">
              <form method="post" action={`/proposals/${pr.id}/vote`}>
                <input type="hidden" name="value" value="yes" />
                <button class={pr.myVote === true ? "primary" : ""} type="submit">
                  Yes
                </button>
              </form>
              <form method="post" action={`/proposals/${pr.id}/vote`}>
                <input type="hidden" name="value" value="no" />
                <button class={pr.myVote === false ? "primary" : ""} type="submit">
                  No
                </button>
              </form>
            </div>
          )}
          {pr.stage === "deliberation" && !pr.critical && p.member && (
            <div style="margin-top:.7rem">
              <form method="post" action={`/proposals/${pr.id}/petition-critical`} style="display:inline">
                <button type="submit" disabled={pr.iSigned}>
                  {pr.iSigned ? "You signed the critical petition" : "Petition to classify critical"}
                </button>
              </form>{" "}
              <span class="small muted">
                {pr.petitionSignatures}/{pr.petitionNeeded} signatures ({p.petitionSharePct}% of Active Members — Rules of Procedure 1.6)
              </span>
            </div>
          )}
          {pr.stage === "deliberation" && !pr.timeSensitive && (pr.cls === "ordinary" || pr.cls === "treasury") && p.member && (
            <div style="margin-top:.7rem">
              <form method="post" action={`/proposals/${pr.id}/petition-time-sensitive`} class="formgrid" style="grid-template-columns:1fr auto;gap:.5rem;display:inline-grid">
                <label class="sr-only" for="ts-deadline-note">Deadline this proposal is petitioning against</label>
                <input
                  id="ts-deadline-note"
                  name="deadlineNote"
                  placeholder="The specific deadline (required for the petition to succeed)"
                  value={pr.timeSensitiveDeadlineNote ?? ""}
                  style="min-width:20rem"
                />
                <button type="submit" disabled={pr.iSignedTimeSensitive}>
                  {pr.iSignedTimeSensitive ? "You signed the time-sensitive petition" : "Petition as time-sensitive"}
                </button>
              </form>{" "}
              <span class="small muted">
                {pr.tsPetitionSignatures}/{pr.tsPetitionNeeded} signatures ({p.petitionSharePct}% of Active Members — Rules of Procedure 1.3a) — restores the
                pre-amendment 7d/5d timeline for a proposal with a genuine external deadline.
              </span>
            </div>
          )}
        </div>

        <div class="card" style="grid-column:1/-1">
          <span class="label">Deliberation — Article III.1, Rules of Procedure §2</span>
          {p.member ? (
            <form method="post" action={`/proposals/${pr.id}/comments`} class="formgrid">
              <textarea name="body" rows={3} placeholder="Argument, evidence, or critique — on the record, permanently." required></textarea>
              <label class="small sans" style="display:flex;gap:.4rem;align-items:center">
                <input type="checkbox" name="anonymous" />
                Post under a lower-visibility display name instead of my handle (Rules of Procedure 2.4 — earns no Mark)
              </label>
              <input name="displayName" placeholder="Display name (only used if posting under lower visibility)" />
              <button class="primary" type="submit" style="justify-self:start">
                Post
              </button>
            </form>
          ) : (
            <form method="post" action={`/proposals/${pr.id}/comments`} class="formgrid">
              <textarea name="body" rows={3} placeholder="Argument, evidence, or critique — on the record, permanently." required></textarea>
              <input name="displayName" placeholder="Display name (optional)" />
              <button class="primary" type="submit" style="justify-self:start">
                Post as a visitor
              </button>
            </form>
          )}
          <p class="muted small" style="margin-top:.5rem">
            Participation is free; Deliberation Marks are earned only under a persistent Member identity. If your
            argument moves the decision, log it as a contribution linking back to your comment below and get it
            attested.
          </p>
          <div style="margin-top:1rem">
            {p.comments.length === 0 && <p class="muted">No comments yet — be the first to argue it out.</p>}
            {p.comments.map((c) => (
              <div class="row" id={`c${c.id}`}>
                <div style="flex:1;min-width:230px">
                  <b>{c.isAnonymous ? `${c.displayName ?? "a visitor"} (anonymous)` : c.memberName}</b>{" "}
                  <span class="small muted">· {new Date(c.postedAt).toLocaleString()}</span>
                  <p style="margin-top:.2rem">{c.body}</p>
                  {c.modHref && (
                    <p class="small"><a href={c.modHref}>moderator: remove →</a></p>
                  )}
                  {!c.isAnonymous && !c.hidden && (
                    <a
                      class="small"
                      href={`/contribution?domain=Deliberation&evidenceLink=${encodeURIComponent(`/proposals/${pr.id}#c${c.id}`)}&description=${encodeURIComponent(`Argued in deliberation on "${pr.title}"`)}`}
                    >
                      Log this as a Deliberation contribution →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {pr.critical && (
          <div class="card" style="grid-column:1/-1">
            <span class="label">Minority reports — Rules of Procedure 5.3</span>
            <p class="muted small" style="margin-bottom:.7rem">
              Any Member may formally attach a written, attributed dissenting case to a major proposal — preserved on
              the permanent record alongside it, whether it passes or fails. Opt-in only; nothing appears here unless
              a Member chooses to file one.
            </p>
            {p.minorityReports.length === 0 && <p class="muted small">No minority report has been filed.</p>}
            {p.minorityReports.map((r) => (
              <div class="row">
                <div style="flex:1;min-width:230px">
                  <b>{r.memberName}</b> <span class="small muted">· {new Date(r.filedAt).toLocaleString()}</span>
                  <p style="margin-top:.2rem">{r.body}</p>
                </div>
              </div>
            ))}
            {p.member && !p.iFiledMinorityReport && (
              <form method="post" action={`/proposals/${pr.id}/minority-report`} class="formgrid" style="margin-top:.8rem">
                <label class="sr-only" for="minority-report-body">The dissenting case, in full</label>
                <textarea id="minority-report-body" name="body" rows={3} placeholder="The dissenting case, in full — this is preserved permanently, in your name." required></textarea>
                <button class="primary" type="submit" style="justify-self:start">
                  File minority report
                </button>
              </form>
            )}
            {p.iFiledMinorityReport && <p class="small ok" style="margin-top:.6rem">You filed a minority report on this proposal.</p>}
          </div>
        )}
      </div>
    </Layout>
  );
};
