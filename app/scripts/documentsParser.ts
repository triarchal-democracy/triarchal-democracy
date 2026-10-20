// Pure parsing logic for the Documents area generator (Phase 2,
// docs/briefs/2026-10-11_app-review-and-documents.md). No file I/O anywhere in
// this module — app/scripts/build-documents.ts does the reading/writing;
// app/scripts/build-documents.test.ts imports buildDocumentsData directly to
// check staleness and cross-reference resolution in-memory.
//
// Clause-numbering and continuation regexes are a deliberate, faithful port
// of site-src/mdblocks.py / sync_site.py's approach (see
// docs/reviews/2026-10-11_documents-generator-research.md) — in particular
// the wrapped-line continuation bug that cost real time on the Python side
// once already (CLAUDE.md: "six hard-wrapped clauses were published cut off
// mid-sentence"). The structural edge cases below (double-lettered 7.1a/
// 7.1b, Charter 2.6 not being the last clause, zero-clause sections, missing
// blank lines before a `##` heading) are drawn from
// docs/reviews/2026-10-11_founding-docs-structure-catalog.md, which read all
// 11 documents specifically to find them before this parser was written.

export type DocStatus = "foundational" | "standard" | "staged" | "dormant" | "triarc-only";

export interface CrossReference {
  targetDocumentSlug: string;
  // null when the reference is to a whole document, Article, Right, or
  // bare section, rather than one specific clause.
  targetClauseId: string | null;
  targetArticle?: string; // Roman numeral, only set for an Article-level reference ("Article VII")
  targetRight?: string; // Roman numeral, only set for a Bill-of-Rights "Right N" reference
  targetSection?: string; // bare section number, only set for e.g. "Contribution Code 8" (no decimal — there is no clause literally "8")
}

export interface Clause {
  id: string; // "5.3", "5.3a", "I" (Roman, Bill of Rights only)
  documentSlug: string;
  leadTitle: string | null; // bold lead-in text for a CLAUSE_T/RIGHT-style clause
  bodyMarkdown: string;
  attachedList: string[] | null;
  attachedTable: { headers: string[]; rows: string[][] } | null;
  crossReferences: CrossReference[];
  isScheduleOfDefaults: boolean;
  scheduleKind: "chosen" | "derived" | null;
  isEntrenched: boolean;
}

export interface Section {
  heading: string;
  // The heading's own "Article <Roman>" token, if it has one (Charter only).
  article: string | null;
  clauseIds: string[];
  // Content between the heading and the section's first clause, belonging
  // to the SECTION rather than to any one clause — Contribution Code's
  // Domain table and Code of Conduct's "## 2. Violations" lead sentence
  // both sit here. null/null/null when a section's first real content is
  // already its first clause.
  introMarkdown: string | null;
  introList: string[] | null;
  introTable: { headers: string[]; rows: string[][] } | null;
}

export interface FoundingDocument {
  slug: string;
  sourceFile: string;
  title: string;
  status: DocStatus;
  introText: string;
  sections: Section[];
  clauses: Clause[];
}

export interface EntrenchedSection {
  documentSlug: string;
  article: string;
  sectionHeading: string;
  clauseIds: string[];
}

export interface DocumentsGenerated {
  documents: FoundingDocument[];
  referencedBy: Record<string, { documentSlug: string; clauseId: string }[]>;
  // Charter 8.2's seven provisions resolve to three different shapes:
  // entrenchedClauseIds holds the ones citing a specific clause directly
  // (1.2, 3.2, 2.5, Treasury 5.7, GAC 7.3, and 8.2 itself — six, not seven:
  // 1.2 anchors two provisions at once). entrenchedSections and
  // entrenchedDocuments hold the other two provisions, which cite a whole
  // Article (VII) or a whole document (the Member Bill of Rights, in full)
  // rather than one clause — every clause they contain is entrenched too,
  // via these two fields, not via entrenchedClauseIds.
  entrenchedClauseIds: string[];
  entrenchedSections: EntrenchedSection[];
  entrenchedDocuments: string[];
  // Government Adoption Compact's real defaults that no schedule-of-defaults
  // clause accounts for — Phase 1/Phase 2-review finding, surfaced on the
  // Defaults page rather than silently dropped. See founder decision #2.
  unaccountedDefaults: { documentSlug: string; clauseId: string; note: string }[];
}

