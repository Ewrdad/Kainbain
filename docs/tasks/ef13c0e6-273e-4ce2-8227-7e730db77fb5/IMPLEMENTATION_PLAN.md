# Implementation Plan: Image (UI-example) questions for the question-me skill

Task folder: `docs/tasks/ef13c0e6-273e-4ce2-8227-7e730db77fb5/`
Source request: give the question-me skill an image-question option — agent proposes up to 4 detailed UI/logo
descriptions, the survey renders them as generated example images, the human picks one, and the chosen image is
saved in the task folder and referenced from SURVEY.md (or equivalent). API key lives in general settings;
skill config gets an image-gen dropdown (`none` removes the image-gen section entirely, otherwise select a
provider). First provider: Muse/Meta image generation, designed for later extension. Key stays server-side.
Plan scope: planning only — no code is changed in this stage.

## Goal & scope guard

- A new survey question type for image choice. The agent writes up to 4 detailed descriptions; the **backend**
  generates the images (gateway model — runners/agents never see the key), stores them in the task folder
  `assets/` directory, and the survey UI renders them as a single-pick image question with a descriptions
  fallback when generation is unavailable or fails.
- General (system) settings gains a persisted per-provider API-key store with a new Settings UI section.
- The question-me skill config gains an `imageGen` keyword (`none` | provider id) rendered as a dropdown in
  the workflow editor's Skills panel; `none` removes the image-gen section from the agent prompt entirely.
- Non-goals for this slice: more than one real provider (Muse Image only, behind a registry built for more);
  per-project keys (shared key only, per q2 default); multiple sizes (one fixed size, per q6 default);
  video/edit/reference-composition features of Muse Image; changing existing `single`/`multiple` behaviour
  (byte-identical when `imageGen: none`, which is the default).

## Inputs and survey position

- Grill survey (`SURVEY.md`) is present but `answers` is `{}` — Round 1 (q1–q7) is **unanswered**. Every survey
  answer below is a provisional default (the options marked Recommended, or the task text where it decides),
  not a user decision. Re-confirm q1 (provider identity) before locking Phase B.
- The prior report named in the stage brief (`idea-20261102-005723.md`) is **not present** in this checkout;
  only `SURVEY.md` exists in the task folder, so no prior findings could be reused beyond the survey itself.

### Survey factored in — provisional defaults (reversible)

| # | Survey question | Provisional decision | Rationale & how it shapes the plan |
|---|-----------------|----------------------|-------------------------------------|
| q1 | Which image service first (Muse/Meta)? | **Muse Image (`muse-image-1.0`) via the Meta Model API** (`https://api.meta.ai/v1`), API-key auth | Matches the task text ("muse/meta image gen interface"); verified to exist as a developer API in Aug 2026 (see Sources). Exact request schema is pinned in Phase 0 spike; a provider interface + mock provider means no other work blocks on it. If the user names a different service, only the provider adapter changes. |
| q2 | Where is the image key saved? | **One shared key in general settings** | The Recommended option and the task text agree. Implemented as a new persisted system-level secret store (none exists today — see finding 5) with an env override. |
| q3 | How do image choices work? | **Up to 4 pictures, pick one favourite** | The Recommended option. New question `type: "image"` behaves like `single` (one selection) with image cards instead of radio rows. |
| q4 | When are pictures created? | **Most reliable: eagerly at park time, in the background** | The Recommended option ("no preference — most reliable") plus the task's reliability steer. Backend starts generation when the task parks for survey; images are ready (or failed-with-fallback) before the human opens the page. Survey GET reports per-image status so the UI can show progress if generation is still running. |
| q5 | Pictures cannot be made? | **Show the written descriptions instead** | The Recommended option. Descriptions are always in the round JSON (the agent writes them), so fallback is free: render option text + a notice, never block answering. |
| q6 | Picture shapes in v1? | **One fixed size** | The Recommended option. One configured size (square-ish default TBD in Phase 0) for all image questions; no per-question size field in v1. |
| q7 | How many picture questions per survey? | **Several allowed, each up to 4 pictures** | The Recommended option, with a cost guard: a per-survey image cap (default 12 = 3 full questions) enforced by the backend; questions beyond the cap render descriptions-only with a notice. |

## Research findings (verified in this checkout — big pieces first)

