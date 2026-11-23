# Implementation plan — Redo the Model Aliases screen so model names stop being cut off

## 0. Goal

The collapsed alias rows in Settings › Project Settings › Model Aliases truncate the model
summary to the point it is meaningless (screenshot: `assets/image.png`), even on desktop where
the rest of the page is empty. Model names carry provider prefixes (`google::gemini-3-pro`),
so a mid-name ellipsis destroys the information.

Redo the alias UI so the full model reference is readable on desktop and mobile, while keeping
every existing behaviour intact: collapse/expand, weighted targets, validation errors, reliability
lines, delete, add, save/discard.

In scope: the alias screen only — `frontend/src/components/settings/ModelAliasesSection.jsx`
(collapsed rows + expanded alias cards). Out of scope: the model picker on stage cards, any
backend/API change (none needed — this is a pure frontend layout/content change).

Source request: task title + `assets/image.png`. Decision checklist: `SURVEY.md` (round 1,
questions q1–q6; answers not collected yet — see §1).

## 1. Survey decision map (SURVEY.md round 1 — proposed defaults)

The survey answers are still empty (`"answers": {}`), so each question gets a **proposed
default** derived from the issue text. Once answers land they are binding; if an answer
contradicts a default, only Step 0 (design spike) is revisited — Steps 1–4 are written to be
layout-agnostic.

| # | Question | Proposed default (to bind when answered) |
|---|---|---|
| q1 | Scope of the redo | The whole alias screen: collapsed summary rows **and** the expanded alias cards' headers. Not the stage-card model picker. |
| q2 | Overflow behaviour | Summary becomes its own wrapping area: model name gets the flexible width, wraps (`break-all`) before any ellipsis; small badges (reliability, warnings) sit on the first line with the name and never squeeze the model text. Ellipsis is the last resort, with the full ref always in `title` + the DOM. |
| q3 | Provider prefix | Model id renders as the main text with the provider as a small separate badge next to it (`google` badge + `gemini-3-pro`); the complete stored ref is never shortened in the DOM/accessibility tree — it stays in `title` and an sr-only span. |
| q4 | Mobile (narrow screen) | The model summary gets its own full-width line under the alias name (option 1), not a cut single line. |
| q5 | Many aliases | Keep compact collapsed rows by default (option 1) — one header line + one summary line per alias — full details on expand. No hover auto-expand. |
| q6 | Other pain points | Error/warning badges move to their own full-width line when present so they are never squeezed out; reliability line stays compact on the header line; percent split stays inside the expanded card. |

## 2. Current-state map (verified in repo)

Root causes of the cut-off names:

1. **The section is width-capped.** `ModelAliasesSection.jsx:1148` renders
   `<div data-testid="model-aliases-section" className="space-y-3 max-w-2xl">` — 42rem (672px)
   max, while the settings page is much wider on desktop. This alone wastes the "rest of the
   page" the issue mentions. (Other settings tabs also use `max-w-2xl`, e.g.
   `ProjectSettings.jsx:259` — widening those is out of scope.)
2. **The collapsed row is one crowded flex line.** `ModelAliasesSection.jsx:1238` —
   `flex items-center justify-between gap-2 flex-wrap min-w-0` holds, in one row: the collapse
   toggle, the alias name (`truncate`, :1249), the summary badge (:1255–1260), the error badge
   (:1261+), the reliability line (:1283+), and the delete button (:1301+). Everything competes
   for the same width.
3. **The summary is a single hard-truncated string.** The badge wraps
   `<TruncatedText text={formatAliasSummary(targets, targetHarnesses)} />` (:1258).
   `TruncatedText` (`frontend/src/components/common/TruncatedText.jsx`) applies
   `min-w-0 max-w-full truncate inline-block` — a one-line ellipsis whose only full-text carrier
   is the hover `title`. `formatAliasSummary` (:854–880) builds one long string
   `"2 targets · 50% Muse (google::gemini-3-pro), 50% pi (…)"`, so a long provider-prefixed ref
   is exactly what gets cut.