export const MANIFEST: Record<string, { slug: string; status: DocStatus }> = {
  "Founding_Charter.md": { slug: "charter", status: "foundational" },
  "Treasury_Code.md": { slug: "treasury-code", status: "standard" },
  "Contribution_Code.md": { slug: "contribution-code", status: "standard" },
  "Rules_of_Procedure.md": { slug: "rules-of-procedure", status: "standard" },
  "Code_of_Conduct.md": { slug: "code-of-conduct", status: "standard" },
  "Dispute_Procedure_Code.md": { slug: "dispute-procedure-code", status: "standard" },
  "Member_Bill_of_Rights.md": { slug: "member-bill-of-rights", status: "standard" },
  "Federation_Compact.md": { slug: "federation-compact", status: "dormant" },
  "Government_Adoption_Compact.md": { slug: "government-adoption-compact", status: "staged" },
  "Triarc_Membership_Code.md": { slug: "triarc-membership-code", status: "triarc-only" },
  "Triarc_Operations_Code.md": { slug: "triarc-operations-code", status: "triarc-only" },
};

// Longest-name-first so "member bill of rights" is tried before "bill of
// rights" would otherwise shadow it, and so multi-word names are matched
// whole rather than on a shorter internal substring.
const DOC_NAMES: { name: string; slug: string }[] = [
  { name: "founding charter", slug: "charter" },
  { name: "member bill of rights", slug: "member-bill-of-rights" },
  { name: "the bill of rights", slug: "member-bill-of-rights" },
  { name: "treasury code", slug: "treasury-code" },
  { name: "contribution code", slug: "contribution-code" },
  { name: "rules of procedure", slug: "rules-of-procedure" },
  { name: "code of conduct", slug: "code-of-conduct" },
  { name: "dispute procedure code", slug: "dispute-procedure-code" },
  { name: "federation compact", slug: "federation-compact" },
  { name: "government adoption compact", slug: "government-adoption-compact" },
  { name: "triarc membership code", slug: "triarc-membership-code" },
  { name: "triarc operations code", slug: "triarc-operations-code" },
  { name: "charter", slug: "charter" },
].sort((a, b) => b.name.length - a.name.length);

// (Stage 2) Mechanisms referenced by proper-noun name, not a clause number —
// catalog item 3c. Both defined in the Government Adoption Compact; the
// section number is where each is actually defined, for the Reader's
// cross-reference preview to point at.
const NAMED_MECHANISMS: { pattern: RegExp; slug: string; section: string }[] = [
  { pattern: /Delegated-Authority Mechanism/, slug: "government-adoption-compact", section: "4" },
  { pattern: /Default-Delegate Mechanism/, slug: "government-adoption-compact", section: "3" },
];

const CLAUSE = /^\*\*(\d+\.\d+[a-z]?)\*\*\s+(.*)$/;
const CLAUSE_T = /^\*\*(\d+\.\d+[a-z]?)\s+(.+?)\*\*\s*(.*)$/;
const RIGHT = /^\*\*([IVX]+)\.\s+(.+?)\*\*\s*(.*)$/;
const HEADING = /^##\s+(.*)$/;
const ARTICLE_IN_HEADING = /Article\s+([IVX]+)/;
const STOP_PREFIXES = ["**", ">", "#", "|", "-", "*", "<"];
const BULLET_LINE = /^[-*]\s+/;
// Charter 3.1's four-stage lifecycle is the one list in the whole corpus
// that uses markdown ORDERED-list syntax ("1. **Submission**...") rather
// than bullets — without this, continuation() stops at the blank line
// before it and attachedStructure() finds neither a bullet nor a table, so
// the entire list silently disappears from the clause's content. "1." also
// never collides with a clause number, because a real clause number is
// always wrapped in `**...**` at the very start of the line (CLAUSE's own
// anchor), never a bare "N." — Charter 3.1 is a parenthesis-free integer
// followed by a period and a bold word.
const NUMBERED_LINE = /^\d+\.\s+/;
const TABLE_ROW = /^\|/;

function startsWithStop(line: string): boolean {
  const l = line.trimStart();
  return STOP_PREFIXES.some((p) => l.startsWith(p));
}

