# Implementation Plan — Early, actionable MARK + JSDoc `@example` signal

## Goal

An agent adding a new exported component (or any new public export) learns the
MARK-block plus JSDoc `@example` requirement from repo docs or a sub-minute
local check — before CI — and, if it still fails, the CI failure message tells
them exactly what to add (file, export name, ready-to-paste snippet).

Case study: KainBain task `cccd8b9d-9021-4d0f-b51c-26d489073567`
(uncomplete-task feature) — the new `TaskCompleteToggleButton.jsx` default
export failed the JSDoc baseline in CI (`tests/check-jsdoc-example.test.mjs`,
"the baseline covers every currently-missing export") and was fixed after the
fact; see `docs/tasks/cccd8b9d-9021-4d0f-b51c-26d489073567/automated-tests-failure-20261115-232533.md`
and `review-uncomplete-20261116.md`.

## Binding constraints (from SURVEY.md — all Recommended options won)

1. **Docs home:** write the rule in **both** the main coding-standards guide
   **and** the agent quick-start checklist (q1).
2. **Early signal:** add the JSDoc-`@example` check to the **quick checks run
   locally before pushing** (q2). The "clearer CI message" alternative is a
   complement, not the primary fix.
3. **Scope:** the rule covers **any new shared item, even when added to an
   existing file** — not only brand-new files (q3).
4. **Message detail:** a violation message must carry **file name, item name,
   and a small ready-to-paste fixed example** (q4).

## Grounded facts (verified this turn, not assumed)

- Gate logic: `scripts/check-jsdoc-example.mjs` scans `api/`, `shared/`,
  `frontend/src/` (`*.js/jsx`); every `export function/class/const/let/var`
  and `export default` needs `@example` in the nearest attached JSDoc block;
  pre-existing gaps are grandfathered in
  `scripts/baselines/jsdoc-example-missing.json` (currently 680 entries).
- Gate failure renderer: `formatExampleFailure()` already names file +
  `kind exportName`, gives a generic MARK/`@example` template, and points at
  `npm run check:jsdoc-example` — but the snippet is **one generic template**,
  not tailored per export kind (e.g. `export default X` vs
  `export function f`), and it never shows the offending export's own context.
- Speed (measured): `node scripts/check-jsdoc-example.mjs` → **PASS in 0.64s**
  on this checkout — comfortably sub-minute, suitable for a fast local gate.
  The CI failure instead surfaced inside "Harness Self-Tests" (~80s into a
  ~17-minute `npm test` run), i.e. a whole wasted CI cycle for a formatting
  omission.
- Agent docs today: `docs/agent-docs/KB-Code-Standards.md` ("vendored, source
  of truth is this in-repo copy") already enforces `@example` on new exports
  (WP-8 section, points at `npm run check:jsdoc-example`), but **MARK is only
  implicit** (appears in an example snippet, never stated as a requirement),
  and the scope wording ("new exports") does not spell out q3 (new export in
  an existing file). `AGENTS-MAP.md` ("Test & lint commands") already lists
  `npm run check:jsdoc-example` but **not as a pre-push step**.
- No dedicated agent quick-start/pre-push checklist file was found
  (`docs/`, `docs/agent-docs/`, `AGENTS-MAP.md` searched); the checklist home
  must be confirmed in Phase 0 (leading candidate: a short pre-push block in
  `AGENTS-MAP.md` §Test & lint commands).
- Compliant reference: `frontend/src/components/tasks/TaskCompleteToggleButton.jsx`
  lines 1–21 (named export) and 59–64 (default export) — the post-fix shape to
  copy into docs/snippets.

## Approach (make the change easy, then make the change)

- **Phase 0 (make it easy):** pin down the checklist home, the exact fast-gate
  wiring point, and the per-kind snippet shapes; no behavior changes.
- **Phase 1 (docs):** state MARK + `@example` explicitly in both homes, with
  the q3 scope and a copy-paste example per export kind.
- **Phase 2 (fast signal + message):** document/wire the sub-second local
  check as a pre-push step; upgrade `formatExampleFailure` to emit a
  per-export tailored snippet; extend its unit tests.
- **Phase 3 (prove it):** acceptance walkthrough — a fresh non-compliant
  export must be caught locally in <60s and the message must name file +
  export + snippet.

## Steps

### Phase 0 — Recon (do first; unblocks everything)

1. **Confirm the checklist home.** Check whether agents have a canonical
   quick-start/pre-push checklist (re-search `docs/`, `AGENTS-MAP.md`,
   runner/agent prompts for "before pushing" guidance). Leading candidate: a
   short pre-push block in `AGENTS-MAP.md` §Test & lint commands. If none
   exists, the plan creates the checklist as a small section there rather than
   a new file (agents already read that map; a new file risks being unseen).
2. **Confirm the fast-gate wiring point.** Identify what "quick checks run
   locally before pushing" concretely means here (documented command list vs
   a hook vs `docs:check`). Note `docs:check` already runs the JSDoc gate but
   also runs slower doc/link checks — measure it; if it exceeds ~60s, the
   pre-push recommendation must be the standalone
   `npm run check:jsdoc-example` (0.64s measured), not full `docs:check`.
3. **Catalog per-kind snippet shapes.** Derive the minimal compliant block for
   each `kind` the scanner reports (`function`, `class`, `const`/`let`/`var`,
   `default`, incl. `export default function/class`) from the fixed
   `TaskCompleteToggleButton.jsx` (named + default examples) and one `const`
   example elsewhere in the tree. These become the message templates and the
   docs examples — one source, two uses.

### Phase 1 — Docs: state MARK + `@example` in both homes

