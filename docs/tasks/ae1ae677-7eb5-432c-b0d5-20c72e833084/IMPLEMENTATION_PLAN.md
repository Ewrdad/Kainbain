# Implementation Plan — Runner build identity and stale-code detection

Task: `ae1ae677-7eb5-432c-b0d5-20c72e833084` · Parent bug: `b3401f19` · Source work package: WP-A (cause N1).
Blocks: WP-F. Shared-file coordination: WP-B also touches `runner/daemon.js` (only `refreshDiscoveredModels`/boot) — whichever merges second rebases.

## 1. Goal

Give every runner a verifiable build identity (`build { sha, builtAt, dirty }`) plus a boot-time
code hash and per-heartbeat stale-code signal (`codeChangedSinceBoot`, `bootedAtMs`), make the
release pipeline stamp and enforce version bumps so `runner/updates` can actually offer updates,
and surface a **warning (never a block)** in the Settings runner card when a runner is stale.

Why: per RESPONSE.md N1, `runner/version.json` has said `0.1.0` since 2026-10-31, all runners
report `versions.runner 0.1.0`, the self-updater never fires, and past tickets "fixed" code that
runners never picked up. A runner whose files change after boot (e.g. `runner/daemon.js` mtime
4s after boot on local-bravo) is currently indistinguishable from a fresh one.

## 2. Success criteria (acceptance, from the task)

1. Unit test asserting `factsFor()` reports build identity — fails on today's code, passes after.
2. `codeChangedSinceBoot` flips to `true` after a file touch (temp-dir fixture).
3. `normalizeCapabilities` preserves `versions.build`.
4. Settings runner card renders the warning state.
5. Release CI rejects an unbumped version when runner code changed.
6. No new blocking behavior: mismatch warns only; blocking stays limited to true version
   incompatibility (existing `RUNNER_VERSION_BELOW_MINIMUM` path), per survey constraint q15.

## 3. Survey inputs (SURVEY.md + round-2 q15)

Local `SURVEY.md` (round 1, q1–q5) is **unanswered** (`"answers": {}`), and the referenced
`RESPONSE.md` / `RESPONSE_SURVEY.md` parent-bug docs are not present in this checkout. The plan
therefore adopts the survey's Recommended options as explicit assumptions (flagged for
confirmation during implementation):

- q1 (what counts as incompatible): runner **major version older than required** → block only
  there; everything else warns. Matches existing minimum-version machinery.
- q2 (where the warning appears): **Settings runner card only** — no dashboard banner, no
  per-task warnings.
- q3 (code changed after boot): **warn on the card, keep running** — no auto-restart, no
  restart button in this work package (button is a named follow-up, not scope).
- q4 (dev/local runners): **show build info everywhere, warn only on managed runners**.
  Needs a managed-vs-dev discriminator (see Open questions).
- q5 (bump enforcement): **strict — fail the release** if the version was not bumped.
- Round-2 q15 (hard constraint from the task): **warn, never block, on version mismatch**
  ("Only block stale runners if there is a version incompatibility").

## 4. Guiding principle — make the change easy, then make the change

The risky parts are discovery (which files the installed runner actually reads, how the backend
record carries versions, what "backend sha" means for comparison) and test seams (`factsFor` is
currently a private function; runner tests run via `node --test`). So the workflow is:

1. **Spikes first** (Phase 0): resolve every unknown that could reshape the design before
   writing production code.
2. **Seams and fixtures** (Phase 1): extract testable units and fixtures with zero behavior
   change — pure refactors covered by the existing suites.
3. **The change** (Phase 2): five small vertical slices, each independently testable.
4. **Assurance** (Phase 3): acceptance tests, regression gates, docs, WP-B rebase, WP-F handoff.

## 5. Phase 0 — Research spikes (do first; big unknowns before code)

Each spike is time-boxed and ends in a short note in this task folder (or a decision recorded
in the implementation PR). No production code here.

### Spike 0.1 — Which `version.json` does an installed runner read?

