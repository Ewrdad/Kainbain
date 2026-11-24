# Upgrade-safety review — S4 branch (0.2.0 -> 0.2.1)

Task: `78eac844-250a-44d1-810e-6f047eb5a59e`. Stage asks to confirm, without fixing, that the current implementation will not break existing installs on update, and to FAIL if it would.

Verdict: **PASS** — no update-breaking change found. Evidence below is from reading the branch diff against `main` (`git diff $(git merge-base HEAD main)..HEAD`) and the update/install code paths. This stage is docs-only; no source was modified.

## What the branch changes

Runtime code is runner-only and small:

- `runner/client.js`: adds `TRANSIENT_BACKEND_STATUSES`, `TRANSIENT_NETWORK_CODES`, and the pure predicate `isTransientBackendError(err)`. The existing `createRunnerClient.call` path is untouched.
- `runner/daemon.js`: imports `isTransientBackendError`; adds `retryTransient`, `describeBackendOutageCause`; adds transient branches to `joinAndHeartbeat` (register + heartbeat retries), `executeAssignment`, `executeIntegrationAssignment`, `runDispatchLoop` (dispatch-poll retry/backoff), and `runSingleAssignment` (maps transient-interrupted to a clean non-zero exit).
- `runner/version.json`: `0.2.0` -> `0.2.1`. `apiVersion` stays `1.0.0`; `requires.backendApi` stays `>=1.0.0 <2.0.0`.
- `runner/README.md`: docs only.
- `scripts/run-tests.mjs` + `publish.sh`: register `runner/client.backendOutage.test.js` in the runner gates.
- `runner/client.backendOutage.test.js` + `runner/daemon.test.js`: new regression tests.

Nothing else runtime touches config, credentials, state, systemd, or packaging logic. No new dependencies, no new env flags, no schema or wire changes (the `interrupt` `reason` field already exists; `transient` is an in-memory flag on the return object only).

## Upgrade paths checked

### Self-update channel (`runner/updates/index.js`, `runner/updates/state.js`, `runner/main.js`)

- `filterReleaseCandidate` requires strictly newer + not prerelease + backend-compatible + platform asset. `0.2.1` is strictly newer semver, final (not prerelease), same `requires.backendApi` range, and ships for the same linux/darwin x64/arm64 assets via the same `packageRunner`. Old `0.2.0` installs are offered `0.2.1`; no downgrade is ever selected (never-downgrade rule intact).
- `applyUpdate` downloads, re-verifies sha256, extracts to `releases/<v>/unpacked`, normalizes the tar top-dir, sanity-checks `version.json`, carries `api/node_modules` over from the previous tree, then atomically flips `current`/`previous` symlinks. This branch modifies none of that logic, so atomicity and lock behavior are unchanged.
- `bootstrapUpdateState` (called first in `main.js`) still rolls back after 3 failed boots by flipping `current` back to `previous`. `markUpdateSuccess` still gates GC on first good heartbeat. Both operate on `update-state.json` whose shape this branch does not change (`status`/`bootAttempts`/`from`/`to` — see `runner/updates/state.js`). `0.2.0` reads a `0.2.1`-written state file identically; rollback to the `0.2.0` tree is byte-safe.

### Backend gating (`api/flow/runnerVersionCompat.js`, `api/version.json`, `runner/version.json`)

- Backend `accepts.runner` is `>=1.0.0 <2.0.0`; runner `requires.backendApi` is the same range. Component compatibility is unchanged.
- Backend floors are `KAINBAIN_RUNNER_MIN_VERSION=0.1.0` and `KAINBAIN_RUNNER_RECOMMENDED_VERSION=0.1.0` (`.env.example`). `0.2.0` and `0.2.1` are both well above the minimum, so neither trips `RUNNER_VERSION_BELOW_MINIMUM`, and `0.2.1` does not newly show as below-recommended. Advertising `runnerVersion 0.2.1` in `factsFor` is a display/matrix change only.

### Fresh install and manual tarball (`scripts/package-runner.mjs`, `runner/bin/kainbain-runner`, `scripts/install-local-runner.sh`)

- `packageRunner` copies `runner/`, `shared/`, `api/` with pruning of `*.test.js`/`*.spec.js` (see `copyPruned`/`assertClean`), so the new `runner/client.backendOutage.test.js` never ships. `INSTALL.txt` and the leg-closure (`RUNNER_LEG_BUNDLED_DEPS`) are untouched; no new bare imports were added (`daemon.js` -> `./client.js` is a relative import present in every bundle).
- The `kainbain-runner` wrapper resolves `current` on every boot and reboots on symlink flip or the `restart-requested` sentinel. The new transient paths write neither, so wrapper restart semantics are unchanged (the daemon simply stays running during an outage instead of exiting — the intended S4 behavior, not a break).
- `install-local-runner.sh` writes the same env file and systemd unit keys (`KAINBAIN_RUNNER_*`); no env keys are added, removed, or renamed, and `runner/config.js` is not in the diff.

### Wire protocol

- `runner/client.js` `call` still sends identical paths/bodies/headers and still throws `{statusCode, code}` on non-2xx. The new predicate only reads `statusCode`/`code`/`cause.code`; it changes no request bytes.
- `interrupt` reasoning reuses the existing `reason` string field (capped 500). The transient branches use a new reason prefix (`Backend unreachable mid-assignment: ...`), which the backend records as an opaque history string (`api/flow/executionLedger.js` interrupt path) — nothing parses the prefix. `complete` gains no new fields. A `0.2.1` runner talks to any `1.0.0` backend exactly as `0.2.0` did; no paired backend upgrade is required.

## Per-dimension breakage analysis

