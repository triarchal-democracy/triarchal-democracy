# Brief for a Claude Code session — app review, and the documents inside the app

*Written 11 October 2026 for a fresh Claude Code session started at the repository root. Read this
file, then `CLAUDE.md`, before touching anything. Where they disagree on a standing rule, `CLAUDE.md`
wins; where they disagree on this task, this file wins.*

---

## What the founder wants

1. **A full review of the app** (`app/`, Triarchal Framework) — every route, view, mechanic,
   migration and test — measured against the founding documents in `docs/founding/`.
2. **The founding documents inside the app**: a complete, readable reference to the Charter and the
   ten other documents, implemented so a Member *engages* with them — understands what a rule says,
   sees it working in their own community, and knows how to change it — rather than scrolling a wall
   of clauses.

Do them in that order. The review tells you what the documents section has to link to and which
rules the app gets wrong; building the reader first would wire it to bugs.

---

## Ground rules (non-negotiable)

- **You do not deploy.** No `wrangler deploy`, no `vercel`, no `wrangler d1 ... --remote`. When work
  is ready, write the founder a guarded PowerShell block (see `CLAUDE.md`, "Deploying") and stop.
- **One wrangler config.** `app/wrangler.patha.toml` is the Triarc (`triarchalframework`,
  D1 `statera-patha`). Every wrangler command you write names
  `-c wrangler.patha.toml`. Note: `package.json`'s `db:migrate:*` scripts target the D1 named
  `triarc`, which is not the Triarc's database — flag this in the review and fix it.
- **The founding documents are the source of truth, and they are first drafts.** Do not edit their
  substance. Where code and document disagree, report it; the founder decides which one changes.
  Typos and broken cross-references you may fix, listed in your summary.
- **One copy of every fact.** The project's recurring failure has been the same fact written in two
  places and drifting. Anything the app shows from the documents must be *generated from*
  `docs/founding/*.md`, never re-typed, and a test must fail when the generated copy is stale (the
  site already does this: `site-src/verify.py` section 3g).
- **No manufactured attention.** Rules of Procedure 4.3: the platform "may never manufacture urgency
  … No countdowns, streaks, or guilt-based prompts." *Engaging* here means clear, useful and
  connected — never streaks, badges for reading, reading-progress nags, notifications to read, or
  Marks for reading. Reading the documents earns nothing.
- **Standing content rules** (from `CLAUDE.md`): the dividend is gated and nothing implies otherwise;
  disability, income-assistance, pension and child-benefit programmes are outside the mechanism by
  default (Compact 7.1a) and no screen implies the project intends to change them; Platform Stage 1
  means conventional auth, not cryptography; never name a specific assistance programme.
- **Checks that must pass before you call anything done:** `python3 site-src/verify.py`,
  `python3 site-src/check_arithmetic_page.py`, `cd app && npx vitest run`,
  `cd app && npx tsc --noEmit`. `verify.py` scans `app/src` too.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
  Never `git add -A` without reading `git status` first; scratch files have been committed that way.
  Do not push — the founder pushes.
- **No credentials.** Twilio and any other secrets are set by the founder with `wrangler secret put`.

---

## Phase 1 — Review (report only, change nothing)

Read all of `app/src` (about 11,000 lines; `index.tsx` alone is ~2,800) and `app/migrations`.
Produce `docs/reviews/2026-10-app-review.md` containing:

### 1a. Traceability matrix — the centrepiece
Every clause in `docs/founding/*.md` that the software is supposed to enforce, compute or display,
one row each:

| Document & clause | What it requires | Where the code does it (file:line) | Test that proves it | Status |
|---|---|---|---|---|

Status is one of **implemented & tested**, **implemented, untested**, **partial**,
**contradicts the document**, **not built (documented as not built)**, **not built (undisclosed)**.
The last two matter most: the documents and the About page are explicit about what is not built yet
(postal and phone channels, cryptographic anchoring, Phase II tracking); anything missing that the
documents present as working is a finding.

Give special attention to the mechanics changed on 10 October:
- Treasury Code 4.1/4.3/5.4/5.5 and Charter 5.3/5.3a — cap measured on **new money only**; what the
  cap holds back joins the **next** cycle's Foundation Dividend, split equally.
- Charter Article IX — Phase I 150/50, Phase II 500/150 plus the founder-share criterion (founder-
  authored proposals under a quarter of those completed). Check the one-time migration in
  `community.ts`; it wrote no record entry after deploy, so the stored live values are unconfirmed
  (see `CLAUDE.md`, "Open").
- Contribution Code 2.3 — civic vs organisational sector defaults (`CIVIC_SECTORS` behind the
  `CIVIC_SECTORS` var).
- Compact 7.3 continuity, now entrenched under Charter 8.2 (seven entrenched provisions) — does the
  app's amendment-class logic know continuity is entrenched?

### 1b. Findings, ranked
Security (auth, sessions, phone verification, rate limits, `/admin/*`, CSRF, input validation,
anything reachable without auth that should not be), correctness against the documents, data
integrity and migrations, accessibility (keyboard, contrast, screen
readers, mobile), performance, and code health (`index.tsx` size, dead code, stale comments that
describe superseded rules). Each finding: severity, `file:line`, what happens, the clause it
violates if any, the fix.

