// Clause-structured amendments (docs/reviews/clause-amendments-plan.md).
// Everything here is computed from app/src/generated/documents.ts and
// nothing else — no second hand-maintained list of in-scope documents or
// entrenched clauses. If Charter 8.2 is ever amended to name a different
// document, this file needs no change; only the generated module does.
import { documentsData } from "../generated/documents";
import type { DocumentsGenerated } from "../../scripts/documentsParser";
import type { ProposalClass } from "./params";

// "In scope" = Charter, unconditionally, plus any document that contains at
// least one entrenched clause — derived from the same three fields the
// generator already produces, never a second list that could drift from
// Charter 8.2 the way CLAUDE.md warns a hand-maintained duplicate always
// eventually does.
export function inScopeAmendmentDocuments(data: DocumentsGenerated = documentsData): Set<string> {
  const slugs = new Set<string>(["charter"]);
  for (const id of data.entrenchedClauseIds) slugs.add(id.split("#")[0]);
  for (const s of data.entrenchedSections) slugs.add(s.documentSlug);
  for (const d of data.entrenchedDocuments) slugs.add(d);
  return slugs;
}

export function isClauseEntrenched(documentSlug: string, clauseId: string, data: DocumentsGenerated = documentsData): boolean {
  if (data.entrenchedDocuments.includes(documentSlug)) return true;
  if (data.entrenchedClauseIds.includes(`${documentSlug}#${clauseId}`)) return true;
  return data.entrenchedSections.some((s) => s.documentSlug === documentSlug && s.clauseIds.includes(clauseId));
}

export function resolveClauseKey(key: string, data: DocumentsGenerated = documentsData): { documentSlug: string; clauseId: string } | null {
  const idx = key.indexOf("#");
  if (idx < 0) return null;
  const documentSlug = key.slice(0, idx);
  const clauseId = key.slice(idx + 1);
  const doc = data.documents.find((d) => d.slug === documentSlug);
  if (!doc || !doc.clauses.some((c) => c.id === clauseId)) return null;
  return { documentSlug, clauseId };
}

// The floor a set of named clauses imposes on the proposal's class. Never a
// downgrade — only ever a minimum. null means "no floor; whatever the
// submitter picked stands," which is the case for every clause in Treasury
// Code / the Government Adoption Compact that isn't their one entrenched one.
// Invalid keys are silently ignored here — rejecting them is the caller's
// job (app/src/index.tsx's POST /proposals handler), a layer up.
export function classFloor(keys: string[], data: DocumentsGenerated = documentsData): "entrenched" | "amendment" | null {
  let floor: "entrenched" | "amendment" | null = null;
  for (const key of keys) {
    const resolved = resolveClauseKey(key, data);
    if (!resolved) continue;
    if (isClauseEntrenched(resolved.documentSlug, resolved.clauseId, data)) return "entrenched"; // highest; short-circuits
    if (resolved.documentSlug === "charter") floor = "amendment";
  }
  return floor;
}

// Label for a single clause key, for chips/checkboxes/explanatory text —
// "The Founding Charter 1.2" rather than the raw "charter#1.2" key.
export function clauseLabel(key: string, data: DocumentsGenerated = documentsData): string {
  const resolved = resolveClauseKey(key, data);
  if (!resolved) return key;
  const doc = data.documents.find((d) => d.slug === resolved.documentSlug);
  return `${doc?.title ?? resolved.documentSlug} ${resolved.clauseId}`;
}

export interface TargetClauseChip {
  key: string;
  href: string;
  label: string;
  isEntrenched: boolean;
}

// Turns a proposal's stored targetClauseIds (the JSON string from the
// `proposals` column, or null) into chip data for proposalDetail.tsx /
// proposals.tsx — resolved against the CURRENT documentsData, not the
// stored text, so a chip's label always matches what the clause is called
// today, and a key that no longer resolves (document amended after
// submission, or a pre-migration row with nothing stored) is silently
// dropped rather than rendered as a dead link. Malformed JSON is treated
// the same as null — defensive, since nothing should ever write it, but
// this is read from the database, not re-derived.
export function resolveStoredClauseChips(stored: string | null, data: DocumentsGenerated = documentsData): TargetClauseChip[] {
  if (!stored) return [];
  let keys: unknown;
  try {
    keys = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(keys)) return [];
  const chips: TargetClauseChip[] = [];
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const resolved = resolveClauseKey(key, data);
    if (!resolved) continue;
    chips.push({ key, href: `/documents/${resolved.documentSlug}#${resolved.clauseId}`, label: clauseLabel(key, data), isEntrenched: isClauseEntrenched(resolved.documentSlug, resolved.clauseId, data) });
  }
  return chips;
}

