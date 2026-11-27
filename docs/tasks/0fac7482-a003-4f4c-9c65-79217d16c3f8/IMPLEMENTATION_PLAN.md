# Implementation Plan — Remove `[Paused]` from the UI (tab) title

Task: `0fac7482-a003-4f4c-9c65-79217d16c3f8`
Source docs: `SURVEY.md` (this folder), task brief ("Remove the paused from the UI title — misleading, leftover from single-thread days").
Plan follows "make the change easy, then make the change": research/grounding first, then a small preparatory step, then the one-line-class change, then cleanup and verification.

## Goal

Remove the misleading engine-status prefix (`[Paused]` / `[Running]`) from the browser tab title (`document.title`), so the tab always reads `Kainbain - <project> - <page>` regardless of compute/engine state. No other UI surface changes.

## Success Criteria

1. No tab title rendered by the app contains `[Paused]` or `[Running]`, in any view, with any engine state (running, paused, idle, fetch-failed).
2. Toggling compute (including the `p` keyboard shortcut) no longer changes `document.title`.
3. Titles stay distinct per view (WCAG 2.4.2): `Kainbain - <project> - <page>`, with project omitted when unknown and page omitted for unknown views — exactly today's segment behavior minus the prefix.
4. All other status displays (engine badges, pills, `NowPlayingBar`, observability dashboard) are unchanged.
5. `npm run test:unit`, `npm run lint:frontend`, and `npm run docs:check` pass; no shipped-source reference to the title status prefix remains.

## Survey analysis (SURVEY.md — currently UNANSWERED, `answers: {}`)

The survey asks three questions; no answers were recorded, so this plan adopts explicit defaults (each reversible, fallback noted):

| # | Question | Adopted default | Why |
|---|----------|-----------------|-----|
| q1 | Remove both `[Running]`+`[Paused]`, or only `[Paused]`? | **Remove both** (no status in the tab title) | The brief says the prefix "isn't useful or relevant" — that applies to the whole single-thread-era signal, not one value. Keeping `[Running]` alone reintroduces the same misleading asymmetry (absence-of-prefix would imply "paused") and keeps the false single global-state model the brief rejects. |
| q2 | Target format? | **`Kainbain - <project> - <page>`** | Matches the survey's option and today's segments minus the prefix. |
| q3 | Keep Paused/Running elsewhere on screen? | **Yes — tab title only** | The brief scopes to "the UI title"; badges/pills describe per-task or live engine state and are out of scope. |

**Implementer note (Step 0):** re-read `SURVEY.md` at implementation time. If answers have since been recorded, they override the defaults above. If q1 was answered "remove only `[Paused]`, keep `[Running]`", the change is still one line in `titleForView` (prefix `Running` only when `computeRunning === true`, else no prefix) — the rest of this plan is unchanged.

## Approach

The title pipeline is already fully centralized, which makes this a small, safe change:

- **Single builder:** `titleForView()` in `frontend/src/a11y/useDocumentTitle.js` (lines 64–81). The prefix is born on line 73 (`const status = …`) and prepended on line 77 (`[` + status + `] Kainbain`).
- **Single owner/caller:** `App.jsx` lines 47–53 calls `titleForView(view, { taskKey, computeRunning, projectName })` inside `useDocumentTitle`. (Comments in `App.jsx` and `RetrospectivePage.jsx` confirm views must not set `document.title` themselves.)
- **Static shell title:** `frontend/index.html` line 6: `<title>[Paused] Kainbain - Orchestrator</title>` (pre-hydration paint).
- **Flag source (do NOT remove):** `computeRunning` comes from `useEngineStatus.js` (`api.computeStatus()`). It is also consumed by `NowPlayingBar`, `Header`, and the compute toggle — only its *title* use goes away.
- **Pinned by tests:** `frontend/src/a11y/useDocumentTitle.test.jsx` (format, Running/Paused matrix, fallbacks) and `frontend/src/components/App.test.jsx` lines 444–487 (boot title, view-tracking, Running flip).
- **E2E-safe:** canary specs (`canary-e2e/tests/*.spec.js`, `helpers.js`) assert only `toHaveTitle(/Kainbain/)`, which still matches after the change.
- **Docs gate gotcha:** `npm run docs:check` runs `scripts/check-jsdoc-example.mjs`, which validates `@example` outputs — the `@example` lines in `useDocumentTitle.js` (lines 61–62, 89) MUST be updated to the new format or the docs gate fails.