/** Faithful port of mdblocks.py/sync_site.py's `_continuation`: keep consuming
 * lines until a blank line or a line starting with a stop-prefix — checked
 * independently of the blank-line check, so a clause that runs directly into
 * a `##` heading with no blank line between them (confirmed in Treasury Code
 * and Rules of Procedure ×2) still stops correctly. */
function continuation(lines: string[], startIndex: number): { body: string[]; next: number } {
  const body: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") break;
    if (startsWithStop(line)) break;
    body.push(line.trim());
    i++;
  }
  return { body, next: i };
}

/** After continuation stops, check whether the stopping point is an attached
 * bullet list or table (vs. a genuine new clause/heading, which attaches
 * nothing). Consumes the attached block and returns the new position. */
function attachedStructure(lines: string[], startIndex: number): { list: string[] | null; table: Clause["attachedTable"]; next: number } {
  // continuation() stops AT a blank line without consuming it, so the next
  // real content (a bullet list, a table, or nothing) sits one or more
  // blank lines ahead of startIndex — skip them to look, but only commit to
  // skipping if something actually attaches; otherwise leave startIndex
  // untouched so the main loop's normal line-by-line advance still finds
  // whatever comes next (a new clause, a heading, or genuinely nothing).
  let i = startIndex;
  while (i < lines.length && lines[i].trim() === "") i++;
  const isListStart = (l: string) => BULLET_LINE.test(l) || NUMBERED_LINE.test(l);
  if (i >= lines.length || !(isListStart(lines[i].trim()) || TABLE_ROW.test(lines[i].trim()))) {
    return { list: null, table: null, next: startIndex };
  }
  const line = lines[i];

  if (isListStart(line.trim())) {
    const items: string[] = [];
    while (i < lines.length && isListStart(lines[i].trim())) {
      items.push(lines[i].trim().replace(BULLET_LINE, "").replace(NUMBERED_LINE, ""));
      i++;
    }
    return { list: items, table: null, next: i };
  }

  if (TABLE_ROW.test(line.trim())) {
    const rows: string[][] = [];
    while (i < lines.length && TABLE_ROW.test(lines[i].trim())) {
      rows.push(
        lines[i]
          .trim()
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx !== 0 && idx !== arr.length - 1)
      );
      i++;
    }
    // Row 1 = headers, row 2 = the `---|---` separator (discarded), rest = data.
    const headers = rows[0] ?? [];
    const dataRows = rows.slice(2);
    return { list: null, table: { headers, rows: dataRows }, next: i };
  }

  return { list: null, table: null, next: i };
}

interface RawClause {
  id: string;
  leadTitle: string | null;
  bodyMarkdown: string;
  attachedList: string[] | null;
  attachedTable: Clause["attachedTable"];
}

function parseClauses(lines: string[]): { clauses: RawClause[]; sections: { heading: string; article: string | null; startLine: number }[] } {
  const clauses: RawClause[] = [];
  const sections: { heading: string; article: string | null; startLine: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const h = line.match(HEADING);
    if (h) {
      const articleMatch = h[1].match(ARTICLE_IN_HEADING);
      sections.push({ heading: h[1].trim(), article: articleMatch ? articleMatch[1] : null, startLine: i });
      i++;
      continue;
    }

    let m = line.match(CLAUSE);
    let id: string | null = null;
    let leadTitle: string | null = null;
    let firstLineRest = "";
    if (m) {
      id = m[1];
      firstLineRest = m[2];
    } else {
      m = line.match(CLAUSE_T);
      if (m) {
        id = m[1];
        leadTitle = m[2];
        firstLineRest = m[3] ?? "";
      } else {
        m = line.match(RIGHT);
        if (m) {
          id = m[1];
          leadTitle = m[2];
          firstLineRest = m[3] ?? "";
        }
      }
    }

    if (id === null) {
      i++;
      continue;
    }

    const { body, next } = continuation(lines, i + 1);
    const { list, table, next: afterAttached } = attachedStructure(lines, next);
    const bodyMarkdown = [firstLineRest, ...body].filter((s) => s.length > 0).join(" ");
    clauses.push({ id, leadTitle, bodyMarkdown, attachedList: list, attachedTable: table });
    i = afterAttached;
  }
  return { clauses, sections };
}