### 1c. Every sentence the app shows a user that states a rule
List each one with the clause it paraphrases and whether it still matches. This is where
superseded wording hides.

**Stop at the end of Phase 1.** Summarise the top findings for the founder and wait. Do not fix
anything until the founder says which findings to act on.

---

## Phase 2 — The documents in the app

Use plan mode: present the design (routes, data flow, screens, what is generated, what is tested)
and wait for the founder's go before building.

### What it should be
A **Documents** area in the app, in the nav, readable by anyone (signed in or not):

1. **Library** (`/documents`) — the eleven founding documents as cards: name, one line on what it
   governs, how many clauses, and status where it matters (e.g. the Federation Compact is dormant;
   the Triarc Operations Code applies to the Triarc alone; documents are proposals, not ratified).
2. **Reader** (`/documents/:slug`) — the full text, with:
   - a table of contents by article/section, and a stable anchor and copyable link for every clause
     (`/documents/charter#5.3`);
   - **every cross-reference auto-linked** ("Treasury Code 5.4", "Compact 7.1a", "charter 5.3",
     bare "5.4" within the same document) — and on hover or tap, the referenced clause's text
     inline, with a no-JavaScript fallback (`<details>`);
   - **"Referenced by"** under each clause: the clauses elsewhere that point to it;
   - entrenched clauses (Charter 8.2's seven) and "schedule of defaults" clauses visually marked.
3. **Live in this community** — beside a clause that the app computes, show the current value from
   the running community, read-only:
   - Charter 5.3/5.3a, Treasury 4.1/5.4: this cycle's equal share, Foundation share, cap, the
     one-in-*n* full-distribution figure;
   - Treasury 5.1: the activation gate — verified Members and Delegate Positions filled, against 30
     and all;
   - Charter Article IX: progress against each Phase I criterion (Phase II where computable,
     "not tracked yet" where not — say so honestly);
   - Rules of Procedure 1.3/1.3b: each proposal class's threshold and what it means in votes at the
     current membership;
   - Contribution Code 2.3: this community's actual sector list;
   - Charter 3.3: the delegation expiry periods in force.
   Values come from `params.ts` / the community's stored params and live queries — never typed into
   copy.
4. **Defaults and how to change them** (`/documents/defaults`) — every chosen default across the
   documents (each "schedule of defaults" clause names them): current value, which proposal class
   can change it, and a **"Propose a change"** link that opens a new proposal pre-filled with the
   clause and the correct class (entrenched provisions route to the entrenched class). This is the
   most engaging thing the section can do: it turns reading into the route to changing the rules.
5. **From the app to the rule** — wherever the app acts on a rule (casting a vote, a proposal's
   threshold, the dividend page, delegation expiry, a dispute, the founding-phase dashboard), a small
   clause chip ("Rules of Procedure 1.3") linking to the reader. Members should never have to wonder
   *why* the app did something.
6. **Search** — extend `/search` to clauses, returning the clause with its anchor.

### Plain-language summaries — only with a guard
Short "in plain words" lines per article help, but they are a second copy of the rule and will drift.
If the founder approves them: keep them in one file next to the documents (e.g.
`docs/founding/plain/<doc>.md`), each keyed to its clause and storing a hash of the clause text it
summarises; a test fails whenever a clause changes and its summary has not been re-confirmed. Draft
them for the founder's review; never publish a summary the founder has not seen.

### How to build it
- A generator (`app/scripts/build-documents.ts` or Python if simpler, matching `site-src/`) parses
  `docs/founding/*.md` into a typed module (`app/src/generated/documents.ts`): documents → sections →
  clauses, each with id, number, text, cross-references and flags. Reuse what `site-src/mdblocks.py`
  and `site-src/sync_site.py` already know about the markdown's shape — headings, bold clause numbers
  like `**5.3a**`, lists and tables attached to clauses, `>` notes.
- A test re-runs the parse and fails if the committed generated module is stale, and fails on any
  cross-reference that does not resolve (the site has the same check: `verify.py` 3c).
- Server-rendered with the existing Hono JSX views and `layout.tsx` styles; works without JavaScript;
  progressive enhancement only for previews and copy-link.
- Matches the site's typography and tone. Mobile first. Accessible: real headings, focus states,
  sufficient contrast, link text that says where it goes.
- Unit tests for the parser, the cross-reference resolver, the "live" calculators (assert they equal
  `mechanics.ts`, not a re-implementation), and the proposal pre-fill routing to the right class.

### Out of scope unless the founder asks
Editing document text; annotations or comments on clauses (deliberation belongs in proposals);
changing any mechanic; anything on the public website in `site/`.

---

## Finishing

- All four checks pass; the generated documents module is current.
- `CLAUDE.md` gains a short section: the documents area, its generator, and the staleness test —
  added to the "canonical vs generated" table.
- A summary for the founder in plain language: what was found, what was built, what was deferred,
  and the guarded deploy block (migrations, if any, then deploy, both with
  `-c wrangler.patha.toml`).
