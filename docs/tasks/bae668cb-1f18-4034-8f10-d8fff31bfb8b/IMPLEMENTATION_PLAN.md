# IMPLEMENTATION_PLAN — Derive-or-consolidate the site-docs section taxonomy

## Goal

Remove at least one manual touch-point from a site-docs section rename while
keeping every safety property the two case-study tasks built: retired ids keep
resolving via `LEGACY_SECTION_ALIASES` with an owner-facing `console.warn`
(never a silent drop), and the guardrail still fails loudly naming any
alias-less retired id. Owner direction is a docs-derived bottom-up taxonomy
with no central list to maintain ([SURVEY.md](./SURVEY.md) q1 = derive from
docs); the survey also bounds the work to the smallest safe cleanup
([SURVEY.md](./SURVEY.md) q2) and to a single shared list with no frontend
second copy ([SURVEY.md](./SURVEY.md) q4). [SURVEY.md](./SURVEY.md) q3 was
"not sure", so this plan recommends the status quo already proven by the case
studies: old links keep working **plus** a warning (alias + warn, exactly what
`readDocFile` does today).

## Background and case studies (what already exists)

- `68714709-3f50-4e5c-bfa6-bac16a36c393`: regrouped the docs viewer sidebar.
  Its upgrade-safety audit reproduced the live failure this whole line of work
  guards against — `readDocFile` returned `null` for old `section:` values so
  `listDocs` returned `[]` and `getDoc` returned `null` on custom
  `KAINBAIN_SITE_DOCS` dirs, with no alias, warning, or `DEPRECATIONS.md`
  entry. The branch fixed that instance ad hoc (`LEGACY_SECTION_ALIASES` +
  warn + deprecation note + regression tests).
- `ee3ca5d2-8b05-4908-bbd1-808c667d1175`: built the permanent guardrail so the
  next rename cannot repeat the silent drop. Shipped state (verify by reading
  before implementing):
  - `api/siteDocs.js`: `DOC_SECTIONS` (4 ids in sidebar order),
    `SECTION_LABELS`, `LEGACY_SECTION_ALIASES`
    (`how-it-works → concepts`, `working-with → workflows`),
    `KNOWN_SECTION_HISTORY` (6 ids, append-only), `resolveSectionName` (pure
    lookup), `readDocFile` (alias resolves + warns; alias-less retired id
    warns loudly naming the fix; unknown/missing section warns).
  - `api/siteDocs.test.js` "siteDocs taxonomy rename guardrail" (6
    assertions: history ⊆ current ∪ aliased; current ⊆ history; alias keys ⊆
    history; history clean; alias targets live; retired ids in
    `DEPRECATIONS.md`).
  - `frontend/src/components/docs/docsSections.js`: `DOC_SECTION_ORDER` +
    `DOC_SECTION_LABELS` hand mirror; `DocsView.jsx` prefers the `sections`
    array from `GET /docs` at runtime and falls back to the mirror.
  - `api/siteDocs.frontendParity.test.js` locks the two copies together;
    `frontend/.../docsSections.test.js` pins the literal order and the
    label-key set; `api/siteDocs.test.js` pins `DOC_SECTIONS` with
    `toEqual([...4 literals])`.
- A rename today therefore touches ~7 places: `DOC_SECTIONS`,
  `SECTION_LABELS`, `LEGACY_SECTION_ALIASES`, `KNOWN_SECTION_HISTORY`,
  `DEPRECATIONS.md`, the frontend mirror (order + labels), and the
  exact-equality test literals. The REQUIRED RENAME PROCEDURE docblock on
  `DOC_SECTIONS` lists them.

## Success criteria

1. At least one manual rename touch-point is deleted (not documented, deleted:
   a rename diff no longer needs to edit that file/constant), **or** a written
   evidence-backed finding shows content-derivation is unsafe plus the
   next-cheapest consolidation is shipped instead.
2. Unchanged safety properties, each re-proven by mutation probe (see Step 8):
   aliased retired ids index with a recorded warning; alias-less retired ids
   fail the guardrail naming the id and the fix; `DEPRECATIONS.md` mention
   still required.
3. `test:api`, `lint:api`, and `docs:check` green on the final diff
   (`docs:check` = siteDocs suites + doc-link + jsdoc-example checks, so
   edited docblocks are covered).

## Approach (make the change easy, then make the change)

Order the work so the riskiest question is answered cheapest first. Research
spikes (Steps 1–3, read-only, no behavior change) come before any seam or
edit, because they decide between the two mutually exclusive end states:

- **End state D (derivation, owner-preferred):** section ids (and ideally
  order/labels) computed from shipped `site-docs/` content at startup/test
  time; `DOC_SECTIONS` becomes a derived value or disappears.
