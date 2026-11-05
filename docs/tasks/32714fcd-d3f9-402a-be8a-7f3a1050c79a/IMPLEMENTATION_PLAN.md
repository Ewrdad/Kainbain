# Implementation Plan — Fix the first-time install experience

## Goal

Make a fresh KainBain install work end to end for a new user with no prior
knowledge: the local runner is autodetected and configured, projects can be
loaded and created (including the git-remote requirement being satisfiable
from the UI), the projects directory is populated or explained instead of
sitting empty, and a failed install can be cleanly uninstalled. Overall, the
new-user onboarding path is refined from "install" to "first task running".

## Success Criteria

- A new user following only the documented install path ends with: stack
  healthy, one local runner connected and approved without manual credential
  pasting, and one working project (created or adopted) visible in the UI.
- Project creation from the UI never dead-ends on the D11 git-remote rule:
  the remote is either enterable in the dialog, auto-satisfied by a
  configured default, or the dialog explains the local-only alternative.
- Existing projects on disk are discoverable after install (no silently
  empty projects directory).
- `deploy/uninstall.sh` (or the agreed equivalent) removes everything
  `deploy/install.sh` created, with `--dry-run` and a state-preserving
  default; documented in the install docs.
- `npm run test:unit`, `npm run lint`, `npm run docs:check`, and the
  `deploy/*.test.sh` shells stay green.

## Background and evidence

All findings below were verified by reading the code in this checkout. Big
and research-heavy pieces are ordered first in the Steps.

- Install path (verified): `deploy/install.sh` installs a Docker stack
  (backend + frontend prebuilt images) plus native local runner(s) via
  `startRunner.sh`. `scripts/install-local-runner.sh` is the dev-host
  equivalent. Both auto-detect harness CLIs on `PATH`
  (`pi`, `muse`, `agy`/`antigravity`, `vibe`).
- Runner approval friction (verified): after install the user must approve
  the runner in Settings > Harness > Runners
  (`POST /runners/:id/approve`, `api/flow/runnerRoutes.js:333`) and paste
  the credential into the runner env file by hand
  (`deploy/install.sh:238`, `scripts/install-local-runner.sh:19-22`). The
  "not autodetected and configured" complaint maps to this manual
  approve-and-paste loop plus the join-token bootstrap (`--join-token` /
  `~/.kainbain/runner-join.token`).
- Project creation dead-end (verified root cause): the "Create New Project"
  modal in `frontend/src/components/layout/Header.jsx:665-714` collects
  only a project name, but the backend enforces D11 — new projects require
  a fetchable git remote (`gitUrl` or `KAINBAIN_GIT_REMOTE_TEMPLATE`,
  `api/projectStore.js:746-758`, contract in
  `api/projectStore.remoteRequired.test.js`). A remote *is* editable later
  (`ProjectSettingsForm.jsx:84`, `gitRepo` state → `gitUrl`), but it cannot
  be entered at creation time, so creation fails on a fresh install with no
  template configured. Adoption (`POST /projects/register`) stays
  remote-free by design (D11b).
- Empty projects directory (verified): install maps
  `<install>/projects` (fresh, empty) to the backend's project root;
  discovery/adoption of pre-existing repos is documented only in
  `site-docs/first-time-setup.md:90-100` ("+ Add Existing Project…",
  `PROJECTS_ROOT`/`PROJECTS_ROOTS`). Nothing in the install flow points
  the backend at the user's real repos or seeds a starter project, so the
  board is empty with no next action.
- No uninstall (verified): a repo-wide search for "uninstall" matches
  nothing in `deploy/`, `scripts/`, or docs. `deploy/` has
  `install.sh`, `update.sh`, `redeploy.sh`, `install-runner.sh` and their
  `*.test.sh` shells, but no inverse. Re-running install is safe
  (never overwrites without `--force`), but there is no recovery path for
  a botched install.
- Survey/idea inputs (evidence gap): the stage brief cites
  `docs/tasks/32714fcd-d3f9-402a-be8a-7f3a1050c79a/SURVEY.md` and
  `idea-20261104-173921.md`, but that task directory did not exist in this
  checkout (verified: `ls docs/tasks/` has no such entry; branch
  `kb/32714fcd-d3f9-402a-be8a-7f3a1050c79a` is checked out). This plan
  therefore proceeds from the task text plus the code evidence above. If
  the survey appears later, Step 1 reconciles it and the D11/UX decisions
  below are the contained rework surface.

## Approach

"Make change easy, then make the change", biggest/risky pieces first:

1. Research spikes first (Steps 1-2): reproduce the fresh-install journey
   end to end in a sandbox, and decide the D11 UX policy (remote field vs
   local-first creation). These are the two decisions every later step
   depends on.
2. Make change easy (Steps 3-4): extract shared, unit-tested resolvers for
   runner bootstrap state and project-creation readiness so the UI can
   render honest next actions; add install/uninstall test harness.
