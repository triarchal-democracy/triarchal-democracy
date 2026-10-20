import { describe, it, expect } from "vitest";
// @ts-expect-error -- no @types/node in this Workers-only project (same
// reasoning as renderSafety.test.ts); node:fs resolves fine at runtime.
import { readFileSync } from "node:fs";

// Phase 2 stage 5 — the seven hardcoded rule-number instances the views
// review found (docs/reviews/2026-10-app-views-review.md) are retrofitted
// onto lib/params.ts / lib/liveValues.ts in this commit. This test is the
// guard the instruction asked for: it fails if any of the specific literal
// strings that used to sit in these files ever comes back, the same way
// renderSafety.test.ts guards the \uXXXX escape-sequence bug. It checks
// the exact phrase that was there, not the bare number — "10%" and "90
// days" each appear elsewhere in these same files for unrelated, correct
// reasons, so a check that fired on the bare number would be constantly
// wrong.
//
// Stage 5 follow-up (founder review of stop 2): the layout.tsx footer's
// delegation wording was walked back to its original wording — see
// phase2-progress.md's Stage 5 follow-up section for why. That case is no
// longer retrofitted; it's removed from this describe block rather than
// left in asserting something now false, and the restored wording gets its
// own regression guard further down instead.
describe("retrofitted hardcoded-default literals cannot silently come back", () => {
  const cases: { file: string; mustNotContain: string }[] = [
    { file: "src/views/contribution.tsx", mustNotContain: "(50% diversity cap)" },
    { file: "src/views/delegation.tsx", mustNotContain: "renew annually" },
    { file: "src/views/treasury.tsx", mustNotContain: "(target: 12 months ops)" },
    { file: "src/views/governanceHealth.tsx", mustNotContain: "at 10% of all delegated votes" },
    { file: "src/views/proposalDetail.tsx", mustNotContain: "(10% of Active Members —" },
  ];

  for (const { file, mustNotContain } of cases) {
    it(`${file} no longer hardcodes "${mustNotContain}"`, () => {
      const text: string = readFileSync(file, "utf-8");
      expect(text).not.toContain(mustNotContain);
    });
  }

  it("the petition-signature share is one named constant, not a bare 0.1 literal, everywhere index.tsx computes it", () => {
    const text: string = readFileSync("src/index.tsx", "utf-8");
    expect(text).not.toContain("active * 0.1");
    // Confirms the constant is actually imported and used, not just absent
    // because the whole computation was deleted.
    const occurrences = text.split("PETITION_SIGNATURE_SHARE").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(5); // 1 import + 4 call sites
  });
});

// Stage 5 follow-up — regression guard for the revert itself, not for a
// hardcoded default. layout.tsx's footer keeps "renews annually" as
// qualitative wording (Charter 3.3's schedule states the ordinary cycle's
// default as "annual," not as a day count) while the critical-decision
// figure still reads live from DEFAULT_PARAMS.
describe("Stage 5 follow-up — the footer's delegation wording is back to its original", () => {
  it("layout.tsx's footer says \"renews annually\" and still reads the critical-decision day count live", () => {
    const text: string = readFileSync("src/views/layout.tsx", "utf-8");
    expect(text).toContain("renews annually");
    expect(text).toContain("DEFAULT_PARAMS.delegationExpiryCriticalDays");
  });
});