- **End state C (consolidation fallback):** `api/siteDocs.js` stays the single
  hand-maintained source; the frontend mirror and/or the pinned test literals
  become derived artifacts that no rename ever edits by hand.

Do not build both. The decision gate (Step 4) picks one on evidence. Current
prior, to be confirmed or refuted by the spikes: **full derivation is likely
unsafe** (labels and order have no in-content source; empty-section and
custom-dir problems below), and the cheapest safe structural win is
**killing the frontend hand mirror** (survey q4 already approved: "reuse one
list, no second copy"), possibly plus collapsing `DOC_SECTIONS` +
`SECTION_LABELS` into one record. The plan is sequenced so that conclusion,
if confirmed, costs three short spikes rather than a failed implementation.

## Step 1 — Spike A: can the frontend consume the API without a hand mirror?

Read-only. Question: what is the cheapest channel that lets
`frontend/src/components/docs/docsSections.js` stop being hand-edited?

- Read `frontend/src/components/docs/DocsView.jsx` around the `sections` /
  fallback logic: confirm the runtime already prefers `GET /docs`
  `sections`, and identify exactly when the fallback matters (offline,
  first paint, tests, storybook).
- Check the frontend bundler config: can a browser bundle import
  `api/siteDocs.js` directly? Prior: **no** — it imports `node:fs`,
  `node:path`, `./config.js`, so direct import would break the web build;
  the spike must verify this rather than assume it.
- Enumerate viable channels: (a) generated file (a small `scripts/` step or
  vitest setup emitting `docsSections.js` from the API at build/test time);
  (b) runtime-only (delete the fallback, render sidebar from the index
  response); (c) extend `GET /docs` to also return labels so the frontend
  needs neither order nor label copies.
- Output: a one-paragraph verdict naming the channel and its new failure
  mode (e.g. generated-file staleness vs. runtime-only empty-first-paint).

## Step 2 — Spike B: are labels and order derivable from shipped content?

Read-only. Scan the real `site-docs/` dir (40 articles, 10 per section):

- Confirm no label metadata exists in frontmatter (fields today are `title`,
  `section`, `order`, optional `slug`) — labels therefore cannot be derived
  without a new frontmatter field or naming convention, which is itself a new
  central contract, not "no list".
- Confirm no per-section order metadata exists (`order` is per article, so
  section order derived from content would be arbitrary: first-appearance,
  alphabetical, or min-article-order — all unstable across edits).
- Output: verdict on whether derivation can cover ids-only, or
  ids + order + labels, and what new content contract each would require.

## Step 3 — Spike C: empty-section and custom-dir behavior under derivation

Read-only, with throwaway temp dirs (never the real content dir):

- Empty-section: a rename that moves the last article out of a section makes
  a derived taxonomy silently drop that id — indistinguishable from the
  silent-drop failure the guardrail exists to prevent. Verify against
  `listDocs`/`readDocFile` semantics and the integrity test's "never asserts
  on article counts" rule.
- Custom dirs: `KAINBAIN_SITE_DOCS` overrides mean derived taxonomy differs
  per deployment; confirm the frontend fallback and parity test would then
  compare against the wrong list.
- New-section bootstrapping: a brand-new empty section cannot exist before
  its first article under derivation.
- Output: verdict — derivation-safe, derivation-safe-with-reserved-list
  (which concedes "no central list" is unachievable), or derivation-unsafe.

## Step 4 — Decision gate: derivation vs. consolidation

Write the finding down in the task folder before any implementation edit:

- If any spike shows derivation drops order/labels stability, empty-section
  visibility, or custom-dir parity, record the **evidence-backed unsafe
  finding** (failing input + observed behavior + why the guardrail cannot
  cover it) and proceed with end state C.
- If derivation is safe, proceed with end state D, keeping
  `LEGACY_SECTION_ALIASES` + warn + `KNOWN_SECTION_HISTORY` + guardrail
  intact (derivation changes where *current* ids come from, never the
  retired-id path).
- Either way, name the single touch-point being deleted.

## Step 5 — Make the change easy: characterization + seam (no behavior change)

- Write a throwaway rename-cost probe (under `/tmp`, never committed):
  simulate a rename and list every file/literal that must change for
  `test:api` + `docs:check` to stay green. This is the baseline the final
  diff is measured against.
- Add the seam for the chosen end state without changing behavior:
  - State C (expected): introduce the single canonical record (e.g. one
    `SECTION_DEFS`-style map deriving `DOC_SECTIONS` + `SECTION_LABELS`, or
    the generation step for the frontend mirror) *alongside* the existing
    exports; keep all existing tests green.
  - State D: add a content-scanning derivation helper beside `DOC_SECTIONS`
    with unit tests on temp dirs; `DOC_SECTIONS` itself unchanged yet.

## Step 6 — Make the change: delete the touch-point

One structural edit only (smallest safe cleanup per survey q2):

- Preferred (state C): delete the hand-maintained frontend mirror —
  `docsSections.js` becomes generated or the fallback is removed in favor of
  the `GET /docs` index (extended with labels if Spike A chose channel c).
  A rename then never edits the frontend by hand; the parity test enforces
  the single source.
- Alternative (state C): collapse `DOC_SECTIONS` + `SECTION_LABELS` into one
  record and derive both exports, deleting the intra-file duplicate.
- Alternative (state C): convert the exact-equality test literals
  (`DOC_SECTIONS` `toEqual`, `DOC_SECTION_ORDER` `toEqual`, label-key
  sorting) into invariant assertions over the single source, so test files
  stop being rename touch-points. Note the trade-off: these literals are
  intentional tripwires, so prefer deleting the *mirror* over weakening the
  *tripwire* unless both are cheap.
- Forbidden: touching the retired-id path (`LEGACY_SECTION_ALIASES` entries
  are never removed), silencing any `readDocFile` warning, or removing an id
  from `KNOWN_SECTION_HISTORY`.

## Step 7 — Update the procedure where it lives

- Rewrite the REQUIRED RENAME PROCEDURE docblock on `DOC_SECTIONS` to the
  new touch-point list (fewer steps), keeping the alias + warn +
  `DEPRECATIONS.md` + history requirements verbatim.
- If the frontend mirror is generated, document the regen command in the
  `docsSections.js` header and in the task notes; if runtime-only, document
  the new first-paint/empty-index behavior.
- No second full copy of the procedure anywhere (existing rule: one-line
  pointer from `LEGACY_SECTION_ALIASES`).

## Step 8 — Mutation probes (prove the guardrail still bites)

With throwaway local edits, reverted immediately (or via `git stash`):

1. Remove one `LEGACY_SECTION_ALIASES` entry → guardrail fails naming that
   retired id (record exact message).
2. Rename a `DOC_SECTIONS` id without adding an alias → guardrail fails
   naming the retired id.
3. Perform a valid rename end-to-end under the *new* structure (new id +
   alias + `DEPRECATIONS.md` mention + history update, plus regen step if
   any) → full siteDocs suites pass without hand-editing the deleted
   touch-point (record the diff file list as proof the touch-point is gone).

## Step 9 — Full gates + docs

- Run `npm run test:api`, `npm run lint:api`, and root `npm run docs:check`;
  all green required. No UI change is expected, so no `capture:screenshot`
  or visual suite (consistent with `ee3ca5d2`); if Step 6 changes sidebar
  first-paint behavior, add one headless DocsView check instead.
- Task-folder notes: the Step 4 finding, the Step 5 baseline vs. final
  touch-point count, and the three Step 8 messages.

## Validation plan (maps to the steps)

| What is proven | How | Expected evidence |
|---|---|---|
| Derivation verdict is factual | Spikes A–C reads + temp-dir probes | Named file/line for each claim (bundler config, frontmatter fields, `listDocs` empty-dir return) |
| One touch-point deleted | Step 8 probe 3 diff file list vs Step 5 baseline | Rename diff touches fewer files; deleted file/constant absent from diff |
| Retired ids still resolve + warn | Existing legacy-alias suite + probe 1 revert | Suite green; probe-1 failure message names the id |
| Alias-less retire still fails loud | Probes 1–2 | Guardrail messages naming the id and the fix |
| Gates green | `test:api`, `lint:api`, `docs:check` | Zero failures; jsdoc-example check covers edited docblocks |

## Risks and open questions

- **Bundler boundary (spike A risk):** if neither generation nor runtime-only
  is cheap in this repo's frontend toolchain, the fallback is the intra-API
  collapse (`DOC_SECTIONS` + `SECTION_LABELS` → one record) plus test-literal
  consolidation — still one deleted touch-point, zero frontend risk.
- **Label source under derivation:** no in-content label field exists, so end
  state D would need a new frontmatter contract (`label:` per article with a
  first-wins/consistency rule, or a per-section index file) — that replaces
  a central list with a distributed one and needs its own consistency test;
  costed in Step 4, not assumed.
- **No open survey questions:** q1 (derive), q2 (smallest), q4 (single list)
  are settled by the survey answers; q3 ("not sure") is resolved by
  recommendation (alias + warn, the proven status quo), recorded above.
- **Non-goals:** no sidebar regroup, no new sections, no generic rename
  framework beyond siteDocs, no changes to slug/traversal/title rules.
