import { Layout } from "./layout";
import { INTERIM_MEASURE_HOURS, CONDUCT_PROVISIONS, SANCTION_STEPS, ACCRUAL_SUSPENSION_DAYS, PARTICIPATION_SUSPENSION_DAYS } from "../lib/conduct";

// Article VI / Dispute Procedure Code — the public face of every Dispute Panel.
// Everything here is on the record by design (Charter 7.1): who filed, who was
// drawn and how, what was said, how the panel voted once it has decided.

type Viewer = { id: number; name: string } | null;

export interface DisputeListItem {
  panelId: number;
  title: string;
  filedAt: number;
  status: "awaiting-response" | "deliberating" | "decided";
  decision: string | null;
  seated: number;
  seats: number;
}

export interface QueuedDraw {
  title: string;
  requestedAt: number;
  reason: string | null;
}

export interface MeasureView {
  id: number;
  moderatorName: string;
  targetName: string;
  kind: "freeze-account" | "remove-content";
  contentKind: string | null;
  reason: string;
  takenAt: number;
  lapsesAt: number;
  status: "in force" | "kept by the panel" | "ended";
  endedAt: number | null;
  reportPanelId: number | null;
  approvals: number;
  seats: number;
  canApprove: boolean;
}

export interface ModeratorView {
  id: number;
  memberId: number;
  name: string;
  via: "appointed" | "position";
}

