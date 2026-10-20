import { Layout } from "./layout";

export const PeoplePage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  people: { id: number; name: string }[];
  q: string;
}) => (
  <Layout title="People" tab="people" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">People</h2>
    <div class="card" style="margin-bottom:1rem">
      <form method="get" action="/people" style="display:flex;gap:.5rem">
        <label class="sr-only" for="people-q">Search by handle</label>
        <input id="people-q" name="q" placeholder="Search by handle" value={p.q} style="flex:1" />
        <button class="primary" type="submit">
          Search
        </button>
      </form>
    </div>
    <div class="card">
      {p.people.length === 0 && <p class="muted">No Members found.</p>}
      {p.people.map((m) => (
        <div class="row">
          <a href={`/profile/${m.id}`}>{m.name}</a>
        </div>
      ))}
    </div>
  </Layout>
);
