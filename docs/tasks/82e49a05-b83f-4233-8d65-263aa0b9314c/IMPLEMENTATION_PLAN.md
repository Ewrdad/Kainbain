# Implementation plan — fix runner auto-update system

Task: `82e49a05-b83f-4233-8d65-263aa0b9314c`
Status: plan only, no code changed.
Principle: make the change easy first (diagnose, unify, rig), then make the change.

## Goal

Remote runners reliably converge to the newest runner release that is
compatible with the backend they talk to, with the backend managing which
version that is — while keeping the ADR 0012 guarantee that the backend
never ships runner bytes (R05 supply-chain boundary).

Concretely: the server2 runner (and every remote runner) stops saying
"update available" / "below minimum" / "update failed" permanently, and a
new runner release propagates to the fleet on idle without manual SSH.

## Success criteria

1. A remote runner on an old version, attached to a current backend, updates
   itself to the newest compatible release on idle and re-registers at the
   new version with no operator action.
2. A runner never updates past what its backend supports: version selection
   is compatibility-gated, not "GitHub latest, always".
3. The backend manages updates: an operator sets the desired/minimum runner
   version in one managed place and the fleet converges; per-runner state
   stays read-only telemetry (no per-runner pinning, per survey).
4. Cutting a release through the normal publish pipeline produces a signed,
   verifiable GitHub runner release (no separate manual tag step that can be
   forgotten).
5. Rollback of a bad release is a documented, drilled procedure that does not
   require touching runner hosts.
6. `npm run test:unit`, the runner suite, lint, and `npm run docs:check`
   pass; the staging fleet soaks one full release cycle; server2 accepts.

## Non-goals

- Backend-served runner bytes (Option B, rejected by ADR 0012, R05).
- Windows runner support (deferred by survey / ADR 0012).
- Pre-release opt-in for production runners (rejected by survey; canaries
   stay skip-by-default).
- Per-runner version pinning (rejected by survey).
- Changing the minisign trust root or key rotation ceremony (only verify it).

## Survey note (evidence gap)

The stage brief says to factor in the grill survey at
`docs/tasks/82e49a05-b83f-4233-8d65-263aa0b9314c/SURVEY.md`, plus
`idea-20261111-173030.md` and `check-for-plan-failure-20261111-174711.md`.
None of these files exists in this checkout (the task folder itself was
absent and was created for this plan). They could not be factored in
directly. This is recorded as open question O1 below.

As a proxy, this plan treats the survey refinements already committed in
`docs/adr/0012-runner-artifact-update-channel.md` as binding: versioned
archives over host Node (not SEA), Linux + macOS only, badge-then-dispatch
(409 only below the minimum floor), air-gapped override URL plus
failed-boot rollback in v1, no pre-release opt-in, no per-runner pinning.
Anything in the missing SURVEY.md that contradicts this plan must win and
the plan must be revised at implementation kickoff (step 0.1).

## Current-state diagnosis (verified in this checkout)

Findings below were read from source or observed live during planning; each
names its evidence so the implementer can re-verify rather than trust prose.

D1. Only one runner release exists, and nothing cuts new ones. Live GitHub
state (checked 2026-11-11): `releases/latest` is `runner-v0.1.0`
(published 2026-11-05) with 4 platform tarballs plus `manifest.json` and
`manifest.json.minisig`; it is the only `runner-v*` tag remotely and
locally. `publish.sh` (the pipeline release path) builds the runner with
`scripts/package-runner.sh` into `dist/` but never creates or pushes a
`runner-v*` tag — a release only happens when someone manually runs
`git tag runner-vX.Y.Z && git push origin runner-vX.Y.Z` (per
`docs/PORTABLE_DEPLOYMENT.md`). So "releases are not releasing right": the
normal pipeline cannot produce an update, and `runner/version.json` still
says `0.1.0`, which every runner reports.

D2. The release that exists is healthy. The live `manifest.json` verifies
OK against the pinned key in `runner/updates/verify.js`
(`PINNED_RELEASE_PUBLIC_KEY`, keynum `901011da8bb09147`) using the repo's
own verifier, and carries 4 correct assets. Signing, the pinned key, and
the `runner-release.yml` workflow are not the fault. (The "initial
placeholder" comment above the pinned key looks stale; confirm and
reword it rather than rotating the key.)

