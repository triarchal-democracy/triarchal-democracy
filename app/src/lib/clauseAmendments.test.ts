import { describe, it, expect } from "vitest";
import { inScopeAmendmentDocuments, isClauseEntrenched, resolveClauseKey, classFloor, clauseLabel, resolveProposalClassification, buildClausePicker, resolveStoredClauseChips } from "./clauseAmendments";
import { documentsData } from "../generated/documents";
import type { DocumentsGenerated } from "../../scripts/documentsParser";
import { CLASS_CONFIG, type ProposalClass } from "./params";
import { createTestDb } from "../../scripts/testDb";
import { ensureCommunity } from "./community";
import { proposals, members } from "../db/schema";
import { eq } from "drizzle-orm";

// The 19 clauses the generator currently derives as entrenched, enumerated
// explicitly here rather than re-derived — so this test can't pass by
// tautology against clauseAmendments.ts's own logic. If Charter 8.2 changes
// what it protects, this list must be updated deliberately, the same
// discipline build-documents.test.ts already applies to entrenchedClauseIds.
const KNOWN_ENTRENCHED: [string, string][] = [
  ["charter", "1.2"],
  ["charter", "2.5"],
  ["charter", "3.2"],
  ["charter", "7.1"],
  ["charter", "7.2"],
  ["charter", "7.3"],
  ["charter", "8.2"],
  ["treasury-code", "5.7"],
  ["government-adoption-compact", "7.3"],
  ["member-bill-of-rights", "I"],
  ["member-bill-of-rights", "II"],
  ["member-bill-of-rights", "III"],
  ["member-bill-of-rights", "IV"],
  ["member-bill-of-rights", "V"],
  ["member-bill-of-rights", "VI"],
  ["member-bill-of-rights", "VII"],
  ["member-bill-of-rights", "VIII"],
  ["member-bill-of-rights", "IX"],
  ["member-bill-of-rights", "X"],
];

describe("inScopeAmendmentDocuments", () => {
  it("returns exactly the 4 in-scope documents against the real generated data", () => {
    expect(inScopeAmendmentDocuments()).toEqual(new Set(["charter", "treasury-code", "government-adoption-compact", "member-bill-of-rights"]));
  });
});

describe("isClauseEntrenched", () => {
  it("is true for all 19 known entrenched clauses", () => {
    expect(KNOWN_ENTRENCHED).toHaveLength(19);
    for (const [slug, id] of KNOWN_ENTRENCHED) {
      expect(isClauseEntrenched(slug, id), `${slug}#${id}`).toBe(true);
    }
  });

  it("is false for a sample of non-entrenched clauses in Charter, Treasury Code, and the Government Adoption Compact", () => {
    // Member Bill of Rights has no non-entrenched clauses at all — every
    // Right is protected (plan §1) — so there is no sample to take there.
    expect(isClauseEntrenched("charter", "5.3")).toBe(false);
    expect(isClauseEntrenched("treasury-code", "2.1")).toBe(false);
    expect(isClauseEntrenched("government-adoption-compact", "1.1")).toBe(false);
  });

  it("is false for a clause in an out-of-scope document", () => {
    expect(isClauseEntrenched("contribution-code", "1.1")).toBe(false);
    expect(isClauseEntrenched("rules-of-procedure", "1.3")).toBe(false);
  });
});

describe("resolveClauseKey", () => {
  it("resolves every known entrenched clause", () => {
    for (const [slug, id] of KNOWN_ENTRENCHED) {
      expect(resolveClauseKey(`${slug}#${id}`)).toEqual({ documentSlug: slug, clauseId: id });
    }
  });

  it("returns null for a malformed key (no '#')", () => {
    expect(resolveClauseKey("charter8.2")).toBeNull();
  });

  it("returns null for an unknown document", () => {
    expect(resolveClauseKey("not-a-real-document#1.1")).toBeNull();
  });

  it("returns null for a well-formed but nonexistent clause id", () => {
    expect(resolveClauseKey("charter#99.9")).toBeNull();
  });
});

describe("classFloor", () => {
  it("is 'entrenched' for a single entrenched clause", () => {
    expect(classFloor(["treasury-code#5.7"])).toBe("entrenched");
  });

  it("is 'entrenched' when mixed with a non-entrenched clause — the highest floor wins", () => {
    expect(classFloor(["treasury-code#5.7", "treasury-code#2.1"])).toBe("entrenched");
    expect(classFloor(["treasury-code#2.1", "treasury-code#5.7"])).toBe("entrenched"); // order-independent
  });

  it("is 'amendment' for Charter-only, non-entrenched clauses", () => {
    expect(classFloor(["charter#5.3"])).toBe("amendment");
  });

  it("is null for Treasury Code / Government Adoption Compact clauses that aren't their one entrenched one", () => {
    expect(classFloor(["treasury-code#2.1"])).toBeNull();
    expect(classFloor(["government-adoption-compact#1.1"])).toBeNull();
  });

  it("is null for empty input", () => {
    expect(classFloor([])).toBeNull();
  });

  it("ignores an invalid key and still sets the floor from a valid one alongside it", () => {
    expect(classFloor(["charter#99.9", "charter#5.3"])).toBe("amendment");
    expect(classFloor(["charter#99.9"])).toBeNull();
  });
});