export interface ProposalClassResolution {
  // The final class — may be raised above what was submitted, never lowered.
  cls: ProposalClass;
  // Resolved, valid keys only — what actually gets stored.
  targetClauseIds: string[];
  // Keys that didn't resolve against the current documents — any of these
  // present is a hard rejection by the caller (POST /proposals), independent
  // of class.
  invalidClauseKeys: string[];
  // Non-empty means the caller must reject the submission and insert
  // nothing — a raw POST, not just the rendered picker, is the real attack
  // surface this guards, so this is checked unconditionally, not only when
  // the client happened to submit "amendment"/"entrenched".
  errors: string[];
}

// Pure decision logic for the server-side enforcement (plan §4), pulled out
// of the POST /proposals handler specifically so it's unit-testable without
// simulating a full HTTP request through Hono's D1/session middleware —
// this codebase has no route-level test harness, and building one just for
// this would be disproportionate to what's actually being tested here: a
// classification decision, not anything about requests or sessions.
export function resolveProposalClassification(submittedCls: ProposalClass, rawClauseKeys: string[], data: DocumentsGenerated = documentsData): ProposalClassResolution {
  const invalidClauseKeys = rawClauseKeys.filter((k) => !resolveClauseKey(k, data));
  const targetClauseIds = rawClauseKeys.filter((k) => resolveClauseKey(k, data));

  let cls = submittedCls;
  const floor = classFloor(targetClauseIds, data);
  if (floor === "entrenched") {
    cls = "entrenched"; // never a downgrade — always the highest floor wins
  } else if (floor === "amendment" && cls !== "amendment" && cls !== "entrenched") {
    cls = "amendment";
  }

  const errors: string[] = [];
  if (invalidClauseKeys.length > 0) {
    errors.push(`${invalidClauseKeys.map((k) => `"${k}"`).join(", ")} does not match a real clause.`);
  }
  if ((cls === "amendment" || cls === "entrenched") && targetClauseIds.length === 0) {
    errors.push("A Charter or Entrenched amendment must name at least one target clause.");
  }

  return { cls, targetClauseIds, invalidClauseKeys, errors };
}

export interface ClausePickerClause {
  key: string; // "documentSlug#clauseId"
  id: string;
  label: string;
  isEntrenched: boolean;
}

export interface ClausePickerGroup {
  heading: string; // the document's own section/Article heading
  clauses: ClausePickerClause[];
}

export interface ClausePickerDocument {
  documentSlug: string;
  documentTitle: string;
  groups: ClausePickerGroup[];
}

// The submission form's clause picker: every clause in every in-scope
// document, grouped by document and then by the document's own
// section/Article heading — "grouped by document and article." Computed
// once from documentsData; nothing here is hand-maintained, and a document
// gaining or losing entrenched clauses changes this automatically the next
// time documents.ts is regenerated.
export function buildClausePicker(data: DocumentsGenerated = documentsData): ClausePickerDocument[] {
  const inScope = inScopeAmendmentDocuments(data);
  return data.documents
    .filter((d) => inScope.has(d.slug))
    .map((doc) => ({
      documentSlug: doc.slug,
      documentTitle: doc.title,
      groups: doc.sections
        .filter((s) => s.clauseIds.length > 0)
        .map((s) => ({
          heading: s.heading,
          clauses: s.clauseIds.map((id) => {
            const clause = doc.clauses.find((c) => c.id === id)!;
            return {
              key: `${doc.slug}#${id}`,
              id,
              label: clause.leadTitle ? `${id} — ${clause.leadTitle}` : id,
              isEntrenched: clause.isEntrenched,
            };
          }),
        })),
    }));
}
