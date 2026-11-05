# IMPLEMENTATION_PLAN — Survey results are not being saved

- Task: `fbcaef1d-4b97-4fcd-8a50-f32d903c7185`
- Symptom: surveys are created but never filled in; the survey is left as a blank template.
- Status: **plan only — no code changed in this stage.**
- Date: 2026-11-04
- Inputs factored in:
  - `docs/tasks/fbcaef1d-4b97-4fcd-8a50-f32d903c7185/SURVEY.md` (grill-me survey; answers are currently empty — see §4)
  - `idea-20261104-015830.md` was listed as a prior report but **does not exist on disk** — treated as missing input (see §10).
- Verification policy for this repo: `npm run test:unit` is the primary gate; no long-lived background servers for visual checks — use headless runners, fixtures, and `npm run capture:screenshot`.

## 1. Goal

Make survey answers persist reliably end to end: a human fills in a survey on the survey page (`/#/tasks/:id/survey`), clicks Save/Submit, and the answers land in the task's configured survey file (default `SURVEY.md`) and remain visible on reload — instead of the survey staying a blank template.

## 2. Success criteria

1. Saving answers writes them to the same survey file the survey page reads (no read/write file mismatch).
2. After Save, the form still shows the just-saved selections and notes (no blank-reset illusion), and a reload shows them too.
3. After Submit with all visible required questions answered, the task advances exactly as today (`survey-verify` canary still passes).
4. Every save failure surfaces a specific, actionable error (never a silent return to a blank form).
5. No regression: `npm run test:unit` green, `canary-e2e/tests/survey-verify.spec.js` green, append-only round history preserved (old rounds/answers untouched by saves).

## 3. Context and grounding (what the code does today)

Save path, in call order:

1. UI — [SurveyPage.jsx](/home/server2/.kainbain/runner-work/kb-fbcaef1d-4b97-4fcd-8a50-f32d903c7185/frontend/src/components/tasks/SurveyPage.jsx) builds `answerPayload` from local `answers` state (`{ [qid]: { selected, notes } }`) and calls `http.submitSurvey(projectId, taskId, { answers })` for both Save and Submit.
2. Routes — `GET/POST /tasks/:id/survey` registered in `api/work/taskWorkRoutes.js` (route behaviour pinned by [taskSurvey.routes.test.js](/home/server2/.kainbain/runner-work/kb-fbcaef1d-4b97-4fcd-8a50-f32d903c7185/api/work/taskSurvey.routes.test.js)).
3. Storage — [taskSurvey.js](/home/server2/.kainbain/runner-work/kb-fbcaef1d-4b97-4fcd-8a50-f32d903c7185/api/work/taskSurvey.js) `saveSurveyAnswers` merges the patch via `applyAnswers`, validates the merged rounds with `validateSurvey`, then rewrites only the `survey-json` fences via `spliceRoundsIntoMarkdown`. Rejects with `SURVEY_NOT_FOUND` (404) or `SURVEY_INVALID` (400); throws when fence count drifts ("changed underfoot").
4. Model — [shared/survey.js](/home/server2/.kainbain/runner-work/kb-fbcaef1d-4b97-4fcd-8a50-f32d903c7185/shared/survey.js): `applyAnswers` (latest round owning each id wins, unknown ids reported not thrown), `validateSurvey` (options subset, single ≤ 1, `showIf` grammar), `surveyStatus` / `unansweredRequired`.
5. File selection — `resolveQuestionMeOutputFile` / `_fileInputForArgs`: explicit file keys (`outputFile` + aliases) win, else a stage object decides, else default `SURVEY.md`. Both read and write paths funnel through this, but GET and POST could still disagree if they receive different selectors.
6. Contract docs — [site-docs/surveys.md](/home/server2/.kainbain/runner-work/kb-fbcaef1d-4b97-4fcd-8a50-f32d903c7185/site-docs/surveys.md) (append-only rounds, `outputFile` aliases, empty-round and no-file behaviour).
7. E2E proof the happy path once worked — [survey-verify.spec.js](/home/server2/.kainbain/runner-work/kb-fbcaef1d-4b97-4fcd-8a50-f32d903c7185/canary-e2e/tests/survey-verify.spec.js) covers save-stays-parked, submit-advances, append-only round 2, mobile, and empty-round continue.

## 4. What SURVEY.md contributes (and what is still open)

