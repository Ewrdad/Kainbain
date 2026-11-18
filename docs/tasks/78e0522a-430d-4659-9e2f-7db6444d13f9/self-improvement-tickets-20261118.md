# Self-improvement follow-ons — case study `78e0522a-430d-4659-9e2f-7db6444d13f9`

Task: "Add a restart and update as separate options for runners" (per-runner
Restart/Update split + Latest-or-pinned version control).
Branch: `kb/78e0522a-430d-4659-9e2f-7db6444d13f9`.
History reviewed: `SURVEY.md`, `IMPLEMENTATION_PLAN.md`, `spike-notes-0a-0c.md`,
`quick-review-failure-20261116-234946.md`,
`automated-tests-failure-20261117-010944.md`,
`automated-test-2-failure-20261117-041518.md`, `pr-review-20261117.md`,
`upgrade-safety-review-20261117.md`, `final-review-20261117-073507.md`
(human rejection + `assets/19126.png`), `stage-review-20261117-092404.md`.
Every structural claim below was re-verified against the current tree
(file:line pointers are to this branch).

## Ticket-creation status: NOT CREATED (API unreachable)

The KainBain API at `http://localhost:3100` refused connections
(`curl http://localhost:3100/projects` → connection refused, no backend
process on this host), so per the skill guardrails no tickets were created:
ids could not be resolved against live data and dedupe was impossible.
The six drafts below are complete and ready to `POST /tasks` once the API
is reachable. Intended targets (from skill config, UNVERIFIED):
`projectId=0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`,
`workflowId=wf-default`, `stageId=1`, `execute=false`.
Idempotency keys are `sha256(finding-slug + "1" + currentTaskId).slice(0,32)`.

Dedupe note: local `./docs/tasks/` folders are keyed by id, not title, so
title dedupe was not possible offline. Re-check
`GET /tasks?workflowId=<id>` for open tickets with the same goals before
creating; each draft lists search keywords.

---

## Draft 1 — Soften exact-surface API pinning tests so additive operations don't fail CI

- `title`: "Soften exact-surface API pinning tests so additive operations don't fail CI"
- `idempotencyKey`: `b7c2da50090f4a6cfa63dd3f810057d9`
- Dedupe keywords: surface pin, api.surface, domainRequests, exact keys

`goal`:

