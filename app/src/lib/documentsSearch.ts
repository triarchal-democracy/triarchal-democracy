// Documents search (Stage A). Single source of truth: app/src/generated/documents.ts
// — no second index, no hand-maintained list of searchable fields. Matching is
// deliberately simple: lowercase, case-insensitive substring, no regex, no new
// dependency. Public, same reasoning as the rest of the Documents area —
// nothing here depends on a signed-in member or any per-community DB state.
import { documentsData } from "../generated/documents";
import type { DocumentsGenerated, Clause } from "../../scripts/documentsParser";

export interface DocumentSearchResult {
  documentSlug: string;
  documentTitle: string;
  clauseId: string;
  clauseTitle: string | null;
  isEntrenched: boolean;
  href: string;
  // The snippet, split so the match can be rendered distinctly (e.g. <mark>)
  // without ever concatenating into a raw-HTML string — each piece is its
  // own text child, escaped like any other JSX text.
  before: string;
  match: string;
  after: string;
}

export const MAX_DOCUMENT_SEARCH_RESULTS = 30;
const SNIPPET_RADIUS = 50; // characters kept on each side of the match

// Markdown markers that are legitimate in a clause's own source (Charter
// 5.3's "**five times an equal share**" is real emphasis) but read as
// stray syntax in a short search snippet rather than as emphasis. Stripped
// per-field, before any field is joined into the combined searchable text
// — so a marker's closing half in one field can never accidentally pair
// with an opening half in an unrelated one — and therefore before any
// matching happens at all. Search and snippet-building both then operate
// entirely on this one cleaned string, so the match position is correct by
// construction: there is never a second, differently-indexed "raw" text to
// reconcile it against.
function stripMarkdownMarkers(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** -> bold
    .replace(/\*([^*]+)\*/g, "$1") // *italic* -> italic
    .replace(/`([^`]+)`/g, "$1") // `code` -> code
    .replace(/^[-*]\s+/, ""); // a leading list dash/bullet, if one survived this field's own extraction
}

// Clause id, lead title, body, and any attached list/table — "clause text,
// clause titles, and clause ids" per the instruction. Joined with a
// separator unlikely to appear naturally, so a query can't accidentally
// span two unrelated fields and look like one match.
function clauseSearchableText(clause: Clause): string {
  const parts = [clause.id, clause.leadTitle ?? "", clause.bodyMarkdown];
  if (clause.attachedList) parts.push(...clause.attachedList);
  if (clause.attachedTable) {
    parts.push(clause.attachedTable.headers.join(" | "));
    for (const row of clause.attachedTable.rows) parts.push(row.join(" | "));
  }
  return parts.map(stripMarkdownMarkers).join("  ");
}

function buildSnippet(haystack: string, matchStart: number, matchLen: number): { before: string; match: string; after: string } {
  const start = Math.max(0, matchStart - SNIPPET_RADIUS);
  const end = Math.min(haystack.length, matchStart + matchLen + SNIPPET_RADIUS);
  return {
    before: (start > 0 ? "…" : "") + haystack.slice(start, matchStart),
    match: haystack.slice(matchStart, matchStart + matchLen),
    after: haystack.slice(matchStart + matchLen, end) + (end < haystack.length ? "…" : ""),
  };
}

export interface DocumentSearchOutcome {
  results: DocumentSearchResult[];
  totalMatches: number;
}

export function searchDocuments(rawQuery: string, data: DocumentsGenerated = documentsData, limit: number = MAX_DOCUMENT_SEARCH_RESULTS): DocumentSearchOutcome {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return { results: [], totalMatches: 0 };
  const matchLen = rawQuery.trim().length;
  const matches: DocumentSearchResult[] = [];
  for (const doc of data.documents) {
    for (const clause of doc.clauses) {
      const haystack = clauseSearchableText(clause);
      const idx = haystack.toLowerCase().indexOf(q);
      if (idx < 0) continue;
      const snippet = buildSnippet(haystack, idx, matchLen);
      matches.push({
        documentSlug: doc.slug,
        documentTitle: doc.title,
        clauseId: clause.id,
        clauseTitle: clause.leadTitle,
        isEntrenched: clause.isEntrenched,
        href: `/documents/${doc.slug}#${clause.id}`,
        before: snippet.before,
        match: snippet.match,
        after: snippet.after,
      });
    }
  }
  return { results: matches.slice(0, limit), totalMatches: matches.length };
}