1. **Survey model — `shared/survey.js` (~500+ lines; verified).** Single source of truth shared by backend and
   frontend: `QUESTION_TYPES = ["single", "multiple"]`, `normalizeQuestion`, `validateSurvey`, `serializeRound`,
   `applyAnswers`, `unansweredRequired`, `surveyStatus`. Any new question type must extend normalize + validate +
   serialize together or rounds will fail validation on write (`appendSurveyRound` / `saveSurveyAnswers` reject
   invalid rounds and leave the file untouched). `options` are plain strings; answers are `{ selected: string[],
   notes: string }` subsets of options.
2. **Survey backend — `api/work/taskSurvey.js` (verified) + routes in `api/work/taskWorkRoutes.js`.**
   `readSurvey` / `appendSurveyRound` / `saveSurveyAnswers` / `spliceRoundsIntoMarkdown` (byte-preserving answer
   merge) are the established patterns; `GET /tasks/:id/survey` returns `{ surveyFile, exists, status, rounds,
   errors, ... }` and `POST` merges answers only. The question-me gate is `resolveSurveyGate` + `readSurvey`,
   invoked from `api/flow/execution/parkTaskForSurvey.js` (verified, sync function used by both embedded and
   Runner-report finish paths). Generation must therefore be fire-and-forget-at-park or lazy-on-GET — it cannot
   be synchronous inside the park call.
3. **Task image storage + serving already exists — `api/routes/taskImages.js` + `api/work/taskAssets.js`
   (verified).** Images live in `<cwd>/docs/tasks/<taskId>/assets/`, referenced relatively
   (`![alt](assets/<name>)`); helpers cover allowlist (`png/jpg/jpeg/gif/webp`), `sanitizeImageName`,
   `dedupeImageName`, `writeTaskImage`, `listTaskImages`; serving is binary-safe with immutable cache headers
   at `GET /projects/:id/tasks/:taskId/images/:name`. Generated survey images reuse all of this — no new
   storage or serving layer needed.
4. **Skill config pipeline (verified end-to-end).** `skills/question-me/KB_config.json` declares
   `keywords.{outputFile,minQuestions}` (+ `context`, `defaults.mode`); per-stage overrides live in
   `stage.skills[i].config` and layer over defaults in `resolveSkillKeywordMap` (`api/skills/skillInjection.js`);
   substitution is dumb `{{key}}` replacement (`applySkillKeywords`) — **there is no conditional-section
   mechanism**, so "none removes the section entirely" needs a new seam (Phase A1). The workflow editor edits
   per-stage keyword values in `frontend/src/components/workflow/StageSkillsPanel.jsx` (~1020 lines): kbRef
   keywords render as cascading dropdowns (precedent for metadata-driven dropdowns), everything else is
   free-text/JSON — so a metadata-driven provider dropdown follows an existing pattern (Phase A2).
5. **No persisted system-level secret store exists (verified by grep).** System Settings
   (`frontend/src/components/settings/SystemSettingsContent.jsx` + `settingsTabs.js`) has persisted tabs
   (Storage/Notifications/Prompt Layout via their own endpoints) and wireframe tabs (Models/Engine: "changes
   here are not saved yet"). Global config is env-driven and **read-only** (`api/config/schema.js`, served
   redacted via `GET /status/config` with `secret: true` flags). Per-project settings persist through the
   project store (`PATCH /projects/:id`). So "save an API key in general settings" requires a **new**
   system-secret store + endpoints + UI section — this is the biggest new-backend piece (Phase A3).
6. **Survey UI — `frontend/src/components/tasks/SurveyPage.jsx` (577 lines; verified).** Renders rounds via a
   `QuestionField` component (radio/checkbox + Notes), `showIf` visibility via shared helpers, Save vs
   Submit-and-advance, `Save answers`/`Submit & continue`/`Continue without questions` buttons. Image questions
   slot in as a new `QuestionField` variant (image cards + radio semantics + Notes). Existing tests:
   `SurveyPage.test.jsx`, `SurveyBanner.test.jsx`; canary `canary-e2e/tests/survey-verify.spec.js`.
7. **Runner trust boundary.** Runners authenticate with join tokens / per-runner credentials (see
   `KAINBAIN_RUNNER_JOIN_TOKEN` in `api/config/schema.js`) and operate on task docs; the task explicitly says
   the key must stay in the backend. Decision: **backend gateway** — the runner/agent only writes descriptions
   into SURVEY.md like any other question text; all provider calls happen server-side. This is also the easiest
   option: no runner protocol change, no credential distribution, works for embedded runs identically.
