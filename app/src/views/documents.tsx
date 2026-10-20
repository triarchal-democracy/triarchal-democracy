import { Layout } from "./layout";
import { documentsData } from "../generated/documents";
import type { FoundingDocument, Clause, Section, CrossReference, DocStatus } from "../../scripts/documentsParser";
import type { LiveValues } from "../lib/liveValues";
import { inScopeAmendmentDocuments } from "../lib/clauseAmendments";
import type { DocumentSearchResult } from "../lib/documentsSearch";

// Clause-structured amendments — Charter, plus any document containing an
// entrenched clause. Computed once at module load (the generated module is
// static), reused by every ClauseBlock render rather than recomputed per
// clause.
const IN_SCOPE_DOCUMENTS = inScopeAmendmentDocuments();

const STATUS_LABEL: Partial<Record<DocStatus, string>> = {
  dormant: "Dormant",
  "triarc-only": "Triarc-only",
  staged: "Staged",
};

// 2026-10-11, Phase 2 stage 3. Markdown bold (`**text**`) rendered as real
// <strong> elements via JSX, never as an HTML string — this app has no
// dangerouslySetInnerHTML/raw() anywhere (Phase 1 app review, auth-security
// finding), and founding-document text is trusted content, but there's no
// reason to introduce the first raw-HTML path in the codebase when a plain
// split/map does the same job safely.
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part) => (part.startsWith("**") && part.endsWith("**") ? <strong>{part.slice(2, -2)}</strong> : part));
}