describe("clauseLabel", () => {
  it("labels a resolvable key with the document's title and clause id", () => {
    expect(clauseLabel("charter#8.2")).toBe("The Founding Charter 8.2");
  });

  it("falls back to the raw key for an unresolvable one", () => {
    expect(clauseLabel("charter#99.9")).toBe("charter#99.9");
  });
});

describe("buildClausePicker", () => {
  const picker = buildClausePicker();

  it("has exactly the 4 in-scope documents, in documentsData's own MANIFEST order", () => {
    expect(new Set(picker.map((d) => d.documentSlug))).toEqual(new Set(["charter", "treasury-code", "government-adoption-compact", "member-bill-of-rights"]));
    expect(picker).toHaveLength(4);
  });

  it("every group has a real heading and at least one clause", () => {
    for (const doc of picker) {
      expect(doc.groups.length).toBeGreaterThan(0);
      for (const group of doc.groups) {
        expect(group.heading.length).toBeGreaterThan(0);
        expect(group.clauses.length).toBeGreaterThan(0);
      }
    }
  });

  it("flags charter#8.2 as entrenched in the picker data, and charter#5.3 as not", () => {
    const charter = picker.find((d) => d.documentSlug === "charter")!;
    const all = charter.groups.flatMap((g) => g.clauses);
    expect(all.find((c) => c.id === "8.2")?.isEntrenched).toBe(true);
    expect(all.find((c) => c.id === "5.3")?.isEntrenched).toBe(false);
  });

  it("every Member Bill of Rights clause is entrenched in the picker data", () => {
    const bor = picker.find((d) => d.documentSlug === "member-bill-of-rights")!;
    const all = bor.groups.flatMap((g) => g.clauses);
    expect(all.length).toBe(10);
    for (const c of all) expect(c.isEntrenched, c.id).toBe(true);
  });

  it("every clause key round-trips through resolveClauseKey", () => {
    for (const doc of picker) {
      for (const group of doc.groups) {
        for (const clause of group.clauses) {
          expect(resolveClauseKey(clause.key)).toEqual({ documentSlug: doc.documentSlug, clauseId: clause.id });
        }
      }
    }
  });
});

describe("resolveStoredClauseChips", () => {
  it("is empty for null (the 'clause not recorded' case)", () => {
    expect(resolveStoredClauseChips(null)).toEqual([]);
  });

  it("is empty for malformed JSON, not a throw", () => {
    expect(() => resolveStoredClauseChips("not json")).not.toThrow();
    expect(resolveStoredClauseChips("not json")).toEqual([]);
  });

  it("is empty for valid JSON that isn't an array", () => {
    expect(resolveStoredClauseChips('{"a":1}')).toEqual([]);
  });

  it("resolves a real stored key to a real chip with the right href and label", () => {
    const chips = resolveStoredClauseChips('["charter#8.2"]');
    expect(chips).toEqual([{ key: "charter#8.2", href: "/documents/charter#8.2", label: "The Founding Charter 8.2", isEntrenched: true }]);
  });

  it("drops a key that no longer resolves, rather than rendering a dead link", () => {
    expect(resolveStoredClauseChips('["charter#99.9"]')).toEqual([]);
  });

  it("drops only the invalid key, keeping any valid ones alongside it", () => {
    const chips = resolveStoredClauseChips('["charter#99.9", "charter#5.3"]');
    expect(chips.map((c) => c.key)).toEqual(["charter#5.3"]);
    expect(chips[0].isEntrenched).toBe(false);
  });
});