8. **Provider grounding.** Muse Image is Meta Superintelligence Labs' image model, served to developers as
   `muse-image-1.0` on the Meta Model API (`https://api.meta.ai/v1`, API-key auth, ~$0.01/image announced) and
   alternatively via fal.ai (`meta/muse-image/text-to-image`). Exact REST schema/auth headers must be verified
   against Meta's developer docs in the Phase 0 spike (docs move fast; discovery snippets are not a schema).

## Approach — make change easy, then make the change

> Workers before jobs: first create the seams (conditional skill sections, metadata-driven keyword dropdowns,
> provider registry + mock, persisted key store, survey-model image support), each shippable and tested on its
> own with zero behaviour change; then wire the feature through them. Research and the riskiest backend piece
> (secret store + provider contract) come first so later UI work cannot discover a structural blocker.

Key decisions:

- **Backend gateway, not runner generation.** Easiest (no runner protocol/credential work) and most reliable
  (one code path for embedded + Runner runs; key never leaves the server; retries/timeouts centralised).
- **Eager background generation at park time.** `parkTaskForSurvey` parks synchronously as today, then
  fire-and-forget `ensureSurveyImages()` generates missing images, writes them via `taskAssets` helpers, and
  splices `images[]` status into the round JSON. Survey GET surfaces per-image `ready/pending/failed` so the
  UI can poll or fall back. Rejected alternative: lazy generation on first survey GET — simpler code, but the
  human waits on image latency and refresh races are harder; rejected alternative 2: synchronous at park —
  blocks stage finish on provider latency and risks timeouts.
- **Descriptions are the durable contract; images are derived artifacts.** The agent writes
  `type: "image"` + ≤4 description `options`; the backend fills `images[]`; answers stay `{ selected, notes }`
  selecting by description string, so every existing validation/completion path keeps working and q5 fallback
  is automatic.
- **Chosen image persistence:** on successful submit/advance, the backend copies the selected image to a stable
  name (`assets/survey-r<round>-<qid>-chosen.png`) and appends a `## Chosen designs` markdown section to the
  survey file with `![...](assets/...)` references — satisfying "saved as an image in the task folder with a
  reference in SURVEY.md or equivalent" without disturbing the append-only round JSON.

## Step-by-step workflow (ordered: big/research early)

### Phase 0 — Research spike & contract freeze (blocks everything; no prod code)

1. Verify the Muse Image developer API against Meta's current docs (endpoint, auth header, text-to-image
   schema, sizes, response bytes/URL, rate limits, pricing). Record the exact pinned contract + doc URL in
   this file's Sources section. If the Meta Model API is unreachable from the test environment, record fal.ai
   as the verified fallback path (do not implement it in this slice).
2. Freeze the round-JSON contract for image questions (proposed; confirm or amend here before Phase A):
   `{ id, type: "image", text, options: [≤4 description strings], required, showIf,
   images: [{ option: <index>, file: "assets/<name>", status: "pending|ready|failed", error?: string }] }`.
   Agent writes everything except `images`; backend owns `images`.
3. Freeze the `imageGen` keyword contract: KB_config default `"none"`; stage override `"none"` or a provider
   id from the registry (`"muse"` in v1); unknown values fail safe to `none` + process-log warning.
4. Freeze the conditional-section syntax for SKILL.md (proposal: `{{#if imageGen}} … {{/if}}` blocks evaluated
   against the layered keyword map, where `"none"`/`""`/missing is falsy). Confirm it composes with the
   existing unknown-`{{...}}`-preserved guarantee.
5. Re-confirm q1 (Muse Image vs another service) and the per-survey image cap with the user if reachable;
   otherwise proceed on the provisional defaults above.
6. Exit: contract written here; spike code (if any) thrown away or kept only as the mock provider fixture.

### Phase A — Make the change easy (seams; each independently testable, no behaviour change)

- **A1. Conditional skill sections.** Extend `api/skills/skillInjection.js` with the Phase-0 conditional syntax
  (render/omit blocks from the layered keyword map), keeping byte-identical output for skills without
  conditionals (guarded by the existing `promptCuration.skills.contract` tests). Unit tests: truthy/falsy/
  missing/`none` keyword, nested unknowns preserved, size-cap accounting unchanged.