- Context: `runner/daemon.js` loads `RUNNER_VERSION`/`RUNNER_API_VERSION` from `./version.json`
  beside `daemon.js`, but `scripts/package-runner.mjs` copies `runner/` then stamps
  `<stage>/version.json` at the **archive root**. Confirm the installed layout
  (`releases/<version>/unpacked/...`) and which file the booted daemon parses.
- Outcome: the exact file the packager must stamp with `build { sha, builtAt, dirty }`, and
  whether the archive-root `version.json` needs the same stamp. If the two can diverge, the
  plan's Phase 2 slices must stamp both or unify them.

### Spike 0.2 — How do versions reach the Settings card today?

- Trace: heartbeat `facts.versions` → `api/flow/dispatch/normalizeCapabilities.js`
  (currently passes `versions` through unsanitized) → backend runner record
  (`runnerVersion` top-level? `facts.versions.runner` nested? `capabilities.versions`?) →
  `GET /runners`-style API shape → `describeRunnerVersion()` in
  `frontend/src/components/settings/runnerConfigHelpers.js` (reads `runnerVersion`, else
  `facts.versions.runner`) → `RunnerConfigurationSection.jsx` roster/detail.
- Outcome: the exact record fields where `build` and `codeChangedSinceBoot` must land to be
  renderable, and whether backend persistence changes are needed (backend files are **not** in
  the owned-files list — if persistence changes are required, that is a scope escalation to
  resolve before Phase 2).

### Spike 0.3 — What is "backend sha" for the comparison?

- The card must warn when `build.sha != backend sha`. Find the authoritative backend identity:
  `api/version.json`? A build-info endpoint? The release manifest commit? `git rev-parse HEAD`
  at backend boot?
- Outcome: a concrete source (endpoint or field) the frontend can compare against, plus the
  old-runner/old-backend fallback (missing `build` → show "unknown", never warn — warn-only
  for *known* mismatch).

### Spike 0.4 — Managed-vs-dev discriminator (survey q4)

- Find how the backend/frontend can tell a managed runner from a dev runner today
  (install root? wrapper presence? config flag? runner id pattern?).
- Outcome: the discriminator the card uses to suppress warnings on dev runners while still
  showing build info. If none exists, the cheapest honest fallback is "warn on all" with the
  q4 refinement as a follow-up — do not invent a new registry.

### Spike 0.5 — Baseline the heartbeat test surface

- Inventory existing coverage: `runner/daemon.test.js` (pins `RUNNER_VERSION` to
  `version.json`), `runner/updates-*.test.js`, `api/flow/dispatch` tests for
  `normalizeCapabilities`, `RunnerConfigurationSection.test.jsx` /
  `runnerConfigHelpers.test.js`. Note how tests construct facts today (since `factsFor` is
  unexported).
- Outcome: the seam design for Phase 1 (export vs. test hook vs. through-public-API tests).

## 6. Phase 1 — Make the change easy (zero-behavior-change refactors)

Each step must keep all existing suites green. Land as one preparatory commit (or stacked PR)
before any behavior change.

1. **Extract version loading** in `runner/daemon.js`: move the two `version.json` IIFE reads
   into a small pure loader (e.g. `loadRunnerVersionInfo(dir)` returning
   `{ runnerVersion, apiVersion, build }`) with `dir` injectable; keep `RUNNER_VERSION` /
   `RUNNER_API_VERSION` as thin wrappers. Add unit tests pinning current fallback behavior.
2. **Add a `factsFor` test seam**: export `factsFor` for tests (or add an explicit test-hook
   export) without changing its output. Add a characterization test snapshotting today's
   `versions: { protocol, runner, api }` shape — this is the test that Phase 2 extends into
   acceptance criterion 1.
3. **Add a temp-dir runner fixture helper** for runner tests: builds a fake `runner/` tree
   (with `version.json`) under `os.tmpdir()`, so the mtime-scan tests never touch the real
   checkout. Reuse in acceptance criterion 2.
