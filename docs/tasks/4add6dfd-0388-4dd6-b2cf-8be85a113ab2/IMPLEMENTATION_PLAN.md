# Implementation Plan — Bring all site docs up to date

- Task: `4add6dfd-0388-4dd6-b2cf-8be85a113ab2`
- Goal: a fundamental review and deep refresh of the unauthenticated in-app
  documentation (`site-docs/`) so every essential onboarding path is correct,
  detailed, beginner-friendly, and verified against the current product.
- Principle applied throughout: **make the change easy, then make the change.**
  Phase 0–2 finish research, audit, and structure before any page is rewritten.
- Survey decisions (`SURVEY.md`, Round 1) applied as standing constraints:
  - Full rewrite plus short screenshots/videos where they help.
  - Harness guides scope: **Muse**, **Pi**, **OpenCode** (survey-selected). Also
    audit/mention the other registered harnesses (`antigravity`, `custom`,
    `mock`, `vibe`, `codex`) at overview level so no runner is undocumented.
  - Target reader is a **total beginner**: explain terms, no assumptions.
  - “Up to date” means product-verified: install steps, screens, and buttons
    must be tried.
  - Custom-skills guide stays **simple + one worked example** (not a full
    reference), while the deep contract reference already lives in
    `prompts-tokens.md` and `api-reference.md`.
  - No further survey rounds are required.

## Why phase order matters

Documentation rots when it is written against guesses. The expensive mistakes
here are (1) documenting a step that no longer works, (2) duplicating a command
in five pages so one drift breaks all of them, and (3) deleting/renaming a page
and leaving a dangling `#/docs/<slug>` link that fails the integrity test.

Phases 0–2 make those mistakes impossible before the prose is written; phases
3–6 make the changes; phase 7 verifies them the way the survey demands.

## 0. Source of truth and audit scope

Read-only sources that establish “correct” versus “stale”:

1. `site-docs/README.md` — authoring rules and integrity rules.
2. `docs/EngineDetails/*.md` — harness depth and support tiers.
3. `api/agent/harnesses/README.md` — registered harness list and support tiers.
4. `runner/README.md`, `deploy/install.sh`, `deploy/install-runner.sh`,
   `scripts/install-local-runner.sh` — runner onboarding + dispatcher env.
5. `README.md` root is **owner-maintained and off-limits to edits** (only
   referenced, never rewritten).
6. `api/config/schema.js`, `KAINBAIN_*` env in `.env.example`, and
   `GET /status/config` — environment truth for `ports-env.md`.
7. `api/agentGuide.js` + `api/routes/*.js` — route contracts referenced by
   `api-reference.md`.
8. `skills/*/SKILL.md` and `KB_config.json` — skill authoring truth.
9. Existing site-docs (full inventory below).

### 0.1 Site-docs inventory (current state to audit)

How-it-works (`order`):

- `architecture` 10
- `pipeline-stages` 20
- `stage-liveness-and-stalls` 25
- `agent-execution` 30
- `transport-health` 40
- `prompts-tokens` 50
- `self-deploy` 60
- `activity-stream` 70
- `unified-logging` 75

Working-with (`order`):

- `install-run` 10
- `first-time-setup` 15
- `ports-env` 20
- `first-project` 30
- `task-images` 35
- `surveys` 36
- `submit-track-task` 40
- `task-dependencies` 45
- `review-gates` 50
- `retrospective-review` 55
- `keyboard-shortcuts` 60
- `git-index-lock-runbook` 65
- `editing-tasks` 68
- `faq` 70
- `red-shared-gate` 66 (note: duplicated-ish conflict of ordering already
  violating strict monotonic feel, though section-unique; revisit)
- `push-notifications` 75
- `alert-webhooks` 76
- `api-reference` 80
- `adr/*` (outside index: ADRs are served in `adr/` and documented by
  `adr/README.md`)

No existing **getting-started hub**, **add-a-new-runner**, **link-runner-to-harness**,
**existing-project adoption dedicated guide**, or **custom-skills** page in
`site-docs/`. Their content is scattered (first-time-setup, first-project,
first-project Adopt section, prompts-tokens, ports-env, FAQ).

