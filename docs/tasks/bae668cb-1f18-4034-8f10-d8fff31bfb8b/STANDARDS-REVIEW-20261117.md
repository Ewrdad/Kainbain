# Standards review — branch tip vs `origin/main`

Date: 2026-11-17. Scope: structural consolidation of the site‑docs section
taxonomy (end state C). This is a docs‑only review: no source file was edited;
all gates below were run read‑only against a detached `/tmp` worktree of the
pushed tip (recreated with
`git worktree add --detach /tmp/kb-review-tip origin/kb/bae668cb-1f18-4034-8f10-d8fff31bfb8b`).

## What was reviewed

- Base: `origin/main` @ `8b5904e0`.
- Tip: `origin/kb/bae668cb-1f18-4034-8f10-d8fff31bfb8b` @ `f4a7c2fb`
  (merge‑base `df30a473`, 6 commits, 24 files vs main).
- Standards: `docs/KB Code Standards.md` (Values §…) plus the enforced rules
  in `docs/agent-docs/KB-Code-Standards.md` §Documentation/Jsdoc (§JSDocs,
  `check:jsdoc-example`, `check:one-function`).
- Task contract: `IMPLEMENTATION_PLAN.md` (success criteria 1–3), the
  Step‑4 finding in `FINDING-derivation-vs-consolidation.md`, and the
  mutation/gate evidence in `VERIFICATION-20261117.md` and
  `CLEANUP-20261117.md` (the latter two exist only on the pushed tip, not in
  the stale local checkout — see §Staleness below).

Behaviour claimed and independently re‑probed: `GET /docs` now ships
`{ sections, sectionLabels, docs }` from the new `api/siteDocs.js`
`buildDocsIndex()` single source; the frontend keeps no second taxonomy copy
(`DOC_SECTION_ORDER`/`DOC_SECTION_LABELS` deleted) and derives order/labels
at runtime via `deriveSectionOrder` (`frontend/src/components/docs/deriveSectionOrder.js`)
and `resolveSectionLabel`
(`frontend/src/components/docs/resolveSectionLabel.js`); `DocsView.jsx`
calls both with labelled inputs. The retired‑id path is untouched (see
§Safety properties).

## Staleness warning (read first)

The *local* checkout (`223fb0ed`) is 2 commits behind the pushed tip
`f4a7c2fb` and on its own **fails** `check:one-function` (2 top‑level
functions in `docsSections.js`) plus the labelled‑input rule (positional
`(index, docs)` / `(index, section)`). The pushed tip fixes both (split into
one‑function files, `({ index, docs } = {})`). All PASS verdicts in this
document are for the pushed tip. **Do not merge the stale base**: fast‑forward
the worktree to `f4a7c2fb` before merging, or the gate failure above reappears.

## Per‑standard verdicts

### 1. User understandable over technical language — PASS

- **Long, descriptive names.** New locals are `fromIndex`, `indexSections`,
  `seen`, `sectionId`, `labels` (`deriveSectionOrder.js`,
  `resolveSectionLabel.js`), `FRONTEND_DOCS_MODULES`, `moduleName`,
  `moduleNamespace` (`api/siteDocs.frontendParity.test.js`), `sectionRankById`,
  `uniqueArticles` (`buildDocsIndex` callers). The one short name, `{ dir }`
  in `buildDocsIndex({ dir } = {})`, is the established option key already
  used by `listDocs({ dir } = {})` / `getDoc(slug, { dir } = {})` in the same
  file — consistency wins over a new long name for an existing key.
- **Avoid technical language / never mention design patterns.** Diff
  (main…tip) contains no `factory`/`barrel`/`singleton`/`strategy`/`adapter`
  mentions; the only new “pattern” string is the review note’s own
  “Labelled input pattern” prose in `CLEANUP-20261117.md`, not source.
  `SLUG_PATTERN` predates the branch and is a regex allowlist, not a design‑pattern
  reference. “Own‑property”/“prototype” in `resolveSectionLabel` JSDoc name
  the exact failure inputs (`constructor`, `__proto__`) with a plain‑English
  why (“never leak a non‑string label into the UI”) — justified, not
  architecture jargon.
