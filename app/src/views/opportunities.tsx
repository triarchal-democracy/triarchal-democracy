import { Layout } from "./layout";
import type { Domain } from "../lib/params";

export interface OpportunityRow {
  id: number;
  title: string;
  description: string;
  domain: Domain | null;
  postedByName: string;
  postedAt: number;
  sectorNames: string[];
  sectorIds: number[];
}

function OpportunityCard(o: OpportunityRow) {
  return (
    <div class="row" id={`o${o.id}`}>
      <div style="flex:1;min-width:230px">
        <b>{o.title}</b>{" "}
        <span class="small muted">
          · posted by {o.postedByName} · {new Date(o.postedAt).toDateString()}
          {o.sectorNames.length > 0 && <> · {o.sectorNames.join(", ")}</>}
        </span>
        <p class="small" style="margin-top:.3rem">
          {o.description}
        </p>
        <a
          class="small"
          href={`/contribution?domain=${o.domain ?? "Craft"}&evidenceLink=${encodeURIComponent(`/opportunities#o${o.id}`)}&description=${encodeURIComponent(`Completed opportunity: "${o.title}"`)}${o.sectorIds[0] ? `&sectorId=${o.sectorIds[0]}` : ""}`}
        >
          Log completing this →
        </a>
      </div>
    </div>
  );
}

export const OpportunitiesPage = (p: {
  member: { id: number; name: string };
  adminDebug: boolean; communityName: string;
  opportunities: OpportunityRow[];
  ranked: OpportunityRow[];
  sectors: { id: number; name: string }[];
  filterSectorId?: number | null;
}) => (
  <Layout title="Opportunities" tab="opportunities" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">Opportunities — tasks and problems, posted openly</h2>
    <div class="grid cols2">
      <div class="card" style="grid-column:1/-1">
        <span class="label">Filter by sector</span>
        <form method="get" action="/opportunities" style="display:flex;gap:.5rem">
          <label class="sr-only" for="opportunities-filter-sector">Filter by sector</label>
          <select id="opportunities-filter-sector" name="sectorId">
            <option value="">All sectors</option>
            {p.sectors.map((s) => (
              <option value={s.id} selected={p.filterSectorId === s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit">Filter</button>
          {p.filterSectorId && (
            <a class="btnlink" href="/opportunities">
              Clear
            </a>
          )}
        </form>
      </div>
      <div class="card" style="grid-column:1/-1">
        <span class="label">Post an opportunity (Contribution Code 7 — free, no Mark for posting)</span>
        <form method="post" action="/opportunities" class="formgrid">
          <label class="sr-only" for="opportunity-title">Title — what needs doing?</label>
          <input id="opportunity-title" name="title" placeholder="Title — what needs doing?" required />
          <label class="sr-only" for="opportunity-description">Describe the task or problem</label>
          <textarea id="opportunity-description" name="description" rows={2} placeholder="Describe the task or problem." required></textarea>
          <label class="sr-only" for="opportunity-domain">Domain the work would count as, if any</label>
          <select id="opportunity-domain" name="domain">
            <option value="">— domain the work would count as, if any —</option>
            {["Deliberation", "Craft", "Stewardship"].map((d) => (
              <option value={d}>{d}</option>
            ))}
          </select>
          <div class="small muted">Sector tags (optional, any number):</div>
          <div style="display:flex;gap:.8rem;flex-wrap:wrap">
            {p.sectors.map((s) => (
              <label class="small sans" style="display:flex;gap:.3rem;align-items:center">
                <input type="checkbox" name="sectorId" value={s.id} /> {s.name}
              </label>
            ))}
          </div>
          <button class="primary" type="submit" style="justify-self:start">
            Post opportunity
          </button>
        </form>
      </div>

      {p.ranked.length > 0 && (
        <div class="card" style="grid-column:1/-1">
          <span class="label">Recommended for you — by sectors you follow &amp; have contributed to (Rules of Procedure 4.4)</span>
          {p.ranked.map((o) => OpportunityCard(o))}
        </div>
      )}

      <div class="card" style="grid-column:1/-1">
        <span class="label">All opportunities</span>
        {p.opportunities.length === 0 && <p class="muted">No opportunities posted yet.</p>}
        {p.opportunities.map((o) => OpportunityCard(o))}
      </div>
    </div>
  </Layout>
);