Two frontend tests assert the ENTIRE API key list with `toEqual`:
`frontend/src/services/api.surface.test.js` ("exposes the pinned non-domain
keys plus exactly the registry operations", line 17) and
`frontend/src/services/domainRequests.test.js` ("exposes exactly the registry
operations with no duplicates", line 16). Their purpose is to catch dropped
or renamed operations, but as written they also fail on purely ADDITIVE
changes: adding one new operation (`requestRunnerRestart`) failed the full
gate (`Unit Tests (frontend)`, 2 failed / 4805 passed) and cost a whole
~14-minute CI cycle plus an agent fix-and-retry loop for a change that broke
nothing. Change both tests to fail on removed/renamed keys while passing (or
explicitly warning) on added keys — e.g. assert the expected set is a subset
of the actual keys and report additions separately — or generate the expected
list from the operation registry so additive changes stay green by
construction. Keep the dropped-operation detection: removing an operation
must still fail loudly. Verify by adding a dummy operation and showing the
suite stays green, then removing one and showing it fails.

Case-study reference: task `78e0522a-430d-4659-9e2f-7db6444d13f9`
(Restart/Update runner split),
`docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/automated-tests-failure-20261117-010944.md`
and `ci-fast-gate-20261117-010508/unit-tests-frontend.full.log`.

---

## Draft 2 — Cut the gitGate test's 15-minute starvation budget and quarantine the flake

- `title`: "Cut the gitGate test's 15-minute starvation budget and quarantine the flake"
- `idempotencyKey`: `8c78625b0884a5572e5a8c14c501f5a0`
- Dedupe keywords: gitGate, starvation, flake, timeout

`goal`:

`api/gitGate.test.js` sets `STARVATION_BUDGET_MS = 900000` (15 minutes) as
the `it` timeout for the git serialization tests. When the "never runs two
git processes on the same repo at once" test flaked, it hung the entire
`Unit Tests (api)` branch for 1057s and failed the whole gate on code
completely unrelated to the change under test — roughly 17 minutes of dead
agent iteration time per occurrence. A prior test-only hardening
(`0603447d`) reduced the odds but the 15-minute budget is still in place, so
the next hang costs the same. Reduce the budget to a tight value that still
distinguishes real serialization regressions from slowness (tens of seconds,
not minutes), make the test self-diagnose on timeout (log which promise
never settled instead of a bare timeout), and consider moving this
timing-sensitive test out of the blocking fast gate into a non-blocking lane
so one flaky timing test can never again hold 7400 passing tests hostage.
Verify with repeated runs and by showing a forced-hang fails fast with a
useful message.

Case-study reference: task `78e0522a-430d-4659-9e2f-7db6444d13f9`
(Restart/Update runner split),
`docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/automated-test-2-failure-20261117-041518.md`
and `ci-fast-gate-20261117-035740/unit-tests-api.full.log`.

---

## Draft 3 — Unify runner/backend build identity into one canonical contract

- `title`: "Unify runner/backend build identity into one canonical contract"
- `idempotencyKey`: `4a12ba7d12d46c2abc4c6e50287ff500`
- Dedupe keywords: build identity, version compare, canonical version, hash vs build

`goal`:

Runner version identity currently lives in three-plus independent
implementations: `api/flow/runnerVersionCompat.js` (backend semver),
`frontend/src/components/settings/runnerConfigHelpers.js` (frontend numeric
compare + `SHA_LIKE_RE`), and `runner/updates/index.js` /
`runner/updates/manifest.js` (update client). They already diverged once in
production: the Runners settings UI compared a runner build hash (`fbcf844`)
against a version-tagged backend image tag (`1.0.0-28aac94`) — a hash vs a
build — and mis-flagged which release was latest in the version dropdown,
which a human reviewer rejected with a screenshot. The fix (`extractBuildSha`,
`canonicalRunnerVersion`, mirrored sha-regex guards) had to be hand-applied
in each layer and can drift again with the next edit. Define ONE canonical
build-identity contract (what a version is, what a build/commit is, how
`1.0.0-28aac94`-style tags canonicalize, what never parses as a version)
plus a shared conformance fixture covering mixed identities (plain semver,
short/long hashes, tagged builds, numeric stamps, junk), and make every
layer implement or import it with tests asserting identical verdicts on the
fixture. No layer may compare raw identity strings across domains again.

Case-study reference: task `78e0522a-430d-4659-9e2f-7db6444d13f9`
(Restart/Update runner split), human rejection in
`docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/final-review-20261117-073507.md`
with `assets/19126.png`, resolved in `stage-review-20261117-092404.md`.

---

## Draft 4 — Couple release publishing to the recommended-version knob

- `title`: "Couple release publishing to the recommended-version knob"
- `idempotencyKey`: `45ea3efad22dd3ffee67b70aae4192e9`
- Dedupe keywords: recommended version, publish, release knob

`goal`:

The "a new version is published" signal that drives Latest-runner banners and
auto-update is the manually-bumped `KAINBAIN_RUNNER_RECOMMENDED_VERSION`
environment knob (`docs/runner-update-runbook.md`, step 5). Publishing a
release WITHOUT bumping the knob shows no banner and triggers no auto-update
— silently defeating the exact UX the version-control feature was built for —
and nothing warns the publisher. Three separate reviews on the same task
flagged this as "human reviewers should confirm", which is process fragility,
not a decision. Make it structural: either the release/publish script bumps
the knob atomically as part of publishing, or a check fails (loudly, at
publish time or in CI) when a release exists that no knob points at.
Document the single publish path in the runbook and remove the manual step.
Verify by publishing a test release and showing the banner/auto-update path
activates with no extra manual action.

Case-study reference: task `78e0522a-430d-4659-9e2f-7db6444d13f9`
(Restart/Update runner split), noted in `pr-review-20261117.md`,
`upgrade-safety-review-20261117.md`, and `stage-review-20261117-092404.md`
(finding 2).

---

## Draft 5 — Extend the binary guard to large non-proof files and ignore archives

- `title`: "Extend the binary guard to large non-proof files and ignore archives"
- `idempotencyKey`: `56a55e5d7dae691a97736eb5d4bb9681`
- Dedupe keywords: binary guard, tarball, gitignore, large file

`goal`:

Agent tooling downloaded `tesseract-0.1.3.tar.gz` (45,555,135 bytes) to the
repo root and it got COMMITTED and tracked (visible in `git ls-files`),
alongside a second tracked archive (`opencode-ai-sdk-1.18.34.tgz`).
`.gitignore` contains no `*.tar.gz`/`*.tgz` entry, and
`scripts/check-binary-guard.mjs` only inspects proof-image paths under
`docs/tasks/`, so no gate caught 45MB of junk heading for main — it was
found by a human-speed review pass instead. Untrack and remove the committed
archives, add archive patterns (`*.tar.gz`, `*.tgz`, plus obvious siblings)
to `.gitignore`, and extend the binary guard (or CI) to fail on newly tracked
files over a size threshold outside an allowlisted path set. Verify by
showing the guard fails on a fresh large-file add and passes on the cleaned
tree.

Case-study reference: task `78e0522a-430d-4659-9e2f-7db6444d13f9`
(Restart/Update runner split),
`docs/tasks/78e0522a-430d-4659-9e2f-7db6444d13f9/stage-review-20261117-092404.md`
(finding 1, "must-remove before merge").

---

## Draft 6 — Add a release-catalogue endpoint so the version dropdown lists true releases

- `title`: "Add a release-catalogue endpoint so the version dropdown lists true releases"
- `idempotencyKey`: `a6ec0ba36e2fed5e639bcb663bd9a319`
- Dedupe keywords: release catalogue, version dropdown, fleetKnownVersions

`goal`:

The per-runner version dropdown was specified as "`Latest` plus every
released version" (survey q3), but no release catalogue exists, so the UI
settled for `fleetKnownVersions` — the union of versions runners happen to
report plus the recommended/minimum knobs. Consequence: a freshly published
release that no runner has adopted yet can be missing or mis-flagged in the
dropdown (this ambiguity contributed to the human "latest not flagged"
rejection on the feature that introduced the dropdown). Add a lightweight,
cached release-list endpoint (newest-first, same ~30-entry bound as the
runner update client) that the dropdown prefers, keeping the current
fleet-known union strictly as the offline/degraded fallback. Verify with the
dropdown showing a release no runner runs yet, and with the catalogue
unreachable showing the degraded list.

Case-study reference: task `78e0522a-430d-4659-9e2f-7db6444d13f9`
(Restart/Update runner split), `SURVEY.md` q3,
`spike-notes-0a-0c.md` §0b, `pr-review-20261117.md` (documented deviation 1).

---

## Considered and deliberately NOT ticketed

- **Wrapper shim not refreshed by `applyUpdate`** (`$INSTALL_ROOT/bin/kainbain-runner`
  ignores the restart sentinel until the installer re-lays it; degrades to a
  systemd restart). Real tech debt, already documented in
  `upgrade-safety-review-20261117.md` §5 with graceful degradation. Low
  agent-effort leverage (it doesn't slow iteration), so left for the owning
  team rather than this loop.
- **Quick-review FAIL on an empty diff** (`quick-review-failure-20261116-234946.md`:
  review ran with zero commits and failed). Looks like pipeline ordering
  (review before implementation) but may be intentional failback routing;
  could not verify pipeline config from here, so no ticket — needs an
  operator to confirm whether the ordering is by design.
- **No Playwright screenshots for runner-settings states** (live-app capture
  risks live runners; jsdom asserted the JSX instead, yet the human still
  found a live-data-only ergonomic bug). Folded into Draft 3's conformance
  fixtures, which attack the same gap more cheaply than a screenshot harness.