4. **Frontend helper seam**: confirm `describeRunnerVersion`-style helpers are the single place
   the card reads versions from; add a pure `describeRunnerBuild(runner)` + warning-predicate
   helper file alongside with tests for the unknown/missing cases first (old runners send no
   `build` — must render "unknown", no warning, no crash).
5. **CI script seam**: verify `scripts/detect-changed-components.mjs` already flags
   `runner/**` → runner and `api/agent/**` → backend+runner (it does today, including
   `api/agent/harnesses/**`); add a test pinning that mapping so the Phase-2 bump gate can
   rely on it.

Validation after Phase 1: `node --test runner/daemon.test.js` (+ the full runner-release gate
list from `.github/workflows/runner-release.yml`), `npm run test:unit`, frontend settings
tests — all green, no behavior delta.

## 7. Phase 2 — Make the change (five slices, in order)

Slice order follows dependency order: identity → signal → passthrough → enforcement → display.
Each slice ships with its tests; each is independently revertable except where noted.

### Slice 2.1 — Build identity in `runner/version.json` + packager stamping

- Extend `runner/version.json` schema with `build: { sha, builtAt, dirty }`
  (all nullable/optional for backward compat; checked-in file carries `null`s or is
  git-ignored per repo convention — decide in implementation, document it).
- `scripts/package-runner.mjs`: stamp `build` at bundle time —
  `sha` from `git rev-parse HEAD`, `builtAt` as ISO time, `dirty` from
  `git status --porcelain` (scoped to the packaged tree). Stamp the file Spike 0.1 proved is
  read (and the archive-root copy if they differ).
- `scripts/generate-runner-manifest.mjs`: optionally carry the build sha into the manifest
  (so the update channel can compare identities, not just semver) — additive field only.
- Dev-runner fallback in `runner/daemon.js`: when the stamped `build.sha` is absent (running
  from a git checkout), compute at boot via `git rev-parse HEAD` + dirty from
  `git status --porcelain runner/`; best-effort, never fails boot (not-a-checkout →
  `sha: null`, `dirty: null`).
- Owned files: `runner/version.json`, `scripts/package-runner.mjs`
  (+ `scripts/generate-runner-manifest.mjs` if the manifest field is added), `runner/daemon.js`
  version-loading block only.

### Slice 2.2 — Heartbeat: `build` + `bootedAtMs` + `codeChangedSinceBoot`

- Boot: record `bootedAtMs = Date.now()` and hash the `runner/` tree (cheap fingerprint:
  max mtime + file count + sizes; full content hash is overkill and slow on every heartbeat).
- Per heartbeat in `factsFor()`: re-scan mtimes cheaply (single directory walk, no hashing);
  report `codeChangedSinceBoot: true` when any file under `runner/` is newer than boot (or
  the fingerprint changed). Guard cost: skip when a previous heartbeat already flipped, or
  cache scan results for N seconds.
- `facts.versions` becomes `{ protocol, runner, api, build, bootedAtMs, codeChangedSinceBoot }`
  (exact nesting per Spike 0.2 — `build` inside `versions` per the task; keep old keys
  byte-identical for old backends).
- Owned files: `runner/daemon.js` `factsFor()`/`versions` only. **Do not touch
  `refreshDiscoveredModels`/boot sequencing — that is WP-B's area.**
- Performance note: the mtime walk must be bounded (ignore `node_modules`, logs); add a test
  asserting the scan completes fast on a synthetic tree.

### Slice 2.3 — `normalizeCapabilities` versions passthrough

- `api/flow/dispatch/normalizeCapabilities.js`: sanitize-and-preserve `versions.build`,
  `bootedAtMs`, `codeChangedSinceBoot` following the file's existing advisory-data rule
  (malformed → dropped, never a 400 — mirror `sanitizeDiscoveryStatus` bounds: capped
  strings, finite numbers, booleans).
- Old runners without `build` pass through unchanged (no `build` key, no error).
- Acceptance criterion 3 test lives here.

### Slice 2.4 — Release pipeline: bump enforcement (strict, per survey q5)