### 0.2 Baseline gates to run first

```bash
npm run docs:check          # siteDocs, apiCoverage, agentGuide, envCoverage,
                            # link check, JSDoc check
npm run test:unit           # api + frontend
node scripts/check-duplicate-settings.mjs
```

Record baseline output in `docs/tasks/4add6dfd-0388-4dd6-b2cf-8be85a113ab2/docs-baseline.md`.
Anything already red must be fixed or explicitly recorded before rewrites
begin, so new work is not blamed for pre-existing failures.

## 1. Make the change easy — structure, ownership, and refactor passthrough

Goal: remove the conditions that make a 30-page rewrite error-prone: duplicated
commands, dangling links, inconsistent orders, and no clear “canonical”
destination for each topic.

### 1.1 Establish an information-architecture map

Create `docs/tasks/4add6dfd-0388-4dd6-b2cf-8be85a113ab2/ia-map.md` mapping:
each essential user question → one canonical page → supporting references.

Canonical targets (all new or confirmed):

| User question | Canonical slug | Section | Status |
| --- | --- | --- | --- |
| “How do I get started?” | `getting-started` | working-with | **new** |
| “How do I install/run KainBain?” | `install-run` | working-with | rewrite |
| “How do I add a new runner?” | `add-new-runner` | working-with | **new** |
| “How do I link a runner to Muse?” | `link-runner-muse` | working-with | **new** |
| “How do I link a runner to Pi?” | `link-runner-pi` | working-with | **new** |
| “How do I link a runner to OpenCode?” | `link-runner-opencode` | working-with | **new** |
| “How do I do my first project?” | `first-project` | working-with | rewrite |
| “How do I load an existing project?” | `existing-projects` (alias adoption) | working-with | **new** (canonically split out of first-project) |
| “How do I create a custom skill?” | `custom-skills` | working-with | **new** |
| “What do environment knobs do?” | `ports-env` | working-with | rewrite/verify |
| “How does KainBain work?” | `architecture`, `pipeline-stages`, … | how-it-works | audit |

`getting-started` becomes the single landing page with a numbered map. Every
other page may link into it but must not restate its ordered checklist.

### 1.2 Fix ordering discipline before adding pages

Working-with is currently near-monotonic but has insert gaps and one out-of-place
entries (`red-shared-gate` at 66 after `editing-tasks` 68 in ordering value).
Establish a pre-numbered reservation table for new and rewritten pages (fill
gaps of 10 globally within the section) and apply it in one pass:

Reserve working-with orders:

- `getting-started` → 5
- `install-run` → 10 (already)
- `first-time-setup` → 15 (already)
- `add-new-runner` → 12
- `link-runner-pi` → 13
- `link-runner-muse` → 14
- `link-runner-opencode` → 16
- `ports-env` → 20 (already)
- `existing-projects` → 28
- `first-project` → 30 (already)
- `task-images` → 35
- `surveys` → 36
- `task-dependencies` → 45
- `submit-track-task` → 40
- `review-gates` → 50
- `custom-skills` → 52
- `retrospective-review` → 55
- `keyboard-shortcuts` → 60
- `git-index-lock-runbook` → 65
- `red-shared-gate` → 66 (keep, move editing tasks to 67)
- `editing-tasks` → 67
- `faq` → 70
- `push-notifications` → 75
- `alert-webhooks` → 76
- `api-reference` → 80

Run `siteDocs.integrity.test.js` after the reservation pass (order uniqueness
per section).

### 1.3 Make repeated command surfaces explicit

Define one canonical home per repeated command set:
- install/dev/deploy commands → `install-run.md` (already the detail reference).
- env/process knobs → `ports-env.md` (already the pointer).
- `getting-started.md` may only **link** to those, with at most one
  copy-paste block in a quick-start box. Planner check: spot-check any repeated
  multi-line command block across pages and remove duplicates in favor of links.

### 1.4 Skills content source-of-truth

Keep `skills/*/SKILL.md` examples authoritative:
- `custom-skills.md` will use **one worked example** (taking one existing skill,
  e.g. `stage-report/SKILL.md` + its `KB_config.json`) and walk “idea →
  folder → frontmatter → config → import → attach direct/option → verify”.