4. **Model refs embed the provider.** Grammar in `shared/modelKeys.js` /
   `frontend/src/services/modelKeys.js`: canonical `harness::provider::id::reasoning`, legacy
   `provider::id`; `splitReasoning` (`shared/modelKeys.js:148`) splits the optional `::level`.

Key files and contracts:

| File | Role | Notes |
|---|---|---|
| `frontend/src/components/settings/ModelAliasesSection.jsx` (1489 LOC) | The alias screen | MARK-documented sections: `formatAliasSummary` :854, `CollapseToggleButton` :882, `DeleteAliasButton` :914, `AliasTargetRow` :462, collapsed/expanded render :1238–1450 |
| `frontend/src/components/common/TruncatedText.jsx` + `.test.jsx` | Shared one-line truncation label | Used by all settings cards; keep unchanged for other cards |
| `frontend/src/components/settings/ReliabilityLine.jsx` | Per-alias / per-target reliability line | Rendered in the collapsed row today |
| `frontend/src/components/settings/useCollapsibleRows.js` + `.test.jsx` | Collapse state keyed by stable row keys | Not touched by this redo |
| `frontend/src/components/settings/ProjectSettingsForm.jsx:685–700` | Mount point (`activeFormSection === 'aliases'`) | Passes aliases/harnesses/fleetCounts/projectId |
| `ModelAliasesSection.test.jsx` (1549 LOC), `ModelAliasesSection.reliability.test.jsx` (587) | Existing component tests | Assert summary text via `model-alias-summary-{i}` (:865, :1093) |
| `SettingsCards.overflow.test.jsx:193–210` | Overflow contract test | Asserts the *current* "summary truncates long model refs" contract — deliberately updated in Step 5 |
| `TruncatedText.test.jsx`, `useCollapsibleRows.test.jsx` | Shared hook/label tests | Should stay green untouched |

Stable test ids to preserve on the new markup: `model-aliases-section`, `model-alias-row`,
`model-alias-toggle-{i}`, `model-alias-summary-{i}`, `model-alias-error-alert-{i}` /
`model-alias-error-badge-{i}`, `alias-reliability-{i}`, `model-alias-body-{i}`.

Repo rules that shape the implementation:

- New files under `frontend/src/` are gated by `scripts/check-one-function-per-file.mjs`
  (one top-level function per new file) — so new pieces are **new files**, not more functions
  inside `ModelAliasesSection.jsx`.
- Every new/renamed export needs a `MARK:` + `@description` + runnable `@example` JSDoc block;
  gate: `npm run check:jsdoc-example` (see `docs/agent-docs/KB-Code-Standards.md` §Jsdoc).
- `npm run check:deps:frontend` guards declared imports.
- Accessibility: repo aligns to WCAG 2.2 AAA (`docs/accessibility/`); full model refs must stay
  in the DOM/accessibility tree — a hover tooltip alone is not enough.

## 3. Approach — make the change easy, then make the change

1. **Design spike first (Step 0)** — the only real unknown is the exact collapsed-row layout
   and truncation order. Settle it on a static mock before touching source.
2. **Make the change easy (Step 1)** — extract pure helpers + a presentational collapsed-row
   component into their own one-function-per-file modules with unit tests, while the current
   UI stays byte-identical and green. After this step the redo is prop-drilling, not surgery.
3. **Make the change (Steps 2–4)** — widen the container, swap the collapsed row to the new
   layout, polish the expanded header/error badge.
4. **Assure it (Steps 5–7)** — update/extend tests, headless screenshots at desktop + mobile
   widths, docs + accessibility pass. Full gates before merge.

## 4. Step-by-step plan

### Step 0 — Design spike: collapsed-row layout model (do first; the only design unknown)