- **Common language.** `section`/`docs`/`sections`/`sectionLabels` are used
  uniformly; “group” in sidebar prose matches the pre‑existing `DocsView.jsx`
  (“Group order follows…”) for the presentation of sections.
- **File structure reflects the call stack.** Helpers live in the same
  `frontend/src/components/docs/` folder as their caller `DocsView.jsx` (flat
  docs folder, same as `DocsSidebarGroup`, `useCollapsedSections`) and each
  file is named after its single function, so “modify the sidebar order” is
  findable as `deriveSectionOrder.js`. `buildDocsIndex` lives beside
  `listDocs`/`getDoc` in `api/siteDocs.js`, thin route in `api/routes/docs.js`
  — same layering as before.
- **JSDocs in plain English, why not just what, `@example` tags.**
  `buildDocsIndex`, `deriveSectionOrder`, `resolveSectionLabel`, and
  `DOCS_SIDEBAR_STORAGE_KEY` each explain why (copies so callers cannot
  mutate the canonical list; dedup so a malformed index can never render one
  group twice; prototype guard so `__proto__` cannot leak). The REQUIRED
  RENAME PROCEDURE rewrite keeps alias/warn/history/`DEPRECATIONS.md`
  requirements verbatim (steps 2–5) and updates only step 1 (frontend derives
  from `buildDocsIndex`) and step 6 (intentional tripwires).
- **Labelled data input pattern.** All three new functions use
  `({ ... } = {})`; all call sites use `deriveSectionOrder({ index, docs })`
  and `resolveSectionLabel({ index, section })`. Matches `resolveSectionName`
  / `warnUnlessFileMissing` in the same files. The stale local checkout’s
  positional helpers are superseded on the tip.
- **`MARK:` above every new export.** Verified for `buildDocsIndex`
  (`api/siteDocs.js:392‑404`), `deriveSectionOrder`
  (`deriveSectionOrder.js:2‑18`), `resolveSectionLabel`
  (`resolveSectionLabel.js:2‑18`), `DOCS_SIDEBAR_STORAGE_KEY`
  (`docsSections.js:13‑20`): in every case the line above `export` is `***/`
  (only whitespace in between) with `MARK:` + `@description` + `@example` in
  the block. `npm run check:jsdoc-example` → PASS on the tip (680 missing,
  all grandfathered).

### 2. Functional over object oriented — PASS

- **No classes, no currying pseudo‑classes.** Diff adds zero `class`
  declarations; only plain `export function` bodies and `{...}` copies.
- **Black box, single responsibility.** `deriveSectionOrder` only orders,
  `resolveSectionLabel` only labels, `buildDocsIndex` only assembles the
  payload (`sections` copy + `sectionLabels` copy + `listDocs`). Each is
  named with a verb (`build`/`derive`/`resolve`).
- **Immutable by construction.** `buildDocsIndex` returns fresh
  `[...DOC_SECTIONS]` / `{ ...SECTION_LABELS }`; a node probe confirmed
  mutation of the result does not touch the canonical values. Helpers return
  fresh arrays/strings and never mutate inputs.
- **Minimum data.** `buildDocsIndex` takes only `{ dir }`;
  `deriveSectionOrder`/`resolveSectionLabel` take the GET /docs payload
  unit (`index` + `docs`/`section`) and pick fields (`sections`,
  `sectionLabels`) inside. Passing the payload as a unit is the
  minimum‑fragmentation reading: fragmenting it further
  (`indexSections`, `sectionLabels` as separate args) would invent a second
  calling contract for one payload. Not a violation.

### 3. Co‑location over abstraction — PASS