D3. Remote systemd runners structurally cannot boot an update. Both
installers — `scripts/install-local-runner.sh` and `startRunner.sh` —
write units with `ExecStart=<node> main.js` and a fixed `WorkingDirectory`
(the checkout or `~/apps/kainbain/runner/runner`). But `applyUpdate`
(`runner/updates/index.js`) stages the new tree under
`$KAINBAIN_RUNNER_INSTALL_ROOT/releases/<v>/unpacked` (default
`runner-install`, sibling of the work root) and flips a `current` symlink
there. Only the wrapper `runner/bin/kainbain-runner` follows that symlink;
direct `node main.js` re-execs the same old directory (systemd
`Restart=always` restarts the old path, not the new tree). Local runners
are masked from this because `deploy.sh` copies fresh files into
`~/apps/kainbain/runner` and restarts them; remote runners have no such
path, so they stage (or fail) forever while running the old bits. This is
the most likely mechanism behind "server2 regularly says out of date".

D4. Two packagers disagree about the bundle layout. `scripts/package-runner.sh`
(publish/deploy path) emits `kainbain-runner-<shortsha>.tar.gz` with layout
`runner/{runner,api,shared}/` + `VERSION.json`; `scripts/package-runner.mjs`
(GitHub release path) emits
`kainbain-runner-<version>-<platform>-<arch>.tar.gz` with layout
`runner/, api/, shared/, version.json, INSTALL.txt`. Only the `.mjs`
layout satisfies `applyUpdate`'s expectations (`version.json` at the
unpacked root, entry `runner/main.js` under it). Nothing tests that the
shipped layout matches what the updater consumes.

D5. Version selection ignores backend compatibility. `checkForUpdate`
(`runner/updates/index.js`) compares only GitHub-latest (or mirror
manifest) against `RUNNER_VERSION`; the manifest has no backend-compat
field, and the backend never tells the runner its own `apiVersion`
(`api/flow/runnerRoutes.js` heartbeat/register responses carry no version
advertisement; the runner reports `facts.versions.{protocol,runner,api}`
in `runner/daemon.js` `factsFor` but receives nothing back). A runner
therefore cannot pick "the latest version compatible with its backend" —
no such input exists on either side.

D6. "Managed by the backend" is currently two env knobs plus one command.
`KAINBAIN_RUNNER_MIN_VERSION` (409 floor, `RUNNER_VERSION_BELOW_MINIMUM`
in `api/flow/runnerVersionCompat.js`) and
`KAINBAIN_RUNNER_RECOMMENDED_VERSION` (badge-only,
`updateAvailableForRunner`) default to `0.1.0`; `requestUpdate`
(`RUNNER_COMMANDS` in `api/flow/runnerRegistry.js`, handled in
`runner/daemon.js` `handlePendingCommands`) queues an idle-only update.
There is no managed desired-version directive derived from backend
compat, and a recommended knob set above any existing release produces a
permanent, unresolvable "update available" badge (likely part of the
server2 symptom — confirm live backend env in step 0.2).

D7. The publish gate under-tests the update channel. `publish.sh`
`gate_for runner` runs 6 runner suites and omits all 8 `updates-*`
suites; the release workflow runs the update suites but nothing runs the
daemon/compat suites there. A green publish can ship a broken updater.

## Key decisions