- Questions to answer: (a) exact two-line collapsed layout — line 1 = toggle + alias name +
  reliability + delete; line 2 = full-width wrapping row of per-target chips; (b) chip structure =
  `50%` + harness label + provider badge + model id (mono, `break-all`, `min-w-0 flex-1`) with
  the full `harness::provider::id` ref in `title` + sr-only; (c) truncation order = chip wraps →
  model id wraps → ellipsis only as last resort; (d) container width: `max-w-2xl` → `max-w-4xl`
  for this section only; (e) mobile `<sm`: line 2 becomes its own full-width block (q4 option 1),
  which the flex-wrap structure gives naturally.
- Method: build a throwaway static HTML/Tailwind mock (scratchpad, not the repo) reproducing a
  collapsed alias with `2 targets · 50% Muse (google::gemini-3-pro-preview), 50% pi
  (anthropic::claude-sonnet-4-5)` at 1440px and 390px, review it against the six survey
  options, then write a ≤1-page decision note `DESIGN-NOTE.md` in this task folder with
  before/after ASCII layout and the chosen truncation order.
- Decide the provider-split semantics: strip an optional `::reasoning` via
  `splitReasoning`, then split on the first `::` — `google::gemini-3-pro` →
  `{ provider: 'google', modelId: 'gemini-3-pro' }`; canonical `pi::google::m` →
  `{ provider: 'google', modelId: 'm' }` (harness half is shown via the harness label chip, not
  repeated); no `::` → `{ provider: '', modelId: ref }`.
- Gate: decision note written and reviewed; **no source changes yet**.

### Step 1 — Make the change easy: seam extraction with the UI unchanged

New files (one function per file, each with a `MARK:` JSDoc block + `@example`):

- `frontend/src/components/settings/splitModelRefProvider.js` — `splitModelRefProvider(ref)` →
  `{ provider, modelId }` per Step 0 semantics; fail-safe on garbage input.
- `frontend/src/components/settings/aliasTargetSummary.js` — `aliasTargetSummary(target, targetHarnesses)`
  → structured `{ percent, harnessId, harnessLabel, modelRef, provider, modelId, reasoning }`
  for one target row (blank/unassigned/`none`-selection handled; never throws).
- `frontend/src/components/settings/AliasTargetChip.jsx` — one chip in the collapsed summary:
  percent, harness label, provider badge, model id (wrapping, `title` = full ref), sr-only full
  ref for the accessibility tree.
- `frontend/src/components/settings/AliasCollapsedRow.jsx` — the whole collapsed row
  (toggle, name, chips row, error badge line, reliability line, delete) as a pure presentational
  component receiving everything via props; `ModelAliasesSection` keeps state and passes
  handlers down.
- Reimplement the existing exported `formatAliasSummary` **on top of** `aliasTargetSummary` so
  the text fallback (used for tooltips/aria) and the chips can never drift apart.
- Unit tests for the two pure helpers + the two components (render via testing-library, following
  `ModelAliasesSection.test.jsx` conventions: `vi.mock` the api service where needed).
- Gate: `npm run test:frontend` fully green with **no visual change**; `npm run check:jsdoc-example`,
  `npm run check:one-function`, `npm run lint:frontend` green.

### Step 2 — Widen the alias section container

- In `ModelAliasesSection.jsx:1148` change `max-w-2xl` to the Step 0 width (default `max-w-4xl`)
  on the section root only.
- Gate: existing tests green (no test asserts `max-w-2xl` on this root — verify by grep first);
  one screenshot (Step 6) shows the section using the wider area.

### Step 3 — The core fix: collapsed row redesign

- Replace the single flex line at :1238–1310 with `<AliasCollapsedRow …>` implementing the
  Step 0 layout: header line (toggle + name + reliability + delete) and a full-width wrapping
  chips line (`data-testid="model-alias-summary-{i}"` on the chips container so existing test ids
  survive) with one `AliasTargetChip` per target.
- Error badge (`model-alias-error-badge-{i}`) renders on its own full-width line when present
  (q6), keeping `break-all`.