The grill-me survey in `SURVEY.md` currently has `"answers": {}` — **no answers yet**. The plan factors each question in as a decision branch with a safe default, so work is not blocked while answers are awaited:

| Survey Q | What it would disambiguate | Default assumption (reversible) |
|---|---|---|
| q1 — what goes wrong on save (answers vanish / error message / button dead / other) | Distinguishes UI-state reset vs backend reject vs dead handler | Assume "answers disappear, form looks blank again" (matches the task text); Phase 2 tests all three anyway |
| q2 — what "blank template" means (questions still there, answers gone / whole page empty) | "Questions there, answers gone" points at save/state; "page empty" points at load/parse failure | Assume "questions still there, answers gone"; Phase 2 checks the load path too |
| q3 — scope (every survey / one survey / sometimes) | "Every survey" = systemic bug; "one survey" = data-specific (bad round/options/`showIf`); "sometimes" = race or conditional-visibility bug | Assume systemic until the repro matrix says otherwise |
| q4 — expected post-survey behaviour (advance vs wait-for-check) | Defines "done": Submit advances (documented) vs a new wait state | Default to documented behaviour: Save parks, Submit advances ([site-docs/surveys.md](/home/server2/.kainbain/runner-work/kb-fbcaef1d-4b97-4fcd-8a50-f32d903c7185/site-docs/surveys.md)); do NOT build a new wait state unless the answer demands it |
| q5 — error message text (conditional on q1 = error) | Would pinpoint `SURVEY_INVALID` / `SURVEY_NOT_FOUND` / network failure | No default possible; Phase 1 makes the UI/backend surface the exact code + message so this question answers itself |

Action: request the SURVEY.md answers out of band, but proceed on the defaults above. If answers arrive mid-implementation and contradict a default, re-run the affected Phase 2 branch before fixing.

## 5. Approach — make the change easy, then make the change

- **Big/research work first.** The fix is unknown until the layer is known (UI state vs routes vs validation vs file resolution vs fence splicing), so diagnosis (Phases 0–2) precedes any fix. No speculative fixes in multiple layers.
- **Make the change easy (Phases 0–1):** lock the expected contract, build a one-command repro, add characterization tests that pin current save behaviour, and make failures loud (exact error codes in UI + logs). These stay as permanent regression assets.
- **Make the change (Phases 3–4):** apply the smallest fix at the confirmed root cause, plus minimal hardening so a save can never again look like a silent blank reset.
- **Prove it (Phase 5–6):** layered tests (unit → routes → frontend → canary), then docs.

## 6. Steps

### Phase 0 — Lock the contract (small, first)

1. Record the expected behaviour (from §2 and [site-docs/surveys.md](/home/server2/.kainbain/runner-work/kb-fbcaef1d-4b97-4fcd-8a50-f32d903c7185/site-docs/surveys.md)): Save persists without advancing; Submit persists and advances iff no visible required questions are open; hidden conditional questions never block; unknown-question ids are reported; file untouched when validation fails.
2. Confirm the §4 defaults with the requester if reachable (async; non-blocking). Note the missing `idea-20261104-015830.md` in the request so it can be re-supplied or struck from the record.
3. Freeze scope: this task fixes **saving answers**. Survey *generation* (agent writing rounds), new wait states, and UI redesign are non-goals (§9).

### Phase 1 — Make the change easy: repro + characterization + loud failures (no fix yet)

4. Build a one-command repro script (throwaway, under `/tmp`, e.g. `/tmp/survey-save-repro.mjs`): mkdtemp project → create task docs dir → `appendSurveyRound` with a 2-question round (one `single` required, one `multiple` optional with `showIf`) → `saveSurveyAnswers` with a UI-shaped payload → assert the file contains the answers and `status`/`missing` are correct. Expected evidence: script prints PASS today for the direct-storage path (isolating storage from UI/routes), or fails and immediately localises the bug.
5. Extend the repro to the route layer using the existing fake-app pattern from `taskSurvey.routes.test.js`: POST answers through the real route handler and diff the file on disk. This catches read/write selector mismatch (GET vs POST resolving different `outputFile`s) without a browser.
6. Add characterization tests (kept permanently; expected to pass both before and after, documenting reality):
   - UI-shaped payloads incl. edge shapes: empty `selected` with notes-only, untouched questions omitted from payload, `multiple` with several values, answers for `showIf`-hidden questions.
   - `saveSurveyAnswers` accept/reject matrix: unknown option → `SURVEY_INVALID`; unknown question id → reported in `unknownIds`, file still written; missing file → `SURVEY_NOT_FOUND`.