| Dimension | Finding | Breaks existing install? |
|---|---|---|
| Version / updater | Strictly newer final `0.2.1`, same compat range, same assets; satisfies `check-runner-version-bump` (runner code changed + version bumped). | No |
| Backend floor | Both versions above `MIN 0.1.0`; no refusal, no forced update. | No |
| Wire / backend API | No endpoint, method, or body-shape change; `reason` text only. | No |
| Config / env / credential | `config.js` untouched; no new required vars; `credentialFile.js` untouched; `~/.kainbain/runner-<short>.credential` format unchanged. | No |
| State files (`update-state.json`, workdir) | No schema change, no migration, no new persisted fields; worktree reaping unchanged. | No |
| Node / runtime | Only long-supported syntax (`Set`, `Number.isFinite`, optional chaining — already used in these files); no new npm deps or native modules. | No |
| Bundle layout | No new runtime files; edited files ship together in one tarball so `daemon.js` -> `./client.js` always resolves. | No |
| Boot: `register`/`heartbeat` retries | Bounded `[250,500,1000]` attempts on classifier-positive errors only, then the original throw. Adds at most ~1.75s before boot failure on a long outage; auth/unknown still exit loud immediately. Strictly more tolerant than today. | No |
| Idle: dispatch-poll retry | `[1000,2000,4000]` capped to `pollMs`, then `polls+=1` + `sleep(pollMs)` + `continue` without consuming idle budget (same shape as the existing `429`/`RUNNER_PAUSED` branches). Unknown errors still hit `throw err` (`persistent-loop-probe` test unmodified). Process stays alive through a long outage instead of systemd-restarting — intended behavior, polls resume on heal. | No (intended liveness change, not a brick) |
| In-assignment: `executeAssignment`/`executeIntegrationAssignment` | Transient -> best-effort `interrupt` with reason + `return {interrupted:true,...,transient:true}` instead of rethrow. The interrupt itself is swallowed if it also 502s (lease TTL is the backstop, same as sibling branches). Task is released via the identical re-queue path as before. | No |
| Single-shot: `runSingleAssignment` | Transient-interrupted maps to `throw new Error(reason)` (non-zero exit preserved), matching the pre-existing non-zero contract where the raw backend error used to propagate. Error *text* changes from e.g. `Backend 502 on ...` to `Backend unreachable mid-assignment: ...`; CI callers branching on the old exact string would see a different message but still a failure exit. Not an install break. | No |
| Logging | One warn/error line per ride-through naming cause + ids; retries stay quiet. No log-volume contract break. | No |
| Rollback | `previous` still points at the `0.2.0` tree; state is symmetric; manual/rollback flip restores byte-identical old code. | No |
| Tests / gates (`run-tests.mjs`, `publish.sh`) | Both lists now name `runner/client.backendOutage.test.js`; nothing here runs inside already-installed trees. (Prior CI failure in `tests/publish.test.mjs` was a list-pin mismatch at that time; the branch's `publish.sh` update aligns the lists — a gate-strictness item for the next CI run, not an install-safety issue.) | No |

## Deliberate-shape checks (why these cannot brick installs)

- **Classifier is allowlist-only.** `statusCode` present -> transient iff in `{502,503,504}`; otherwise the cause chain (depth 4) must carry a known `ECONN*`/`UND_ERR_*` code. `STALE_EPOCH`/409, 401/403 auth, 429, 500, and unknown errors all return `false` by construction, so new failure modes stay loud instead of spinning. A bare `TypeError: fetch failed` with no recognized code (e.g. misconfigured `backendUrl`) also returns `false` — ambiguous failures keep exiting loud.
- **No persistence drift.** The outage cause helper (`describeBackendOutageCause`) is pure string building with `redactSecretsText`; nothing new is written to disk.
- **Bounded by construction.** Both retry loops are capped arrays; the idle path always sleeps `pollMs` and re-polls, so a dead backend cannot create a hot loop (same backoff shape as the pre-existing `429` branch).
- **db49d6c6 not reworked.** The loop-level catch around `executeAssignment` is untouched by this diff; S4 only adds branches inside the assignment catches and the dispatch-poll catch, per the plan constraint.

## What was verified

- `git diff $(git merge-base HEAD main)..HEAD` file list and full diff of `runner/client.js`, `runner/daemon.js`, `runner/version.json`, `scripts/run-tests.mjs`, `publish.sh`, `runner/README.md`.
- `runner/updates/{index,manifest,state}.js`, `runner/main.js`, `runner/credentialFile.js`, `runner/config.js`, `scripts/package-runner.mjs`, `runner/bin/kainbain-runner`, `api/flow/runnerVersionCompat.js`, `api/version.json`, `.env.example` version knobs — all confirming no gating, schema, or contract change.
- `runner/daemon.test.js` added tests assert single-shot still exits non-zero on transient, unknown dispatch errors still throw, and `STALE_EPOCH` still propagates (boundary pinned). No existing test assertions were rewritten to hide a contract change (diff is additive in `daemon.test.js`).

Not executed beyond reads in this stage (docs-only): no test runs, no tariff/install simulation, no journal check. That is CI/rollout work; it does not affect the install-safety conclusion because the updater/packaging/state paths involved are fully readable and unchanged.

## Conclusion

The current `0.2.1` implementation is a backward-compatible, runner-only patch: same backend range, same config/credential/state contracts, same bundle shape, bounded retries, unchanged audit of fatal paths, and clean rollback. Existing installs can update in place via the self-update channel, fresh installs extract the same layout, and a failed `0.2.1` boot still rolls back to `0.2.0`. Nothing in the diff requires a paired backend upgrade, env-file rewrite, credential re-collection, or manual intervention.
