import { describe, it, expect } from "vitest";
// @ts-expect-error -- no @types/node in this Workers-only project (tsconfig's
// "types" is scoped to @cloudflare/workers-types + vitest/globals, deliberately
// not @types/node to avoid ambient conflicts with Workers' own global types
// elsewhere in the app). node:fs resolves fine at runtime: vitest always runs
// under Node, regardless of what the app itself targets.
import { readFileSync, readdirSync } from "node:fs";

// 2026-10-11 app views review — treasury.tsx:82 had ×, —, §4
// typed directly as JSX text instead of inside a string literal or template
// expression. JSX text is not a JS string literal: a \uXXXX sequence written
// directly as JSXText has no escape meaning and renders as the literal
// six-character sequence in the browser, not the intended character. Nothing
// else in this tree legitimately writes a \uXXXX escape — every other
// non-ASCII character in these views (×, —, §, etc.) is typed as the real
// character directly — so this grep-style check has no legitimate case to
// exempt. If one is ever needed, exempt it explicitly rather than loosening
// the pattern.
//
// Path is relative to the test runner's working directory (vitest run, from
// app/) rather than __dirname/import.meta.url, for the same no-extra-types
// reason as the node:fs import above.
describe("views contain no literal \\uXXXX escape-sequence text", () => {
  const viewsDir = "src/views";
  const files: string[] = readdirSync(viewsDir).filter((f: string) => f.endsWith(".tsx"));

  it("found at least the view files this check is meant to cover", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  for (const file of files) {
    it(`${file} has no stray \\uXXXX text`, () => {
      const text: string = readFileSync(`${viewsDir}/${file}`, "utf-8");
      const match = text.match(/\\u[0-9a-fA-F]{4}/);
      expect(match, match ? `found "${match[0]}" — should be the real character, not an escape sequence` : undefined).toBeNull();
    });
  }
});