function isClauseOrHeadingLine(line: string): boolean {
  return CLAUSE.test(line) || CLAUSE_T.test(line) || RIGHT.test(line) || HEADING.test(line);
}

/** Content between a section's heading and its first clause, belonging to
 * the section rather than any one clause (Contribution Code's Domain table,
 * Code of Conduct's "## 2. Violations" lead sentence). Mirrors
 * continuation()/attachedStructure()'s stop rules, plus stopping at a clause
 * marker too (continuation() never has to worry about that case, since it
 * always starts just after a clause has already matched). */
function parseSectionPreamble(lines: string[], start: number, end: number): { introMarkdown: string | null; introList: string[] | null; introTable: Clause["attachedTable"] } {
  let i = start;
  while (i < end && lines[i].trim() === "") i++;
  const introLines: string[] = [];
  while (i < end && lines[i].trim() !== "" && !isClauseOrHeadingLine(lines[i]) && !BULLET_LINE.test(lines[i].trim()) && !NUMBERED_LINE.test(lines[i].trim()) && !TABLE_ROW.test(lines[i].trim())) {
    introLines.push(lines[i].trim());
    i++;
  }
  const { list, table } = attachedStructure(lines, i);
  return { introMarkdown: introLines.length ? introLines.join(" ") : null, introList: list, introTable: table };
}

/** Attach each parsed clause to the section it falls under, by line position. */
function assignSections(
  sections: { heading: string; article: string | null; startLine: number }[],
  lines: string[],
  clauseStartLines: Map<string, number>
): Section[] {
  return sections.map((s, idx) => {
    const end = idx + 1 < sections.length ? sections[idx + 1].startLine : lines.length;
    const entriesInSection = [...clauseStartLines.entries()].filter(([, line]) => line >= s.startLine && line < end);
    const clauseIds = entriesInSection.map(([id]) => id);
    const firstClauseLine = entriesInSection.length ? Math.min(...entriesInSection.map(([, line]) => line)) : end;
    const preamble = parseSectionPreamble(lines, s.startLine + 1, firstClauseLine);
    return { heading: s.heading, article: s.article, clauseIds, ...preamble };
  });
}

/** Finds every `CLAUSE`/`CLAUSE_T`/`RIGHT` match's own starting line, so
 * assignSections can bucket clauses by position without re-scanning. */
function clauseStartLines(lines: string[]): Map<string, number> {
  const map = new Map<string, number>();
  lines.forEach((line, idx) => {
    const m = line.match(CLAUSE) ?? line.match(CLAUSE_T) ?? line.match(RIGHT);
    if (m) map.set(m[1], idx);
  });
  return map;
}

const DOC_NUM_REF = /(\d+\.\d+[a-z]?)\s+through\s+(\d+\.\d+[a-z]?)/gi;
const BARE_NUM = /\b(\d+\.\d+[a-z]?)\b/g;