- **Tests next to the file.** `deriveSectionOrder.test.js` beside
  `deriveSectionOrder.js`, `resolveSectionLabel.test.js` beside
  `resolveSectionLabel.js`, `docsSections.test.js` beside `docsSections.js`,
  new `buildDocsIndex` suite inside `api/siteDocs.test.js` beside
  `api/siteDocs.js`.
- **One function per file (enforced).** Each new file holds exactly one
  top‑level named function; `docsSections.js` holds zero (const only).
  `npm run check:one-function` → PASS on the tip (835 files, 281
  grandfathered) with no new allowlist entry. `api/siteDocs.js` is a
  grandfathered multi‑function file; adding `buildDocsIndex` there is not a
  new file and is exempt. No new barrel re‑export (the gate’s optional
  remediation) was added — `DocsView.jsx` imports each helper directly.
- **Helpers only where repeated.** Order derivation is used once
  (`sectionOrder` memo) and label resolution twice (grouped map + breadcrumb)
  in `DocsView.jsx`; two small pure helpers are not over‑abstraction. The
  extended `FRONTEND_DOCS_MODULES` scan (all three frontend docs modules) is
  the direct consequence of the one‑function split, not a new abstraction.
- **Searchability.** Grep for fewer ports: `DOC_SECTION_ORDER`/`DOC_SECTION_LABELS`
  now occur only as the parity guardrail’s fix messages, never as live
  imports; no importer of the removed `DocsView` re‑exports exists
  (`routes.jsx` imports only `DocsView`; tests import `DocsView`,
  `slugFromHash`).

### 4. Tested over trusted — PASS (with a stated scope limit)

- **Fail‑safe helpers, proven by new edge tests.** Dedup in both paths,
  non‑string index entries skipped, first‑appearance fallback, empty‑index
  `[]`, always‑string label, prototype/`__proto__`/null/undefined →
  `''`. A node probe re‑ran every example and edge (`['b','a']`,
  dedup `['a','b']`, fallback `['b','a']`, `constructor` → `constructor`,
  `__proto__` → `__proto__`, null → `''`) with no throws, matching the test
  assertions. Render‑level cover: “a duplicated id in the index sections
  renders the group only once” (`DocsView.test.jsx`).
- **Contract tests, not literal copying.** `siteDocs.frontendParity.test.js`
  now asserts the index contract (`sections` equals `DOC_SECTIONS`,
  `sectionLabels` equals `SECTION_LABELS`, every indexed article inside a
  shipped section, no second copy in any of the three frontend modules) and
  `api/routes/docs.test.js` asserts every shipped section carries a
  non‑empty string label (exact values stay single‑sourced in parity).
  `buildDocsIndex` unit tests cover payload shape and copy‑not‑reference.
  Integration fidelity: parity drives real `app.inject(GET /docs)`;
  `DocsView` tests render through the UI.
- **Lowest level, consistent style.** Pure‑function units + API contract +
  one render test; vitest `describe`/`it`/`expect` with `MARK:` docblocks and
  `@example run …` exactly like neighbouring suites. Isolation follows
  precedent: the parity test’s `isolatedTestRoots` first import +
  `afterAll` temp‑root cleanup is byte‑parallel to
  `api/routes/ws.test.js`.
- **Scope limit (not a failure of the branch).** Full `test:api` /
  `lint:api` / `test:frontend` / `lint:frontend` were **not** re‑run in this
  session because the runner worktrees have no `node_modules` installed
  (`vitest: not found`). Independent evidence here is: pure‑node gates
  (`check:jsdoc-example` PASS, `check:one-function` PASS,
  `check-doc-links.mjs` PASS over 71 doc files) plus direct node probes of
  `buildDocsIndex`/`deriveSectionOrder`/`resolveSectionLabel` (all match
  the committed tests). The recorded full‑suite exit‑0 claims in
  `VERIFICATION-20261117.md` and `CLEANUP-20261117.md` were not
  re‑observed here and are cited as prior‑stage evidence, not re‑proven.
  The branch’s own suite bodies were read in full (see
  `api/siteDocs*.test.js`, `api/routes/docs.test.js`,
  `frontend/.../*.test.*` diffs).