K1. Keep bytes external and signed (ADR 0012 stands); move *version
selection* under backend management. The backend will direct ("run X",
bounded by compatibility) but never serve runner code. This preserves
the R05 supply-chain boundary while delivering "updates manageable by
the backend". Rejected: backend-served artifacts (re-litigates R05),
and runner-chases-latest-alone (today's behavior, incompatible with the
task's compat requirement).

K2. Compatibility is explicit data, not tribal knowledge. The release
manifest gains a `requires.backendApi` semver range (additive schema
change); the backend advertises its own `apiVersion` plus a
desired/minimum runner version on heartbeat/register responses; the
runner selects the newest verified release whose range its backend
satisfies, capped by the backend's desired version. Rejected: bumping
env knobs by hand per release (what produced the stuck badge), and
runner-side guessing of backend compat.

K3. One packager, one layout. `scripts/package-runner.mjs` becomes the
single bundle builder; the `.sh` packager is retired or reduced to a
thin wrapper, and `publish.sh`, `deploy.sh`, and `runner-release.yml`
all consume the same layout that `applyUpdate` boots. A conformance
test pins layout-against-consumer so they cannot drift again.

K4. The wrapper becomes the installed entrypoint. New installs and a
migration script put systemd units on `runner/bin/kainbain-runner` with
a real versioned install root; direct `node main.js` stays dev-only.
Without this, every other fix stages bits no process ever boots (D3).

K5. Releases flow from the pipeline, not from memory. The runner publish
path cuts (or triggers the cut of) the `runner-v*` tag + GitHub release
as part of the normal Merge → Publish flow, with the tag as the version
source of truth. Manual `git tag` remains the emergency path, documented
as such. Rejected: leaving releases manual (proven to stall at 0.1.0).

K6. No downgrades, no pre-release installs, no per-runner pins. The
updater still never downgrades and still skips pre-releases (survey /
ADR 0012); rollback of a bad release is delete/un-publish + lower knobs
+ cut a patch forward. Desired version is fleet-wide (optionally
per-channel later, not per-runner).

## Work plan

Ordered so the biggest unknowns and enablers land first. Phase 0 is
research; phase 1 changes no update behavior (make the change easy);
phase 2 is the behavior change; phase 3 hardens and proves it.

### Phase 0 — Diagnose the live failure and close research gaps

0.1 Recover or redo the grill survey. Locate SURVEY.md (backend task
store / operator notes) or re-run the grill interview; reconcile with
the ADR 0012 proxy constraints above. If the survey contradicts K1–K6,
revise this plan before phase 1. Owner: task author + implementer.
0.2 Capture the live failure state (read-only). On the backend host:
`KAINBAIN_RUNNER_MIN_VERSION`, `KAINBAIN_RUNNER_RECOMMENDED_VERSION`,
backend `api/version.json`, fleet matrix rows for server2 runners.
On server2: unit file (`ExecStart`, `WorkingDirectory`), env file
(`KAINBAIN_RUNNER_UPDATE_URL`, `AUTO_UPDATE`, `INSTALL_ROOT`,
`WORK_ROOT`), `update-state.json` + `releases/` + `current`/`previous`
under the effective install root, journal entries matching
`Runner update`. Classify the symptom exactly: stuck "update
available" (D6), "update failed" (verify/apply error + reason), or
"below minimum" (409 loop). Record versions, timestamps, reasons.
0.3 Audit release provenance. Confirm who/what last cut `runner-v0.1.0`,
whether `RUNNER_RELEASE_SIGNING_KEY*` secrets are present and match the
pinned public key, and who has tag-push rights. Confirm the stale
"placeholder" comment in `verify.js` and schedule its rewording.
0.4 Design the compat contract. Define: manifest `requires.backendApi`
semver range semantics (reuse `runner/version.json` `requires` +
`api/version.json` `accepts.runner` vocabulary); heartbeat/register
response fields (`backendApiVersion`, `desiredRunnerVersion`,
`minimumRunnerVersion`); selection rule (newest verified release with
`backendApiVersion` satisfying `requires.backendApi`, at-or-below
desired, strictly above current; desired/min absent = today's
behavior); mirror index format for listing more than "latest" (mirror
serving a `releases.json` index; GitHub path using the releases list
API with `releases/latest` fast path). Write it as the spec section of
the new/updated ADR before coding.
Exit: symptom classified with evidence; survey reconciled; compat spec
written; decision log updated.

### Phase 1 — Make the change easy (no behavior change)

1.1 Unify packaging. Make `scripts/package-runner.mjs` canonical:
publish.sh and deploy.sh runner staging consume its layout (or call it
directly); retire `scripts/package-runner.sh` to a thin wrapper or
delete it; keep `dist/` tarball naming the manifest expects.
1.2 Pin layout-against-consumer conformance. New test builds a bundle
with the canonical packager into a temp dir, then runs the real
`applyUpdate` staging checks against it: `version.json` at unpacked
root, `runnerVersion` equals manifest version, entrypoint
`runner/main.js` present, no forbidden files. Fails the build on drift.
1.3 Fix the gates. `publish.sh` runner gate runs the full runner suite
list (same explicit list as `scripts/run-tests.mjs`, including all
`updates-*`); `runner-release.yml` additionally runs the daemon/config
suites that guard `maybeSelfUpdate` wiring. Register any new suite file
in `scripts/run-tests.mjs` (pinned by `tests/run-tests.test.mjs`).
1.4 Build the update-channel rig. Hermetic mock release server
(exercising GitHub-pointer mode, mirror-base mode, full-manifest-URL
mode, 409-triggered forced check, signature failure, sha mismatch,
stale lock, rollback-after-3-boots, wrapper restart) usable from both
unit tests and a scripted end-to-end pass over a temp install root.
Extend the existing `updates-*.test.js` files rather than forking them.
1.5 Add a read-only install doctor. `runner/bin/kainbain-runner
doctor` (or `--verify-install`) reports: entrypoint kind (wrapper vs
direct), unit `ExecStart`/`WorkingDirectory` when run on a host,
effective install root, `current`/`previous` targets, installed vs
reported `RUNNER_VERSION`, update-state, backend reachability, and the
effective desired/min versions. No writes. This is the migration
pre-check and the support tool for "says out of date" tickets.
1.6 Reword the stale key comment and document key provenance in the
runbook (no rotation). Confirm `scripts/runner-pinned-key/` and source
stay consistent via the existing CI check.
Exit: one packager, conformance green, gates cover the channel, rig +
doctor merged, all existing suites green.

### Phase 2 — Make the change

2.1 Manifest `requires.backendApi` (additive). `buildManifest` in
`scripts/generate-runner-manifest.mjs` stamps the range from the
release source tree's `runner/version.json`; `validateManifest`
accepts v1 manifests unchanged and validates `requires` when present;
`package-runner.mjs` stamps the same range into the bundled
`version.json`. Old runners ignore the new field.
2.2 Backend advertises versions. Heartbeat/register responses include
`backendApiVersion` (from `api/version.json`), `desiredRunnerVersion`
(= recommended knob, defaulting to backend's known-good mapping), and
`minimumRunnerVersion` (= min knob). Extend `api/config/schema.js`
docs; keep env knobs as the managed surface in this iteration (Settings
persistence only if a settings store already exists for these keys —
do not invent one).
2.3 Runner selects newest compatible release. Extend the update client:
fetch the release list (GitHub releases API, newest-first, bounded;
mirror `releases.json` index), verify each candidate manifest
signature before trusting its `requires`, filter by backend compat +
desired cap + newer-than-current, skip pre-releases, then download the
winner through the existing verified-asset path. `releases/latest`
remains the fast path when it already satisfies the filter. Keep all
existing timeouts, locks, atomicity, and never-downgrade behavior.
2.4 Backend-managed desired version, end to end. Wire the fleet matrix
"update available" / "below minimum" badges and the existing
`requestUpdate` command to the desired version from 2.2 so the operator
flow is: set desired (env), runners converge on idle or via Update now
when idle, badges clear. No per-runner pinning.
2.5 Cut over installs to the wrapper. Migration script + runbook:
snapshot unit + env, lay down
`<install-root>/releases/<current>/unpacked` from the running tree,
create `current` (and `previous` when a prior tree exists), rewrite the
unit to `ExecStart=.../kainbain-runner` with env
`KAINBAIN_RUNNER_INSTALL_ROOT`, `daemon-reload`, restart, verify via
the doctor (1.5) and a heartbeat showing the same version. New
installers (`install-local-runner.sh`, `startRunner.sh`) write
wrapper-based units from the start. Order: staging hosts, then local
runners, then server2/remote runners in a maintenance window (idle
runners first; busy runners drain, then migrate).
2.6 Pipeline cuts the release. Extend the runner publish path so a
runner publish produces the `runner-v*` tag + GitHub release (tag push
from CI with the release workflow unchanged as the builder, or the
pipeline invoking the same build+sign+release steps). Tag is the
version source of truth; repo `runner/version.json` stays the floor
for dev. Include the pre-release tag convention (`*-rc.*` etc.) for
canaries and the rule that v1 runners skip them.
Exit: remote runner on old version converges to newest compatible on
idle; desired version managed from the backend; pipeline publish yields
a signed release; wrapper cutover complete on server2.

### Phase 3 — Harden, soak, and prove

3.1 Rollback drill on staging: publish canary bad release (pre-release
tag), delete/un-publish it, lower desired/min, cut patch forward;
verify runners never strand and badges clear. Record timings.
3.2 Soak: one full release cycle on the staging fleet (old → new across
at least two releases, one forced-409 path, one `requestUpdate` path,
one mirror-override host if air-gapped hosts exist).
3.3 Observability pass: fleet matrix shows current vs desired vs minimum
per runner plus last check outcome/reason (reuse `updateStatus`
facts); "update failed" links to the runbook section matching the
reason prefix.
3.4 Server2 acceptance: doctor clean, version advanced across a real
release, badges clear, journal shows check → stage → restart →
re-register → success prune sequence.
Exit: drill + soak green, acceptance signed off.

## Validation plan

Per-phase gates (run at each phase exit, not just at the end):

- Phase 0: evidence bundle (env dumps, journal excerpts, release audit)
  attached to the task; compat spec reviewed against ADR 0012.
- Phase 1: `node scripts/run-tests.mjs` (full runner list),
  `npm run test:api`, `npm run lint:api`, layout-conformance test,
  rig end-to-end over temp install root, doctor output on a legacy
  install (must report accurately, change nothing).
- Phase 2: new unit suites for compat selection (matrix: compatible
  newer / incompatible newer / desired cap / pre-release skip /
  no-downgrade / mirror index / releases-list paging + failure
  fallbacks), backend advertisement contract tests
  (`api/flow/runnerVersionCompat*.test.js` style), installer unit
  tests for wrapper units, pipeline dry-run (`publish.sh --dry-run`
  for runner + tag-content verification), migration dry-run on a
  cloned staging host.
- Phase 3: rollback drill log, soak log (two releases), server2
  acceptance checklist, `npm run docs:check` (doc links, JSDoc
  examples, env coverage for any new/changed knob).
- Overall assurance: `npm run test:unit` + runner suites + lint green
  on the merge commit; canary-e2e untouched paths still pass if the
  suite covers runners pages (headless only, no long-lived servers —
  use `npm run capture:screenshot` for any UI badge change).

Highest-risk validation: the wrapper cutover on live systemd hosts
(2.5) — rehearse on a staging clone first, migrate idle runners
first, keep the pre-migration unit file snapshot for instant revert.

## Documentation plan

- Amend `docs/adr/0012-runner-artifact-update-channel.md` (Amendments
  section, no history rewrite) or add a small follow-up ADR recording
  the compat contract + backend-directed selection + pipeline release
  trigger. Keep the R05 boundary statement prominent.
- Update `docs/PORTABLE_DEPLOYMENT.md` "Runner updates" (desired
  version management, compat gating, pipeline release flow, wrapper
  entrypoint, mirror index format) and `runner/README.md` self-update
  section to match.
- New or extended runbook: cutting a runner release (normal +
  emergency manual tag), rollback drill, remote-host migration to the
  wrapper, "runner says out of date" triage using the doctor. Link it
  from the fleet UI failure badge and from Settings help text.
- Regenerate `.env.example` if knobs change (`generate-env-example`
  flow) and update `api/config/schema.js` docs; CHANGELOG entry.
- Record the missing-SURVEY.md reconciliation (0.1 outcome) in the
  task folder so the next reader knows what was assumed.

## Risks and open questions

R1. Live-runner migration risk: rewriting systemd units on busy remote
hosts can strand leases. Mitigate: idle-first order, drain-then-cut,
unit snapshots, instant revert, staging rehearsal.
R2. Desired-version authority: if SURVEY.md demanded DB-persisted
settings UI rather than env knobs, scope grows. Mitigate: 0.1 decides
before 2.2/2.4; default to env knobs (current managed surface).
R3. Release-list fetching changes GitHub API usage (rate limits on
shared egress IPs). Mitigate: `releases/latest` fast path, bounded
list fetch, mirror index for fleets, cache within the check interval.
R4. Mixed-fleet window: old runners ignore new fields (safe by
design), but badges for them stay knob-driven until they update.
Accept and document; no flag day.

O1. Where is SURVEY.md / the grill answers, and do they contradict
K1–K6? (Step 0.1.)
O2. What are the live backend knob values and the exact server2 badge
text + `update-state.json` reason today? (Step 0.2.)
O3. Who approves and who can push `runner-v*` tags / run the release
workflow (permissions, environments)? (Step 0.3.)
O4. Is there an existing persisted-settings surface for runner knobs,
or do env knobs remain the managed surface? (Decided in 0.4/2.2.)
O5. Any air-gapped hosts needing the mirror index on day one, or can
mirrors follow in a fast-follow? (Default: ship index support with
2.3, onboard mirrors in 3.2 only if such hosts exist.)