"Make the change easy" here = lock the surviving behavior (project/page/unknown-view/task-key segments) with characterization coverage and centralized test expectations first, so the prefix removal itself becomes a mechanical, obviously-correct deletion.

## Steps

### Step 0 — Confirm scope and re-verify inventory (research; do first)

1. Re-read `docs/tasks/0fac7482-a003-4f4c-9c65-79217d16c3f8/SURVEY.md`. If `answers` is now populated, adopt them over the §Survey defaults (see the q1 fallback above).
2. Re-run these searches from the repo root (the tree may have moved since planning):
   - `titleForView|computeRunning` in `frontend/src` (expect: builder + the single `App.jsx` call site + unrelated `computeRunning` consumers in `NowPlayingBar`/`Header`/context — those stay).
   - Literal `[Paused]` / `[Running]` in `frontend/` (expect hits only in `useDocumentTitle.js`, its test, `App.test.jsx`, `App.jsx` comment, `index.html`).
   - `toHaveTitle|document.title` in `canary-e2e/` (expect only `/Kainbain/` regex assertions — no update needed).
3. Record any new callers of `titleForView` found; each gets the same treatment as `App.jsx` in Step 2.

### Step 1 — Make the change easy: lock surviving behavior in tests

Goal: before touching the format, ensure the segments that must NOT change are pinned, so Step 2's diff can only affect the prefix.