function extractCrossReferences(text: string, currentDocSlug: string, allClauseIds: Map<string, Set<string>>): CrossReference[] {
  const refs: CrossReference[] = [];
  const consumed = new Set<number>(); // character offsets already claimed by a longer match

  // 1. Full document name + clause number (case-insensitive), or name + range.
  for (const { name, slug } of DOC_NAMES) {
    const re = new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\s+(\\d+\\.\\d+[a-z]?)(?:\\s+through\\s+(\\d+\\.\\d+[a-z]?))?`, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      if ([...consumed].some((c) => c >= match!.index && c < match!.index + match![0].length)) continue;
      for (let c = match.index; c < match.index + match[0].length; c++) consumed.add(c);
      if (match[2]) {
        for (const id of expandRange(match[1], match[2])) refs.push({ targetDocumentSlug: slug, targetClauseId: id });
      } else {
        refs.push({ targetDocumentSlug: slug, targetClauseId: match[1] });
      }
    }
  }

  // 1b. (Stage 2) Full document name + bare SECTION number, no decimal —
  // "Contribution Code 8" means the whole "## 8. Positions and Supporting
  // Nominees" section; there is no clause literally numbered "8", only 8.1
  // through 8.9. Must run after step 1 (which already claimed name+decimal
  // matches) and before step 3's bare-name fallback claims the same text as
  // a whole-document reference instead.
  for (const { name, slug } of DOC_NAMES) {
    const re = new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\s+(\\d+)\\b(?!\\.)`, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      if ([...consumed].some((c) => c >= match!.index && c < match!.index + match![0].length)) continue;
      for (let c = match.index; c < match.index + match[0].length; c++) consumed.add(c);
      refs.push({ targetDocumentSlug: slug, targetClauseId: null, targetSection: match[1] });
    }
  }

  // 2. Article references ("Article VII") — resolve to the article itself
  // (no single clause), always within the Charter.
  const articleRe = /Article\s+([IVX]+)/g;
  let am: RegExpExecArray | null;
  while ((am = articleRe.exec(text))) {
    if ([...consumed].some((c) => c >= am!.index && c < am!.index + am![0].length)) continue;
    refs.push({ targetDocumentSlug: "charter", targetClauseId: null, targetArticle: am[1] });
  }

  // 2b. (Stage 2) "Right N" references — resolve to the Member Bill of
  // Rights document's own Roman-numeral clause, from anywhere outside that
  // document itself (which never refers to its own items as "Right N").
  // Works whether or not "of the Bill of Rights" trails it (Dispute
  // Procedure Code 4.2 spells it out in full; most documents don't).
  if (currentDocSlug !== "member-bill-of-rights") {
    // Optionally consume a trailing "of the (Member) Bill of Rights" too
    // (Dispute Procedure Code 4.2 spells it out in full) so it counts as
    // one reference, not two — otherwise step 3's whole-document fallback
    // would separately match the trailing document name and double-count it.
    const rightRe = /Right\s+([IVX]+)(\s+of\s+the\s+(?:Member\s+)?Bill\s+of\s+Rights)?/gi;
    let rt: RegExpExecArray | null;
    while ((rt = rightRe.exec(text))) {
      if ([...consumed].some((c) => c >= rt!.index && c < rt!.index + rt![0].length)) continue;
      for (let c = rt.index; c < rt.index + rt[0].length; c++) consumed.add(c);
      refs.push({ targetDocumentSlug: "member-bill-of-rights", targetClauseId: rt[1], targetRight: rt[1] });
    }
  }

  // 2c. (Stage 2) Named mechanisms, referenced by proper-noun name rather
  // than a clause number — a small lookup, not a numeric pattern.
  for (const { pattern, slug, section } of NAMED_MECHANISMS) {
    let nm: RegExpExecArray | null;
    const re = new RegExp(pattern.source, "g");
    while ((nm = re.exec(text))) {
      if ([...consumed].some((c) => c >= nm!.index && c < nm!.index + nm![0].length)) continue;
      for (let c = nm.index; c < nm.index + nm[0].length; c++) consumed.add(c);
      refs.push({ targetDocumentSlug: slug, targetClauseId: null, targetSection: section });
    }
  }

  // 3. Whole-document references by name alone, no trailing number — only
  // when NOT already consumed by a name+number/range match above.
  for (const { name, slug } of DOC_NAMES) {
    if (name === "charter") continue; // too ambiguous bare; "this charter" self-refs dominate
    const re = new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const overlapsConsumed = [...consumed].some((c) => c >= match!.index && c < match!.index + match![0].length);
      if (overlapsConsumed) continue;
      if (slug === currentDocSlug) continue; // self-reference, not a cross-reference
      refs.push({ targetDocumentSlug: slug, targetClauseId: null });
    }
  }

  // 4. Bare same-document numeric references and ranges — resolve only if
  // the number actually exists as a clause in the CURRENT document
  // (resolvability as the filter, founder-approved over requiring parens).
  const currentIds = allClauseIds.get(currentDocSlug) ?? new Set();
  const rangeRe = new RegExp(DOC_NUM_REF.source, "gi");
  let rm: RegExpExecArray | null;
  while ((rm = rangeRe.exec(text))) {
    if ([...consumed].some((c) => c >= rm!.index && c < rm!.index + rm![0].length)) continue;
    for (let c = rm.index; c < rm.index + rm[0].length; c++) consumed.add(c);
    for (const id of expandRange(rm[1], rm[2])) {
      if (currentIds.has(id)) refs.push({ targetDocumentSlug: currentDocSlug, targetClauseId: id });
    }
  }
  const bareRe = new RegExp(BARE_NUM.source, "g");
  let bm: RegExpExecArray | null;
  while ((bm = bareRe.exec(text))) {
    if ([...consumed].some((c) => c >= bm!.index && c < bm!.index + bm![0].length)) continue;
    if (currentIds.has(bm[1])) refs.push({ targetDocumentSlug: currentDocSlug, targetClauseId: bm[1] });
  }

  return refs;
}

