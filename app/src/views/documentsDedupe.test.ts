import { describe, it, expect } from "vitest";
import { dedupeReferencedBy } from "./documents";

describe("dedupeReferencedBy (live review of 244645e)", () => {
  it("shows each source clause once, in order of first appearance", () => {
    const out = dedupeReferencedBy([
      { documentSlug: "membership-code", clauseId: "1.2" },
      { documentSlug: "charter", clauseId: "2.6" },
      { documentSlug: "membership-code", clauseId: "1.2" },
      { documentSlug: "charter", clauseId: "2.6" },
      { documentSlug: "charter", clauseId: "2.6" },
      { documentSlug: "charter", clauseId: "3.3" },
    ]);
    expect(out).toEqual([
      { documentSlug: "membership-code", clauseId: "1.2" },
      { documentSlug: "charter", clauseId: "2.6" },
      { documentSlug: "charter", clauseId: "3.3" },
    ]);
  });

  it("keeps same clause id from different documents distinct", () => {
    expect(dedupeReferencedBy([{ documentSlug: "a", clauseId: "1.1" }, { documentSlug: "b", clauseId: "1.1" }])).toHaveLength(2);
  });
});