- Do **not** copy the full skills/internal contract into site-docs (it already
  lives in `prompts-tokens.md`). The new page should be a landing ramp; deep
  details reference that article and `#/docs/api-reference`.

## 2. Make the change easy — verification harness and evidence capture

2.1 Create a verification scratch space
`docs/tasks/4add6dfd-0388-4dd6-b2cf-8be85a113ab2/verification/`
containing:
- `install-verify.md` (commands actually run, observed output)
- `screen-inventory.md` (which UI screens get screenshots: Settings › Harness,
  Settings › Runners, Project menu → Add Existing Project, Skills tab, stage
  drawer)
- `runner-registration-log.md` (mock runner registration run)
- stored screenshots (PNG) of any newly created button-level instructions.

2.2 Screenshot policy (surveys asked for “pictures where they help”):
- Capture with `npm run capture:screenshot` or the headless screenshot tool.
- Store under `site-docs/assets/`? Decision: keep screenshots out of the
  public docs tree until deployment path is confirmed; for v1 use them as
  evidence in verification and reference them with markdown image links only if
  the asset folder is added. Any media must have alt text, and no host
  identifiers/secrets.

2.3 Baseline server run will be performed in **phase 7** (verification), not
before. Phases 0–6 should rely on docs tests and code reading to avoid port
lifecycle fatigue. But writing install steps that have never been executed is
forbidden for the implementer; the plan’s execution stage must perform it.

## 3. Make the change easy — harness-guide evidence pack (before prose)

For each of Muse, Pi, OpenCode, gather facts in
`docs/tasks/4add6dfd-0388-4dd6-b2cf-8be85a113ab2/harness-facts/<name>.md`:
- binary name, `--version`, install command on this OS (`npm`? vendor
  installer?), fallback `~/.local/bin`, `~/.opencode/bin`.
- whether it is actually installed on the reference host and at what version.
- `GET /harnesses` probe result and `KAINBAIN_*_BIN` override name.
- minimum to get a runner/harness talking:
  - Pi is in-process SDK (no process, no runner link needed beyond project
    harness = `pi`).
  - Muse via `muse serve`/exec/MSP.
  - OpenCode requires reachable server URL (spawned per project or
    `OPENCODE_URL`).
- model discovery: `pi` catalogue, `agy models`, OpenCode provider list.
- runner advertisement: what model ids the runner reports for that harness, when
  present.
- known caveats: tier, theoretical max, testing runs on local box.

Decision: for total beginners, each harness guide must start with “What this
harness is in one sentence” and a “Do I need this?” call-out. Pi is the
default (`KAINBAIN_DEFAULT_HARNESS=pi`) and the recommended starting point; the
link-runner guide for Pi therefore also explains that, for a single box, no
separate runner is usually needed.

## 4. Make the change — content waves

All new files follow `site-docs/README.md` frontmatter (all four fields
required), `slug == filename`, no order collisions, `#/docs/<slug>`
cross-links. Never put secrets in these files.

### Wave A — Get started and install (biggest value first)

A1. Add `site-docs/getting-started.md` (order 5, working-with).

Structure (beginner-first):
1. “What is KainBain?” (two-sentence plain English + picture placeholder).
2. “Pick your starting point” links:
   - *I just want to try it* → first-time setup + mock harness.
   - *I have a repo* → existing-projects.
   - *I want to scale runs across machines* → add-new-runner.
3. “The five things you will do” numbered path:
   install/run → create or adopt project → shape stages → submit task → review
   and merge.
4. Glossary sidebar (runner, harness, project, task, stage, skill, model, alias)
   — short definitions with links to the deeper articles.
5. “Where to get help” (FAQ, troubleshooting).

Must not restate full install commands: link to `install-run.md` and
`first-time-setup.md`.

A2. Rewrite `first-time-setup.md` (order 15) for verification updates:
- keep ordered path but tighten all commands from phase 7.
- make **Cold start with nothing installed** explicit: mock harness opt-in,
  detection via `GET /harnesses`, badges in Settings.