### 5. Fast iteration over long planning — PASS (process)

The branch follows the plan’s sequence (Spikes A–C → Step‑4 finding → one
Step‑6 deletion → Step‑8 probes → gates) and documents each step in the task
folder. `IMPLEMENTATION_PLAN.md` explicitly preferred “delete the mirror over
weakening the tripwire” and the shipped change does exactly that: the
intentional backend tripwires (`DOC_SECTIONS toEqual`, GET /docs shape,
`LEGACY_SECTION_ALIASES toEqual`) remain; only the frontend mirror and its
pinned literals left. `api/agentGuide.js` and `site-docs/api-reference.md`
GET /docs descriptions were de‑literalised in the same pass (a further
touch‑point removed, additive `sectionLabels` field, route schema already
`additionalProperties: true`) — smallest‑safe scope respected (survey q2),
no sidebar regroup / new sections / slug‑rule changes.

## Safety properties (task contract) — PASS

- **Retired ids keep resolving with an owner‑facing warning, never a silent
  drop.** `LEGACY_SECTION_ALIASES` (`how-it-works → concepts`,
  `working-with → workflows`), `KNOWN_SECTION_HISTORY` (6 ids), and the
  `resolveSectionName`/`readDocFile` warning paths are byte‑unchanged in the
  `api/siteDocs.js` diff (only docblocks + new `buildDocsIndex`). A node
  probe confirms alias resolution, current‑id passthrough, and unknown→null.
  `DEPRECATIONS.md` is untouched by the branch (no diff vs main).
- **Guardrail still fails loudly naming alias‑less retired ids.** The
  `siteDocs taxonomy rename guardrail` suite in `api/siteDocs.test.js` is
  untouched (the branch only adds a separate `buildDocsIndex` describe); the
  parity guardrail now scans all three frontend modules with a fix message
  naming the offending module. Prior‑stage mutation probes (re‑recorded in
  `VERIFICATION-20261117.md` / `CLEANUP-20261117.md`) show the guardrail
  naming `working-with` / `workflows` with the fix text; not re‑probed here
  to avoid mutating the tree, but the guardrail source was read and is
  intact.
- **Derivation finding is evidence‑backed.** `FINDING-derivation-vs-consolidation.md`
  Spike A (bundler boundary: `node:fs`/`node:path`/`./config.js` at module
  top, `GET /docs` additive channel), Spike B (no `label:` frontmatter —
  re‑verified: 0 hits, `section:` is exactly 10× each of the 4 current ids),
  and Spike C (empty‑section silent drop identical to the guarded failure,
  `KAINBAIN_SITE_DOCS` per‑deployment divergence) were spot‑checked against
  the tip tree and hold. Deleting the frontend hand mirror is the
  next‑cheapest consolidation (survey q4) and is what shipped.
- **Touch‑point accounting.** Baseline rename touched ~7 places across
  8 files including the frontend statements; the tip deletes the frontend
  source literals and their pinned tests, and the parity test asserts the
  index contract instead. Remaining backend literals are documented in step 6
  as intentional tripwires (“the guardrail, not those literals, protects
  retired ids”) — consistent with the plan’s trade‑off note.

## What a future reviewer should re‑run before merging

1. Fast‑forward this worktree to `f4a7c2fb` (or rebase the review commit):
   `git pull --ff-only origin kb/bae668cb-1f18-4034-8f10-d8fff31bfb8b`
   (equivalent; exact form depends on the harness).
2. `npm run test:api`, `npm run lint:api`, `npm run docs:check`,
   `npm run check:one-function` — expected green per `CLEANUP-20261117.md`;
   only the last two plus doc‑links were independently re‑observed here.
3. Optional re‑probe: Step‑8 probe 1 (remove
   `LEGACY_SECTION_ALIASES['working-with']`) must fail naming `working-with`
   with the fix text; probe 3 (valid rename) must show zero frontend edits.