function expandRange(start: string, end: string): string[] {
  const [sMajor, sMinor] = start.split(".");
  const [eMajor] = end.split(".");
  const minorNum = parseInt(sMinor, 10);
  const minorSuffix = sMinor.replace(/^\d+/, "");
  const eMinorNum = parseInt(end.split(".")[1], 10);
  if (sMajor !== eMajor || isNaN(minorNum) || isNaN(eMinorNum)) return [start, end];
  const ids: string[] = [];
  for (let n = minorNum; n <= eMinorNum; n++) ids.push(`${sMajor}.${n}${minorSuffix}`);
  return ids;
}

const SCHEDULE_MARKER = "**Schedule of defaults.**";

function detectSchedule(bodyMarkdown: string): { isScheduleOfDefaults: boolean; scheduleKind: "chosen" | "derived" | null } {
  if (!bodyMarkdown.startsWith(SCHEDULE_MARKER)) return { isScheduleOfDefaults: false, scheduleKind: null };
  // Dispute Procedure Code 7.2 is the one outlier: "is **derived** rather
  // than chosen" — derived appears before chosen in that sentence, and
  // "derived" itself is bold-marked (`**derived**`) so a plain word-boundary
  // match needs to tolerate the asterisks sitting between the word and the
  // following whitespace. Everywhere else says "chosen rather than derived".
  const derivedFirst = /derived\*{0,2}\s+rather\s+than\s+chosen/i.test(bodyMarkdown);
  return { isScheduleOfDefaults: true, scheduleKind: derivedFirst ? "derived" : "chosen" };
}

/** Every document opens with one italic subtitle paragraph — except
 * Federation Compact, which has a second, separate italic "Status:"
 * paragraph right after the first (the only document with two). Join every
 * *leading*, fully-italic paragraph rather than just the first, so Federation
 * Compact's dormancy statement (in its second paragraph) isn't silently
 * dropped from the Library card's description. Stops at the `---` divider
 * (or any non-italic paragraph) every document has right after this intro
 * block — never at a bolded paragraph like the Charter's "How to read this
 * document," which isn't wrapped in a single pair of asterisks end-to-end. */
function extractIntroText(markdown: string): string {
  const paragraphs = markdown.split(/\n\s*\n/);
  const italics: string[] = [];
  for (const raw of paragraphs) {
    const p = raw.trim();
    if (p.startsWith("#")) continue;
    const m = p.match(/^\*([\s\S]+)\*$/);
    if (!m) break;
    italics.push(m[1].trim());
  }
  return italics.join(" ");
}