- Mobile: chips line is `w-full flex flex-wrap` under the header — on `<sm` it naturally becomes
  the full-width second line (q4 option 1); verify at 390px in Step 6.
- Keep all test ids listed in §2 on the equivalent elements.
- Gate: `ModelAliasesSection.test.jsx` collapse/expand/ARIA tests still green; summary
  assertions updated in Step 5.

### Step 4 — Expanded card polish (small)

- Expanded header keeps `TruncatedText` for the alias name (names are short by design) — verify
  by grep that no other `truncate` on this screen clips a model ref (the target model dropdowns
  already show full text; the "Stored … kept" note and validity messages already `break-words`).
- Only if Step 0 judges it helpful: show the provider badge next to the model dropdown in
  `AliasTargetRow`. Otherwise leave expanded cards untouched.

### Step 5 — Tests: update the overflow contract, add coverage

- Update `SettingsCards.overflow.test.jsx:193–210`: the test "truncates the collapsed summary
  when model refs are very long" becomes "keeps the full long model ref readable in the
  collapsed summary" — assert the full ref is present in the DOM (chip `title` + sr-only text)
  and the model id element carries `break-all` (wraps) instead of relying on single-line
  ellipsis. Other cards in that file are untouched.
- Update `ModelAliasesSection.test.jsx` summary assertions (:865, :1093): `model-alias-summary-{i}`
  now contains per-target chips — assert percent text, harness label, provider badge text, and
  the full model ref (in DOM/title), not one concatenated truncated string.
- New unit tests: `splitModelRefProvider` (no `::`, single `:`, canonical 3-segment, `::reasoning`
  suffix, blank/garbage) and `aliasTargetSummary` (legacy `provider::id`, canonical ref, blank
  model, `none`-selection harness hides model, unknown harness → `unassigned` label).
- New component test: a 2-target alias renders one chip per target with correct percents; a
  140-char model ref renders fully (text present, wraps); error badge on its own line.
- Gate: `npm run test:frontend` green (includes the duplicate-identifiers check);
  `npm run test:unit` green; `npm run lint:frontend` green; `npm run check:jsdoc-example` and
  `npm run check:deps:frontend` green.

### Step 6 — Visual verification (headless; no long-lived servers)

