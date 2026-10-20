// Phase 2 stage 4 — a real (if tiny) SQLite database for testing DB-backed
// code like liveValues.ts, with zero new dependencies: node:sqlite is a
// built-in on Node v24 (confirmed on this machine), and
// drizzle-orm/sqlite-proxy lets any synchronous/async SQL executor stand in
// for a real driver. The 17 committed migration files are plain SQL (no
// D1-specific syntax) and are run exactly as they ship, so this is testing
// against the real schema, not a hand-maintained copy of it that could
// drift from the actual migrations.
import { drizzle } from "drizzle-orm/sqlite-proxy";
// @ts-expect-error -- no @types/node in this Workers-only project (same
// reasoning as app/src/views/renderSafety.test.ts); node:fs resolves fine
// at runtime, vitest always runs under Node.
import { readFileSync, readdirSync } from "node:fs";
import * as schema from "../src/db/schema";
import type { Db } from "../src/db/client";

// node:sqlite (a Node v24 built-in, confirmed on this machine, no new
// dependency) is new enough that Vite/Vitest's SSR module resolver doesn't
// yet recognize it as an externalizable Node builtin — a plain `import
// "node:sqlite"` fails under vitest with "Failed to load url sqlite"
// even though the exact same import works fine under plain `node`.
// process.getBuiltinModule (Node 22.3+) sidesteps the resolver entirely by
// fetching the builtin directly, with no import/require statement for any
// bundler to intercept.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");

// Relative to the test runner's working directory (vitest run, from app/) —
// same no-extra-types reasoning as renderSafety.test.ts: avoids
// import.meta.url/__dirname, neither of which types cleanly without
// @types/node or the "dom" lib.
const MIGRATIONS_DIR = "migrations";

// Real D1 (confirmed against this exact migration sequence via local
// `wrangler dev`, Phase 2 stage 3) tolerates one specific pattern this
// project's `0002_closed_timeslip.sql` relies on: an INSERT…SELECT that
// rebuilds `proposal_comments` into `__new_proposal_comments` selects
// "display_name" and "is_anonymous" from the OLD table, which never had
// those columns — only the NEW one does. SQLite's historical double-quoted-
// string-literal fallback (a double-quoted identifier that can't resolve to
// a real column is treated as a string literal instead of erroring) is what
// lets this work on D1's SQLite build; Node's node:sqlite build has that
// fallback off by default. Rather than chase a compile-time SQLite flag
// node:sqlite may not expose at all, retry a failing statement with any
// column the engine says doesn't exist substituted for `NULL` — exactly
// what a double-quoted-string-literal fallback would have produced here
// anyway, since a brand-new column has no historical data to select.
function execWithMissingColumnFallback(sqlite: { exec: (sql: string) => void }, statement: string, depth = 0): void {
  try {
    sqlite.exec(statement);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const match = message.match(/no such column: "?([\w.]+)"?/);
    if (!match || depth > 5) throw err;
    const column = match[1].split(".").pop();
    // Only the SELECT half of an INSERT INTO ... SELECT ... FROM can be
    // referencing a column the SOURCE table lacks — the INSERT half names
    // columns on the (different) destination table, which does have it,
    // and must be left alone. Split on the first "SELECT " so only the
    // source-side reference gets nulled out.
    const selectAt = statement.indexOf("SELECT ");
    if (selectAt === -1) throw err;
    const head = statement.slice(0, selectAt);
    const tail = statement.slice(selectAt).replace(new RegExp(`"${column}"`), "NULL");
    const patched = head + tail;
    if (patched === statement) throw err;
    execWithMissingColumnFallback(sqlite, patched, depth + 1);
  }
}

/** A fresh in-memory SQLite database with every committed migration applied,
 * wrapped in a drizzle instance structurally identical to the app's real
 * `Db` (same schema, same query-builder surface) but type-cast at this one
 * boundary, since drizzle-orm/sqlite-proxy and drizzle-orm/d1 are different
 * generic classes even though both implement the same drizzle-core API this
 * app's code actually calls (select/insert/update/delete chains — nothing
 * here touches a D1-specific method). */
/**
 * `onQuery`, when given, is called once per statement sent to SQLite —
 * Charter 9.3's Amendment A needs a test that counts D1 calls for one full
 * `computeSustainabilityProgress` and asserts a fixed small upper bound,
 * independent of window length. Optional and additive: every existing call
 * site keeps working unchanged.
 */
export function createTestDb(onQuery?: () => void): Db {
  const sqlite = new DatabaseSync(":memory:");
  const files: string[] = readdirSync(MIGRATIONS_DIR)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql: string = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf-8");
    // drizzle-kit's own migration-file convention: statements are separated
    // by this exact marker, not by a bare ";" — several statements
    // (CHECK constraints, multi-statement table rebuilds) contain
    // semicolons that aren't statement boundaries.
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) execWithMissingColumnFallback(sqlite, trimmed);
    }
  }

  const proxyDb = drizzle(
    async (sql: string, params: unknown[], method: string) => {
      onQuery?.();
      const stmt = sqlite.prepare(sql);
      if (method === "run") {
        stmt.run(...params);
        return { rows: [] };
      }
      const rows = stmt.all(...params) as Record<string, unknown>[];
      return { rows: rows.map((r) => Object.values(r)) };
    },
    { schema }
  );

  return proxyDb as unknown as Db;
}
