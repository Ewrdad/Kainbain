# WP2 upgrade-safety audit — will existing installs break on update?

Scope: the WP2 change on `kb/1f8959ca-265a-4f85-bb3a-c82eaa612e27` (`git diff main...HEAD`:
`api/watch/productionSignals.js` new, plus additive `record*` call sites and
`computeObservabilityMetrics` extension). Question: does updating an existing
install (backend restart, `docker compose` rebuild, runner self-update) break?

Verdict: **No breakage found.** The change is additive in-memory instrumentation
with no migration, no new dependency, no protocol bump, and no persisted-state
write. Two non-breaking gaps are noted at the end (they limit the feature, they
do not break an update).

## 1. Dependencies / engines / lockfiles — unchanged

- `git diff main...HEAD -- package.json package-lock.json api/package.json
  api/package-lock.json runner/version.json shared/` is empty. No new npm
  dependency, no engine bump, no pruned-lock churn.
- `api/watch/productionSignals.js` has **zero imports** (`grep -c "^import"` = 0,
  verified). It cannot create a circular import, and the runner importing it
  (`runner/daemon.js`, `runner/project.js`) needs no bundled npm closure.
  `RUNNER_LEG_BUNDLED_DEPS` in `scripts/package-runner.mjs` stays
  `['@earendil-works/pi-coding-agent']` only; no change required.

## 2. Persisted state — no migration, no file writes

- All WP2 state lives on `taskStore.productionSignals` (lazy-attached) plus the
  storeless in-process totals in `productionSignals.js`. **Nothing is written to
  disk**: `grep writeFile/persist api/watch/productionSignals.js` is empty, and
  the module never touches `task.md`, `~/.kainbain/engine/*`,
  `~/.kainbain/projects.json`, or the runner-registry state file.
- A backend restart therefore resets counters to zero (the dictionary documents
  the counters as cumulative since `productionSignals.since`, rates = deltas of
  successive snapshots). Existing task/engine data is read, never rewritten.
- `RUNNER_STATE_VERSION` and every `task.md` shape are untouched, so an old
  install's files load identically after the update.

## 3. Runner protocol — still `v1`, `facts.signals` is additive both ways

- `RUNNER_PROTOCOL` stays `"v1"` (`api/flow/runnerRegistry.js`), no `MIN` bump.
  `runner/version.json` keeps `runnerVersion 0.1.0` with `requires.backendApi
  ">=1.0.0 <2.0.0"`. No handshake change.
- **Old runner → new backend:** `recordRunnerSignalReport(store, id,
  facts.signals)` returns `false` and touches nothing when `signals` is
  `undefined`, so a pre-WP2 daemon heartbeats with 200 and the exposition just
  stays at zero evictions (see `api/watch/productionSignals.js` and the
  `runnerRoutes.test.js` case for a heartbeat without `facts.signals`).
- **New runner → old backend:** `normalizeCapabilities()` reads only known
  keys and returns a normalized object; `record.facts` is stored raw
  (`runnerRegistry.js:714,1040`). The extra `facts.signals` key is inert
  advisory data on an old backend that never reads it — heartbeat/register
  still validate the same fields and cannot 400 on the new key (the same
  additive-field rule `sanitizeVersions` documents for `values.build`).
- The `signals` payload itself is capped to one finite counter
  (`worktreeEvictions`), monotone-merged per runner, so a restarted runner can
  never move the fleet total backwards.

## 4. Shipping — the new file reaches every install path

- Backend/docker: `Dockerfile` does `COPY api/ ./api/` and `deploy.sh --prod`
  stages `tar -C api ...` wholesale, so `api/watch/productionSignals.js` ships
  (see `deploy.sh:1723`). No file is deleted or renamed.
- Runner distributable: `scripts/package-runner.mjs` `copyPruned(root/api → stage/api)`
  for `scripts/package-runner.sh` and `deploy.sh:1723-1724`, so the daemon that
  imports `../api/watch/productionSignals.js` resolves in the bundled runner
  tree. Wrapper installs (`runner-install-root.sh`) lay down `runner + api +
  shared` wholesale (`cp -a api/.`), so an update overwrites the tree with the
  new module present. No stale-tree `ERR_MODULE_NOT_FOUND` window.
- `api/index.js:241` adds one in-memory line `taskStore.executionLedger =
  executionLedger`; the `ExecutionLedger` constructor signatures are unchanged.

## 5. API surface — additive response keys only

- `computeObservabilityMetrics` gains an optional third param `opts = {}`
  (`api/watch/observabilityMetrics.js:35`), so all existing callers
  (`taskStore.getObservabilityMetrics`, `status.js:358`,
  `observabilityMetrics.test.js`) keep working with no change.
- The response gains `queueDepthByProject`, `ledgerStaleRejected`, and
  `productionSignals` alongside untouched `stats.queueDepth`, `schedulerStats`,
  `gitContention`, `executionQueue`. Nothing is removed or renamed; no frontend
  file references the new keys (`grep` in `frontend/` is empty), so the UI
  cannot break on new fields.
- Instrumentation never gates dispatch: every `record*` funnels through
  `mutateSignals`, which swallows its own faults (frozen/locked store,
  malformed args drop the sample). A legacy or frozen `taskStore` therefore
  degrades to "no signal", never a failed dispatch. This is what makes the
  call-site insertions in `runnerRoutes.js`, `scheduleTick.js`, and
  `skillInjection.js` non-behavioural.

## 6. Update scenarios for existing installs

- **Backend restart with in-flight tasks:** signals are event counters, not
  derived state; in-flight claims/com completions are unaffected. Future
  failures only change where they are counted.
- **Runner self-update / wrapper reinstall:** the new tree contains the new
  module and the `facts.signals` field; an old runner that has not yet
  self-updated keeps working against the new backend (§3).
- **Mixed fleet during a rolling update:** both directions are forward- and
  backward-compatible per §3; no version floor change forces an upgrade.
- **Frozen/legacy doubles and persisted state files:** lazy attach plus
  try/catch means old shapes (no `productionSignals`, no `executionLedger`)
  yield empty-but-total summaries; `ledgerStaleRejected: null` when no ledger
  handle exists.

## Non-breaking gaps (do not fail the stage)

- `taskStore.getObservabilityMetrics(filterProjectId)` does not forward `opts`,
  so the HTTP `/status` observability path always reports full history; the
  `{ windowMs, now }` window only takes effect via direct
  `computeObservabilityMetrics(store, undefined, { windowMs, now })` calls
  (as the dictionary documents). This weakens the load-window story on the
  served endpoint but does not break any existing install or response.
- `runner/version.json` (`0.1.0`) was not bumped, so the runner self-update
  channel will not notice this code change by version alone (hosts keep the
  old daemon, which is safe per §3). A future release should bump it so
  eviction reporting reaches existing fleets without a manual reinstall.

