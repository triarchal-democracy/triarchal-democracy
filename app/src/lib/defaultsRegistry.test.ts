import { describe, it, expect } from "vitest";
import { DEFAULTS_REGISTRY, isDefaultEntrenched } from "./defaultsRegistry";
import { DEFAULT_PARAMS } from "./params";
import { documentsData } from "../generated/documents";

// Phase 2 stage 6 drift-guard — same two-sided discipline
// check_arithmetic_page.py already applies to the site's arithmetic page:
// (1) every registry entry cites a clause that actually exists; (2) the
// document still says what the registry thinks it says; (3) the app's own
// current value is consistent with what the document says. Three distinct
// failure modes, matching the instruction exactly: a documented default
// with no registry entry, a registry entry with no documented default, or
// the app value differing from the document value.

function fullDocumentText(documentSlug: string): string {
  const doc = documentsData.documents.find((d) => d.slug === documentSlug);
  if (!doc) return "";
  const parts: string[] = [doc.introText];
  for (const section of doc.sections) {
    if (section.introMarkdown) parts.push(section.introMarkdown);
    if (section.introList) parts.push(section.introList.join(" "));
    if (section.introTable) parts.push(JSON.stringify(section.introTable));
  }
  for (const clause of doc.clauses) {
    parts.push(clause.bodyMarkdown);
    if (clause.attachedList) parts.push(clause.attachedList.join(" "));
    if (clause.attachedTable) parts.push(JSON.stringify(clause.attachedTable));
  }
  return parts.join(" \n ");
}

describe("defaults registry — every entry's cited clause is real", () => {
  for (const entry of DEFAULTS_REGISTRY) {
    it(`${entry.id}: ${entry.documentSlug}#${entry.clauseId} exists`, () => {
      const doc = documentsData.documents.find((d) => d.slug === entry.documentSlug);
      expect(doc, entry.documentSlug).toBeDefined();
      expect(doc!.clauses.some((c) => c.id === entry.clauseId), `${entry.documentSlug}#${entry.clauseId}`).toBe(true);
    });

    it(`${entry.id}: ${entry.documentSlug}#${entry.scheduleClauseId} (its schedule) is a real schedule-of-defaults clause`, () => {
      const doc = documentsData.documents.find((d) => d.slug === entry.documentSlug);
      const schedule = doc?.clauses.find((c) => c.id === entry.scheduleClauseId);
      expect(schedule, `${entry.documentSlug}#${entry.scheduleClauseId}`).toBeDefined();
      expect(schedule?.isScheduleOfDefaults, `${entry.documentSlug}#${entry.scheduleClauseId} should be a schedule-of-defaults clause`).toBe(true);
    });
  }
});

describe("defaults registry — the document still says what the registry thinks it says", () => {
  for (const entry of DEFAULTS_REGISTRY) {
    it(`${entry.id}: "${entry.expectedInClauseText}" still appears in ${entry.documentSlug}`, () => {
      const text = fullDocumentText(entry.documentSlug);
      expect(text, `expected "${entry.expectedInClauseText}" somewhere in ${entry.documentSlug}`).toContain(entry.expectedInClauseText);
    });
  }
});

describe("defaults registry — the app's current value is consistent with the registry's expectation", () => {
  for (const entry of DEFAULTS_REGISTRY) {
    it(`${entry.id}: currentAppValue(DEFAULT_PARAMS) doesn't throw and returns real text`, () => {
      const value = entry.currentAppValue(DEFAULT_PARAMS);
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    });
  }

  // expectedValue is required to be set exactly when paramsPath is —
  // checked as its own invariant so a future entry can't gain a real
  // params field without also gaining a strict value to check it against,
  // and can't carry a stray expectedValue when there's no app parameter
  // behind it to compare against.
  for (const entry of DEFAULTS_REGISTRY) {
    it(`${entry.id}: expectedValue is set iff paramsPath is set`, () => {
      expect(entry.expectedValue !== null, `${entry.id}: expectedValue null-ness must match paramsPath null-ness`).toBe(entry.paramsPath !== null);
    });
  }

  // The strict check the instruction asked for: not "contains the right
  // digits" (the old spot-checks below, which never covered
  // delegate-recall-trigger and so never caught that pct()'s plain
  // Math.round(n * 100) was rounding Charter 4.8's 1.5% default up to a
  // misquoted "2%" — fixed in params.ts's formatPercent once this test
  // went looking for an exact match instead of a substring). Every entry
  // with a real paramsPath must produce EXACTLY expectedValue from
  // DEFAULT_PARAMS — this is the assertion that fails the moment someone
  // changes a default in params.ts without updating this registry (or
  // vice versa).
  for (const entry of DEFAULTS_REGISTRY) {
    if (entry.expectedValue === null) continue;
    it(`${entry.id}: currentAppValue(DEFAULT_PARAMS) is exactly "${entry.expectedValue}"`, () => {
      expect(entry.currentAppValue(DEFAULT_PARAMS)).toBe(entry.expectedValue);
    });
  }
});

describe("defaults registry — coverage per schedule (the 'documented default has no registry entry' direction)", () => {
  // Exhaustive automatic extraction from free-flowing prose isn't reliable
  // (see the registry's own header comment) — this is the disclosed proxy:
  // a hand-maintained minimum entry count per schedule, so losing coverage
  // silently (an entry deleted, a schedule's id typo'd) still fails loudly,
  // even though a genuinely new default added to a document's prose
  // without a matching registry entry would not be caught by this alone.
  const expectedMinimumPerSchedule: { documentSlug: string; scheduleClauseId: string; min: number }[] = [
    { documentSlug: "charter", scheduleClauseId: "2.6", min: 11 },
    { documentSlug: "treasury-code", scheduleClauseId: "9.7", min: 7 },
    { documentSlug: "contribution-code", scheduleClauseId: "8.9", min: 5 },
    { documentSlug: "rules-of-procedure", scheduleClauseId: "7.4", min: 4 },
    { documentSlug: "code-of-conduct", scheduleClauseId: "4.5", min: 2 },
    { documentSlug: "dispute-procedure-code", scheduleClauseId: "7.2", min: 1 },
    { documentSlug: "triarc-membership-code", scheduleClauseId: "4.2", min: 1 },
    { documentSlug: "triarc-operations-code", scheduleClauseId: "5.2", min: 1 },
  ];
  for (const { documentSlug, scheduleClauseId, min } of expectedMinimumPerSchedule) {
    it(`${documentSlug}#${scheduleClauseId} has at least ${min} registry entries`, () => {
      const count = DEFAULTS_REGISTRY.filter((e) => e.documentSlug === documentSlug && e.scheduleClauseId === scheduleClauseId).length;
      expect(count).toBeGreaterThanOrEqual(min);
    });
  }

  it("every one of the 8 schedule-of-defaults clauses the generator finds has at least one registry entry", () => {
    const schedules = documentsData.documents.flatMap((d) => d.clauses.filter((c) => c.isScheduleOfDefaults).map((c) => `${d.slug}#${c.id}`));
    expect(schedules).toHaveLength(8);
    for (const key of schedules) {
      const [slug, clauseId] = key.split("#");
      expect(DEFAULTS_REGISTRY.some((e) => e.documentSlug === slug && e.scheduleClauseId === clauseId), key).toBe(true);
    }
  });
});

describe("isDefaultEntrenched", () => {
  it("is false for every current registry entry (none of today's registered defaults are among Charter 8.2's seven)", () => {
    for (const entry of DEFAULTS_REGISTRY) {
      expect(isDefaultEntrenched(entry, documentsData.entrenchedClauseIds), entry.id).toBe(false);
    }
  });
});