7. Make failures loud (diagnostic improvement, kept): verify the frontend API client propagates backend `code`/`statusCode`/message into `err.message` shown by `SurveyPage`'s `saveError` alert; if it swallows them, fix propagation now (it is instrumentation, not the fix). Add a server log line on survey-save reject with task id, code, and first validation error.
8. Capture the failing fixture: the smallest SURVEY.md + answers payload that reproduces "blank after save", saved as a test fixture for Phase 5. If no repro exists at any layer by end of Phase 1, stop and report: the bug is environment/data-specific — request the failing task's SURVEY.md (q3 = "one survey" branch).

### Phase 2 — Isolate the root cause (research core; each branch is falsifiable)

Run the branches in order; stop at the first confirmed cause. Each branch names the evidence that confirms or kills it.

9. Branch A — UI state reset (prime suspect for "answers disappear, form blank again"): after `handleSave` → `refreshFrom(data)`, `SurveyPage` sets `survey` but never rehydrates `answers` from the response, and `merged` overlays stale `rounds` with local `answers`. Confirm: save via UI test, assert radio/checkbox/notes still show post-save values; kill: selections persist in a `SurveyPage.test.jsx`-style test with a mock client.
10. Branch B — read/write file mismatch: GET and POST resolve different files (e.g. stage carries `outputFile: FEEDBACK.md` but one path defaults to `SURVEY.md`), so answers save correctly — to a file the UI never reads. Confirm: Phase 1 route repro shows bytes landing in a different filename than the GET path reads; kill: both resolve identically across default, alias-key, and stage-object selectors.
11. Branch C — validation rejects the UI's payload: `submitSurvey` throws `SURVEY_INVALID` (e.g. option string mismatch after `String()` coercion, single-choice multi-select, `showIf` referencing unknown question failing the *whole-file* `validateSurvey` on save). Confirm: route repro returns 400 with a concrete first error; kill: UI-shaped payloads pass the Phase 1 matrix.
12. Branch D — fence splice failure: `spliceRoundsIntoMarkdown` throws "changed underfoot" (extra `survey-json`-looking fences, CRLF, agent-edited prose breaking the regex) leaving the file untouched while the UI reports — or swallows — an error. Confirm: save against the real failing SURVEY.md throws; kill: round-trip tests with CRLF/prose variants pass.
13. Branch E — load/parse path ("whole page empty" q2 variant): `parseSurvey` skips invalid-JSON blocks into `errors` that the UI may ignore, rendering an empty form. Confirm: failing SURVEY.md yields `errors.length > 0` with zero rounds; kill: `errors` empty for the repro file.
14. Record the confirmed branch + evidence in the task docs before writing the fix. If two branches confirm (e.g. validation rejects AND UI swallows the error), fix the data-path cause first, the surfacing cause second.

### Phase 3 — Make the change: smallest fix at the confirmed cause

15. Apply exactly one branch fix:
    - A: rehydrate `answers` from the save response (or refetch the survey) in `refreshFrom`; never clear local selections on save; add `savedAt` indicator.
    - B: unify GET/POST file selectors on the single `_fileInputForArgs` derivation; add a route test asserting same-file round-trip under an `outputFile` override.
    - C: fix whichever side violates the contract — normalize the client payload (e.g. omit untouched questions, coerce exactly like `normalizeQuestion`) or relax the server check to the documented rule — with a test per payload shape from Phase 1.
    - D: harden fence matching/splicing (tolerate CRLF and surrounding prose; precise error naming the offending fence).
    - E: surface `errors` in the UI as a blocking warning naming the broken round instead of rendering an empty form.
16. Keep the diff minimal: no refactors, no new dependencies, no behaviour change to generation/parking/advancement.

### Phase 4 — Minimal hardening (same change, guarded)

17. Ensure a save can never present as a silent blank reset: on save error keep selections, show the backend code + message; on save success show "Answers saved" with a timestamp (already partially present — complete it).
18. Guard double-submit races (buttons already disable while saving/submitting — verify in test, do not rework).
19. Re-run the Phase 1 characterization tests: previously-passing ones still pass; the previously-failing fixture now passes.

## 7. Testing plan (assurance the change was implemented)