1. In `frontend/src/a11y/useDocumentTitle.test.jsx`, verify/extend characterization coverage for the surviving segments (most already exists — keep it): distinct titles per view, project omitted when blank, task key on task-scoped views, graceful unknown-view fallback, legacy positional-arg compatibility.
2. Centralize the *expected-format* construction in the test files (a tiny local helper, e.g. `expectedTitle(project, page)`), so the Step 2 format flip edits expectations in one obvious place per file rather than a dozen string literals. Keep `useDocumentTitle` set/restore tests untouched (they don't depend on the format).
3. Run `npm run test --prefix frontend -- src/a11y/useDocumentTitle.test.jsx` to confirm green before the change.

### Step 2 — Make the change: drop the status prefix

1. `frontend/src/a11y/useDocumentTitle.js` — `titleForView()`:
   - Remove the `status` computation (line 73) and start `segments` with plain `'Kainbain'`.
   - Keep the function signature backward compatible (still accept the options object / legacy positional args; ignore `computeRunning`) — this keeps the diff minimal and call sites safe. Mark `computeRunning` as ignored/deprecated in the JSDoc.
   - Rewrite the JSDoc block (lines 45–63): new format description, new `@example` outputs (required by `check-jsdoc-example.mjs`).
2. `frontend/src/components/App.jsx`:
   - Stop passing `computeRunning` into `titleForView`, and remove `computeRunning` from the `useKainBain()` destructure — its only use in `App.jsx` is the title call (the `p` shortcut uses `toggleCompute`, which stays). `lint` will confirm nothing else referenced it.
   - Update the WCAG 2.4.2 comment (lines 43–46) to the new `Kainbain - <project> - <page>` format.
3. `frontend/index.html` line 6: `<title>Kainbain - Orchestrator</title>`.
4. Update the two test files' expectations to the prefix-free format (via the Step 1 helpers):
   - `useDocumentTitle.test.jsx`: rename the `[Running/Paused] format` test to assert the new format; convert the "Running vs Paused" matrix test into "title carries no status prefix regardless of `computeRunning`" (pass `true`/`false`/`undefined` — all yield identical titles).
   - `App.test.jsx` (lines 444–487): boot/view-tracking titles drop the prefix; rewrite the "flips to Running" test as "title is unaffected by compute toggle" (press `p`, assert title unchanged).
5. Grep shipped source for `Running] Kainbain` / `Paused] Kainbain` — expect zero hits outside historical task docs under `docs/tasks/`.

### Step 3 — Cleanup: remove what's now dead (title path only)

1. Confirm `computeRunning` is still consumed by `NowPlayingBar`/`Header`/toggle logic — the flag, its polling, and its toggle stay. Only the title wiring added in Step 2 goes.
2. If no caller passes `computeRunning` to `titleForView` anymore, keep the ignored-option tolerance (cheap, protects external/deep imports) but ensure no test or comment still describes prefix behavior.
3. Check `frontend/src/a11y/README.md` §3 (title ownership rule) — it names no prefix format, so likely no edit; only touch it if it quotes the old format.

### Step 4 — Documentation updates

1. JSDoc in `useDocumentTitle.js` + comment in `App.jsx` (done in Step 2) — these are the primary docs for this surface.
2. No user-facing docs describe the `[Paused]` tab prefix (verified: only historical task reports mention it) — no `site-docs`/guide updates needed. If Step 0's re-search finds any, update them here.
3. Optional: one-line `CHANGELOG.md` entry under Unreleased (UI: removed engine-status prefix from tab title) if the repo convention calls for it — check the file's head first.

## Validation Plan

Run in this order; each step gates the next:

1. **Focused unit tests** (fast, proves the change):
   - `npm run test --prefix frontend -- src/a11y/useDocumentTitle.test.jsx src/components/App.test.jsx`
   - Expect: all pass; specifically the new "no status prefix" / "title unaffected by toggle" assertions.
2. **Full primary gate:** `npm run test:unit` (api + frontend suites).
3. **Lint:** `npm run lint:frontend` (catches unused `computeRunning` destructures, a11y rule drift).
4. **Docs gate:** `npm run docs:check` (validates the rewritten JSDoc `@example`s).
5. **Straggler grep:** literal `[Paused]` / `[Running]` under `frontend/` (src + `index.html`) returns nothing; `titleForView` has no other callers than those updated.
6. **Headless title check (no long-lived server):** use the headless screenshot tool (`npm run capture:screenshot`) or a throwaway jsdom/vitest probe asserting `document.title === 'Kainbain - Project A - Orchestrator'` on boot and after a compute toggle. Per stage guidance, do not spawn background dev servers.
7. **Manual (implementer, 2 min):** open the app, read the tab across Orchestrator/Explorer/Settings/Retrospective; press `p` to toggle compute and confirm the tab title does not change; confirm badges/pills still show status (q3 scope guard).

Highest-risk validation: **Step 7's toggle check + the rewritten `App.test.jsx` toggle test** — they prove the misleading coupling is actually gone rather than just reworded.

## Risks / Open Questions

- **Survey unanswered (biggest risk):** q1's "both vs only-Paused" default could mismatch the requester's intent. Mitigation: Step 0 re-check; the alternative is a one-line variant, and the plan's tests/validation are identical either way. Open question for the requester: confirm "remove both prefixes".
- **WCAG 2.4.2 (Page Titled):** removing the prefix slightly reduces title distinctness across engine states, but per-view distinctness (the criterion's requirement) is preserved via project + page segments; the existing "titles every view distinctly" test continues to enforce it.
- **Over-deletion risk:** `computeRunning` must survive for `NowPlayingBar`/`Header`/toggle. The plan explicitly scopes deletion to the title path; `lint` + full `test:unit` catch accidental breakage.
- **Stale-title regressions:** the single-owner invariant (`App.jsx` owns `document.title`; see the `RetrospectivePage` stuck-title history) is untouched — this plan changes the string, not the ownership.
- **None** for e2e: canary title assertions are prefix-agnostic (`/Kainbain/`).

## Non-goals

- Changing any status badge, pill, banner, dashboard widget, or notification copy.
- Removing or renaming the `computeRunning` flag, its API (`computeStatus`/start/stop), or the `p` shortcut.
- Any backend change.
