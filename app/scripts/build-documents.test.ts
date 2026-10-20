import { describe, it, expect } from "vitest";
import { readAllFoundingMarkdown, renderModule } from "./build-documents.ts";
import { buildDocumentsData, MANIFEST, parseDocument } from "./documentsParser.ts";
import { readFileSync } from "node:fs";

// 2026-10-11, Phase 2 stage 1. The staleness check is a plain in-memory
// equality — no subprocess, no temp file, no overwrite-and-restore, unlike
// site-src/verify.py's equivalent for the Python generators (see
// docs/reviews/2026-10-11_documents-generator-research.md item 6). This is
// possible specifically because renderModule() is a pure function.
describe("generated documents.ts staleness", () => {
  it("matches what the generator would produce right now from docs/founding/*.md", () => {
    const founding = readAllFoundingMarkdown();
    const expected = renderModule(founding);
    const actual = readFileSync(new URL("../src/generated/documents.ts", import.meta.url), "utf-8");
    expect(actual).toBe(expected);
  });
});

// Found while building clause-structured amendments: `git restore` on a
// Windows checkout with core.autocrlf=true (and no .gitattributes
// override — this repo has none) re-materializes a founding document with
// CRLF line endings. None of the clause/heading regexes above can match a
// trailing `\r` (JS regex `.` excludes line terminators, `\r` included),
// so a CRLF document parsed to zero clauses entirely, silently, before
// parseDocument's CRLF normalization was added. This is a real risk for
// anyone who clones or checks this repo out fresh on Windows, not specific
// to one file or one session — guarded here so it can't come back quietly.
describe("CRLF robustness", () => {
  it("parses a CRLF-line-ended document identically to its LF original", () => {
    const lf = readAllFoundingMarkdown()["Founding_Charter.md"];
    const crlf = lf.replace(/\n/g, "\r\n");
    const fromLf = parseDocument("Founding_Charter.md", lf);
    const fromCrlf = parseDocument("Founding_Charter.md", crlf);
    expect(fromCrlf.clauses.length).toBeGreaterThan(0);
    expect(fromCrlf).toEqual(fromLf);
  });

  it("parses a lone-CR-line-ended document (old Mac style) identically too", () => {
    const lf = readAllFoundingMarkdown()["Founding_Charter.md"];
    const cr = lf.replace(/\n/g, "\r");
    const fromLf = parseDocument("Founding_Charter.md", lf);
    const fromCr = parseDocument("Founding_Charter.md", cr);
    expect(fromCr).toEqual(fromLf);
  });
});