function Table(p: { table: { headers: string[]; rows: string[][] } }) {
  return (
    <table style="width:100%;margin:.6rem 0;font-size:.85rem;border-collapse:collapse">
      <thead>
        <tr>
          {p.table.headers.map((h) => (
            <th style="text-align:left;padding:.3rem .5rem;border-bottom:1px solid var(--rule)">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {p.table.rows.map((row) => (
          <tr>
            {row.map((cell) => (
              <td style="padding:.3rem .5rem;border-bottom:1px solid var(--rule);vertical-align:top">{renderInline(cell)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function docTitle(slug: string): string {
  return documentsData.documents.find((d) => d.slug === slug)?.title ?? slug;
}

function sectionForNumber(doc: FoundingDocument, n: string): Section | undefined {
  return doc.sections.find((s) => s.heading.startsWith(`${n}.`));
}

function crossRefLabel(ref: CrossReference): string {
  const title = docTitle(ref.targetDocumentSlug);
  if (ref.targetClauseId) return `${title} ${ref.targetClauseId}`;
  if (ref.targetArticle) return `${title}, Article ${ref.targetArticle}`;
  if (ref.targetSection) {
    const doc = documentsData.documents.find((d) => d.slug === ref.targetDocumentSlug);
    const sec = doc && sectionForNumber(doc, ref.targetSection);
    return sec ? `${title}, ${sec.heading}` : `${title}, Section ${ref.targetSection}`;
  }
  return title;
}

function crossRefHref(ref: CrossReference): string {
  const base = `/documents/${ref.targetDocumentSlug}`;
  if (ref.targetClauseId) return `${base}#${ref.targetClauseId}`;
  if (ref.targetSection) {
    const doc = documentsData.documents.find((d) => d.slug === ref.targetDocumentSlug);
    const idx = doc?.sections.findIndex((s) => s.heading.startsWith(`${ref.targetSection}.`));
    return idx !== undefined && idx >= 0 ? `${base}#section-${idx}` : base;
  }
  return base;
}

function crossRefPreview(ref: CrossReference): string | null {
  if (!ref.targetClauseId) return null;
  const doc = documentsData.documents.find((d) => d.slug === ref.targetDocumentSlug);
  const clause = doc?.clauses.find((c) => c.id === ref.targetClauseId);
  return clause ? clause.bodyMarkdown : null;
}

function refKey(ref: CrossReference): string {
  return `${ref.targetDocumentSlug}|${ref.targetClauseId ?? ""}|${ref.targetArticle ?? ""}|${ref.targetSection ?? ""}`;
}

/** Cross-references are extracted straightforwardly from prose and can
 * legitimately repeat within one long clause (the same clause number
 * mentioned twice in two different sentences) — dedupe for display here
 * rather than changing the generator's faithful extraction. */
function dedupeRefs(refs: CrossReference[]): CrossReference[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = refKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** "Referenced by" is built from every cross-reference in every clause, so a
 * clause that mentions the same target twice contributes the same source
 * twice. Display each source clause once, in order of first appearance. */
export function dedupeReferencedBy(refs: { documentSlug: string; clauseId: string }[]): { documentSlug: string; clauseId: string }[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.documentSlug}#${r.clauseId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// No client-side JavaScript anywhere in this app (CSP: script-src 'none') —
// <details>/<summary> is the brief's own no-JS inline-preview mechanism,
// and it's keyboard-operable natively with no extra work (Phase 2 plan §7).
function CrossRefChip(p: { ref: CrossReference }) {
  const preview = crossRefPreview(p.ref);
  const label = crossRefLabel(p.ref);
  const href = crossRefHref(p.ref);
  if (!preview) {
    return (
      <a class="pill gray" href={href} style="margin:0 .3rem .3rem 0;text-decoration:none;display:inline-block">
        {label}
      </a>
    );
  }
  return (
    <details style="display:inline-block;margin:0 .3rem .3rem 0;vertical-align:top">
      <summary class="pill gray" style="cursor:pointer;display:inline-block">
        {label}
      </summary>
      <div class="card small" style="max-width:28rem;margin-top:.3rem">
        {renderInline(preview)}
        <div style="margin-top:.4rem">
          <a href={href}>Open {label} →</a>
        </div>
      </div>
    </details>
  );
}

function ClauseBlock(p: { clause: Clause; doc: FoundingDocument; live: LiveValues | null }) {
  const { clause, doc, live } = p;
  const liveEntries = live?.[`${doc.slug}#${clause.id}`];
  const refs = dedupeRefs(clause.crossReferences);
  const referencedBy = dedupeReferencedBy(documentsData.referencedBy[`${doc.slug}#${clause.id}`] ?? []);
  const clauseKey = `${doc.slug}#${clause.id}`;
  const clauseInScope = IN_SCOPE_DOCUMENTS.has(doc.slug);
  // Out of scope (no entrenched clause anywhere in this document, and it
  // isn't the Charter): no clause-picker checkbox exists for it, so the
  // target-clause query param is omitted entirely — the link pre-fills
  // title/why/cls exactly as it did before this feature, free text as
  // always. In scope: defaults to "amendment" (or "entrenched," if the
  // clause itself is), never "ordinary," which the picker would then have
  // to silently raise anyway.
  const proposeHref = clauseInScope
    ? `/proposals?cls=${clause.isEntrenched ? "entrenched" : "amendment"}&title=${encodeURIComponent(`Amend ${doc.title} ${clause.id}`)}&why=${encodeURIComponent(`Changes ${doc.title} ${clause.id}.`)}&targetClauseIds=${encodeURIComponent(clauseKey)}`
    : `/proposals?cls=ordinary&title=${encodeURIComponent(`Amend ${doc.title} ${clause.id}`)}&why=${encodeURIComponent(`Changes ${doc.title} ${clause.id}.`)}`;
  return (
    <div class="card" id={clause.id} style="margin-bottom:.8rem">
      <div class="row" style="border:none;padding:0 0 .3rem 0;align-items:baseline">
        <span class="label" style="margin-bottom:0">
          {clause.id}
          {clause.leadTitle ? ` ${clause.leadTitle}` : ""}{" "}
          {clause.isEntrenched && <span class="pill">entrenched</span>}{" "}
          {clause.isScheduleOfDefaults && <span class="pill gray">schedule of defaults — {clause.scheduleKind}</span>}
        </span>
        <a class="small" href={`#${clause.id}`} title="Permanent link to this clause">
          #
        </a>
      </div>
      <p>{renderInline(clause.bodyMarkdown)}</p>
      {clause.attachedList && (
        <ul style="margin:.4rem 0 0 1.2rem">
          {clause.attachedList.map((item) => (
            <li class="small">{renderInline(item)}</li>
          ))}
        </ul>
      )}
      {clause.attachedTable && <Table table={clause.attachedTable} />}
      <p class="small" style="margin-top:.5rem">
        <a href={proposeHref}>Propose a change →</a>
        {clause.isEntrenched && (
          <span class="muted"> — entrenched: three-quarters majority, 40% minimum participation (Charter 8.2)</span>
        )}
      </p>
      {/* Phase 2 stage 4 — "Live in this community". Absent whenever the
          live-values fetch failed or this clause has no live value at all
          (most clauses don't) — never a box showing a zero that looks real. */}
      {liveEntries && liveEntries.length > 0 && (
        <div class="card" style="margin-top:.6rem;background:var(--paper)">
          <span class="label" style="margin-bottom:.3rem">
            Live in this community
          </span>
          {liveEntries.map((entry) => (
            <div class="row" style="border:none;padding:.15rem 0">
              <span class="small sans muted">{entry.label}</span>
              <span class="small sans">{entry.value}</span>
            </div>
          ))}
        </div>
      )}
      {refs.length > 0 && (
        <div class="small muted" style="margin-top:.5rem">
          <span class="sans" style="font-weight:600">
            References:
          </span>{" "}
          {refs.map((r) => (
            <CrossRefChip ref={r} />
          ))}
        </div>
      )}
      {referencedBy.length > 0 && (
        <div class="small muted" style="margin-top:.3rem">
          <span class="sans" style="font-weight:600">
            Referenced by:
          </span>{" "}
          {referencedBy.map((r) => (
            <a class="pill gray" href={`/documents/${r.documentSlug}#${r.clauseId}`} style="margin:0 .3rem .3rem 0;text-decoration:none;display:inline-block">
              {docTitle(r.documentSlug)} {r.clauseId}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// Stage A — public document search. The existing /search is member-only
// (app/src/index.tsx's `isPublicRequest` never lists it, and its handler
// reads `c.get("member")!` unconditionally); the founding documents are
// public, so this is a second, separate search living on the Library page
// itself rather than a new section bolted onto the member-only one — that
// would have quietly widened /search's access rules, which the task
// explicitly rules out. Submits as a plain GET to /documents?q=..., so no
// new route and no new public-access rule are needed; GET /documents is
// already public.
function DocumentSearchResults(p: { q: string; results: DocumentSearchResult[]; totalMatches: number }) {
  if (p.q === "") return null;
  return (
    <div class="card" style="margin-bottom:1rem">
      <span class="label">Documents</span>
      {p.totalMatches === 0 ? (
        <p class="muted small" style="margin-top:.4rem">No matches for "{p.q}".</p>
      ) : (
        <>
          <p class="muted small" style="margin-top:.2rem">
            {p.totalMatches === p.results.length
              ? `${p.totalMatches} match${p.totalMatches === 1 ? "" : "es"} found.`
              : `Showing the first ${p.results.length} of ${p.totalMatches} matches.`}
          </p>
          {p.results.map((r) => (
            <div class="row" style="padding:.5rem 0;align-items:baseline;flex-wrap:wrap">
              <div style="flex:1;min-width:230px">
                <a href={r.href}>
                  {r.documentTitle} {r.clauseId}
                  {r.clauseTitle ? ` — ${r.clauseTitle}` : ""}
                </a>{" "}
                {r.isEntrenched && <span class="pill">entrenched</span>}
                <p class="small muted" style="margin-top:.2rem">
                  {r.before}
                  <mark>{r.match}</mark>
                  {r.after}
                </p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export const DocumentsLibraryPage = (p: {
  member: { id: number; name: string } | null;
  adminDebug: boolean;
  communityName: string;
  search?: { q: string; results: DocumentSearchResult[]; totalMatches: number };
}) => (
  <Layout title="Documents" tab="documents" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
    <h2 class="pagetitle">The founding documents — proposals, not ratified law</h2>
    <p class="muted small" style="margin-bottom:1rem">
      Eleven documents, none of them enacted yet. One member, one vote; a public, permanent record; liquid
      delegation; a two-tier dividend. Read what a rule actually says before arguing about what it should say.
    </p>
    <div class="card" style="margin-bottom:1rem">
      <form method="get" action="/documents" style="display:flex;gap:.5rem;flex-wrap:wrap">
        <label class="sr-only" for="documents-search-q">Search the founding documents</label>
        <input
          id="documents-search-q"
          name="q"
          placeholder="Search clause text, titles, or a clause id like 4.8…"
          value={p.search?.q ?? ""}
          style="flex:1;min-width:14rem"
        />
        <button class="primary" type="submit">
          Search
        </button>
      </form>
    </div>
    {p.search && <DocumentSearchResults q={p.search.q} results={p.search.results} totalMatches={p.search.totalMatches} />}
    <div class="grid cols2">
      {documentsData.documents.map((d) => (
        <a class="card" href={`/documents/${d.slug}`} style="text-decoration:none;color:inherit">
          <span class="label" style="margin-bottom:0">
            {d.title} {STATUS_LABEL[d.status] && <span class="pill gray">{STATUS_LABEL[d.status]}</span>}
          </span>
          <p class="small muted" style="margin:.4rem 0">
            {d.introText}
          </p>
          <span class="small muted">{d.clauses.length} clauses</span>
        </a>
      ))}
    </div>
  </Layout>
);

export interface DefaultsPageRow {
  id: string;
  documentSlug: string;
  clauseId: string;
  scheduleClauseId: string;
  label: string;
  defaultValue: string;
  // null when the community's live value is the same as the default, or
  // when paramsPath is null (a code constant — there is no "community"
  // value distinct from the default to show).
  liveValue: string | null;
  isEntrenched: boolean;
}

// Phase 2 stage 6 — one row per defaultsRegistry.ts entry, grouped by the
// schedule-of-defaults clause that accounts for it. "Propose a change"
// pre-fills the existing /proposals form via query params (title, why,
// cls) rather than adding a new field — the proposals schema is unchanged
// this stage, so there is nowhere to actually submit a target clause id;
// the entrenched threshold is shown here as plain text next to the link
// instead, matching the Charter 8.2 disclosure's own register.
export const DocumentsDefaultsPage = (p: {
  member: { id: number; name: string } | null;
  adminDebug: boolean;
  communityName: string;
  rows: DefaultsPageRow[];
  unaccountedGac: { documentSlug: string; clauseId: string; note: string }[];
}) => {
  const groups = new Map<string, DefaultsPageRow[]>();
  for (const row of p.rows) {
    const key = `${row.documentSlug}#${row.scheduleClauseId}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  return (
    <Layout title="Defaults" tab="documents" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <p class="small muted" style="margin-bottom:.6rem">
        <a href="/documents">← All documents</a>
      </p>
      <h2 class="pagetitle">Every community-set default</h2>
      <p class="muted small" style="margin-bottom:1rem;max-width:52rem">
        Charter 2.4a: every community-set default is accounted for as derived or chosen, at its clause or in that
        document's schedule of defaults. This page is that accounting, read live — the value shown is what this
        community actually runs today, not a copy retyped from the document.
      </p>
      {[...groups.entries()].map(([key, rows]) => {
        const [slug, scheduleClauseId] = key.split("#");
        return (
          <div class="card" style="margin-bottom:.8rem">
            <span class="label">
              {docTitle(slug)} <a href={`/documents/${slug}#${scheduleClauseId}`}>{scheduleClauseId}</a>
            </span>
            {rows.map((row) => (
              <div class="row" style="padding:.5rem 0;align-items:baseline;flex-wrap:wrap">
                <div style="flex:1;min-width:230px">
                  <a href={`/documents/${row.documentSlug}#${row.clauseId}`}>
                    {docTitle(row.documentSlug)} {row.clauseId}
                  </a>{" "}
                  {row.isEntrenched && <span class="pill">entrenched</span>}
                  <div class="small muted">{row.label}</div>
                </div>
                <div class="small sans" style="text-align:right">
                  <div>
                    {row.defaultValue}
                    {row.liveValue === null && row.defaultValue !== "not implemented" ? " (default)" : ""}
                  </div>
                  {row.liveValue !== null && <div class="muted">live in this community: {row.liveValue}</div>}
                </div>
                <div style="width:100%">
                  <a
                    class="small"
                    href={`/proposals?cls=${row.isEntrenched ? "entrenched" : IN_SCOPE_DOCUMENTS.has(row.documentSlug) ? "amendment" : "ordinary"}&title=${encodeURIComponent(`Amend ${docTitle(row.documentSlug)} ${row.clauseId} — ${row.label}`)}&why=${encodeURIComponent(`Current value: ${row.defaultValue}.`)}${IN_SCOPE_DOCUMENTS.has(row.documentSlug) ? `&targetClauseIds=${encodeURIComponent(`${row.documentSlug}#${row.clauseId}`)}` : ""}`}
                  >
                    Propose a change →
                  </a>
                  {row.isEntrenched && (
                    <span class="small muted"> — entrenched: three-quarters majority, 40% minimum participation (Charter 8.2)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {p.unaccountedGac.length > 0 && (
        <div class="card">
          <span class="label">Not accounted for anywhere</span>
          <p class="muted small" style="margin-bottom:.5rem">
            The Government Adoption Compact has real defaults but no schedule-of-defaults clause of its own —
            Charter 2.4a has nothing to point at for these.
          </p>
          {p.unaccountedGac.map((u) => (
            <div class="small" style="padding:.2rem 0">
              <a href={`/documents/${u.documentSlug}#${u.clauseId}`}>
                {docTitle(u.documentSlug)} {u.clauseId}
              </a>{" "}
              <span class="muted">— {u.note}</span>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
};

export const DocumentsReaderPage = (p: { member: { id: number; name: string } | null; adminDebug: boolean; communityName: string; doc: FoundingDocument; live: LiveValues | null }) => {
  const { doc, live } = p;
  return (
    <Layout title={doc.title} tab="documents" member={p.member} adminDebug={p.adminDebug} communityName={p.communityName}>
      <p class="small muted" style="margin-bottom:.6rem">
        <a href="/documents">← All documents</a>
      </p>
      <h2 class="pagetitle">{doc.title}</h2>
      <p class="muted small" style="margin-bottom:1rem">
        {doc.introText}
      </p>
      <div class="card" style="margin-bottom:1rem">
        <span class="label">Contents</span>
        {doc.sections.map((s, idx) => (
          <div class="small" style="margin-top:.2rem">
            <a href={`#section-${idx}`}>{s.heading}</a>
          </div>
        ))}
      </div>
      {doc.sections.map((section, idx) => (
        <div style="margin-bottom:1.2rem">
          <h3 id={`section-${idx}`} style="font-size:1.1rem;margin:1.2rem 0 .6rem">
            {section.heading}
          </h3>
          {section.introMarkdown && <p class="muted small" style="margin-bottom:.5rem">{renderInline(section.introMarkdown)}</p>}
          {section.introList && (
            <ul style="margin:0 0 .5rem 1.2rem">
              {section.introList.map((item) => (
                <li class="small">{renderInline(item)}</li>
              ))}
            </ul>
          )}
          {section.introTable && <Table table={section.introTable} />}
          {section.clauseIds.map((id) => {
            const clause = doc.clauses.find((c) => c.id === id);
            return clause ? <ClauseBlock clause={clause} doc={doc} live={live} /> : null;
          })}
          {section.clauseIds.length === 0 && !section.introMarkdown && !section.introList && !section.introTable && (
            <p class="muted small">No clauses in this section.</p>
          )}
        </div>
      ))}
    </Layout>
  );
};