- **A2. Metadata-driven keyword dropdowns.** Extend `StageSkillsPanel.jsx` so a KB_config keyword entry with
  UI metadata renders a `<select>` instead of free text. Proposed metadata:
  `{ "value": "none", "description": "…", "ui": "provider-select", "providerApi": "/api/image-gen/providers" }`,
  options fetched from the backend registry (id + label), with static `enum: [...]` as the offline fallback.
  Unit tests with a mock client; existing free-text/JSON paths untouched.
- **A3. Provider registry + key store (biggest backend piece).** New `api/imageGen/` module:
  - `providers.js`: registry interface `{ id, label, generate({prompt, size}) -> Buffer, configured() }`,
    with `mock` (deterministic fixture PNG, no network) and `muse` (Phase-0 contract) adapters.
  - `keyStore.js`: per-provider keys in a `0600` JSON file under the KainBain dir (`api/kainbainDir.js`
    pattern), env override `KAINBAIN_IMAGE_GEN_<PROVIDER>_API_KEY`, keys never logged/returned
    (follow `shared/redactSecrets.js` + `secret: true` schema conventions).
  - Routes: `GET /api/image-gen/providers` (id/label/configured only — never keys), `PUT`/`DELETE`
    `/api/image-gen/providers/:id/key`. Unit + route tests incl. redaction, traversal-safe ids, 0600 perms.
- **A4. Survey-model image support.** Extend `shared/survey.js`: accept `type: "image"` in
  `normalizeQuestion`/`validateSurvey`/`serializeRound` (options ≤4, non-empty; `images[]` optional,
  backend-owned, validated when present); single-pick answer semantics identical to `single` (reuse
  `unansweredRequired`/`applyAnswers` unchanged). Shared tests incl. fixtures for pending/failed/ready.
- **A5. Round-image splice helper.** Add `updateSurveyImages()` to `api/work/taskSurvey.js` following the
  `saveSurveyAnswers` pattern (parse → merge `images[]` only → validate → `spliceRoundsIntoMarkdown` →
  atomic write; rejects leave the file untouched). Unit tests incl. concurrent-edit conflicts.

### Phase B — Make the change (wire the feature)

- **B1. Skill config + prompt.** Add the `imageGen` keyword to `skills/question-me/KB_config.json`
  (default `none`, provider-select UI metadata) and an `{{#if imageGen}}` section to `skills/question-me/SKILL.md`
  documenting the image-question format (type/options ≤4/descriptions guidance: "detailed enough to render a
  UI mock or logo"). Verify prompt output with `imageGen: none` is byte-identical to today.
- **B2. Settings UI.** New System Settings tab `Images` (`settingsTabs.js` + new `ImageGenSection.jsx`,
  persist-immediately pattern like Prompt Layout): per-provider rows showing configured/not-configured,
  key save (password input) / clear, and a "test" button that runs the mock-or-real generation dry-run.
  Unit tests with mock client.
- **B3. Generation job at park.** In the park path (`parkTaskForSurvey.js` callers), after a successful park,
  fire-and-forget `ensureSurveyImages({ cwd, project, taskId, surveyFile, stage })`: resolve provider from the
  stage's `imageGen` config (default `none` → no-op); skip when provider unconfigured (leave `pending`→`failed`
  with `no-key` so the UI falls back to descriptions per q5); enforce per-survey cap; generate via registry
  with timeout + 1 retry; write PNGs with `writeTaskImage` (sanitized `survey-r<round>-<qid>-<i>.png` names);
  splice `images[]` via A5; log to the process log. Unit + integration tests with the mock provider
  (no network), incl. Runner-report finish path parity.
- **B4. Survey UI.** `SurveyPage.jsx` `QuestionField` variant for `type: "image"`: image cards (served from
  the existing task-images endpoint) with single-select radio semantics + Notes; states for pending
  (skeleton + "generating…", lightweight poll of GET survey), failed/missing (description options + notice
  per q5), and empty-provider (`imageGen: none` but agent wrote image questions → descriptions with a hint).
  Reuse shared `isQuestionVisible`/`selectedValues` so `showIf` keeps working. Component tests + headless
  screenshot of each state.
- **B5. Chosen-image persistence.** On submit/advance with image answers, copy the selected file to
  `assets/survey-r<round>-<qid>-chosen.png` and append the `## Chosen designs` reference section to the
  survey file (markdown only — round JSON untouched). Route tests: chosen file exists, reference resolves,
  idempotent re-submit, multi-file surveys (`outputFile` variants) each get their own section.