3. Make the change (Steps 5-9): runner auto-configure, creation dialog
   remote support, projects discovery/seed, uninstall, onboarding UI
   polish — each independently verifiable.
4. Assure it (Step 10 + Validation Plan): unit/integration gates, shell
   tests, headless screenshots, docs.

## Steps

### Step 1 — Research spike: reproduce the fresh-install journey (first, biggest unknown)

- In a scratch VM/container (never the dev host), run the documented path
  `curl …/install.sh | bash` with `--dry-run` first, then for real, and
  record every manual step and failure: harness detection result, join
  token state, approve-and-paste loop, first project creation attempt,
  projects directory contents.
- Capture the UI states a new user sees: empty board, runner
  pending/missing states, creation error text for the D11 failure.
- Reconcile with `SURVEY.md` if it has appeared by implementation time;
  record any conflict between survey answers and this plan's assumptions
  in a `decisions.md` next to this plan.
- Validation: a written journey log (commands run, screenshots, timings)
  exists in the task directory; each symptom in the task text is mapped to
  a code cause or marked unreproduced.

### Step 2 — Research spike: decide the D11 creation policy (second decision gate)

- Options on the table: (a) add an optional "Git remote URL" field to the
  creation modal (recommended — smallest change, matches the existing
  `gitUrl` API field and the settings-form precedent); (b) allow
  local-only creation with a just-in-time remote prompt when a stage needs
  fetchability; (c) keep D11 strict and route new users to adoption only.
- Constraints from code: `projectStore.remoteRequired.test.js` pins the
  current contract — any relaxation must deliberately update that file;
  adoption already covers local-only repos (D11b), so (b) must not
  duplicate the adoption path.
- Record the decision and its D11-test impact in `decisions.md` before any
  creation-UI edit.
- Validation: decision recorded with rejected alternatives; affected test
  files listed.

### Step 3 — Make change easy: runner bootstrap-state resolver (no visual change)

- Add a pure, unit-tested resolver (API side, near
  `api/flow/runnerRegistry.js`) answering: runner installed? seen?
  approved? credential configured? — backed only by existing registry
  state. Expose it through the existing `GET /runners` / status payloads
  without changing their shapes (additive fields only).
- Follow the repo `MARK:` JSDoc convention with a runnable `@example` on
  every new export (`npm run docs:check` gates on this).
- Validation: new unit tests green; existing `runnerRoutes.test.js` and
  registry tests green unmodified; no UI change yet.

### Step 4 — Make change easy: install/uninstall shell-test harness (no behavior change)

- Extend the existing `deploy/*.test.sh` pattern with a shared temp-dir
  fixture (fake `$HOME`, stubbed `docker`/`systemctl`/`curl` on `PATH`)
  so install and uninstall can be tested without touching the host.
- Refactor `deploy/install.sh` minimally to source shared path/parse
  helpers from a new `deploy/lib/` file that the future uninstall script
  will reuse (single source of truth for what install creates).
- Validation: `deploy/install.test.sh` green unmodified in behavior;
  fixture supports a `--dry-run` install + full uninstall round-trip
  assertion (added in Step 8).

### Step 5 — Make the change: runner autodetect and one-step configure

- On first boot with zero approved runners, the backend auto-registers the
  local runner entry (id `local-pi` or the install-provided id) so the
  user sees "pending approval", not "no runner".
- Reduce approve-and-paste to one click: when the browser session is on
  the same host (or the join token validates), approving in Settings
  writes the credential to the runner env automatically, or the runner
  picks up approval by polling without a restart. Keep the manual paste
  path as fallback.
- Surface harness autodetect results in the runner settings UI
  (`RunnerConfigurationSection.jsx`): detected CLIs, missing ones with
  install hints (reuse the `GET /harnesses` hints contract from
  `site-docs/first-time-setup.md:102-111`).
- Validation: API tests for auto-register + one-click approve; frontend
  tests for the new runner states; manual sandbox run shows runner
  connected within one UI action of install.

### Step 6 — Make the change: creatable projects (D11 satisfiable from the UI)

- Per the Step 2 decision (default: option a): add the remote field
  (plus a "no remote yet — adopt a local repo instead" link to the adopt
  modal) to the creation dialog in `Header.jsx`, posting the existing
  `gitUrl` body field; show the backend's D11 error inline instead of a
  bare failure.
- If Step 2 picks (b): implement local-first creation behind the existing
  validation seam and update `projectStore.remoteRequired.test.js`
  deliberately with the new contract.
- Validation: targeted `api/routes/projects.test.js` + frontend modal
  tests green; headless screenshot of the new dialog via
  `npm run capture:screenshot`; creation succeeds from the UI on a fresh
  sandbox install.

### Step 7 — Make the change: projects directory never silently empty