- add a small table of “Which docs page to read next” at the end instead of
  long narrative.

A3. Rewrite `install-run.md` (order 10):
- single source for all commands; fix any found stale items.
- split “deploy” specifics out to `self-deploy.md` by link.
- keep Node/Python/runtime notes (“Node ≥ 20.19 (engines field)”, recent LTS
  allowed).
- add explicit “Quick verify” curl checks against `/status` and `/docs`.

A4. Rewrite `ports-env.md` (order 20):
- run the env coverage tests and current schema; regenerate groups.
- verify every `REQUIRED_OPERATIONAL_VARS` entry, and record any new variables
  removed added since baseline.
- keep the per-variable tables; add a “For beginners: change one thing safely”
  note about restarting after env edits.

### Wave B — projects (new and existing)

B1. Add `existing-projects.md` (order 28):
- adopt flow: UI **Project menu → “+ Add Existing Project…”** and
  `POST /projects/register`.
- idempotency, external roots (`~/.kainbain/projects.json`), `PROJECTS_ROOTS`.
- custom state folder (`.kainbain` vs `.kb`) full safety flow with rename
  instructions.
- “Nothing is moved or deleted” promise.
- link to `first-project.md` for shaping stages.

B2. Rewrite `first-project.md` (order 30):
- create project (`POST /projects`) and activate.
- shape pipeline (one agent + human review).
- Files & Repo tab.
- project settings tabs and search.
- adopt flow moves to `existing-projects.md`; keep only a one-line link.
- add “first successful run” walkthrough (submit one task, inspect stage
  report).

### Wave C — runner onboarding (new content)

C1. Add `add-new-runner.md` (order 12):
- what a runner is (out-of-process executor, only way agent stages run).
- two paths:
  - install-time: `--runners N` in installer.
  - afterwards: `scripts/install-local-runner.sh --id local-pi` +
    remote `--backend`.
  - full manual env list from runner README (join token, credential).
- approval flow with `POST /runners/:id/approve` and UI step-by-step.
- dispatch mode overview (`KAINBAIN_RUNNER_DISPATCH=1`) with a clear
  “optional, start simple” recommendation for beginners.
- health: System Settings › Runners screen, heartbeats, pause/resume/skip.
- rollback note (old Runner to backend compatibility).

C2. Add `link-runner-pi.md` (order 13):
- Pi is in-process SDK and the default harness; usually no runner link needed
  for one machine.
- To advertise Pi on a runner: install Node, set `KAINBAIN_RUNNER_HARNESS=pi`
  or auto-detect.
- Models from Pi catalogue; cache refresh instructions.
- Verify `GET /runners/models/catalogue` includes `pi::...`.

C3. Add `link-runner-muse.md` (order 14):
- install `muse`; `KAINBAIN_MUSE_BIN`, `KAINBAIN_MUSE_MSP`, `KAINBAIN_MUSE_YOLO`.
- model discovery over `muse serve` stdio, disclaimer about host-local login
  (keys stay on host).
- `KAINBAIN_RUNNER_MODELS` pin vs auto discovery; `KAINBAIN_RUNNER_MODEL_DISCOVERY_INTERVAL_MS`.
- approval and MSP details.

C4. Add `link-runner-opencode.md` (order 16):
- install `opencode`; server URL (`OPENCODE_URL` or per-project spawned server).
- model discovery from server provider list; empty-state honesty.
- environment, auth keys, and troubleshooting (missing server, empty catalogue).

C5. Harnesses not covered by a “link runner” guide must still be introduced
in `add-new-runner.md` or a new small `harnesses-overview` page:
- `antigravity`, `custom`, `mock`, `vibe`, `codex` and their support tiers.
- Link to `docs/EngineDetails/HarnessSupportLevels.md` only for engineer depth;
  beginner explanation stays on site-docs.

### Wave D — custom skills guide (simple + one worked example)

D1. Add `custom-skills.md` (order 52):
- “What a skill is” (small markdown package) + one sentence on lean context.
- “When to use”.
- Worked example end-to-end:
  1. Create `hello-reviewer/SKILL.md` with frontmatter.
  2. Add `KB_config.json` with `mode: direct`.
  3. Import via **Settings › Skills** (or drop into overlay).
  4. Attach in stage Skills panel as `direct`, then `option`.
  5. Run and verify prompt injection.