### Phase C — Assurance, docs, hardening

- **C1. Validation gate.** Full `npm run test:unit` (api + frontend) green; `npm run lint`; docs checks
  (`npm run docs:check` — JSDoc examples, doc links); one-function-per-file and duplicate-settings guards if
  touched. No narrowing of existing suites; new tests live next to the code they cover.
- **C2. Visual verification (headless only).** `npm run capture:screenshot` for: image question ready state,
  pending/generating state, failed→descriptions fallback, and the Images settings tab. No long-lived servers
  (per stage guidance — isolated headless runners / mock fixtures only).
- **C3. Docs.** Update `site-docs/surveys.md` (image question type + fallback), `site-docs/api-reference.md`
  (new endpoints), `skills/question-me/SKILL.md` (already in B1), `.env.example` (new env override +
  comment), and `docs/manual-testing/*` if a survey walkthrough exists. Add an ADR only if a Phase-0/B
  decision materially diverges from this plan.
- **C4. Cost/abuse hardening.** Confirm per-survey cap + per-image timeout + no retry storms; log provider
  errors without keys/prompts PII beyond descriptions; canary: extend `survey-verify.spec.js` with an
  image-question round using the mock provider.

## Validation plan (maps to phases)

| Phase | Check | Expected evidence |
|-------|-------|-------------------|
| 0 | Provider contract pinned | Doc URL + schema recorded; mock fixture matches it |
| A1 | `npm run test:api -- skills` | Conditional-section unit tests pass; contract tests byte-identical |
| A2 | `npm run test:frontend -- StageSkillsPanel` | Dropdown renders from registry; free-text paths unchanged |
| A3 | `npm run test:api -- imageGen` + route tests | CRUD key round-trip; keys never in responses/logs; 0600 file |
| A4–A5 | `npm run test:api -- survey` + shared tests | Image rounds validate/splice; invalid input leaves file untouched |
| B1 | Prompt snapshot test | `none` output byte-identical; provider output includes section |
| B2 | `npm run test:frontend -- ImageGenSection` | Save/clear/test flows with mock client |
| B3 | Integration test (mock provider) | Park → assets written → `images[] ready`; no-key → failed + fallback |
| B4 | Component tests + `capture:screenshot` | Ready/pending/failed/none states render; a11y labels present |
| B5 | Route tests | Chosen file + markdown ref; idempotent; per-file surveys isolated |
| C | `npm run test:unit`, `lint`, `docs:check` | All green, no suite narrowing |

Highest-risk validation: **B3 with the real Muse adapter** (network, auth, bytes) — run once manually with a
real key in a scratch task, then rely on the mock for CI; if the live call fails, the contract in Phase 0 was
wrong and only the adapter (not the plumbing) changes.

## Risks / open questions

- **q1 unanswered + provider docs drift.** Mitigated by the Phase-0 spike and the mock-first registry: every
  phase except the Muse adapter is provider-agnostic. If the user names a different service, cost is one new
  adapter (~1 file) + Phase-0 re-verification.
- **New secret store is new attack surface.** Mitigated by 0600 file perms, env override, redaction
  conventions, and never returning keys from any endpoint (configured-boolean only). No encryption-at-rest in
  v1 (same posture as other local secrets — record if this needs revisiting).
- **Image latency at park.** Mitigated by fire-and-forget + per-image timeout + UI polling/fallback; the park
  itself never waits on the provider.
- **Cost.** Muse Image ~$0.01/image announced; worst case 12 images/survey ≈ $0.12. Per-survey cap + no
  regeneration of `ready` images bound this. No budget UI in v1.
- **Scope creep (sizes, multi-pick, per-project keys, more providers).** Explicitly out of scope; the
  registry + keyword metadata are the extension points, documented as follow-ups, not built now.

## Sources

- [Introducing Muse Image and Muse Video (ai.meta.com)](https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/)
  — inspected 2026-11-02: confirms Muse Image as Meta Superintelligence Labs' image model with developer
  availability. Exact REST schema to be pinned from Meta's developer docs in Phase 0 (not in this post).
- Meta Model API base URL (`https://api.meta.ai/v1`), model id (`muse-image-1.0`), fal.ai availability and
  $0.01/image pricing appear only in discovery snippets so far — **unverified**, must be confirmed against
  primary docs in Phase 0 before the adapter is written.
