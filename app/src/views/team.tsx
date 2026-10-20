import { Layout } from "./layout";
import type { DelegateEntry, NomineeEntry } from "../lib/community";

export interface JointActionView {
  id: number;
  kind: string;
  summary: string;
  status: string;
  proposedByName: string;
  proposedAt: number;
  referralProposalId: number | null;
  canRespond: boolean;
  canWithdraw: boolean;
  canRefer: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "waiting for the other co-Delegate",
  executed: "agreed and done",
  declined: "declined",
  referred: "referred to a community vote",
  ratified: "ratified by the community and done",
  rejected: "declined by the community",
  withdrawn: "withdrawn",
  void: "dropped — the Position changed",
};

export const TeamPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  sector: { id: number; name: string };
  delegates: DelegateEntry[];
  allMembers: { id: number; name: string }[];
  pendingChallengeNomineeIds: number[];
  myMemberId: number;
  jointActions?: JointActionView[];
}) => (
  <Layout title={`${p.sector.name} — Team`} member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <p class="small muted" style="margin-bottom:.6rem">
      <a href={`/sectors/${p.sector.id}`}>← {p.sector.name}</a> · <a href="/directory">All sectors</a>
    </p>
    <h2 class="pagetitle">{p.sector.name} — team</h2>
    <p class="muted small" style="margin-bottom:1rem">
      A Delegate may nominate a resident who already has an earned Contribution Record in this sector to support the
      work — a recognized title only, never a share of the Delegate's own vote or delegated authority (Contribution
      Code 8). Any Member may challenge a specific nomination.
    </p>

    {p.delegates.length === 0 && (
      <div class="card">
        <p class="muted">No Delegate recognized for this sector yet.</p>
      </div>
    )}

    {p.delegates
      .filter((d) => !d.coDelegate || d.delegateRecognitionId < d.coDelegate.recognitionId)
      .map((d) => {
        const joint = d.coDelegate !== undefined;
        const iHold = d.memberId === p.myMemberId || d.coDelegate?.memberId === p.myMemberId;
        const nameOfHolder = (id: number | null) => (id === null ? null : id === d.memberId ? d.name : d.coDelegate?.name ?? null);
        return (
          <div class="card" style="margin-bottom:1rem">
            <span class="label">
              {joint ? "Joint Position — " : "Delegate — "}
              <a href={`/profile/${d.memberId}`}>{d.name}</a>
              {joint && (
                <>
                  {" and "}
                  <a href={`/profile/${d.coDelegate!.memberId}`}>{d.coDelegate!.name}</a>
                  <span class="pill" style="margin-left:.5rem">co-Delegates</span>
                </>
              )}
            </span>
            <p class="muted small">recognized {new Date(d.recognizedAt).toDateString()}</p>
            {joint && (
              <div class="small" style="margin-top:.3rem">
                <p class="muted">
                  Held jointly under Charter 4.10 — closely tied delegated support. Each co-Delegate proposes, deliberates and votes on their own; nominating or ending a nomination
                  needs both (Rules of Procedure 6.2, 6.3). Either may be removed individually without affecting the other (6.8).
                </p>
                <p>
                  <b>External spokesperson:</b>{" "}
                  {nameOfHolder(d.joint?.spokespersonId ?? null) ?? "—"}
                  <span class="muted">
                    {d.joint?.spokespersonHow === "agreement"
                      ? " (agreed between them; reaffirmed each renewal cycle)"
                      : " (the co-Delegate with the larger share of delegated support, as no current agreement stands). Confers no additional authority (6.6)."}
                  </span>
                </p>
                <p>
                  <b>Compensation split:</b> {d.joint?.split ? `${nameOfHolder(d.joint.split.first)} ${d.joint.split.firstPct}% · ${nameOfHolder(d.joint.split.second)} ${d.joint.split.secondPct}%` : "—"}
                  <span class="muted">{d.joint?.split?.agreed ? " (by mutual written agreement, on the public record)" : " (the default even split; adjustable only by mutual written agreement, 6.7)"}</span>
                </p>
              </div>
            )}

            <div style="margin-top:.8rem">
              <span class="small sans muted">Supporting Nominees</span>
              {d.nominees.length === 0 && <p class="muted small">None yet.</p>}
              {d.nominees.map((n) => (
                <NomineeRow n={n} p={p} sectorId={p.sector.id} soleHolder={!joint && d.memberId === p.myMemberId} jointHolder={joint && iHold} />
              ))}
            </div>

            {!joint && d.memberId === p.myMemberId && (
              <form method="post" action={`/positions/${d.delegateRecognitionId}/nominate`} style="display:flex;gap:.5rem;margin-top:.8rem;flex-wrap:wrap">
                <label class="sr-only" for={`nominee-member-${d.delegateRecognitionId}`}>Member to nominate</label>
                <select id={`nominee-member-${d.delegateRecognitionId}`} name="nomineeMemberId">
                  {p.allMembers.filter((m) => m.id !== d.memberId).map((m) => (
                    <option value={m.id}>{m.name}</option>
                  ))}
                </select>
                <label class="sr-only" for={`nominee-title-${d.delegateRecognitionId}`}>Role title</label>
                <input id={`nominee-title-${d.delegateRecognitionId}`} name="title" placeholder="Role title, e.g. Housing Policy Assistant" style="flex:1;min-width:12rem" />
                <button class="primary" type="submit">
                  Nominate
                </button>
              </form>
            )}

            {joint && iHold && (
              <div style="margin-top:.8rem">
                <form method="post" action={`/sectors/${p.sector.id}/joint`} style="display:flex;gap:.5rem;flex-wrap:wrap">
                  <input type="hidden" name="kind" value="nominate" />
                  <label class="sr-only" for="joint-nominee-member">Member to nominate</label>
                  <select id="joint-nominee-member" name="nomineeMemberId">
                    {p.allMembers.filter((m) => m.id !== d.memberId && m.id !== d.coDelegate!.memberId).map((m) => (
                      <option value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <label class="sr-only" for="joint-nominee-title">Role title</label>
                  <input id="joint-nominee-title" name="title" placeholder="Role title" style="flex:1;min-width:12rem" />
                  <button class="primary" type="submit">Propose a nomination to my co-Delegate</button>
                </form>
                <form method="post" action={`/sectors/${p.sector.id}/joint`} style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
                  <input type="hidden" name="kind" value="spokesperson" />
                  <label class="sr-only" for="joint-spokesperson">Spokesperson</label>
                  <select id="joint-spokesperson" name="memberId">
                    <option value={String(d.memberId)}>{d.name}</option>
                    <option value={String(d.coDelegate!.memberId)}>{d.coDelegate!.name}</option>
                  </select>
                  <button type="submit">Propose as external spokesperson</button>
                </form>
                <form method="post" action={`/sectors/${p.sector.id}/joint`} style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
                  <input type="hidden" name="kind" value="compensation-split" />
                  <label class="small sans" for="joint-share">My share of compensation (%)</label>
                  <input id="joint-share" name="sharePct" type="number" min="1" max="99" value="50" style="width:5rem" />
                  <button type="submit">Propose this split in writing</button>
                </form>
              </div>
            )}

            {joint && (p.jointActions ?? []).length > 0 && (
              <div style="margin-top:.8rem">
                <span class="small sans muted">Joint requests</span>
                {(p.jointActions ?? []).map((a) => (
                  <div class="row" style="flex-direction:column;align-items:flex-start;gap:.2rem">
                    <span class="small">
                      {a.proposedByName} asked to jointly <b>{a.summary}</b> · {new Date(a.proposedAt).toDateString()} · <span class="pill gray">{STATUS_LABEL[a.status] ?? a.status}</span>
                    </span>
                    <span style="display:flex;gap:.4rem;flex-wrap:wrap">
                      {a.canRespond && (
                        <>
                          <form method="post" action={`/joint/${a.id}/respond`} style="display:inline">
                            <input type="hidden" name="decision" value="accept" />
                            <button class="primary" type="submit">Agree</button>
                          </form>
                          <form method="post" action={`/joint/${a.id}/respond`} style="display:inline">
                            <input type="hidden" name="decision" value="decline" />
                            <button type="submit">Decline</button>
                          </form>
                        </>
                      )}
                      {a.canWithdraw && (
                        <form method="post" action={`/joint/${a.id}/withdraw`} style="display:inline">
                          <button type="submit">Withdraw</button>
                        </form>
                      )}
                      {a.canRefer && (
                        <form method="post" action={`/joint/${a.id}/refer`} style="display:inline">
                          <button type="submit">Deadlocked — refer to a community vote</button>
                        </form>
                      )}
                      {a.referralProposalId && <a class="small" href={`/proposals/${a.referralProposalId}`}>The vote →</a>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
  </Layout>
);

function NomineeRow(x: { n: NomineeEntry; p: Parameters<typeof TeamPage>[0]; sectorId: number; soleHolder: boolean; jointHolder: boolean }) {
  const { n, p } = x;
  const pending = p.pendingChallengeNomineeIds.includes(n.id);
  const disclosedTies = n.ties.filter((t) => t.delegatedToThem || t.delegatedFromThem || t.attestationsMade > 0 || t.attestationsReceived > 0);
  return (
    <div class="row" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;justify-content:space-between;gap:.8rem;flex-wrap:wrap">
        <span>
          <b>{n.title}</b> — <a href={`/profile/${n.memberId}`}>{n.name}</a> <span class="small muted">nominated {new Date(n.nominatedAt).toDateString()}</span>
        </span>
        <span style="display:flex;gap:.4rem;align-items:center">
          {pending && <span class="pill gray">challenge pending</span>}
          {x.soleHolder && (
            <form method="post" action={`/nominations/${n.id}/revoke`}>
              <button type="submit">End nomination</button>
            </form>
          )}
          {x.jointHolder && (
            <form method="post" action={`/sectors/${x.sectorId}/joint`}>
              <input type="hidden" name="kind" value="revoke-nomination" />
              <input type="hidden" name="nomineeId" value={String(n.id)} />
              <button type="submit">Propose ending</button>
            </form>
          )}
          {!pending && (
            <>
              <form method="post" action={`/nominations/${n.id}/challenge`} style="display:inline">
                <input type="hidden" name="kind" value="conduct" />
                <button class="btnlink" type="submit" style="font-size:.7rem">
                  Challenge — conduct
                </button>
              </form>
              <form method="post" action={`/nominations/${n.id}/challenge`} style="display:inline">
                <input type="hidden" name="kind" value="fit" />
                <button class="btnlink" type="submit" style="font-size:.7rem">
                  Challenge — fit
                </button>
              </form>
            </>
          )}
        </span>
      </div>
      <p class="small muted" style="margin-top:.35rem">
        <b>Disclosed ties</b> (Contribution Code 8.8) —{" "}
        {disclosedTies.length === 0
          ? "none on record."
          : disclosedTies.map((t, i) => (
              <>
                {i > 0 && "; "}
                {t.name} ({t.role === "delegate" ? "the Delegate" : "co-nominee"}):{" "}
                {[
                  t.delegatedToThem && "delegated to them",
                  t.delegatedFromThem && "delegated by them",
                  t.attestationsMade > 0 && `${t.attestationsMade} attestation(s) made on their work`,
                  t.attestationsReceived > 0 && `${t.attestationsReceived} attestation(s) received from them`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </>
            ))}
      </p>
    </div>
  );
}
