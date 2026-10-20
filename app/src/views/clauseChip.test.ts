import { describe, it, expect } from "vitest";
// @ts-expect-error -- no @types/node in this Workers-only project (same
// reasoning as renderSafety.test.ts); node:fs resolves fine at runtime.
import { readFileSync } from "node:fs";
import { resolveClauseKey } from "../lib/clauseAmendments";

// Stage B — "a handful of clause chips now, the rest later." Every
// <ClauseChip clauseKey="..."> literal across the three pages this stage
// touches must resolve against the real generated documents — a stale or
// mistyped key would otherwise render nothing at all (ClauseChip's own
// fail-silent fallback) rather than fail loudly here.
const FILES_WITH_CHIPS = ["src/views/treasury.tsx", "src/views/proposalDetail.tsx", "src/views/delegation.tsx"];

// proposalDetail.tsx's class-rule chip (Stage B polish — never show the
// same clause chip twice) passes its clauseKey as a computed variable,
// `<ClauseChip clauseKey={classRuleClauseKey} />`, not a literal string —
// so the plain attribute-literal scan below can't see charter#8.1/8.2
// there directly. Scraped separately via the ternary's own two literal
// branches, which is what classRuleClauseKey actually resolves to for
// every possible value of pr.cls. Rendering-based coverage for the
// dynamic case itself (that each resolves and renders exactly once) lives
// in clauseChipSpacing.test.ts, which renders the real component.
function clauseKeysIn(source: string): string[] {
  const attrRe = /<ClauseChip\s+clauseKey="([^"]+)"/g;
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(source))) keys.push(m[1]);
  const classRuleMatch = source.match(/classRuleClauseKey\s*=\s*pr\.cls\s*===\s*"amendment"\s*\?\s*"(charter#[\d.]+)"\s*:\s*pr\.cls\s*===\s*"entrenched"\s*\?\s*"(charter#[\d.]+)"/);
  if (classRuleMatch) keys.push(classRuleMatch[1], classRuleMatch[2]);
  return keys;
}

describe("every ClauseChip in the stage B pages resolves to a real clause", () => {
  for (const file of FILES_WITH_CHIPS) {
    const source: string = readFileSync(file, "utf-8");
    const keys = clauseKeysIn(source);
    it(`${file} has at least one ClauseChip`, () => {
      expect(keys.length).toBeGreaterThan(0);
    });
    for (const key of keys) {
      it(`${file}: "${key}" resolves to a real clause`, () => {
        expect(resolveClauseKey(key), key).not.toBeNull();
      });
    }
  }

  it("the exact set of chip targets matches what this stage was asked to add", () => {
    const all = FILES_WITH_CHIPS.flatMap((f) => clauseKeysIn(readFileSync(f, "utf-8")));
    expect(new Set(all)).toEqual(
      new Set([
        "treasury-code#2.1",
        "treasury-code#5.1",
        "charter#5.4",
        "charter#5.3",
        "treasury-code#4.3",
        "rules-of-procedure#1.3",
        "charter#8.1",
        "charter#8.2",
        "charter#3.3",
      ])
    );
  });
});

describe("ClauseChip itself", () => {
  it("resolveClauseKey returns null for a key that doesn't exist (the fail-silent case ClauseChip relies on)", () => {
    expect(resolveClauseKey("charter#999.999")).toBeNull();
  });
});
