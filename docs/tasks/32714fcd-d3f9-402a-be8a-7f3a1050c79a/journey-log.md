# Journey log — fresh-install reproduction (Step 1)

Date: 2026-11-04. No scratch VM was available in this session, so the
"VM/container" run was replaced by the closest honest equivalents, each
marked below: a real `--dry-run` of `deploy/install.sh`, shim-driven
`deploy/*.test.sh` runs, and code-path reads of every step a new user
takes after install. Nothing was installed on this host (verified:
`--dry-run` created no directories; `ls /tmp/kb-journey` → absent).

## Commands run

- `bash deploy/install.sh --dry-run --install-dir /tmp/kb-journey/app
  --manifest /dev/null` → exit 0, plan printed, nothing written.
- `npm run test:unit` (baseline, untouched tree) → exit 0
  (api + frontend suites green, e.g. frontend: 303 files / 4202 tests).
- Targeted reads: `deploy/install.sh`, `startRunner.sh`,
  `scripts/install-local-runner.sh`, `runner/daemon.js`
  (`joinAndHeartbeat`), `runner/config.js`, `api/flow/runnerRegistry.js`,
  `api/flow/runnerRoutes.js`, `api/projectStore.js` (create/register/scan),
  `api/routes/projects.js`, `api/index.js` boot wiring,
  `frontend/src/components/layout/Header.jsx` (create + adopt modals),
  `frontend/src/context/useProjects.js`,
  `frontend/src/components/settings/RunnerConfigurationSection.jsx`,
  `frontend/src/components/OrchestratorView.jsx`,
  `frontend/src/components/workflow/WorkflowCanvas.jsx`,
  `site-docs/first-time-setup.md`.

## Step-by-step new-user journey (before this change)

1. `curl …/install.sh | bash` → Docker stack up, one native runner
   started via `startRunner.sh` (harness auto-detect on PATH).
2. Open `http://localhost:3100` → board shows an empty canvas with no
   next action (no empty-state; `WorkflowCanvas` renders nothing
   project-related when there are no projects).
3. Runner: `startRunner.sh` writes `KAINBAIN_RUNNER_JOIN_TOKEN` from
   `~/.kainbain/runner-join.token` — a file that does not exist on a
   fresh box — and `install.sh` writes `KAINBAIN_RUNNER_JOIN_TOKEN` to
   `.env` only when `--join-token` was passed or that same file exists.
   Net: on a truly fresh install the backend has no join token, so
   registration is disabled (`403 REGISTRATION_DISABLED`) and the
   runner can never even reach "pending". The user sees "no runner"
   with no guidance. When a token IS configured, the runner registers
   as pending, the user approves in Settings › Harness › Runners, and
   must hand-copy the one-time credential into the runner env file and
   restart (`runner/daemon.js` `joinAndHeartbeat` exits asking for the
   paste; `RunnerConfigurationSection.jsx` shows the credential once).
4. First project: Header "Create New Project" collects only a name
   (`Header.jsx`), but the API enforces D11 (`REMOTE_REQUIRED` unless
   `gitUrl` or `KAINBAIN_GIT_REMOTE_TEMPLATE`). `useProjects.createProject`
   swallows the failure (logs, returns null), so the modal closes and
   nothing happens — a silent dead-end.
5. Existing repos: the scan (`projectStore._scanForProjects`) only picks
   up directories that already carry a KainBain project config; a plain
   git repo dropped into `<install>/projects` is silently skipped, and
   the only documented path is manual per-repo adoption
   ("+ Add Existing Project…"). Nothing lists what is adoptable.
