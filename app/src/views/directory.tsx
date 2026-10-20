import { Layout } from "./layout";
import type { SectorDirectoryEntry } from "../lib/community";

export const DirectoryPage = (p: {
  member: { id: number; name: string } | null;
  adminDebug: boolean; communityName: string;
  entries: SectorDirectoryEntry[];
  followedSectorIds: number[];
}) => {
  const openCount = p.entries.filter((e) => e.delegates.length === 0).length;
  return (
    <Layout title="Directory" tab="directory" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <h2 class="pagetitle">The Steward &amp; Delegate directory — who's serving, and where a seat is open</h2>
      <p class="muted small" style="margin-bottom:1rem">
        Civic Stewards are computed, not installed — earned trust plus sector standing (Charter 4.2). Delegates are
        installed and removed by a ratified Position decision (Charter 4.3): any member may put themselves forward
        for a sector with no serving Delegate below, and the community votes on it, exactly like any other proposal.
        A Delegate may nominate Supporting Nominees from within their sector's own contributors — a recognized role,
        never a share of the Delegate's vote or authority (Contribution Code 8, Charter 4.6). Recognition that can't
        be seen isn't accountable (Charter 4.4).
        {openCount > 0 && (
          <>
            {" "}
            <b>
              {openCount} of {p.entries.length} sectors currently have no serving Delegate.
            </b>
          </>
        )}
      </p>
      <div class="grid cols2">
        {p.entries.map((e) => {
          const following = p.followedSectorIds.includes(e.sectorId);
          const vacant = e.delegates.length === 0;
          return (
            <div class="card">
              <div class="row" style="border:none;padding:0 0 .5rem 0">
                <span class="label" style="margin-bottom:0">
                  <a href={`/sectors/${e.sectorId}/team`}>{e.sectorName}</a>
                  {vacant && (
                    <span class="pill" style="margin-left:.4rem">
                      open
                    </span>
                  )}
                </span>
                {p.member ? (
                  <form method="post" action={`/sectors/${e.sectorId}/${following ? "unfollow" : "follow"}`}>
                    <button class={following ? "primary" : ""} type="submit">
                      {following ? "Following" : "Follow"}
                    </button>
                  </form>
                ) : (
                  <a class="btnlink" href="/login">
                    Sign in to follow
                  </a>
                )}
              </div>
              <span class="small sans muted">Civic Stewards</span>
              {e.stewards.length === 0 && <p class="muted small">None yet.</p>}
              {e.stewards.map((s) => (
                <div class="row">
                  <a href={`/profile/${s.memberId}`}>{s.name}</a>
                </div>
              ))}
              <span class="small sans muted" style="margin-top:.5rem;display:block">
                Delegate
              </span>
              {vacant && <p class="muted small">No one is currently serving as Delegate for this sector.</p>}
              {e.delegates.map((d) => (
                <div style="margin-bottom:.4rem">
                  <div class="row">
                    <a href={`/profile/${d.memberId}`}>{d.name}</a>
                    <span class="small muted">recognized {new Date(d.recognizedAt).toDateString()}</span>
                  </div>
                  {d.nominees.length > 0 && (
                    <div class="small muted" style="padding-left:1rem">
                      {d.nominees.map((n) => (
                        <div>
                          — {n.title}: <a href={`/profile/${n.memberId}`}>{n.name}</a>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.memberId === p.member?.id && (
                    <div class="small" style="padding-left:1rem;margin-top:.2rem">
                      <a href={`/sectors/${e.sectorId}/team`}>Manage nominees →</a>
                    </div>
                  )}
                </div>
              ))}
              {vacant && p.member && (
                <form method="post" action="/proposals" style="margin-top:.6rem;border-top:1px solid var(--rule, #ddd);padding-top:.6rem">
                  <input type="hidden" name="cls" value="position" />
                  <input type="hidden" name="positionAction" value="recognize" />
                  <input type="hidden" name="targetMemberId" value={p.member.id} />
                  <input type="hidden" name="targetSectorId" value={e.sectorId} />
                  <input type="hidden" name="title" value={`Recognize ${p.member.name} as Delegate for ${e.sectorName}`} />
                  <span class="small">Put yourself forward — the community votes on it, same as any Position decision.</span>
                  <textarea name="why" rows={2} placeholder={`Why should you be the Delegate for ${e.sectorName}?`} required style="margin-top:.3rem"></textarea>
                  <button class="primary" type="submit" style="margin-top:.4rem">
                    Apply for this seat
                  </button>
                </form>
              )}
              {vacant && !p.member && (
                <p class="small" style="margin-top:.6rem">
                  <a href="/login">Sign in</a> to apply for this seat.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Layout>
  );
};