function extractTitle(markdown: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

export function parseDocument(sourceFile: string, markdown: string): FoundingDocument {
  const manifestEntry = MANIFEST[sourceFile];
  if (!manifestEntry) throw new Error(`No MANIFEST entry for ${sourceFile}`);
  // Normalize CRLF/CR to LF before anything else touches this text. Found
  // while building clause-structured amendments: `git restore` on this
  // Windows machine (core.autocrlf=true, no .gitattributes override)
  // re-checked-out Founding_Charter.md with CRLF line endings, and every
  // clause/heading regex below anchors on `$` after a `(.*)`-style capture —
  // `.` never matches `\r` in JS regex (it's a line terminator), so a
  // trailing `\r` makes every one of those regexes fail to match, silently
  // returning zero clauses for the whole document. This is a latent
  // landmine for anyone who clones or checks this repo out fresh on
  // Windows, not specific to this one file or this one session — fixed at
  // the source once, here, rather than CRLF-proofing every regex below.
  markdown = markdown.replace(/\r\n?/g, "\n");
  const lines = markdown.split("\n");
  const { clauses: rawClauses, sections: rawSections } = parseClauses(lines);
  const startLines = clauseStartLines(lines);
  const sections = assignSections(rawSections, lines, startLines);

  const clauses: Clause[] = rawClauses.map((rc) => {
    const schedule = detectSchedule(rc.bodyMarkdown);
    return {
      id: rc.id,
      documentSlug: manifestEntry.slug,
      leadTitle: rc.leadTitle,
      bodyMarkdown: rc.bodyMarkdown,
      attachedList: rc.attachedList,
      attachedTable: rc.attachedTable,
      crossReferences: [], // filled in by buildDocumentsData, once every document's clause-id set is known
      isScheduleOfDefaults: schedule.isScheduleOfDefaults,
      scheduleKind: schedule.scheduleKind,
      isEntrenched: false, // filled in by buildDocumentsData, from Charter 8.2's derived set
    };
  });

  return {
    slug: manifestEntry.slug,
    sourceFile,
    title: extractTitle(markdown),
    status: manifestEntry.status,
    introText: extractIntroText(markdown),
    sections,
    clauses,
  };
}

function crossReferenceKey(r: CrossReference): string {
  return `${r.targetDocumentSlug}|${r.targetClauseId ?? ""}|${r.targetArticle ?? ""}|${r.targetSection ?? ""}`;
}

function dedupeCrossReferences(refs: CrossReference[]): CrossReference[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = crossReferenceKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Runs the cross-reference extractor over Charter 8.2's own bullet list
 * specifically, rather than a hardcoded second lookup table, so renumbering
 * or adding a seventh entrenched provision only requires editing the
 * markdown. Handles the one bare "Compact 7.3" reference by resolving
 * "Compact" to whichever full compact name appears earlier in the SAME
 * bullet — the only rule that works, since "Compact" alone is ambiguous
 * between the two compacts in this corpus.
 *
 * Returns all three shapes Charter 8.2's seven provisions actually take
 * (direct clause citations, a whole-Article citation, a whole-document
 * citation — see DocumentsGenerated's own comment), plus the resolved
 * CrossReference objects themselves so buildDocumentsData can attach them
 * to clause 8.2's own crossReferences — otherwise 8.2 cites Treasury 5.7,
 * GAC 7.3, its own 1.2/3.2/2.5, and (since the seventh provision entrenches
 * the section itself) its own 8.2 in prose but carries no cross-reference
 * data at all, and none of those clauses' "referenced by" lists would ever
 * show it. */
function deriveEntrenchment(
  charterDoc: FoundingDocument,
  allClauseIds: Map<string, Set<string>>
): { clauseIds: string[]; sections: { documentSlug: string; article: string }[]; documents: string[]; refs82: CrossReference[] } {
  const clause82 = charterDoc.clauses.find((c) => c.id === "8.2");
  if (!clause82?.attachedList) return { clauseIds: [], sections: [], documents: [], refs82: [] };
  const clauseIds: string[] = [];
  const sections: { documentSlug: string; article: string }[] = [];
  const documents: string[] = [];
  const refs82: CrossReference[] = [];

  for (const item of clause82.attachedList) {
    const compactMatch = item.match(/\(Compact\s+(\d+\.\d+[a-z]?)\)/i);
    if (compactMatch) {
      const nameMatch = item.match(/Government Adoption Compact|Federation Compact/i);
      const slug = nameMatch?.[0].toLowerCase().includes("federation") ? "federation-compact" : "government-adoption-compact";
      clauseIds.push(`${slug}#${compactMatch[1]}`);
      refs82.push({ targetDocumentSlug: slug, targetClauseId: compactMatch[1] });
      continue;
    }
    const refs = extractCrossReferences(item, "charter", allClauseIds);
    for (const r of refs) {
      refs82.push(r);
      if (r.targetClauseId) {
        clauseIds.push(`${r.targetDocumentSlug}#${r.targetClauseId}`);
      } else if (r.targetArticle) {
        // "The complete public permanence of governance records (Article
        // VII)" — every clause inside that Article is entrenched, not just
        // a single cited clause.
        sections.push({ documentSlug: r.targetDocumentSlug, article: r.targetArticle });
      } else if (!r.targetSection) {
        // Whole-document reference ("The Member Bill of Rights, in full").
        documents.push(r.targetDocumentSlug);
      }
    }
  }
  return {
    clauseIds: [...new Set(clauseIds)],
    sections: [...new Map(sections.map((s) => [`${s.documentSlug}#${s.article}`, s])).values()],
    documents: [...new Set(documents)],
    refs82: dedupeCrossReferences(refs82),
  };
}

export function buildDocumentsData(founding: Record<string, string>): DocumentsGenerated {
  const documents = Object.entries(MANIFEST).map(([file]) => parseDocument(file, founding[file] ?? ""));

  const allClauseIds = new Map<string, Set<string>>();
  for (const doc of documents) allClauseIds.set(doc.slug, new Set(doc.clauses.map((c) => c.id)));

  for (const doc of documents) {
    for (const clause of doc.clauses) {
      clause.crossReferences = extractCrossReferences(clause.bodyMarkdown, doc.slug, allClauseIds);
    }
  }

  const charterDoc = documents.find((d) => d.slug === "charter")!;
  const entrenchment = deriveEntrenchment(charterDoc, allClauseIds);
  const { clauseIds: entrenchedClauseIds, refs82 } = entrenchment;

  // Attach Charter 8.2's own derived citations to its crossReferences
  // before computing referencedBy, so Treasury 5.7, GAC 7.3, and Charter's
  // own 1.2/3.2/2.5 all show 8.2 under "Referenced by" — not because 8.2
  // needed a second, separate reference list, but because its existing one
  // was empty only by omission (the attached bullet list was never fed
  // through the same extractor every other clause's body already is).
  const clause82 = charterDoc.clauses.find((c) => c.id === "8.2")!;
  clause82.crossReferences = dedupeCrossReferences([...clause82.crossReferences, ...refs82]);

  // Expand the directly-cited clause set with every clause inside an
  // entrenched Article or document — this is the set actually used to mark
  // isEntrenched; entrenchedClauseIds itself stays as just the six direct
  // citations (see DocumentsGenerated's own comment on why).
  const entrenchedSet = new Set(entrenchedClauseIds);
  const entrenchedSections: EntrenchedSection[] = [];
  for (const { documentSlug, article } of entrenchment.sections) {
    const doc = documents.find((d) => d.slug === documentSlug);
    const section = doc?.sections.find((s) => s.article === article);
    if (!doc || !section) continue;
    entrenchedSections.push({ documentSlug, article, sectionHeading: section.heading, clauseIds: section.clauseIds });
    for (const id of section.clauseIds) entrenchedSet.add(`${documentSlug}#${id}`);
  }
  for (const slug of entrenchment.documents) {
    const doc = documents.find((d) => d.slug === slug);
    if (!doc) continue;
    for (const c of doc.clauses) entrenchedSet.add(`${slug}#${c.id}`);
  }

  for (const doc of documents) {
    for (const clause of doc.clauses) {
      clause.isEntrenched = entrenchedSet.has(`${doc.slug}#${clause.id}`);
    }
  }

  const referencedBy: DocumentsGenerated["referencedBy"] = {};
  for (const doc of documents) {
    for (const clause of doc.clauses) {
      for (const ref of clause.crossReferences) {
        if (!ref.targetClauseId) continue;
        const key = `${ref.targetDocumentSlug}#${ref.targetClauseId}`;
        (referencedBy[key] ??= []).push({ documentSlug: doc.slug, clauseId: clause.id });
      }
    }
  }

  // Government Adoption Compact has real defaults (4.5's participation-share
  // figures, 4.2's "defined track record" threshold, 7.5's vacant-only
  // staffing rule) but no schedule-of-defaults clause at all — confirmed by
  // the structure catalog, not a parser gap. Surfaced explicitly rather than
  // silently dropped (founder decision #2).
  const unaccountedDefaults: DocumentsGenerated["unaccountedDefaults"] = [
    { documentSlug: "government-adoption-compact", clauseId: "4.5", note: "Participation-share figures (first pilot and long-term ceiling) — not accounted for in any schedule of defaults." },
    { documentSlug: "government-adoption-compact", clauseId: "4.2", note: "The \"defined track record of ratified cycles\" threshold before direct-binding authority — not accounted for anywhere." },
    { documentSlug: "government-adoption-compact", clauseId: "7.5", note: "The vacant-only staffing-redirection rule — not accounted for anywhere." },
  ];

  return { documents, referencedBy, entrenchedClauseIds, entrenchedSections, entrenchedDocuments: entrenchment.documents, unaccountedDefaults };
}
