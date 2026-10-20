import { describe, it, expect } from "vitest";
import { searchDocuments, MAX_DOCUMENT_SEARCH_RESULTS } from "./documentsSearch";
import type { DocumentsGenerated, Clause } from "../../scripts/documentsParser";

describe("searchDocuments", () => {
  it("finds a clause by its id (4.8)", () => {
    const { results } = searchDocuments("4.8");
    expect(results.some((r) => r.documentSlug === "charter" && r.clauseId === "4.8")).toBe(true);
  });

  it("finds a clause by a word in its body text ('recall' → Charter 4.8's own 'recall band')", () => {
    const { results } = searchDocuments("recall");
    const hit = results.find((r) => r.documentSlug === "charter" && r.clauseId === "4.8");
    expect(hit).toBeDefined();
    // The match piece itself is the literal query, case-preserved from source.
    expect(hit!.match.toLowerCase()).toBe("recall");
  });

  it("is case-insensitive", () => {
    const upper = searchDocuments("RECALL").results;
    const lower = searchDocuments("recall").results;
    expect(upper.map((r) => r.href)).toEqual(lower.map((r) => r.href));
  });

  it("finds an entrenched clause and flags it as entrenched", () => {
    const { results } = searchDocuments("cannot be shortened or lowered");
    const hit = results.find((r) => r.documentSlug === "charter" && r.clauseId === "8.2");
    expect(hit).toBeDefined();
    expect(hit!.isEntrenched).toBe(true);
  });

  it("returns zero results, not an error, for an empty query", () => {
    expect(searchDocuments("")).toEqual({ results: [], totalMatches: 0 });
    expect(searchDocuments("   ")).toEqual({ results: [], totalMatches: 0 }); // whitespace-only
  });

  it("handles a query containing regex-special characters as a literal substring, not a crash", () => {
    // No regex is used internally — this must never throw, and must match
    // only where the literal substring actually appears.
    expect(() => searchDocuments("(Compact 7.3)")).not.toThrow();
    const { results } = searchDocuments("(Compact 7.3)");
    expect(results.some((r) => r.documentSlug === "charter" && r.clauseId === "8.2")).toBe(true);
  });

  it("returns zero results for a query that matches nothing", () => {
    const { results, totalMatches } = searchDocuments("zzzznonexistentqueryzzzz");
    expect(results).toEqual([]);
    expect(totalMatches).toBe(0);
  });

  it("caps results at MAX_DOCUMENT_SEARCH_RESULTS but reports the true total", () => {
    // A single common character is guaranteed to exceed the cap across the
    // whole corpus (hundreds of clauses), proving totalMatches isn't just
    // results.length in disguise.
    const { results, totalMatches } = searchDocuments("e");
    expect(results.length).toBe(MAX_DOCUMENT_SEARCH_RESULTS);
    expect(totalMatches).toBeGreaterThan(MAX_DOCUMENT_SEARCH_RESULTS);
  });

  it("every result's href points into the Reader at the right document and clause", () => {
    const { results } = searchDocuments("recall");
    for (const r of results) {
      expect(r.href).toBe(`/documents/${r.documentSlug}#${r.clauseId}`);
    }
  });

  it("the match piece is exactly the query's own length, from the original (non-lowercased) text", () => {
    const { results } = searchDocuments("Recall");
    const hit = results.find((r) => r.documentSlug === "charter" && r.clauseId === "4.8")!;
    expect(hit.match.length).toBe("Recall".length);
  });
});

// Markdown-marker stripping — fixture-based so each case is deterministic
// regardless of whether the real corpus happens to contain a link or a
// bold table cell today (checked: it doesn't, for links). Search and
// snippet-building both run on the already-cleaned text (see
// documentsSearch.ts's stripMarkdownMarkers), so there is only ever one
// coordinate space to get the match position right in.
function fixtureClause(id: string, bodyMarkdown: string, attachedTable: Clause["attachedTable"] = null): Clause {
  return {
    id,
    documentSlug: "fixture-doc",
    leadTitle: null,
    bodyMarkdown,
    attachedList: null,
    attachedTable,
    crossReferences: [],
    isScheduleOfDefaults: false,
    scheduleKind: null,
    isEntrenched: false,
  };
}

const MARKUP_FIXTURE: DocumentsGenerated = {
  documents: [
    {
      slug: "fixture-doc",
      sourceFile: "Fixture.md",
      title: "Fixture Document",
      status: "standard",
      introText: "",
      sections: [],
      clauses: [
        fixtureClause("1.1", "This establishes an **important rule** about governance."),
        fixtureClause("1.2", "See [the full policy](https://example.com/policy) for details."),
        fixtureClause("1.3", "A table describes the split.", { headers: ["Allocation", "Share"], rows: [["Operations", "**capped** at forty percent"]] }),
      ],
    },
  ],
  referencedBy: {},
  entrenchedClauseIds: [],
  entrenchedSections: [],
  entrenchedDocuments: [],
  unaccountedDefaults: [],
};

describe("searchDocuments — markdown-marker stripping", () => {
  it("a query inside a **bold** phrase: no stray asterisks in the snippet, and the match is still highlighted", () => {
    const { results } = searchDocuments("important rule", MARKUP_FIXTURE);
    const hit = results.find((r) => r.clauseId === "1.1");
    expect(hit).toBeDefined();
    expect(hit!.match).toBe("important rule");
    const combined = hit!.before + hit!.match + hit!.after;
    expect(combined).not.toContain("*");
    expect(combined).toContain("This establishes an important rule about governance");
  });

  it("a query inside a [text](url) link: the URL and brackets are gone, the link text remains, and the match is still highlighted", () => {
    const { results } = searchDocuments("full policy", MARKUP_FIXTURE);
    const hit = results.find((r) => r.clauseId === "1.2");
    expect(hit).toBeDefined();
    expect(hit!.match).toBe("full policy");
    const combined = hit!.before + hit!.match + hit!.after;
    expect(combined).not.toContain("[");
    expect(combined).not.toContain("](");
    expect(combined).not.toContain("https://");
    expect(combined).toContain("See the full policy for details");
  });

  it("a query inside a table cell: no stray asterisks in the snippet, and the match is still highlighted", () => {
    const { results } = searchDocuments("capped", MARKUP_FIXTURE);
    const hit = results.find((r) => r.clauseId === "1.3");
    expect(hit).toBeDefined();
    expect(hit!.match).toBe("capped");
    const combined = hit!.before + hit!.match + hit!.after;
    expect(combined).not.toContain("*");
    expect(combined).toContain("capped at forty percent");
  });
});
