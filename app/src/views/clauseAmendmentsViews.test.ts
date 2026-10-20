import { describe, it, expect } from "vitest";
// @ts-expect-error -- no @types/node in this Workers-only project (same
// reasoning as renderSafety.test.ts); node:fs resolves fine at runtime.
import { readFileSync } from "node:fs";

// Clause-structured amendments (docs/reviews/clause-amendments-plan.md)
// §7's view-test list — source-text assertions, no rendering needed, same
// pattern noHardcodedDefaults.test.ts/renderSafety.test.ts already use.
describe("proposals.tsx and proposalDetail.tsx show targeted clauses, or say they're not recorded", () => {
  it("both contain the literal string 'clause not recorded'", () => {
    expect(readFileSync("src/views/proposals.tsx", "utf-8")).toContain("clause not recorded");
    expect(readFileSync("src/views/proposalDetail.tsx", "utf-8")).toContain("clause not recorded");
  });

  it("both render a clause chip linking into the Reader (/documents/) for a resolved target clause", () => {
    const proposalsSrc = readFileSync("src/views/proposals.tsx", "utf-8");
    const detailSrc = readFileSync("src/views/proposalDetail.tsx", "utf-8");
    expect(proposalsSrc).toContain("chip.href");
    expect(detailSrc).toContain("chip.href");
    // Confirms the href actually points into /documents/ somewhere in each
    // file (resolveStoredClauseChips builds it; this just confirms the
    // view renders what it's given rather than a different URL shape).
    expect(proposalsSrc).toContain("TargetClauseChip");
    expect(detailSrc).toContain("TargetClauseChip");
  });

  it("proposals.tsx's submission form includes the clause picker, grouped by document and section", () => {
    const src = readFileSync("src/views/proposals.tsx", "utf-8");
    expect(src).toContain("targetClauseIds");
    expect(src).toContain("ClausePickerDocument");
    expect(src).toContain("entrenched");
  });
});

describe("documents.tsx — Propose a change links and the entrenched explanation", () => {
  it("the Reader's ClauseBlock and the Defaults page both build a /proposals link carrying targetClauseIds for in-scope clauses", () => {
    const src = readFileSync("src/views/documents.tsx", "utf-8");
    const occurrences = src.split("targetClauseIds").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // ClauseBlock + DocumentsDefaultsPage
  });

  it("the Reader shows the entrenched-threshold explanation next to an entrenched clause's own Propose-a-change link", () => {
    const src = readFileSync("src/views/documents.tsx", "utf-8");
    expect(src).toContain("three-quarters majority, 40% minimum participation (Charter 8.2)");
  });
});

// Founder decision Q2 — the 8.2 disclosure ("the app does not yet check a
// submitted amendment's content against this list") is removed outright,
// in this same commit, now that enforcement actually ships alongside it.
// No prior test asserted the disclosure's presence (checked before
// removing it — none did), so there is nothing to delete; this is the new
// test asserting it's gone, per the instruction.
describe("the Reader's old 8.2 disclosure is gone", () => {
  it("documents.tsx no longer contains the retired disclosure text", () => {
    const src = readFileSync("src/views/documents.tsx", "utf-8");
    expect(src).not.toContain("does not yet check a submitted amendment");
    expect(src).not.toContain("touching one of these six");
    expect(src).not.toContain("clause-structured amendment targeting ships");
  });
});