Primary gate: `npm run test:unit`. No long-lived dev servers; visuals via headless runs and `npm run capture:screenshot`.

| # | Layer | Test | Command / runner | Expected evidence |
|---|---|---|---|---|
| T1 | Storage unit | New `api/work/taskSurvey.test.js` cases: UI-shaped payload round-trip, unknown-id reporting, invalid-option reject, fence CRLF/prose tolerance | `npm run test:api` (scoped to taskSurvey first, then full) | New tests fail before fix (Branch C/D) / pass after; no existing test altered |
| T2 | Route integration | New `taskSurvey.routes.test.js` cases: save→read same-file round-trip incl. `outputFile` override; 400 body carries `SURVEY_INVALID` + first error; 404 carries `SURVEY_NOT_FOUND` | `npm run test:api` | Proves Branch B dead; error contract pinned |
| T3 | Frontend unit | New `SurveyPage.test.jsx` cases: selections+notes still visible after Save; save error keeps selections and shows message; reload-from-response hydrates answers | `npm run test:frontend` | Proves Branch A dead |
| T4 | Full unit gate | Entire suite unmodified | `npm run test:unit` | Green, same run before final report |
| T5 | Canary E2E | Existing `canary-e2e/tests/survey-verify.spec.js` (save-stays-parked, submit-advances, append-only round 2, mobile, empty-round) unmodified | Repo canary runner (headless, isolated scratch stack) | Green — proves no regression in parking/advancement/persistence |
| T6 | Visual spot-check | Survey page after save (desktop + 375px): answers visible, no overflow | `npm run capture:screenshot` against the canary scratch stack | Screenshots show filled answers, not a blank template |
| T7 | Manual end-to-end | Phase 1 repro script + one real browser pass: create → answer → save → reload → submit → next stage | Repro script + headless browser | File diff shows answers appended in place; task advanced |

Edge/error paths exercised explicitly: notes-only answers, untouched questions, hidden conditional questions, unknown question ids, invalid options, missing file, malformed JSON block, CRLF files, `outputFile` alias keys, double-click save.

## 8. Documentation plan

1. `site-docs/surveys.md`: add a short "Troubleshooting: answers not saving" section — where answers live (configured `outputFile`, default `SURVEY.md`), what each save error code means, and that Save parks while Submit advances. Only if the fix changes user-visible behaviour; otherwise troubleshooting-only.
2. Task record: append a brief note to this task folder recording the confirmed root-cause branch + evidence (Phase 2 output) so the next reader need not re-diagnose.
3. `CHANGELOG.md`: one entry under the current unreleased section describing the user-visible fix, iff the repo convention calls for it (check the file's head first).
4. No API reference changes unless the error contract changed; if it did, update `site-docs/api-reference.md` survey section to match the new codes.

## 9. Risks, non-goals, rollback

- Risks: (a) SURVEY.md answers arrive late and contradict defaults — mitigated by §4 defaults + re-running the affected Phase 2 branch; (b) data-specific bug (one corrupt SURVEY.md) — mitigated by requesting the failing file in Phase 1 step 8; (c) fix in the wrong layer — mitigated by the falsifiable branch order and the no-speculative-fix rule.
- Non-goals: survey generation quality, new wait/approval states, survey UI redesign, multi-file survey merging, migration of existing blank surveys (call out separately if wanted).
- Rollback: the fix is a small, additive-safe diff; rollback is `git revert` of the fix commit(s). Characterization tests from Phase 1 remain valid either way. No data migration, so no data rollback.

## 10. Open questions

1. SURVEY.md q1–q5 answers (currently `{}`) — proceed on §4 defaults; answers will confirm or redirect Phase 2.
2. `idea-20261104-015830.md` is referenced but missing from the task folder — re-supply or confirm it is not needed.
3. If q3 turns out to be "only one survey": attach that task's SURVEY.md so Phase 2 can test the exact failing data.

## Appendix — Root-cause candidates at a glance

Ordered by fit to "created fine, never filled in, blank template":

1. UI never rehydrates/persists selections across save (SurveyPage `refreshFrom`) — Branch A.
2. Answers written to a different file than the one read (GET/POST selector mismatch) — Branch B.
3. Whole-file validation rejects the save on pre-existing round defects — Branch C.
4. Fence splice throws on real-world markdown — Branch D.
5. Parse errors render as an empty form — Branch E.