- Common mistakes list (slug rule, name clash 409, global skill shadowing
  warning, extension requirement).
- Link to `prompts-tokens.md` and `api-reference.md` for full contract;
  `skills/question-me` is the canonical parent for survey skills.

D2. Update `prompts-tokens.md` (verify only) to link to `custom-skills.md`
as the “walkthrough” companion, and ensure its contract statements still hold.

### Wave E — audit all other existing articles

Audit each existing page against live sources; apply minimal necessary rewrites,
not gratuitous. Audit matrix:

- `architecture.md` — run through central queue and dual halves; verify no stale
  `.home` assumptions.
- `pipeline-stages.md` — stage kinds + `runnerPolicy` and 200-stage cap; update
  cross-links.
- `stage-liveness-and-stalls.md` — timing notes and status expectations.
- `agent-execution.md` — harness reliability, alias and monitor widgets; verify
  wording of per-runner screen location.
- `transport-health.md` — health endpoints; verify.
- `prompts-tokens.md` — done in D2.
- `self-deploy.md` — deploy.sh and publish.sh details; verify.
- `activity-stream.md` and `unified-logging.md` — filenames filter/
  endpoints; verify.
- `submit-track-task.md`, `task-dependencies.md`, `task-images.md`,
  `editing-tasks.md` — API/UI changes; verify.
- `review-gates.md`, `retrospective-review.md` — review sidecar anchors and
  chat details; verify.
- `surveys.md` — survey machine format; verify against `question-me` skill.
- `push-notifications.md`, `alert-webhooks.md` — verify.
- `keyboard-shortcuts.md` — key `4`/`O`, `5` docs etc; verify.
- `git-index-lock-runbook.md`, `red-shared-gate.md` — operational runs still
  accurate.
- `api-reference.md` — generated by `docs.apiCoverage.test.js` (keep as
  contract source); refresh prose only; never break path coverage.
- `adr/README.md` — index/links.
- `faq.md` — trim outdated + add new common issues.

Rule for audit: if a page has no user-facing drift, still run the check, record
“audited, no changes” in the verification report with the evidence list used.

### Publication and link discipline

- Add/update necessary `#/docs/<slug>` links as pages are renamed or added.
- Remove/merge stale pages only with a one-line “Formerly in `<slug>`”
  provenance note in the canonical target (already repo convention).
- Run `scripts/check-doc-links.mjs` on every PR/wave.
- Do not rename existing slugs unless their target changes shape drastically;
  prefer new canonical pages + legacy one-line stubs? But site-docs rules say
  “No stubs”. Therefore if a page is retired, delete it and migrate all links
  + add provenance notes where content landed.

## 5. Cross-surface consistency (not just site-docs)

The same getting-started text is mirrored elsewhere; update the derived surfaces
so they stay mutually consistent but without editing README:

- `agents.md` / `AGENTS-MAP.md` onboarding references (allowed to edit; agent
  docs).
- `frontend` help strings, if any, that name docs slugs.
- `docs/EngineDetails/HarnessSupportLevels.md` stays engine depth; site-docs
  must only summarize.
- In-app `system-settings` references to Runners: ensure button labels mentioned
  in site-docs match actual labels by clicking in the app.

No change to API response shapes. Docs-only.

## 6. Testing & verification plan (matching survey: verify by trying)

Required gates:

```bash
npm run docs:check
npm run test:unit
npm run check:duplicate-settings
```

Manual verification (must produce evidence files in verification/):

1. **Fresh product install/run**: follow `getting-started.md` from empty state or
   a throwaway clone. Run `npm run setup`, `npm run dev`, hit
   `http://localhost:3100/status`, `http://localhost:3100/docs`, open frontend
   dev server, docs tab (keyboard `5`). Screenshot.
2. **Docs integrity render**: each new slug resolves via `GET /docs/:slug`;
   links tested; check unique orders.
3. **Existing project adoption**: run on a temp repo; `POST /projects/register`;
   verify `~/.kainbain/projects.json` or temp `KAINBAIN_*`; restart and
   confirm rediscovery.