export const DisputesPage = (p: {
  member: Viewer;
  adminDebug: boolean;
  communityName: string;
  cases: DisputeListItem[];
  queued: QueuedDraw[];
  poolSize: number;
  poolMinimum: number;
  isVolunteer: boolean;
  mine: DisputeListItem[];
  involved: DisputeListItem[];
  moderators?: ModeratorView[];
  measures?: MeasureView[];
  isModerator?: boolean;
  isFounder?: boolean;
  phaseOneActive?: boolean;
  appointable?: { id: number; name: string }[];
}) => (
  <Layout title="Disputes" tab="disputes" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Disputes</h2>
    <p class="muted small" style="margin-bottom:1rem">
      Article VI of the Charter and the Dispute Procedure Code. A Dispute Panel is eleven volunteers drawn by verifiable
      public randomness; everything it hears and decides is on the public record.
    </p>

    {p.member && (
      <p class="small" style="margin-bottom:1rem">
        <a href="/disputes/report">Report a Code of Conduct violation →</a> Any Member may (Code of Conduct 4.1). Criticism of the Triarc,
        advocacy of any position and unpopular argument are never violations.
      </p>
    )}

    {p.involved.length > 0 && (
      <div class="card">
        <h3>Cases you are a party to</h3>
        {p.involved.map((c) => (
          <div class="row">
            <a href={`/disputes/${c.panelId}`} style="flex:1">{c.title}</a>
            <span class="pill gray">{c.status === "decided" ? `decided: ${c.decision}` : c.status === "awaiting-response" ? "your response window is open" : "deliberating"}</span>
          </div>
        ))}
      </div>
    )}

    {p.mine.length > 0 && (
      <div class="card">
        <h3>Cases you are seated on</h3>
        {p.mine.map((c) => (
          <div class="row">
            <a href={`/disputes/${c.panelId}`} style="flex:1">{c.title}</a>
            <span class="pill gray">{c.status === "decided" ? `decided: ${c.decision}` : c.status === "awaiting-response" ? "accused response window open" : "deliberating"}</span>
          </div>
        ))}
      </div>
    )}

    <div class="card">
      <h3>The panel pool</h3>
      <p class="small">
        {p.poolSize} of the {p.poolMinimum} volunteers needed before any panel can be drawn (Dispute Procedure Code 2.1).
        {p.member ? (p.isVolunteer ? " You are in the pool." : " You are not in the pool.") : ""}{" "}
        {p.member ? <a href={`/profile/${p.member.id}`}>Volunteer or withdraw from your profile</a> : <a href="/login">Sign in to volunteer</a>}.
      </p>
    </div>

    {p.queued.length > 0 && (
      <div class="card">
        <h3>Waiting for a panel</h3>
        <p class="muted small">Queued disputes are drawn automatically as soon as the pool and the eligible Members allow (Dispute Procedure Code 2.1).</p>
        {p.queued.map((q) => (
          <div class="row">
            <span style="flex:1">{q.title}</span>
            <span class="muted small">
              {q.reason === "pool-below-minimum"
                ? "pool below the minimum"
                : q.reason === "too-many-exclusions"
                  ? "too few eligible after exclusions"
                  : "drawing now"}{" "}
              · queued {new Date(q.requestedAt).toDateString()}
            </span>
          </div>
        ))}
      </div>
    )}


    <div class="card">
      <h3>Moderators and interim measures</h3>
      <p class="small">
        Moderators can do two things, only to stop active, ongoing harm (Code of Conduct 4.3): remove content that exposes someone's private information, and freeze a
        suspected sybil account's posting, proposing and contribution logging. They cannot touch any vote, any delegation or any proposal. Every measure is logged
        when it is taken, is filed together with a conduct report so a panel reviews it, and lapses by itself after {INTERIM_MEASURE_HOURS} hours unless more than half of that
        panel's seats keep it.
      </p>
      {(p.moderators ?? []).length === 0 ? (
        <p class="muted small">There are no moderators at present.</p>
      ) : (
        <p class="small">
          Moderators now:{" "}
          {(p.moderators ?? []).map((m, i) => (
            <span>
              {i > 0 ? ", " : ""}
              <a href={`/profile/${m.memberId}`}>{m.name}</a>
              <span class="muted"> ({m.via === "appointed" ? "interim, Phase I" : "by Position"})</span>
              {p.isFounder && m.via === "appointed" && (
                <form method="post" action={`/moderators/${m.id}/remove`} style="display:inline;margin-left:.4rem">
                  <button class="linkish" type="submit">remove</button>
                </form>
              )}
            </span>
          ))}
        </p>
      )}
      {p.isModerator && (
        <p class="small">
          You are a moderator. <a href="/disputes/interim/new?kind=freeze-account">Freeze an account →</a> To remove content, use the "moderator: remove" link beside it.
        </p>
      )}
      {(p.isModerator || p.isFounder) && (
        <form method="post" action="/members/close-underage" class="formgrid" style="margin-top:.6rem">
          <label class="small sans" for="underage-name">
            Close an account under the minimum age (Charter 1.1). Use only when it has become known that the holder is under 18: the account is closed
            and its email and phone are deleted. This cannot be undone.
          </label>
          <input id="underage-name" type="text" name="name" placeholder="Username" required />
          <button type="submit">Close account</button>
        </form>
      )}
      {p.isFounder && p.phaseOneActive && (p.appointable ?? []).length > 0 && (
        <form method="post" action="/moderators/appoint" class="formgrid" style="margin-top:.6rem">
          <label class="small sans" for="appoint-member">Appoint an interim moderator (Phase I only, Charter 9.2)</label>
          <select id="appoint-member" name="memberId" required>
            <option value="">Choose a Member</option>
            {(p.appointable ?? []).map((m) => (
              <option value={String(m.id)}>{m.name}</option>
            ))}
          </select>
          <button type="submit">Appoint</button>
        </form>
      )}
      {(p.measures ?? []).length > 0 && (
        <div style="margin-top:.8rem">
          <h4>Interim measures</h4>
          {(p.measures ?? []).map((m) => (
            <div class="row" style="flex-direction:column;align-items:flex-start;gap:.2rem">
              <span class="small">
                <b>{m.kind === "freeze-account" ? "Account freeze" : `Removed ${m.contentKind?.replace("-", " ")}`}</b> · {m.targetName} · by moderator {m.moderatorName} ·{" "}
                {new Date(m.takenAt).toLocaleString()} · <span class="pill gray">{m.status}</span>
              </span>
              <span class="small muted">{m.reason}</span>
              <span class="small muted">
                {m.status === "ended"
                  ? `Ended ${m.endedAt ? new Date(m.endedAt).toLocaleString() : ""}.`
                  : m.status === "kept by the panel"
                    ? "Kept until the reviewing panel decides."
                    : `Lapses ${new Date(m.lapsesAt).toLocaleString()} unless the panel keeps it (${m.approvals} of ${m.seats} seats have approved; more than half are needed).`}{" "}
                {m.reportPanelId ? <a href={`/disputes/${m.reportPanelId}`}>Reviewing panel →</a> : "Panel being drawn."}
              </span>
              {m.canApprove && (
                <form method="post" action={`/disputes/interim/${m.id}/approve`}>
                  <button type="submit">Keep this measure in force</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>

    <div class="card">
      <h3>All cases</h3>
      {p.cases.length === 0 && <p class="muted small">No case has been brought yet.</p>}
      {p.cases.map((c) => (
        <div class="row">
          <a href={`/disputes/${c.panelId}`} style="flex:1">{c.title}</a>
          <span class="muted small">{new Date(c.filedAt).toDateString()}</span>
          <span class="pill gray">{c.status === "decided" ? `decided: ${c.decision}` : c.status === "awaiting-response" ? "response window open" : "deliberating"}</span>
        </div>
      ))}
    </div>
  </Layout>
);

export interface CaseDraw {
  kind: string;
  method: string;
  beaconChain: string;
  beaconRound: number;
  beaconRandomness: string;
  caseKey: string;
  seed: string;
  poolIds: number[];
  drawnIds: number[];
  drawnAt: number;
  verified: boolean;
}

export interface CasePanelist {
  id: number;
  name: string;
  declined: boolean;
  drawnAt: number;
  vote: string | null; // shown only once decided
  reasoning?: string | null; // shown only once decided
}

export interface ConductView {
  provision: string;
  provisionName: string;
  reporterName: string;
  accusedName: string;
  statement: string;
  evidenceLink: string | null;
  contributions: { id: number; description: string }[];
  allowedSteps: number[]; // the steps a panelist may vote for, 0 = dismiss
  sanctionStep: number | null;
  badFaith: boolean;
}

export interface CaseView {
  panelId: number;
  title: string;
  summary: string;
  filedAt: number;
  decision: string | null;
  decidedAt: number | null;
  respondBy: number;
  respondedAt: number | null;
  responseWaivedAt: number | null;
  decidesBy: number;
  parties: { memberId: number; name: string; role: string }[];
  panelists: CasePanelist[];
  seats: number;
  replacementPending: boolean;
  draws: CaseDraw[];
  nameById: Record<number, string>;
  votesCast: number;
  conduct?: ConductView;
  overturnedAt?: number | null;
  revocation?: { effectiveAt: number; completedAt: number | null };
  overturnProposalId?: number | null;
}

export const DisputeCasePage = (p: {
  member: Viewer;
  adminDebug: boolean;
  communityName: string;
  c: CaseView;
  isPanelist: boolean;
  canDecline: boolean;
  declineBy: number | null;
  isAccused: boolean;
  canVote: boolean;
  myVote: string | null;
  responseWindowOpen: boolean;
  canOverturn?: boolean;
  overturnError?: string;
}) => {
  const c = p.c;
  const seated = c.panelists.filter((x) => !x.declined);
  return (
    <Layout title={c.title} tab="disputes" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <p class="small"><a href="/disputes">← All disputes</a></p>
      <h2 class="pagetitle">{c.title}</h2>
      <p class="small" style="margin-bottom:1rem">{c.summary}</p>

      {c.conduct && (
        <div class="card">
          <h3>The report</h3>
          <p class="small">
            <b>Code of Conduct {c.conduct.provision} — {c.conduct.provisionName}.</b> Filed by {c.conduct.reporterName} against {c.conduct.accusedName}.
          </p>
          <p class="small" style="white-space:pre-wrap;margin-top:.4rem">{c.conduct.statement}</p>
          {c.conduct.evidenceLink && (
            <p class="small" style="margin-top:.4rem">
              Evidence: <a href={c.conduct.evidenceLink} rel="noopener noreferrer">{c.conduct.evidenceLink}</a>
            </p>
          )}
          {c.conduct.contributions.length > 0 && (
            <>
              <p class="small" style="margin-top:.4rem">Contribution entries alleged to be fraudulent:</p>
              <ul class="small" style="margin:.2rem 0 0 1.2rem">
                {c.conduct.contributions.map((e) => (
                  <li>{e.description}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div class="card">
        <h3>Parties</h3>
        {c.parties.map((x) => (
          <div class="row">
            <a href={`/profile/${x.memberId}`} style="flex:1">{x.name}</a>
            <span class="pill gray">{x.role}</span>
          </div>
        ))}
      </div>

      <div class="card">
        <h3>Status</h3>
        {c.decision ? (
          <>
            <p class="small">
              Decided <b>{c.decision}</b> on {new Date(c.decidedAt ?? 0).toDateString()}.
              {c.conduct?.sanctionStep ? ` Finding: ${SANCTION_STEPS.find((x) => x.step === c.conduct!.sanctionStep)?.label} (Code of Conduct ${SANCTION_STEPS.find((x) => x.step === c.conduct!.sanctionStep)?.ref}).` : ""}
            </p>
            {c.conduct?.badFaith && (
              <p class="small">The panel also found the report brought in bad faith (Dispute Procedure Code 7.1).</p>
            )}
            {c.overturnedAt ? (
              <p class="small"><b>This decision was overturned by a full community vote on {new Date(c.overturnedAt).toDateString()} (Charter 6.3).</b></p>
            ) : (
              <>
                {c.revocation && !c.revocation.completedAt && (
                  <p class="small">
                    Revocation is held until {new Date(c.revocation.effectiveAt).toDateString()} (Dispute Procedure Code 6.2).{" "}
                    {c.overturnProposalId
                      ? <>An overturn proposal is open, so it stays paused until that resolves: <a href={`/proposals/${c.overturnProposalId}`}>see the proposal</a>.</>
                      : "Any Member may file a proposal to overturn it before then, and if one is filed the revocation stays paused until it resolves."}
                  </p>
                )}
                {c.revocation?.completedAt && <p class="small">The revocation took effect on {new Date(c.revocation.completedAt).toDateString()}.</p>}
                {!c.revocation && c.overturnProposalId && (
                  <p class="small">An overturn proposal is open: <a href={`/proposals/${c.overturnProposalId}`}>see the proposal</a>.</p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <p class="small">
              {p.responseWindowOpen
                ? `The accused has until ${new Date(c.respondBy).toDateString()} to respond on the record (Dispute Procedure Code 4.2); no decision issues before then unless they waive it.`
                : "The response window has closed or been used. The panel is deliberating."}{" "}
              The panel decides by {new Date(c.decidesBy).toDateString()}.
            </p>
            {c.replacementPending && <p class="small">A seat is vacant after a decline; a replacement is being drawn before the panel decides.</p>}
          </>
        )}
      </div>

      {p.isAccused && !c.decision && p.responseWindowOpen && (
        <div class="card">
          <h3>Your response</h3>
          <p class="small">You may respond on the record, or waive the response window. Right IV of the Bill of Rights admits no exceptions to it.</p>
          <form method="post" action={`/disputes/${c.panelId}/respond`} class="formgrid">
            <label class="sr-only" for="dispute-response">Your response</label>
            <textarea id="dispute-response" name="response" rows={5} placeholder="Your response, which enters the permanent record" required></textarea>
            <button class="primary" type="submit">Respond on the record</button>
          </form>
          <form method="post" action={`/disputes/${c.panelId}/respond`} style="margin-top:.6rem">
            <input type="hidden" name="waive" value="yes" />
            <button type="submit">Waive the response window</button>
          </form>
        </div>
      )}

      <div class="card">
        <h3>The panel ({seated.length} of {c.seats} seats filled)</h3>
        {c.panelists.length === 0 && <p class="muted small">No panel has been seated yet.</p>}
        {c.panelists.map((x) => (
          <div class="row">
            <a href={`/profile/${x.id}`} style="flex:1">{x.name}</a>
            <span class="muted small">
              {x.declined ? "declined" : "seated"}
              {x.vote !== null && !x.declined ? ` · voted: ${x.vote}` : ""}
            </span>
            {x.reasoning && !x.declined && <p class="small" style="flex-basis:100%;white-space:pre-wrap">Reasoning: {x.reasoning}</p>}
          </div>
        ))}
        {!c.decision && <p class="muted small" style="margin-top:.5rem">{c.votesCast} of {seated.length} panelists have voted. Individual votes are published once the panel decides.</p>}

        {p.canDecline && (
          <form method="post" action={`/disputes/${c.panelId}/decline`} style="margin-top:.8rem">
            <p class="small">
              You may decline this seat without giving reasons until {new Date(p.declineBy ?? 0).toLocaleString()} (Dispute Procedure Code 3.2).
              A replacement is then drawn the same way.
            </p>
            <button type="submit">Decline this seat</button>
          </form>
        )}
      </div>

      {p.canVote && (
        <div class="card">
          <h3>Your vote</h3>
          <p class="small">
            The standard is the balance of evidence; the burden rests on the party asserting the violation, and doubt resolves toward the accused
            (Dispute Procedure Code 4.4). You can change your vote until the panel decides.
            {p.myVote ? ` You have voted: ${p.myVote}.` : ""}
          </p>
          {c.conduct ? (
            <form method="post" action={`/disputes/${c.panelId}/vote`} class="formgrid">
              <p class="small">
                Choose the lowest step on the Code of Conduct ladder you consider adequate to the harm, or dismiss. The finding is the step at least half of the
                panel's votes reach.
              </p>
              {c.conduct.allowedSteps.map((st) => {
                const info = SANCTION_STEPS.find((x) => x.step === st);
                const days = st === 2 ? ACCRUAL_SUSPENSION_DAYS : st === 3 ? PARTICIPATION_SUSPENSION_DAYS : null;
                return (
                  <label class="small sans" for={`vote-step-${st}`} style="display:flex;gap:.5rem;align-items:flex-start">
                    <input id={`vote-step-${st}`} type="radio" name="step" value={String(st)} required style="margin-top:.25rem" />
                    <span>
                      {st === 0 ? (
                        <>Dismiss — the report is not made out</>
                      ) : (
                        <>
                          {info?.label} (Code of Conduct {info?.ref}) — {info?.detail}
                          {days ? `, ${days} days` : ""}
                        </>
                      )}
                    </span>
                  </label>
                );
              })}
              <label class="sr-only" for="vote-reasoning">Your reasoning</label>
              <textarea id="vote-reasoning" name="reasoning" rows={4} placeholder="Your reasoning, published with the decision (Dispute Procedure Code 4.3)" required></textarea>
              <label class="small sans" for="vote-badfaith" style="display:flex;gap:.5rem;align-items:flex-start">
                <input id="vote-badfaith" type="checkbox" name="badFaith" style="margin-top:.25rem" />
                <span>The report was brought in bad faith — knowingly false, retaliatory, or part of a pattern of harassment-by-process (Dispute Procedure Code 7.1).</span>
              </label>
              <button class="primary" type="submit">Cast vote</button>
            </form>
          ) : (
            <form method="post" action={`/disputes/${c.panelId}/vote`} class="formgrid">
              <label class="small sans" for="vote-uphold" style="display:flex;gap:.5rem;align-items:center">
                <input id="vote-uphold" type="radio" name="upheld" value="yes" required /> Uphold
              </label>
              <label class="small sans" for="vote-dismiss" style="display:flex;gap:.5rem;align-items:center">
                <input id="vote-dismiss" type="radio" name="upheld" value="no" required /> Dismiss
              </label>
              <button class="primary" type="submit">Cast vote</button>
            </form>
          )}
        </div>
      )}

      {p.canOverturn && (
        <div class="card">
          <h3>Overturn this decision</h3>
          <p class="small">
            A panel decision is overturned only by a full community vote at the charter-amendment threshold: two-thirds of votes cast, with at least 20% of
            Members participating (Charter 6.3, Dispute Procedure Code 6.1). Any Member may bring the proposal, not only a party. There is no second panel.
          </p>
          {p.overturnError && <p class="error">{p.overturnError}</p>}
          <form method="post" action={`/disputes/${c.panelId}/overturn`} class="formgrid">
            <label class="sr-only" for="overturn-reasons">Why this decision should be overturned</label>
            <textarea id="overturn-reasons" name="reasons" rows={5} placeholder="Why this decision should be overturned" required></textarea>
            <button type="submit">File the overturn proposal</button>
          </form>
        </div>
      )}

      <div class="card">
        <h3>How the panel was drawn</h3>
        <p class="muted small">
          Dispute Procedure Code 3.1 requires the method, seed and result to be published. Anyone can re-run a draw from the values below: hash the
          seed text, then shuffle the sorted pool using the seed. The beacon value can be checked against drand itself.
        </p>
        {c.draws.length === 0 && <p class="muted small">No draw has happened yet.</p>}
        {c.draws.map((d) => (
          <div class="row" style="display:block">
            <p class="small">
              <b>{d.kind === "initial" ? "Initial draw" : "Replacement draw"}</b> · {new Date(d.drawnAt).toLocaleString()} ·{" "}
              {d.verified ? "re-run reproduces this result" : "WARNING: re-run does NOT reproduce this result"}
            </p>
            <ul class="small" style="margin:.3rem 0 .3rem 1.2rem;word-break:break-all">
              <li>Method: {d.method}</li>
              <li>Beacon: drand chain {d.beaconChain}, round {d.beaconRound}</li>
              <li>Beacon randomness: {d.beaconRandomness}</li>
              <li>Case key: {d.caseKey}</li>
              <li>Seed: {d.seed}</li>
              <li>Eligible pool ({d.poolIds.length}): {d.poolIds.map((id) => c.nameById[id] ?? `#${id}`).join(", ")}</li>
              <li>Drawn: {d.drawnIds.map((id) => c.nameById[id] ?? `#${id}`).join(", ")}</li>
            </ul>
          </div>
        ))}
      </div>
    </Layout>
  );
};

export const FileReportPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean;
  communityName: string;
  members: { id: number; name: string }[];
  accused: { id: number; name: string } | null;
  contributions: { id: number; description: string }[];
  error?: string;
}) => (
  <Layout title="Report a violation" tab="disputes" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <p class="small"><a href="/disputes">← All disputes</a></p>
    <h2 class="pagetitle">Report a Code of Conduct violation</h2>
    <p class="small" style="margin-bottom:1rem">
      Any Member may report a violation (Code of Conduct 4.1). The report goes on the public record under your username, the accused answers it on the record, and
      a panel of eleven volunteers drawn by verifiable public randomness decides. Criticism of the Triarc, advocacy of any position and unpopular argument appear nowhere
      on the list of violations and never will. A report a panel finds brought in bad faith is itself a violation.
    </p>
    {p.error && <p class="error">{p.error}</p>}
    {!p.accused ? (
      <form method="get" action="/disputes/report" class="card formgrid">
        <label class="small sans" for="report-accused">Who is the report about?</label>
        <select id="report-accused" name="accused" required>
          <option value="">Choose a Member</option>
          {p.members.map((m) => (
            <option value={String(m.id)}>{m.name}</option>
          ))}
        </select>
        <button class="primary" type="submit">Continue</button>
      </form>
    ) : (
      <form method="post" action="/disputes/report" class="card formgrid">
        <input type="hidden" name="accusedId" value={String(p.accused.id)} />
        <p class="small">Report about <b>{p.accused.name}</b>.</p>
        <label class="small sans" for="report-provision">Which provision does it violate?</label>
        <select id="report-provision" name="provision" required>
          {CONDUCT_PROVISIONS.map((x) => (
            <option value={x.id}>
              {x.id} — {x.name}
            </option>
          ))}
        </select>
        <label class="small sans" for="report-statement">What happened, and what evidence supports it?</label>
        <textarea id="report-statement" name="statement" rows={8} maxlength={4000} required></textarea>
        <label class="small sans" for="report-evidence">Link to evidence (optional)</label>
        <input id="report-evidence" type="url" name="evidenceLink" placeholder="https://" />
        {p.contributions.length > 0 && (
          <fieldset class="small">
            <legend>For contribution fraud (2.2): which of {p.accused.name}'s entries do you say are fraudulent?</legend>
            {p.contributions.map((e) => (
              <label class="small sans" for={`report-c-${e.id}`} style="display:flex;gap:.5rem;align-items:flex-start">
                <input id={`report-c-${e.id}`} type="checkbox" name="contribution" value={String(e.id)} style="margin-top:.25rem" />
                <span>{e.description}</span>
              </label>
            ))}
          </fieldset>
        )}
        <button class="primary" type="submit">File the report</button>
      </form>
    )}
  </Layout>
);

export const InterimMeasurePage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean;
  communityName: string;
  kind: "freeze-account" | "remove-content";
  members: { id: number; name: string }[];
  content?: { contentKind: string; contentId: number; authorId: number; authorName: string; excerpt: string };
  coDelegate?: boolean;
  error?: string;
}) => (
  <Layout title="Interim measure" tab="disputes" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <p class="small"><a href="/disputes">← All disputes</a></p>
    <h2 class="pagetitle">{p.kind === "freeze-account" ? "Freeze an account" : "Remove content"}</h2>
    <p class="small" style="margin-bottom:1rem">
      Use this only for active, ongoing harm: content that exposes someone's private information, or an account you reasonably suspect is a sybil. The measure is logged on
      the public record now, filed with a conduct report so a panel of eleven reviews it, and lapses by itself after {INTERIM_MEASURE_HOURS} hours unless more than half of that
      panel's seats keep it. It never touches a vote, a delegation or any proposal.
    </p>
    {p.error && <p class="error">{p.error}</p>}
    <form method="post" action="/disputes/interim" class="card formgrid">
      <input type="hidden" name="kind" value={p.kind} />
      {p.kind === "remove-content" && p.content ? (
        <div>
          <input type="hidden" name="contentKind" value={p.content.contentKind} />
          <input type="hidden" name="contentId" value={String(p.content.contentId)} />
          <input type="hidden" name="targetMemberId" value={String(p.content.authorId)} />
          <p class="small">By <b>{p.content.authorName}</b>:</p>
          <blockquote class="small">{p.content.excerpt}</blockquote>
        </div>
      ) : (
        <div>
          <label class="small sans" for="interim-target">Which account?</label>
          <select id="interim-target" name="targetMemberId" required>
            <option value="">Choose a Member</option>
            {p.members.map((m) => (
              <option value={String(m.id)}>{m.name}</option>
            ))}
          </select>
        </div>
      )}
      <label class="small sans" for="interim-provision">Which provision of the Code of Conduct does the conduct violate?</label>
      <select id="interim-provision" name="provision" required>
        {CONDUCT_PROVISIONS.map((x) => (
          <option value={x.id}>
            {x.id} — {x.name}
          </option>
        ))}
      </select>
      <label class="small sans" for="interim-reason">What is the active harm, and why can it not wait for a panel?</label>
      <textarea id="interim-reason" name="reason" rows={6} maxlength={2000} required></textarea>
      {p.coDelegate && (
        <label class="small sans" for="interim-unreachable" style="display:flex;gap:.5rem;align-items:flex-start">
          <input id="interim-unreachable" type="checkbox" name="otherUnreachable" style="margin-top:.25rem" />
          <span>I am acting as a co-Delegate of this sector's Position, alone, because the other co-Delegate is unreachable (Rules of Procedure 6.4). This is logged publicly.</span>
        </label>
      )}
      <button class="primary" type="submit">Take the measure and file the report</button>
    </form>
  </Layout>
);