4. **`docs/agent-docs/KB-Code-Standards.md`** (vendored page — keep header
   intact; edit only below it): promote MARK from implicit to explicit —
   every new public export needs a `MARK:` line **and** `@description` **and**
   `@example` in the attached JSDoc block; spell out the q3 scope ("any new
   exported item, including a new export added to an existing file — not just
   new files"); keep the baseline rule (never add new exports to
   `scripts/baselines/jsdoc-example-missing.json`); keep the
   `npm run check:jsdoc-example` repro pointer. Reuse the Phase-0 snippet
   shapes (named + default) so docs and error message agree word-for-word.
5. **Checklist home (from step 1):** add one line item, e.g.
   "New export? → MARK + `@example` attached (only whitespace between `*/`
   and `export`) → `npm run check:jsdoc-example` (<1s)". One line, no prose —
   a checklist item, not a second copy of the guide.
6. **Attachment rule (both homes):** state that only whitespace may sit
   between `*/` and `export` (the `nearestJsdoc` rule that bites in practice).

### Phase 2 — Fast signal + actionable message

7. **Wire the local pre-push check.** Make `npm run check:jsdoc-example` (or
   the Phase-0-verified fast command) the documented pre-push step for any
   change adding an export: checklist item (step 5) + `AGENTS-MAP.md` table
   annotation ("run before pushing when you add/rename an export"). Do NOT
   slow it down — no new work inside the script's hot path; do NOT move the
   slow Harness Self-Tests earlier.
8. **Upgrade `formatExampleFailure`** (`scripts/check-jsdoc-example.mjs`):
   for each failing `{ file, exportName, kind }`, emit a ready-to-paste block
   tailored to `kind` (function / class / const-like / default, including
   `export default function` naming), pre-filled with the real file path and
   export name, e.g. for the case-study shape:
   `frontend/src/components/tasks/TaskCompleteToggleButton.jsx` →
   `default TaskCompleteToggleButton` + the exact 4-line block that would
   have passed. Keep the existing generic remediation + local-repro lines.
   Keep output parseable (file paths + `kind name` lines unchanged in form).
9. **Extend `tests/check-jsdoc-example.test.mjs`** (`formatExampleFailure`
   block): assert per-kind snippets appear (at least `function` and
   `default`), asserting file path + export name are embedded in the snippet,
   mirroring the existing assertion style (`assert.match` on `@example`,
   file, `kind Name`, `Remediation:`, repro command).
10. **Case-study regression test:** add a test feeding a fixture shaped like
    the pre-fix `TaskCompleteToggleButton.jsx` (JSDoc-less default export)
    through `findPublicExports` → `checkMissing` (empty baseline) →
    `formatExampleFailure`, asserting it fails with file + `default` name +
    a pastable snippet. This pins the exact CI failure from
    `automated-tests-failure-20261115-232533.md` to the new message.

### Phase 3 — Prove it (acceptance walkthrough)

11. **Local-signal check:** add a temporary new export without `@example` to
    a scratch file in scope, run `npm run check:jsdoc-example`, confirm it
    fails in <60s naming the file/export; delete the scratch file and confirm
    PASS. (Time the run; record the wall time in the stage report.)
12. **Message check:** confirm the failure output contains file + export name
    + a snippet that, pasted above the export, turns the run green — i.e.
    perform the paste once and re-run.
13. **Full relevant suites:** `node --test tests/check-jsdoc-example.test.mjs`
    (must be 14/14 + new tests green) and `npm run docs:check` (the gate the
    script is wired into). No baseline edits: `git status` must show
    `scripts/baselines/jsdoc-example-missing.json` untouched (new exports
    document themselves per q6).

## Testing plan

- Unit: extended `tests/check-jsdoc-example.test.mjs` (steps 9–10) — the
  primary gate; run standalone.
- Manual/acceptance: steps 11–12 walkthrough with a scratch export (created
  and removed within the verification; never committed).
- Regression: `npm run docs:check`; confirm baseline file untouched.
- Out of scope: full `npm test` (17-min gate) — disproportionate for a docs +
  message change; the targeted suites plus `docs:check` are the proportionate
  evidence. The next real CI run on a follow-up task is the end-to-end proof.

## Documentation plan

- Changed: `docs/agent-docs/KB-Code-Standards.md` (explicit MARK + `@example`
  + q3 scope + attachment rule), checklist home from step 1 (one-line item),
  `AGENTS-MAP.md` table annotation if the checklist lives elsewhere.
- Unchanged: baseline JSON, scanner scope (`api/`, `shared/`,
  `frontend/src/`), CI pipeline shape.
- Stage report must record: checklist home chosen, measured local-check wall
  time, and the before/after failure message for the case-study export.

## Risks / open questions

- **Checklist home unconfirmed** (step 1): if agents don't read
  `AGENTS-MAP.md` pre-push either, the docs half needs a better home — ask
  where agents actually look before pushing rather than guessing.
- **Vendored standards page:** `KB-Code-Standards.md` header says keep
  everything below identical to the SilverBullet source — the upstream page
  must be updated/re-vendored in parallel or this copy drifts; flag the drift
  in the report either way.
- **Message length:** per-export tailored snippets grow CI output for large
  violations; cap full snippets per export (e.g. first N, summarize rest) so
  a 50-export violation stays readable.
- Non-goals: no scanner scope changes, no baseline regeneration/pruning, no
  new CI stages, no hook installation without agent consent.

## Success criteria

1. An agent can learn the MARK + `@example` rule (incl. q3 scope and the
   attachment rule) from the guide + checklist without hitting CI.
2. `npm run check:jsdoc-example` is a documented pre-push step and completes
   in <60s.
3. A violation message names the file + export and shows a snippet that
   passes when pasted (proven once in step 12).
4. Baseline file untouched; targeted suites green.