4. **Runner add path**: mock runner CLI/headless flow:
   - set `KAINBAIN_RUNNER_JOIN_TOKEN`, start `node runner/main.js` with mock
     harness; approve through Settings or `POST /runners/:id/approve`;
   - verify heartbeat and Settings › Runners screen.
   - dispatch-mode optional trial with `KAINBAIN_RUNNER_DISPATCH=1` and a temp
     project; capture screens.
5. **Harness-link guides**: on the reference host for Muse/Pi/OpenCode:
   - verify binaries versions and model discovery commands;
   - configure one project per harness and run `GET /harnesses` (+ models);
   - screenshot Settings model pickers.
6. **Custom skills worked example**: create temp skill, import via
   `POST /projects/:id/skills/import`, attach to a stage, dispatch a preview task;
   confirm the body lands in the curated prompt (`POST /tasks/preview`).
7. **Cross-link and path checks**: run `scripts/check-doc-links.mjs` after final
   wave.
8. **Screenshot refresh**: run `npm run capture:screenshot` where helpful; store
   with alt text and stable filenames.

Acceptance criteria (all must be true for the feature task to pass):
- `docs:check` green on final state.
- Every essential target has a canonical, non-stub site-docs page.
- All `#/docs/<slug>` links resolve (integrity test green).
- No two articles share an `order` within a section.
- Each install/instruction paragraph’s commands were executed (evidence file).
- Custom skills guide has exactly one full worked example as surveyed.
- Runner guides cover Muse, Pi, OpenCode separately, plus overview notes for
   the other harnesses.
- `npm run test:unit` green.

## 7. Rollout and cleanup

- Land the changes in waves as separate commits, starting with structural
  changes (phase 1 ordering + ia-map). The point of “make it easy” is that each
  wave can be reviewed in isolation.
- After the last wave, re-run all gates and attach the verification evidence
  directory (or a summary) as task report.
- Do not leave TODO placeholders or “coming soon” sections in the published
  pages. If a section cannot be verified, park the page with a clearly labeled
  known-limitation and add a follow-up task rather than shipping a guess.
- Add a one-line changelog entry? Docs-only tasks need not touch CHANGELOG
  unless the operator asks; if added, use `docs:` prefix. README remains
  untouched.

## 8. Risk register and mitigations

- **Docs site caches or builds**: frontmatter changes are live at request time;
  there is no build needed. Still run `GET /docs` after changes.
- **Order collision**: handled by reservation table + integrity test.
- **Link drift**: handled by `check-doc-links.mjs` and integrity test.
- **Credential leakage in docs**: review all new docs for `KAINBAIN_RUNNER_*`
  example values; use placeholder tokens `<one-time credential>` only.
- **Host-specific paths**: do not hardcode `/home/server/...`; use `${USER}` /
  `~` examples.
- **Image assets**: confirm relative links resolve in frontend before committing
  images; test with MarkdownViewer parser rules (tables with leading/trailing
  pipes, no raw HTML).

## 9. Definition of done

The task is complete when:
1. the pages in section 4 exist and pass gates in section 6.
2. Essential targets in the task are all canonical, readable, beginner-friendly.
3. Verification evidence is present, not assumed.
4. This plan stays on the current git branch and only site-docs (plus permitted
   agent docs) changes.
```

Wait ordering I need ensure integrity test order uniqueness. In section 1.2 I set `submit-track-task` 40, `task-dependencies` 45 (original 45), okay. But `red-shared-gate` 66 and `editing-tasks` 67 leads `git-index-lock-runbook` 65, `editing-tasks` 67, `faq` 70. Fine. But earlier original `editing-tasks` 68; adjust. Unique values all unique? list: 5,10,12,13,14,15,16,20,28,30,35,36,40,45,50,52,55,60,65,66,67,70,75,76,80. yes. Existing `task-images` 35, surveys 36, task-dependencies 45, submit-track-task 40 okay. `red-shared-gate` 66, push 75, alert 76. Good.

Could be okay. Now final answer should summary + verdict. Ensure no fence around verdict. Let's final.