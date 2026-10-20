import { Layout } from "./layout";

export const SectorsIndexPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  sectors: { id: number; name: string }[];
  followedSectorIds: number[];
}) => (
  <Layout title="Sectors" tab="sectors" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Sectors</h2>
    <p class="muted small" style="margin-bottom:1rem">
      Each sector is its own open proposals, its own opportunity listings, its own visible Stewards and Delegates,
      and its own ongoing discussion. Following a sector is how you declare interest (Contribution Code 2.4).
    </p>
    <div class="grid cols2">
      {p.sectors.map((s) => (
        <a class="card" href={`/sectors/${s.id}`} style="text-decoration:none;color:inherit">
          <span class="label" style="margin-bottom:0">
            {s.name} {p.followedSectorIds.includes(s.id) && <span class="pill green">following</span>}
          </span>
        </a>
      ))}
    </div>
  </Layout>
);

export const SectorHubPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  sector: { id: number; name: string };
  following: boolean;
  openProposals: { id: number; title: string; stage: "deliberation" | "voting" | "record" }[];
  opportunities: { id: number; title: string }[];
  posts: { id: number; title: string; authorName: string; postedAt: number }[];
}) => (
  <Layout title={p.sector.name} tab="sectors" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <p class="small muted" style="margin-bottom:.6rem">
      <a href="/sectors">← All sectors</a>
    </p>
    <div class="row" style="border:none;margin-bottom:1rem">
      <h2 class="pagetitle" style="margin:0">
        {p.sector.name}
      </h2>
      <form method="post" action={`/sectors/${p.sector.id}/${p.following ? "unfollow" : "follow"}`}>
        <button class={p.following ? "primary" : ""} type="submit">
          {p.following ? "Following" : "Follow"}
        </button>
      </form>
    </div>
    <div class="grid cols2">
      <div class="card">
        <span class="label">Open proposals</span>
        {p.openProposals.length === 0 && <p class="muted small">None open right now.</p>}
        {p.openProposals.map((pr) => (
          <div class="row">
            <a href={`/proposals/${pr.id}`}>{pr.title}</a>
            <span class="pill gray">{pr.stage}</span>
          </div>
        ))}
        <p class="small" style="margin-top:.5rem">
          <a href="/proposals">All proposals →</a>
        </p>
      </div>
      <div class="card">
        <span class="label">Opportunities</span>
        {p.opportunities.length === 0 && <p class="muted small">None posted yet.</p>}
        {p.opportunities.map((o) => (
          <div class="row">
            <a href={`/opportunities?sectorId=${p.sector.id}#o${o.id}`}>{o.title}</a>
          </div>
        ))}
        <p class="small" style="margin-top:.5rem">
          <a href={`/opportunities?sectorId=${p.sector.id}`}>All opportunities in this sector →</a>
        </p>
      </div>
      <div class="card">
        <span class="label">Team</span>
        <p class="small">
          <a href={`/sectors/${p.sector.id}/team`}>Stewards, Delegates &amp; Supporting Nominees →</a>
        </p>
      </div>
      <div class="card" style="grid-column:1/-1">
        <span class="label">Discussion</span>
        <form method="post" action={`/sectors/${p.sector.id}/posts`} class="formgrid" style="margin-bottom:1rem">
          <label class="sr-only" for="sector-post-title">Discussion title</label>
          <input id="sector-post-title" name="title" placeholder="Start a discussion — title" required />
          <label class="sr-only" for="sector-post-body">What's on your mind about this sector?</label>
          <textarea id="sector-post-body" name="body" rows={2} placeholder="What's on your mind about this sector?" required></textarea>
          <label class="small sans" style="display:flex;gap:.4rem;align-items:center">
            <input type="checkbox" name="anonymous" />
            Post under a lower-visibility display name
          </label>
          <input name="displayName" placeholder="Display name (only used if posting under lower visibility)" />
          <button class="primary" type="submit" style="justify-self:start">
            Post
          </button>
        </form>
        {p.posts.length === 0 && <p class="muted small">No discussion yet — be the first.</p>}
        {p.posts.map((post) => (
          <div class="row">
            <a href={`/sectors/${p.sector.id}/posts/${post.id}`}>{post.title}</a>
            <span class="small muted">
              {post.authorName} · {new Date(post.postedAt).toDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  </Layout>
);

export const SectorPostPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  sectorId: number;
  post: { id: number; title: string; body: string; authorName: string; postedAt: number; modHref?: string };
  comments: { id: number; body: string; authorName: string; postedAt: number; modHref?: string }[];
}) => (
  <Layout title={p.post.title} member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <p class="small muted" style="margin-bottom:.6rem">
      <a href={`/sectors/${p.sectorId}`}>← Back to sector</a>
    </p>
    <h2 class="pagetitle">{p.post.title}</h2>
    <div class="card" style="margin-bottom:1rem">
      <span class="small muted">
        {p.post.authorName} · {new Date(p.post.postedAt).toLocaleString()}
      </span>
      <p style="margin-top:.5rem">{p.post.body}</p>
      {p.post.modHref && (
        <a class="small" href={p.post.modHref}>moderator: remove →</a>
      )}
    </div>
    <div class="card">
      <span class="label">Comments</span>
      <form method="post" action={`/sectors/${p.sectorId}/posts/${p.post.id}/comments`} class="formgrid" style="margin-bottom:1rem">
        <label class="sr-only" for="sector-post-reply">Reply</label>
        <textarea id="sector-post-reply" name="body" rows={2} placeholder="Reply" required></textarea>
        <button class="primary" type="submit" style="justify-self:start">
          Post
        </button>
      </form>
      {p.comments.length === 0 && <p class="muted small">No comments yet.</p>}
      {p.comments.map((cm) => (
        <div class="row">
          <div style="flex:1">
            <b class="small">{cm.authorName}</b> <span class="small muted">· {new Date(cm.postedAt).toLocaleString()}</span>
            <p style="margin-top:.2rem">{cm.body}</p>
            {cm.modHref && (
              <a class="small" href={cm.modHref}>moderator: remove →</a>
            )}
          </div>
        </div>
      ))}
    </div>
    <p class="muted small" style="margin-top:.8rem">
      Governed by the Code of Conduct, like everywhere else. Any Member who sees a violation can <a href="/disputes/report">report it</a>
      (Code of Conduct 4.1) and a Dispute Panel decides.
    </p>
  </Layout>
);