// Negative control, fixture-based (plan §7) — proves the guard is actually
// sensitive to its input, not hardcoded. A fake DocumentsGenerated with a
// deliberately different entrenched set: charter#5.3 entrenched in the
// fixture (it isn't, in reality), charter#8.2 NOT entrenched in the fixture
// (it is, in reality).
describe("negative control — classFloor/isClauseEntrenched respond to a different entrenched set, not the real one", () => {
  const fixture: DocumentsGenerated = {
    documents: [
      {
        slug: "charter",
        sourceFile: "Founding_Charter.md",
        title: "The Founding Charter",
        status: "foundational",
        introText: "",
        sections: [],
        clauses: [
          { id: "5.3", documentSlug: "charter", leadTitle: null, bodyMarkdown: "", attachedList: null, attachedTable: null, crossReferences: [], isScheduleOfDefaults: false, scheduleKind: null, isEntrenched: true },
          { id: "8.2", documentSlug: "charter", leadTitle: null, bodyMarkdown: "", attachedList: null, attachedTable: null, crossReferences: [], isScheduleOfDefaults: false, scheduleKind: null, isEntrenched: false },
        ],
      },
    ],
    referencedBy: {},
    entrenchedClauseIds: ["charter#5.3"], // the opposite of reality
    entrenchedSections: [],
    entrenchedDocuments: [],
    unaccountedDefaults: [],
  };

  it("isClauseEntrenched flips with the fixture: 5.3 true, 8.2 false — the opposite of the real corpus", () => {
    expect(isClauseEntrenched("charter", "5.3", fixture)).toBe(true);
    expect(isClauseEntrenched("charter", "8.2", fixture)).toBe(false);
    // Confirms this isn't just always true/false regardless of input —
    // the real corpus (default argument) gives the opposite answers.
    expect(isClauseEntrenched("charter", "5.3")).toBe(false);
    expect(isClauseEntrenched("charter", "8.2")).toBe(true);
  });

  it("classFloor against the fixture: 5.3 is the entrenched floor, 8.2 only the amendment floor", () => {
    expect(classFloor(["charter#5.3"], fixture)).toBe("entrenched");
    expect(classFloor(["charter#8.2"], fixture)).toBe("amendment");
  });

  it("inScopeAmendmentDocuments against the fixture is still just {charter} — nothing else is entrenched in it", () => {
    expect(inScopeAmendmentDocuments(fixture)).toEqual(new Set(["charter"]));
  });
});

// resolveProposalClassification — the pure decision logic POST /proposals
// calls, pulled out specifically so these cases are testable without a
// route-level HTTP/D1/session test harness, which this codebase doesn't
// have (plan §7 describes these as POST-handler tests; they're equivalent
// here, since the handler is a thin wrapper around this one function plus
// an unconditional `.push(...clauseErrors)` into its existing error array).
describe("resolveProposalClassification", () => {
  it("rejects cls='entrenched' submitted with no target clauses", () => {
    const r = resolveProposalClassification("entrenched", []);
    expect(r.errors).toEqual(["A Charter or Entrenched amendment must name at least one target clause."]);
    expect(r.cls).toBe("entrenched");
  });

  it("rejects cls='amendment' submitted with no target clauses", () => {
    const r = resolveProposalClassification("amendment", []);
    expect(r.errors).toEqual(["A Charter or Entrenched amendment must name at least one target clause."]);
  });

  it("tamper-proofs: cls='ordinary' submitted with a hidden entrenched clause id is raised to 'entrenched'", () => {
    const r = resolveProposalClassification("ordinary", ["treasury-code#5.7"]);
    expect(r.cls).toBe("entrenched");
    expect(r.targetClauseIds).toEqual(["treasury-code#5.7"]);
    expect(r.errors).toEqual([]);
  });

  it("rejects a forged/nonexistent clause id", () => {
    // Two real problems here, both reported: the key itself is invalid,
    // AND — once it's filtered out — the submitted "amendment" class is
    // left with zero valid clauses, which is its own separate violation.
    const r = resolveProposalClassification("amendment", ["charter#99.9"]);
    expect(r.errors).toEqual([`"charter#99.9" does not match a real clause.`, "A Charter or Entrenched amendment must name at least one target clause."]);
    expect(r.targetClauseIds).toEqual([]);
  });

  it("rejects a forged clause id even when a valid one is also named", () => {
    // Confirms the invalid-key rejection is unconditional (plan §4 step 2),
    // not merely a fallback when nothing else validates — a submission with
    // one real clause and one forged one is still fully rejected.
    const r = resolveProposalClassification("amendment", ["charter#99.9", "charter#5.3"]);
    expect(r.errors).toEqual([`"charter#99.9" does not match a real clause.`]);
    expect(r.targetClauseIds).toEqual(["charter#5.3"]);
    expect(r.cls).toBe("amendment");
  });

  it("a mixed entrenched and non-entrenched set raises to entrenched and stores both keys", () => {
    const r = resolveProposalClassification("amendment", ["treasury-code#5.7", "treasury-code#2.1"]);
    expect(r.cls).toBe("entrenched");
    expect(r.targetClauseIds).toEqual(["treasury-code#5.7", "treasury-code#2.1"]);
    expect(r.errors).toEqual([]);
  });

  it("a Charter, non-entrenched clause raises 'ordinary' to 'amendment' but no further", () => {
    const r = resolveProposalClassification("amendment", ["charter#5.3"]);
    expect(r.cls).toBe("amendment");
    expect(r.errors).toEqual([]);
  });

  it("naming a stricter class than required is never auto-downgraded", () => {
    const r = resolveProposalClassification("entrenched", ["charter#5.3"]);
    expect(r.cls).toBe("entrenched");
    expect(r.errors).toEqual([]);
  });

  it("a non-entrenched Treasury Code clause imposes no floor — 'ordinary' stays 'ordinary'", () => {
    const r = resolveProposalClassification("ordinary", ["treasury-code#2.1"]);
    expect(r.cls).toBe("ordinary");
    expect(r.errors).toEqual([]);
  });

  it("a non-entrenched Government Adoption Compact clause imposes no floor either", () => {
    const r = resolveProposalClassification("ordinary", ["government-adoption-compact#1.1"]);
    expect(r.cls).toBe("ordinary");
    expect(r.errors).toEqual([]);
  });

  it("no target clauses at all, with a non-amendment class, is untouched — free text stays free text", () => {
    const r = resolveProposalClassification("ordinary", []);
    expect(r.cls).toBe("ordinary");
    expect(r.errors).toEqual([]);
    expect(r.targetClauseIds).toEqual([]);
  });

  it("entrenched proposals keep the Entrenched class's own Charter 8.1/8.2 timing and threshold — 60 days deliberation, 7 days voting, three-quarters majority, 40% participation", () => {
    // classFloor/resolveProposalClassification only ever return a *class
    // name*; they never compute or override timing/threshold themselves.
    // The caller (POST /proposals) looks the final class up in CLASS_CONFIG
    // exactly as it always has for every other class — confirmed directly
    // here against the real config, not just that cls === "entrenched".
    const r = resolveProposalClassification("ordinary", ["charter#8.2"]);
    expect(r.cls).toBe("entrenched");
    const cfg = CLASS_CONFIG[r.cls];
    expect(cfg.delibDays).toBe(60);
    expect(cfg.voteDays).toBe(7);
    expect(cfg.threshold).toBe(0.75);
    expect(cfg.minParticipation).toBe(0.4);
  });

  it("the negative-control fixture changes which classification results", () => {
    const fixture: DocumentsGenerated = {
      documents: [
        {
          slug: "charter",
          sourceFile: "Founding_Charter.md",
          title: "The Founding Charter",
          status: "foundational",
          introText: "",
          sections: [],
          clauses: [{ id: "5.3", documentSlug: "charter", leadTitle: null, bodyMarkdown: "", attachedList: null, attachedTable: null, crossReferences: [], isScheduleOfDefaults: false, scheduleKind: null, isEntrenched: true }],
        },
      ],
      referencedBy: {},
      entrenchedClauseIds: ["charter#5.3"],
      entrenchedSections: [],
      entrenchedDocuments: [],
      unaccountedDefaults: [],
    };
    expect(resolveProposalClassification("ordinary", ["charter#5.3"], fixture).cls).toBe("entrenched");
    expect(resolveProposalClassification("ordinary", ["charter#5.3"]).cls).toBe("amendment"); // real corpus: 5.3 isn't entrenched
  });
});

