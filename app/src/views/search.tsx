import { Layout } from "./layout";

const SECTIONS = [
  ["proposals", "Proposals"],
  ["opportunities", "Opportunity Board"],
  ["sectors", "Sectors"],
  ["people", "People"],
] as const;

export const SearchPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  section: string;
  q: string;
  results: { label: string; href: string }[];
}) => (
  <Layout title="Search" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Search</h2>
    <p class="muted small" style="margin-bottom:1rem">
      Search is scoped to one section at a time — a Sectors search, a Proposals search, an Opportunity Board search,
      and a People search are separate, not blended into one unified index.
    </p>
    <div class="card" style="margin-bottom:1rem">
      <form method="get" action="/search" style="display:flex;gap:.5rem;flex-wrap:wrap">
        <label class="sr-only" for="search-section">Section to search</label>
        <select id="search-section" name="section">
          {SECTIONS.map(([value, label]) => (
            <option value={value} selected={p.section === value}>
              {label}
            </option>
          ))}
        </select>
        <label class="sr-only" for="search-q">Search term</label>
        <input id="search-q" name="q" placeholder="Search…" value={p.q} style="flex:1;min-width:12rem" />
        <button class="primary" type="submit">
          Search
        </button>
      </form>
    </div>
    <div class="card">
      {p.q === "" && <p class="muted">Enter a search term above.</p>}
      {p.q !== "" && p.results.length === 0 && <p class="muted">No matches in this section.</p>}
      {p.results.map((r) => (
        <div class="row">
          <a href={r.href}>{r.label}</a>
        </div>
      ))}
    </div>
  </Layout>
);
