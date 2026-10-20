import { resolveClauseKey, clauseLabel } from "../lib/clauseAmendments";

// Stage B — "a handful of clause chips now, the rest later" (Phase 2 plan
// §4, founder decision). Same visual as documents.tsx's own CrossRefChip
// plain-link branch (a `.pill gray` linking into the Reader), but a
// standalone component rather than imported from documents.tsx, since
// CrossRefChip isn't exported and this needs to be usable from
// treasury.tsx/proposalDetail.tsx/delegation.tsx too. Resolves the key
// against the generated documents module (via clauseAmendments.ts) and
// renders nothing at all for a key that doesn't resolve — never a dead
// link — which is also exactly what build-documents.test.ts-style tests
// elsewhere in this codebase already guard against happening silently.
export function ClauseChip(p: { clauseKey: string }) {
  const resolved = resolveClauseKey(p.clauseKey);
  if (!resolved) return null;
  return (
    <a
      class="pill gray"
      href={`/documents/${resolved.documentSlug}#${resolved.clauseId}`}
      style="margin:0 .3rem .3rem 0;text-decoration:none;display:inline-block"
    >
      {clauseLabel(p.clauseKey)}
    </a>
  );
}