- Install: if the user has existing repos, offer `--adopt-from DIR`
  (scanning for `.git` roots, capped count) that pre-registers them via
  the adoption API; otherwise seed an optional starter project
  (`--seed-demo` / default-on with `--no-seed` opt-out) containing one
  agent stage + human review so the board demonstrates value immediately.
- UI: replace the bare empty board with an onboarding empty state linking
  the three paths: create, adopt existing, and "learn more" (first-time
  setup doc).
- Validation: API adoption tests for bulk register; install `--dry-run`
  shows adopt/seed actions; screenshot of the new empty state.

### Step 8 — Make the change: uninstall for botched installs

- Add `deploy/uninstall.sh` (sourced from the Step 4 shared lib):
  stops/removes the compose stack, optionally removes images
  (`--images`), disables/removes runner systemd units, removes the
  install dir; default preserves user state
  (`projects/`, `data/`, `notes/`) with `--purge` to delete after an
  explicit confirmation; `--dry-run` prints every action.
- Mirror the existing test pattern with `deploy/uninstall.test.sh`:
  dry-run install → real install into fixture → uninstall → assert
  removal list; `--purge` requires confirmation (non-zero without it).
- Serve it from the ad-site alongside `install.sh`
  (`scripts/sync-adsite.sh` pattern) and link it from the install output
  and docs.
- Validation: new + existing `deploy/*.test.sh` green; round-trip test
  proves uninstall removes exactly what install created.

### Step 9 — Make the change: onboarding UI polish

- Guided checklist on first login (runner connected → first project →
  first task run), dismissible and never blocking; driven by the Step 3
  resolver and project/task counts.
- Copy pass on every first-run error (D11, runner missing, harness
  missing): each names the fix and links the action.
- Validation: frontend tests for checklist states; headless screenshots
  at desktop + 360px widths; no new axe/eslint a11y violations
  (`npm run lint:frontend`).

### Step 10 — Assure and document

- Tests (primary gate): full `npm run test:unit` (api + frontend), plus
  `npm run lint`, `npm run docs:check`, and all `deploy/*.test.sh`.
- Fresh-install rehearsal: repeat the Step 1 sandbox run against the
  finished work; the journey log must show zero manual credential pastes
  and a working project within the documented steps.
- Docs: update `site-docs/first-time-setup.md` (runner approval, creation
  remote field, adopt/seed, uninstall), the install output's "next steps"
  text, and `deploy.sh`/`PORTABLE_DEPLOYMENT.md` where they describe the
  same flow. Record before/after journey deltas and the Step 2 decision
  in the task directory.

## Validation Plan

| Check | Command / evidence | Expected |
|---|---|---|
| Targeted unit tests | `npm run test --prefix api -- runnerRegistry runnerRoutes projects projectStore` and `npm run test --prefix frontend -- ProjectMenu Header ProjectSettings RunnerConfiguration` | All green |
| Full unit/integration gate | `npm run test:unit` | All green |
| Lint | `npm run lint` | Clean |
| JSDoc/docs gates | `npm run docs:check` | Clean (new exports have `MARK:` + runnable `@example`) |
| Shell install/uninstall | `bash deploy/install.test.sh`, `bash deploy/uninstall.test.sh`, plus remaining `deploy/*.test.sh` | All green, round-trip proven |
| UI evidence | `npm run capture:screenshot` for creation dialog, empty state, checklist, runner settings | Screenshots in task dir, reviewed |
| Fresh-install rehearsal | Sandbox `install.sh` run per Step 1 log | Zero manual pastes; working project |
| Manual (cannot automate) | Botched install → uninstall → reinstall; adopt real repos; 360px onboarding | Clean removal; repos appear; no sideways scroll |

Highest-risk validation: the sandbox fresh-install rehearsal — it is the
only check that proves the onboarding works for a real new user rather
than merely passing unit tests.

## Risks / Open Questions

- Survey missing (`SURVEY.md` absent, see Background): D11 policy and
  onboarding-copy choices are assumptions until the survey is reconciled
  in Step 1. Contained: Steps 1-2 exist to absorb this.
- D11 relaxation risk: if Step 2 picks local-first creation, remote
  runners lose fetchability guarantees — keep the strict default for
  multi-runner fleets and gate any relaxation to single-local-runner
  installs.
- One-click credential write (Step 5) touches a security boundary:
  same-host detection or join-token validation must be reviewed; the
  manual paste path stays as the safe fallback.
- Uninstall `--purge` data loss: mitigated by state-preserving default +
  explicit confirmation; never purge without both flags.
- Docker-only install vs native dev path (`npm run setup` /
  `scripts/setup.mjs`): this plan targets the `deploy/install.sh` new-user
  path; contributor setup is a non-goal except where docs overlap.

## Non-goals

- Contributor setup (`npm run setup`, Playwright, canary-e2e).
- `NowPlayingBar` / observability UI changes.
- Backend scheduling, dispatch, or harness-execution changes.
- New user preferences or settings beyond the onboarding checklist
  dismissal.
- Multi-host/fleet provisioning flows.