// Plan §7's "no live data is affected" case, against a real (if tiny)
// SQLite DB via the same createTestDb() fixture liveValues.test.ts uses —
// a row inserted before this column existed reads back and keeps whatever
// cls it already had, untouched by anything in this file (which only ever
// runs at submission, inside POST /proposals, never at read time).
describe("a pre-existing row with targetClauseIds unset is unaffected", () => {
  it("reads back targetClauseIds as null, and CLASS_CONFIG still resolves its cls exactly as it always has", async () => {
    const db = createTestDb();
    const community = await ensureCommunity(db);
    const ts = Date.now();
    const [member] = await db.insert(members).values({ communityId: community.id, name: "alice", email: "alice@example.com", passwordHash: "x", salt: "x", joinedAt: ts, lastActiveAt: ts }).returning();
    const [row] = await db
      .insert(proposals)
      .values({
        communityId: community.id,
        by: member.id,
        title: "A pre-migration amendment proposal",
        why: "Submitted before clause-structured amendments shipped.",
        cls: "amendment",
        submittedAt: ts,
        voteFreezeAt: ts,
        voteOpensAt: ts,
        votingClosesAt: ts + 1,
        stage: "voting",
        // targetClauseIds intentionally omitted — simulates a row from
        // before migration 0017 added the column.
      })
      .returning();

    expect(row.targetClauseIds).toBeNull();

    const [reread] = await db.select().from(proposals).where(eq(proposals.id, row.id));
    expect(reread.targetClauseIds).toBeNull();
    expect(reread.cls).toBe("amendment");
    // The same generic lookup community.ts's closeOneVote uses — confirms
    // the class/threshold machinery needs nothing from this feature to
    // keep working for a row that predates it.
    const cfg = CLASS_CONFIG[reread.cls as ProposalClass];
    expect(cfg.threshold).toBe(2 / 3);
    expect(cfg.minParticipation).toBe(0.2);
  });
});
