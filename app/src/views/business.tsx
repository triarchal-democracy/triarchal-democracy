import { Layout } from "./layout";

export const BusinessesPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  pages: { id: number; name: string; description: string }[];
  followedPageIds: number[];
}) => (
  <Layout title="Businesses" tab="businesses" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Business Pages — non-voting advisory presence</h2>
    <p class="muted small" style="margin-bottom:1rem">
      A labeled, non-voting presence for local business — no comment, no reaction, no vote beyond the one every
      Member already holds (Government Adoption Compact 5.1).
    </p>
    <div class="card" style="margin-bottom:1rem">
      <span class="label">Register a business page</span>
      <form method="post" action="/businesses" class="formgrid">
        <label class="sr-only" for="business-name">Business or organization name</label>
        <input id="business-name" name="name" placeholder="Business or organization name" required />
        <label class="sr-only" for="business-description">What does it do?</label>
        <textarea id="business-description" name="description" rows={2} placeholder="What does it do?" required></textarea>
        <button class="primary" type="submit" style="justify-self:start">
          Create
        </button>
      </form>
    </div>
    <div class="card">
      {p.pages.length === 0 && <p class="muted">No business pages yet.</p>}
      {p.pages.map((page) => (
        <div class="row">
          <div style="flex:1">
            <a href={`/businesses/${page.id}`}>
              <b>{page.name}</b>
            </a>
            <div class="small muted">{page.description}</div>
          </div>
          {p.followedPageIds.includes(page.id) && <span class="pill green">following</span>}
        </div>
      ))}
    </div>
  </Layout>
);

export const BusinessDetailPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  page: { id: number; name: string; description: string; managerName: string };
  isManager: boolean;
  following: boolean;
  updates: { id: number; body: string; postedAt: number }[];
}) => (
  <Layout title={p.page.name} tab="businesses" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <p class="small muted" style="margin-bottom:.6rem">
      <a href="/businesses">← All business pages</a>
    </p>
    <div class="row" style="border:none;margin-bottom:1rem">
      <h2 class="pagetitle" style="margin:0">
        {p.page.name} <span class="pill gray">non-voting</span>
      </h2>
      <form method="post" action={`/businesses/${p.page.id}/${p.following ? "unfollow" : "follow"}`}>
        <button class={p.following ? "primary" : ""} type="submit">
          {p.following ? "Following" : "Follow"}
        </button>
      </form>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <p>{p.page.description}</p>
      <p class="small muted" style="margin-top:.5rem">
        Managed by {p.page.managerName}
      </p>
    </div>
    {p.isManager && (
      <div class="card" style="margin-bottom:1rem">
        <span class="label">Post an update</span>
        <form method="post" action={`/businesses/${p.page.id}/updates`} class="formgrid">
          <textarea name="body" rows={2} placeholder="What's new?" required></textarea>
          <button class="primary" type="submit" style="justify-self:start">
            Post
          </button>
        </form>
      </div>
    )}
    <div class="card">
      <span class="label">Updates</span>
      {p.updates.length === 0 && <p class="muted small">Nothing posted yet.</p>}
      {p.updates.map((u) => (
        <div class="row">
          <span>{u.body}</span>
          <span class="small muted">{new Date(u.postedAt).toDateString()}</span>
        </div>
      ))}
    </div>
  </Layout>
);