6. Botched install: no `deploy/uninstall.sh` exists (repo-wide search
   for "uninstall" matches nothing outside this task's docs). Recovery
   is manual `docker compose down` + deleting scattered files
   (install dir, `~/.kainbain/runner-*.env`,
   `~/.config/systemd/user/kainbain-runner-*.service`).

## Symptom → code cause map

| Task symptom | Cause (file:line) |
|---|---|
| Local runner not autodetected/configured | Join-token loop open on fresh installs (`deploy/install.sh:197`, `startRunner.sh:91`) → `REGISTRATION_DISABLED` (`api/flow/runnerRegistry.js:641`); then manual approve-and-paste (`runner/daemon.js:513`, `RunnerConfigurationSection.jsx:650`) |
| Unable to load in projects | Scan skips dirs without a saved config (`api/projectStore.js:496-534`, `_buildScannedProject` null); adoption is manual one-path-at-a-time (`Header.jsx` adopt modal) with no discovery list |
| Cannot create projects (git remote not enterable) | Modal sends name only (`Header.jsx:364-368`, `useProjects.js:175-178`); API requires `gitUrl`/template (`api/projectStore.js:746-762`); UI swallows the error (`useProjects.js:184-187`) |
| Projects directory sits empty | Install maps a fresh empty `<install>/projects` (`deploy/install.sh:161`); no adopt-from, no seed, no empty-state guidance |
| No uninstall | No inverse script; scattered state (install dir, compose stack, systemd units, `~/.kainbain` env files) |

No symptom was marked unreproduced. UI states (empty board, runner
pending/missing, D11 failure) were verified by code read, not
screenshots — headless screenshots are taken for the NEW states in
Steps 6/7/9 instead (before-states are "nothing renders", which a
screenshot cannot usefully prove).

## SURVEY.md reconciliation

`SURVEY.md` exists in this checkout but all six questions are
unanswered (`"answers": {}`). There is therefore no survey evidence to
conflict with the plan's assumptions; the D11 decision (option a,
remote field in the dialog) matches survey option q3c ("Let me type or
paste the link into the app screen") and is recorded in
`decisions.md`.

## After this change (2026-11-04, same session, no scratch VM)

Each verification below ran against the real code with isolated state
(temp `$HOME`/ports/roots; no host installs, no live ports touched):

- Runner autodetect/configure: `install.sh` mints the join token into
  `.env` + `~/.kainbain/runner-join.token` (proven by
  `deploy/install.test.sh` cases 6-9); approval hands the credential to
  the same-session runner poll via join-nonce (unit: `runnerRegistry`
  + `runnerRoutes` handover suites); `GET /runners/bootstrap` reports
  the expected-runner wait state. Live runner rehearsal (real daemon
  join → approve → collect) remains manual: no harness CLIs or scratch
  VM in this session.
- Loadable projects: `GET /projects/discover` lists unadopted checkouts
  (unit: `projectStore.discover.test.js`, `routes/projects.discover`);
  the empty state offers one-click adoption (unit:
  `OnboardingEmptyState`, `WorkflowCanvas.onboarding`; live: adopted
  `/tmp/kb-shot/projects/demo-repo` via `POST /projects/register` and
  the board flipped to the checklist — see `shot-checklist.png`).
- Creatable projects: dialog posts `gitUrl` with inline D11 errors
  (unit: `Header.test.jsx`; live: `shot-create-dialog.png` opened from
  the empty-state CTA through the window event).
- Empty projects dir: `--adopt-from` (unit: `install.test.sh` cases
  11-14) and `KAINBAIN_SEED_DEMO=1` boot seed (unit: `seedDemo.test.js`;
  live: fresh root booted a "Welcome Tour" project, checklist
  `project: done`); zero-project board renders the onboarding empty
  state (live: `shot-empty-state.png`, desktop + `shot-checklist-360.png`
  at 360px with no sideways scroll).
- Uninstall: `deploy/uninstall.sh` (`--dry-run`, state-preserving
  default, `--purge --yes`, `--images`, `--all-runners`) with
  `deploy/uninstall.test.sh` (dry-run/install/uninstall round-trip +
  `startRunner.sh` parity); served via `sync-adsite.sh`; linked from
  the install output, README, and `#/docs/install-run`.
- Docs: `README.md` (first-run next steps + uninstall),
  `site-docs/install-run.md` (Docker-install detail),
  `site-docs/first-time-setup.md` (remote field, install.sh pointer),
  `site-docs/api-reference.md` + `api/agentGuide.js` (three new routes,
  pinned by the coverage suites that failed CI before this fix).