- Use the repo's headless capture: `npm run capture:screenshot -- --path "#/settings" --width 1440
  --out docs/tasks/158394ab-3b43-4813-b94a-32d772a79972/alias-desktop-after.png` and a second pass
  `--width 390` for mobile (the script supports `--width`, default 1440, and self-verifies PNG
  magic — see `scripts/capture-screenshot.mjs`).
- Fixture: a project with several aliases including a 2-target split and long
  `google::…` / `anthropic::…` refs plus one row with a validation error.
- Verify on the captures: no model name is cut mid-name at 1440px; the section uses the wider
  container; at 390px the summary sits on its own line; the error badge is fully readable.
- Store before/after screenshots in this task folder's `assets/` (PNG only; never edit the PNG
  bytes — the capture script verifies magic itself).
- Gate: screenshots reviewed side by side with `assets/image.png`; `npm run test:visual`
  (canary-e2e visual suite) run if it covers settings, otherwise noted as not covered.

### Step 7 — Documentation & accessibility

- Update the in-app helper paragraph in `ModelAliasesSection.jsx` (:1150–1166) only if its wording
  no longer matches behaviour.
- Grep `site-docs/` for the aliases settings page and update the description of the collapsed
  list if present; keep links intact (`npm run docs:check` validates).
- Accessibility pass against `docs/accessibility/` (WCAG 2.2 AAA alignment): full model ref in the
  accessibility tree (sr-only span, not `title`-only); chip text contrast unchanged (existing
  tokens); toggle/delete targets stay ≥44px; run the `wcag-audit` skill checklist over the new
  markup.
- Add a `CHANGELOG.md` entry if the repo convention covers UI fixes (check existing entries).
- Gate: `npm run docs:check` green.

## 5. Ordering / dependencies

`Step 0` → `Step 1` → `Step 2` → `Step 3` → `Step 4` → `Step 5` (tests updated alongside 3–4,
never after) → `Step 6` (screenshots) → `Step 7` (docs) → full gate `npm test -- --no-canary`
before merge. Steps 2–4 can ship in one PR once Step 1 lands; nothing backend-side is touched,
so api tests are regression-only.

## 6. Acceptance table (from the survey; verify every row)

| Survey | Expected behaviour | Verified by |
|---|---|---|
| q1 | Redo covers collapsed rows + expanded alias cards; stage-card picker untouched | Step 3–4 diff scope; `ModelAliasesSection.test.jsx` |
| q2 | Long model names are readable at desktop width — chips wrap, model id wraps with `break-all`, ellipsis only as last resort with full ref in `title`/DOM | overflow test rewrite (Step 5) + 1440px screenshot |
| q3 | Provider shown as a small badge next to the model id; complete stored ref never shortened in DOM/a11y tree | `splitModelRefProvider` unit tests + chip component test + screenshot |
| q4 | At 390px the model summary is its own full-width line under the alias name | 390px screenshot + layout classes |
| q5 | Many aliases stay compact (one header line + one summary line each); expand shows details | `useCollapsibleRows.test.jsx` + collapse tests stay green |
| q6 | Error/warning badge on its own full-width line when present; reliability line compact on header | error-badge test + screenshot with an invalid row |

Plus the issue's core criterion: **in `assets/image.png`'s scenario, the model names are no
longer meaninglessly cut off on desktop** — shown by the 1440px after-screenshot.

## 7. Assurance plan (how we prove it)

- Unit/component: `npm run test:unit`; focused runs
  `npm run test:frontend -- ModelAliasesSection SettingsCards.overflow TruncatedText useCollapsibleRows`.
- Pre-push gates (all <1 min): `npm run lint:frontend`, `npm run check:jsdoc-example`,
  `npm run check:one-function`, `npm run check:deps:frontend`, `npm run docs:check`.
- Visual: `npm run capture:screenshot` at `--width 1440` and `--width 390` (headless, no
  background server); PNG magic self-verified by the script; before/after stored in
  `docs/tasks/158394ab-3b43-4813-b94a-32d772a79972/assets/`.
- Full gate before merge: `npm test -- --no-canary` (api untouched, so regression-only there).
- Manual checklist: real project with long `provider::model` refs → desktop + mobile viewport;
  keyboard-only expand/collapse (aria-expanded already asserted in tests); save/discard round-trip
  still submits collapsed rows (covered by existing transfer-safety tests).
- Docs: `site-docs/` settings page + in-app copy + CHANGELOG entry reviewed in the same PR;
  accessibility checklist (wcag-audit skill) run over the new collapsed-row markup.

## 8. Risks

- **Overflow-contract test churn**: `SettingsCards.overflow.test.jsx` deliberately changes meaning
  in Step 5 (truncate → readable-wrap). Other settings cards keep `TruncatedText` unchanged, so
  their tests stay green.
- **Section-width divergence**: only the aliases section leaves `max-w-2xl`; other tabs keep it.
  Intentional per the issue; a global settings-page widening is a separate task (note in PR).
- **jsdom cannot measure real layout**: wrap/truncation behaviour is proven by screenshots
  (Step 6), not by class assertions alone; class assertions are a secondary signal.
- **Survey answers pending**: §1 defaults stand in; if answers contradict, only Step 0's layout
  constants change — the Step 1 seams (helpers + presentational row) are layout-agnostic.
- **Very long unbroken model ids** (140+ chars): `break-all` on the chip's model text + full ref
  in `title`/sr-only keeps them contained without mid-name ellipsis; the chip itself may span
  multiple lines, which q2's wrap option explicitly allows.
- **Test-id drift**: any renamed test id breaks existing suites — §2 lists the ids that must
  survive; Step 5 updates only the summary-content assertions.
