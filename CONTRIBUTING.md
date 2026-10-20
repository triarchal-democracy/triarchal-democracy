# Contributing

The most useful contribution is finding what is wrong. The open problems are listed on the Work with us
and Known limits pages of the project site; each points to the clause or entry it comes from.

Practical notes:

- The app is in `app/` (Hono + JSX on Cloudflare Workers, Drizzle ORM over D1, migrations in
  `app/migrations`). Run `npm install` there, then `npx tsc --noEmit` and `npx vitest run`.
- The founding documents live in `docs/founding/*.md`. The app's defaults are checked against them
  (`app/src/lib/defaultsRegistry.ts`), so changing a default means changing the clause and the
  registry together.
- The site is built from the documents with `site-src/`; `python3 site-src/verify.py` must print
  ALL CHECKS PASSED.
- Keep claims modest. No promises of income or outcomes, no urgency, no invented scarcity.
- Questions or a first introduction: see the Work with us page on the project site; it explains how.