describe("cross-reference resolution", () => {
  const founding = readAllFoundingMarkdown();
  const data = buildDocumentsData(founding);
  const docBySlug = new Map(data.documents.map((d) => [d.slug, d]));

  it("resolves every targetClauseId to a real clause in its target document", () => {
    const broken: string[] = [];
    for (const doc of data.documents) {
      for (const clause of doc.clauses) {
        for (const ref of clause.crossReferences) {
          if (ref.targetClauseId === null) continue; // whole-document/Article refs have nothing to check here
          const targetDoc = docBySlug.get(ref.targetDocumentSlug);
          if (!targetDoc) {
            broken.push(`${doc.slug}#${clause.id} -> unknown document "${ref.targetDocumentSlug}"`);
            continue;
          }
          if (!targetDoc.clauses.some((c) => c.id === ref.targetClauseId)) {
            broken.push(`${doc.slug}#${clause.id} -> ${ref.targetDocumentSlug}#${ref.targetClauseId} (no such clause)`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("resolves every entrenchedClauseId to a real clause", () => {
    for (const id of data.entrenchedClauseIds) {
      const [slug, clauseId] = id.split("#");
      expect(docBySlug.get(slug)?.clauses.some((c) => c.id === clauseId)).toBe(true);
    }
  });

  // Stage 2 reference types.
  it("resolves every targetSection to a real section heading in its target document", () => {
    const broken: string[] = [];
    for (const doc of data.documents) {
      for (const clause of doc.clauses) {
        for (const ref of clause.crossReferences) {
          if (!ref.targetSection) continue;
          const targetDoc = docBySlug.get(ref.targetDocumentSlug);
          const ok = targetDoc?.sections.some((s) => s.heading.startsWith(`${ref.targetSection}.`));
          if (!ok) broken.push(`${doc.slug}#${clause.id} -> ${ref.targetDocumentSlug} section ${ref.targetSection} (no such section)`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("resolves every targetRight to one of the Member Bill of Rights' ten Roman-numeral clauses", () => {
    const bor = docBySlug.get("member-bill-of-rights")!;
    for (const doc of data.documents) {
      for (const clause of doc.clauses) {
        for (const ref of clause.crossReferences) {
          if (!ref.targetRight) continue;
          expect(bor.clauses.some((c) => c.id === ref.targetRight)).toBe(true);
        }
      }
    }
  });

  it("resolves 'Contribution Code 8' (Rules of Procedure 6.3) to a bare section reference, not a nonexistent clause '8'", () => {
    const cc = docBySlug.get("contribution-code")!;
    expect(cc.clauses.some((c) => c.id === "8")).toBe(false); // confirms the test is meaningful
    const ref = docBySlug
      .get("rules-of-procedure")!
      .clauses.find((c) => c.id === "6.3")!
      .crossReferences.find((r) => r.targetDocumentSlug === "contribution-code");
    expect(ref?.targetSection).toBe("8");
    expect(ref?.targetClauseId).toBeNull();
  });

  it("resolves named mechanisms (no clause number in the text at all) to their defining section", () => {
    const ref = docBySlug
      .get("treasury-code")!
      .clauses.find((c) => c.id === "8.1")!
      .crossReferences.find((r) => r.targetSection === "4" && r.targetDocumentSlug === "government-adoption-compact");
    expect(ref).toBeDefined();
  });

  it("'Right IV of the Bill of Rights' (Dispute Procedure Code 4.2) counts as one reference, not two", () => {
    const refs = docBySlug.get("dispute-procedure-code")!.clauses.find((c) => c.id === "4.2")!.crossReferences;
    expect(refs.filter((r) => r.targetDocumentSlug === "member-bill-of-rights")).toHaveLength(1);
  });
});

describe("Charter 8.2 entrenched-clause derivation", () => {
  const data = buildDocumentsData(readAllFoundingMarkdown());
  const charter = data.documents.find((d) => d.slug === "charter")!;
  const bor = data.documents.find((d) => d.slug === "member-bill-of-rights")!;

  it("derives exactly the six directly-cited clauses in entrenchedClauseIds", () => {
    // Seven provisions, six direct clause citations — 1.2 anchors both
    // provision 1 and provision 3, and the seventh provision (8.2 entrenching
    // itself) cites 8.2 directly. The other two provisions (Article VII,
    // the Bill of Rights in full) cite no single clause and live in
    // entrenchedSections/entrenchedDocuments instead, not here.
    expect(new Set(data.entrenchedClauseIds)).toEqual(new Set(["charter#1.2", "charter#3.2", "charter#2.5", "treasury-code#5.7", "government-adoption-compact#7.3", "charter#8.2"]));
  });

  it("derives exactly one entrenched section — Charter's own Article VII — with all three of its clauses", () => {
    expect(data.entrenchedSections).toHaveLength(1);
    expect(data.entrenchedSections[0].documentSlug).toBe("charter");
    expect(data.entrenchedSections[0].article).toBe("VII");
    expect(new Set(data.entrenchedSections[0].clauseIds)).toEqual(new Set(["7.1", "7.2", "7.3"]));
  });

  it("derives exactly one entrenched whole document — the Member Bill of Rights", () => {
    expect(data.entrenchedDocuments).toEqual(["member-bill-of-rights"]);
  });

  it("marks every clause in an entrenched Article as entrenched, not just the ones directly cited", () => {
    for (const id of ["7.1", "7.2", "7.3"]) {
      expect(charter.clauses.find((c) => c.id === id)?.isEntrenched, `charter#${id}`).toBe(true);
    }
  });

  it("marks all ten Member Bill of Rights clauses as entrenched, since the whole document is", () => {
    expect(bor.clauses).toHaveLength(10);
    for (const c of bor.clauses) expect(c.isEntrenched, `member-bill-of-rights#${c.id}`).toBe(true);
  });

  it("marks exactly 19 clauses entrenched corpus-wide: 6 direct + 3 (Article VII) + 10 (Bill of Rights)", () => {
    const entrenched = data.documents.flatMap((d) => d.clauses.filter((c) => c.isEntrenched).map((c) => `${d.slug}#${c.id}`));
    expect(entrenched).toHaveLength(19);
  });

  it("clause 1.2 is entrenched, since it anchors two of the seven provisions", () => {
    expect(charter.clauses.find((c) => c.id === "1.2")?.isEntrenched).toBe(true);
  });

  it("clause 8.2 is itself entrenched — the seventh provision entrenches the list, including itself", () => {
    expect(charter.clauses.find((c) => c.id === "8.2")?.isEntrenched).toBe(true);
  });

  it("attaches all seven of Charter 8.2's own citations to its crossReferences, including its self-citation, not an empty list", () => {
    const refs = charter.clauses.find((c) => c.id === "8.2")!.crossReferences;
    const keys = refs.map((r) => `${r.targetDocumentSlug}|${r.targetClauseId ?? ""}|${r.targetArticle ?? ""}`);
    expect(new Set(keys)).toEqual(
      new Set(["charter|1.2|", "charter|3.2|", "charter|2.5|", "charter||VII", "member-bill-of-rights||", "treasury-code|5.7|", "government-adoption-compact|7.3|", "charter|8.2|"])
    );
  });

  it("makes Charter 8.2 show up in 'referenced by' for every clause it directly cites, including itself", () => {
    for (const key of ["charter#1.2", "charter#3.2", "charter#2.5", "treasury-code#5.7", "government-adoption-compact#7.3", "charter#8.2"]) {
      expect(data.referencedBy[key]?.some((r) => r.documentSlug === "charter" && r.clauseId === "8.2"), key).toBe(true);
    }
  });
});

describe("schedule-of-defaults detection", () => {
  const data = buildDocumentsData(readAllFoundingMarkdown());

  it("finds exactly the eight schedule-of-defaults clauses the structure catalog confirmed", () => {
    const found = data.documents.flatMap((d) => d.clauses.filter((c) => c.isScheduleOfDefaults).map((c) => `${d.slug}#${c.id}`));
    expect(new Set(found)).toEqual(
      new Set([
        "charter#2.6",
        "treasury-code#9.7",
        "contribution-code#8.9",
        "rules-of-procedure#7.4",
        "code-of-conduct#4.5",
        "dispute-procedure-code#7.2",
        "triarc-membership-code#4.2",
        "triarc-operations-code#5.2",
      ])
    );
  });

  it("Dispute Procedure Code 7.2 is the one 'derived' outlier; every other schedule is 'chosen'", () => {
    for (const doc of data.documents) {
      for (const clause of doc.clauses) {
        if (!clause.isScheduleOfDefaults) continue;
        const expectedKind = doc.slug === "dispute-procedure-code" ? "derived" : "chosen";
        expect(clause.scheduleKind, `${doc.slug}#${clause.id}`).toBe(expectedKind);
      }
    }
  });

  it("Government Adoption Compact and Federation Compact have no schedule-of-defaults clause at all", () => {
    for (const slug of ["government-adoption-compact", "federation-compact"]) {
      const doc = data.documents.find((d) => d.slug === slug)!;
      expect(doc.clauses.some((c) => c.isScheduleOfDefaults)).toBe(false);
    }
  });

  it("flags Government Adoption Compact's real defaults as unaccounted for, since it has no schedule to anchor them", () => {
    expect(data.unaccountedDefaults.every((d) => d.documentSlug === "government-adoption-compact")).toBe(true);
    expect(data.unaccountedDefaults.length).toBeGreaterThan(0);
  });
});

describe("structural edge cases from the founding-docs catalog", () => {
  const data = buildDocumentsData(readAllFoundingMarkdown());
  const find = (slug: string, id: string) => data.documents.find((d) => d.slug === slug)!.clauses.find((c) => c.id === id)!;

  it("parses Government Adoption Compact 7.1's two lettered children, 7.1a AND 7.1b, not just one", () => {
    const gac = data.documents.find((d) => d.slug === "government-adoption-compact")!;
    expect(gac.clauses.some((c) => c.id === "7.1a")).toBe(true);
    expect(gac.clauses.some((c) => c.id === "7.1b")).toBe(true);
  });

  it("parses all ten Member Bill of Rights clauses by their Roman numerals, not the numeric regex", () => {
    const bor = data.documents.find((d) => d.slug === "member-bill-of-rights")!;
    expect(bor.clauses.map((c) => c.id)).toEqual(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]);
    expect(find("member-bill-of-rights", "I").leadTitle).toBe("Voice.");
  });

  it("captures Charter 3.1's four-stage lifecycle as an attached list, even though it's markdown ORDERED-list syntax, not bullets", () => {
    const c = find("charter", "3.1");
    expect(c.attachedList).not.toBeNull();
    expect(c.attachedList!.length).toBe(4);
    expect(c.attachedList![0]).toMatch(/Submission/);
  });

  it("attaches Contribution Code's Domain table to the SECTION, not to clause 2.1, which has no table of its own", () => {
    const cc = data.documents.find((d) => d.slug === "contribution-code")!;
    const section2 = cc.sections.find((s) => s.heading.startsWith("2."))!;
    expect(section2.introTable).not.toBeNull();
    expect(section2.introTable!.headers).toEqual(["Domain", "Share", "What accrues"]);
    expect(find("contribution-code", "2.1").attachedTable).toBeNull();
  });

  it("gives Code of Conduct's zero-clause '## 5. The spirit clause' section an empty clauseIds array, not a crash", () => {
    const coc = data.documents.find((d) => d.slug === "code-of-conduct")!;
    const section5 = coc.sections.find((s) => s.heading.startsWith("5."))!;
    expect(section5.clauseIds).toEqual([]);
    expect(section5.introMarkdown).toMatch(/No code anticipates everything/);
  });

  it("does not truncate a long hard-wrapped schedule-of-defaults clause (the exact bug the Python generator once had)", () => {
    const c = find("treasury-code", "9.7");
    expect(c.bodyMarkdown.length).toBeGreaterThan(1500);
    expect(c.bodyMarkdown).toMatch(/invoice\.$/);
  });

  it("does not merge a clause's text into the next section's ## heading when there's no blank line between them", () => {
    expect(find("treasury-code", "1.4").bodyMarkdown).not.toMatch(/##/);
    expect(find("rules-of-procedure", "2.4").bodyMarkdown).not.toMatch(/Voting/);
    expect(find("rules-of-procedure", "3.4").bodyMarkdown).not.toMatch(/Scheduling/);
  });
});

describe("document manifest", () => {
  const data = buildDocumentsData(readAllFoundingMarkdown());

  it("has all 11 founding documents, matching MANIFEST", () => {
    expect(data.documents.length).toBe(Object.keys(MANIFEST).length);
  });

  it("every dormant-status document's intro text actually says 'dormant'", () => {
    for (const doc of data.documents.filter((d) => d.status === "dormant")) {
      expect(doc.introText.toLowerCase()).toMatch(/dormant/);
    }
  });

  it("every triarc-only document's intro text says it isn't applicable to any other deployment", () => {
    for (const doc of data.documents.filter((d) => d.status === "triarc-only")) {
      expect(doc.introText.toLowerCase()).toMatch(/not applicable to any other deployment/);
    }
  });
});