- New script (e.g. `scripts/check-runner-version-bump.mjs`): given a base ref (default: last
  release commit, same convention as `detect-changed-components.mjs`), fail (exit 1) when
  `runner/**` or `api/agent/harnesses/**` changed but `runner/version.json` `runnerVersion`
  did not increase (semver-greater than the base's copy).
- Wire into `.github/workflows/runner-release.yml` as an early gate step (before packaging),
  reusing `detect-changed-components.mjs` path semantics so the two cannot disagree on what
  "runner code" means.
- Edge cases: first release / missing base (warn, don't fail); pre-release tags (`-rc.N`)
  count as increases over the base; `version.json`-only releases pass trivially.
- Acceptance criterion 5 test: script-level tests with fixture git ranges (or a `--files`
  mode like `detect-changed-components.mjs --files` for hermetic tests) asserting
  fail-on-unbumped and pass-on-bumped.

### Slice 2.5 — Settings runner card: build sha + warning

- `frontend/src/components/settings/runnerConfigHelpers.js`: `describeRunnerBuild` (short sha,
  dirty marker, built-at) + `runnerBuildWarning(runner, backendSha)` predicate implementing
  survey q1–q4: warn on known sha mismatch or `codeChangedSinceBoot`, suppress warnings for
  dev runners (Spike 0.4 discriminator), never block.
- `RunnerConfigurationSection.jsx` (roster row + detail panel, exact card TBD by Spike 0.2):
  show short sha next to the existing version badge; render a warning banner inline on mismatch
  / changed-since-boot. Old runners (no `build`) show "unknown", no warning.
- Copy must say what to do ("restart or update this runner") without ever disabling actions —
  q15 warn-never-block.
- Acceptance criterion 4 test: component test asserting the warning renders for a mismatched
  fixture and stays hidden for matching/unknown fixtures.

## 8. Phase 3 — Assurance plan

### 8.1 Acceptance tests (one per criterion, must fail before / pass after)

| # | Test | Location | Fails today because |
|---|------|----------|---------------------|
| 1 | `factsFor()` output includes `versions.build.{sha,builtAt,dirty}` + `bootedAtMs` | `runner/daemon.test.js` | `versions` is only `{protocol,runner,api}` |
| 2 | touch a file in temp-dir fixture → next `factsFor()` reports `codeChangedSinceBoot: true` | `runner/daemon.test.js` (fixture from Phase 1.3) | field does not exist |
| 3 | `normalizeCapabilities` preserves `versions.build` (and drops malformed advisory values without errors) | dispatch test file for `normalizeCapabilities` | passthrough not implemented (currently raw passthrough — test pins the sanitized shape) |
| 4 | warning renders on sha mismatch / `codeChangedSinceBoot`; hidden on match/unknown/dev | `RunnerConfigurationSection.test.jsx` + helpers test | no build UI exists |
| 5 | bump-check script exits 1 on runner-code-change without version increase; 0 otherwise | new script test (hermetic `--files` mode) | script does not exist |

### 8.2 Regression gates (must stay green throughout)

- Runner update-channel gate (exact list from `.github/workflows/runner-release.yml`):
  `node --test runner/updates-*.test.js runner/config.test.js runner/daemon.test.js`.
- Full unit suites: `npm run test:unit` (api + frontend).
- Compat gate: `node scripts/check-component-compat.mjs` (version.json schema change must not
  break it — `build` is additive).
- Old-runner interop: heartbeat fixtures without `build` still normalize and render (covered
  by slices 2.3/2.5 negative tests). Old-backend interop: new `versions` keys are ignored, not
  rejected (verify against the backend's heartbeat validation tests).

### 8.3 Manual / visual verification

- Settings card: use the headless screenshot tool (`npm run capture:screenshot`) against a
  fixture runner in each state (match / mismatch / changed-since-boot / unknown / dev) —
  do not spawn long-lived background servers; use existing mock fixtures or the headless
  runner. Eyeball the warning copy and layout per Testing & Verification Guidance.
- End-to-end heartbeat check (optional, if a sandbox runner exists): boot a dev runner from
  the checkout, confirm `build.sha` equals `git rev-parse HEAD`, touch `runner/daemon.js`,
  confirm the next heartbeat carries `codeChangedSinceBoot: true`.

### 8.4 Documentation updates

- `runner/README.md` (or the runner docs page): document `build` fields, dev-checkout fallback,
  and what `codeChangedSinceBoot` means.
- Release docs (`docs/PORTABLE_DEPLOYMENT.md` "Runner updates" section, referenced by the
  release workflow notes): document the bump requirement and the CI failure message + fix
  (bump `runnerVersion`).
- Settings/help copy if the UI has inline help for the Runners screen.
- This task folder: record Spike 0.1–0.5 outcomes (short notes) so WP-F and reviewers can
  follow the decisions.

### 8.5 Coordination and sequencing

- No blockers to start (spikes are self-contained).
- WP-B overlap (`runner/daemon.js`): keep slices 2.1/2.2 clear of `refreshDiscoveredModels`
  and boot sequencing; whoever merges second rebases. Prefer landing the Phase-1 extraction
  first so both work packages share the seam.
- Blocks WP-F: handoff is the shipped `versions.build` / `codeChangedSinceBoot` contract
  (field names, types, fallback semantics) — publish it in the PR description and link from
  this folder.

## 9. Risks and mitigations

- **Backend persistence gap** (Spike 0.2 outcome): if the runner record cannot carry `build`
  without backend changes outside the owned files, escalate scope before Slice 2.3 — do not
  smuggle backend edits into this work package.
- **Mtime-scan cost on every heartbeat**: bound the walk (single pass, skip heavy dirs,
  short-circuit once flipped); cover with a perf assertion test.
- **False positives**: clock skew / reinstalls flipping `codeChangedSinceBoot` — mitigate by
  comparing against boot fingerprint rather than wall-clock alone, and keep it warn-only so a
  false positive is cosmetic, never operational.
- **`git` unavailable in production bundles**: dev fallback must fail soft (`sha: null`);
  packaged runners always carry the stamp — CI test asserts the packaged archive contains a
  non-null `build.sha`.
- **Strict bump gate breaking hotfix flow**: gate fails only when runner-code paths changed
  without a version increase; provide a documented override (e.g. explicit label/env) only if
  the team asks — default is strict per survey q5.

## 10. Non-goals

- Auto-restart or restart button on stale detection (survey q3 follow-up).
- Dashboard banners or per-task warnings (survey q2 decided: card only).
- Blocking stale runners (forbidden by q15 except true incompatibility, which already exists).
- Changing `runner/updates` selection logic beyond making version data available.
- WP-B scope (`refreshDiscoveredModels`, boot sequencing, model discovery).

## 11. Open questions

1. SURVEY.md q1–q5 are unanswered — are the Recommended defaults adopted in §3 acceptable?
   (Assumption: yes; confirm before Slice 2.4/2.5.)
2. Where does the authoritative "backend sha" live? (Spike 0.3.)
3. What distinguishes a managed runner from a dev runner for q4 warning suppression?
   (Spike 0.4.)
4. Should the checked-in `runner/version.json` carry null `build` fields or omit `build`
   until stamped? (Decide in Slice 2.1; keep `check-component-compat` green either way.)
5. Does the update manifest need the build sha, or is semver comparison sufficient once bumps
   are enforced? (Slice 2.1 optional item.)

## 12. Work-order summary (earliest first)

1. Spikes 0.1–0.5 (research; unblock design decisions).
2. Phase 1 seams + characterization tests (safe refactors).
3. Slice 2.1 build identity + packager stamping.
4. Slice 2.2 heartbeat signal.
5. Slice 2.3 capabilities passthrough.
6. Slice 2.4 CI bump gate.
7. Slice 2.5 Settings card.
8. Phase 3 assurance (acceptance matrix, regression, screenshots, docs, WP-B rebase, WP-F handoff).
