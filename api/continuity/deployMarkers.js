/***
 * MARK: Deploy stage markers
 * @description Shared helpers for deploy and composite "Merge and deploy"
 *   stages. A production deploy restarts the very service that runs the
 *   stage, so the stage entry must record which build was live
 *   (`deployBuildAtEntry`) and the post-restart reconciliation must prove a
 *   durable `last-result.json` belongs to THIS stage attempt before
 *   advancing or parking the task. These predicates live here — not copied
 *   per caller — so the entry marker, the stage matcher, and the freshness
 *   check can never drift apart.
 *
 * Failure contract: every helper is total (never throws) on untrusted
 *   input — missing stores, non-string commands, and malformed timestamps
 *   all degrade to a safe negative (`false` / `null`) instead of throwing.
 ***/

/***
 * MARK: DEPLOY_COMMAND_PATTERN
 * @description Matches a stage command that invokes a deploy/publish/redeploy script.
 * @example DEPLOY_COMMAND_PATTERN.test('./publish.sh') => true
 ***/
export const DEPLOY_COMMAND_PATTERN = /(?:deploy|publish|redeploy|update|install)\.sh/;

/***
 * MARK: HOST_COMMAND_PATTERN
 * @description Host commands (deploy/redeploy only; publish is ordinary ci).
 * @example HOST_COMMAND_PATTERN.test('./redeploy.sh --frontend') => true
 * @example HOST_COMMAND_PATTERN.test('./publish.sh --detect') => false
 ***/
export const HOST_COMMAND_PATTERN = /(?:deploy|redeploy)\.sh/;

/***
 * MARK: isDeployCommand
 * @description Whether a stage command string invokes the deploy script.
 *   Implementation-owned twin of the migration heuristic in
 *   `api/projectStore.js` (same pattern source, pinned by test): the
 *   generic copy serves project-load migration, this copy serves the
 *   self-deploy continuity plugin. Neither is consulted by the generic
 *   dispatch path — to the generic engine a deploy-command stage is an
 *   ordinary ci stage.
 * @example isDeployCommand('./deploy.sh --prod') => true
 * @param {unknown} command - Stage `command` or `script` value.
 * @returns {boolean} True only for strings naming `deploy.sh`.
 ***/
export function isDeployCommand(command) {
	if (typeof command !== "string" || command.length === 0) return false;
	return DEPLOY_COMMAND_PATTERN.test(command);
}

/***
 * MARK: isHostCommand
 * @description Whether a stage command is a host command (deploy/publish/
 *   redeploy script). Twin of the helper in api/project/deployCommands.js.
 * @example isHostCommand('./publish.sh --detect') => true
 * @param {unknown} command - Stage `command` or `script` value.
 * @returns {boolean}
 ***/
export function isHostCommand(command) {
	if (typeof command !== "string" || command.length === 0) return false;
	return HOST_COMMAND_PATTERN.test(command);
}

/***
 * MARK: isDeployStageLike
 * @description Whether a stage is explicitly-marked deploy work: an
 *   explicit (legacy) `deploy` type ONLY. Command text is deliberately not
 *   consulted — use `isDeployCommand` on the stage's command, or the full
 *   continuity matcher `isContinuityDeployStage` in
 *   `./deployReconcile.js` (explicit type OR deploy command), when command
 *   matching is intended.
 *   Type comparison is case-insensitive; a missing stage is never deploy.
 * @example isDeployStageLike({ type: 'deploy' }) => true
 * @example isDeployStageLike({ type: 'merge', command: './deploy.sh --prod' }) => false
 * @param {object|null|undefined} stage
 * @returns {boolean}
 ***/
export function isDeployStageLike(stage) {
	if (!stage || typeof stage !== "object") return false;
	// Explicit type only: the generic pipeline never derives deploy
	// semantics from command text, and continuity matches commands via
	// `isDeployCommand` / `isContinuityDeployStage` instead.
	return String(stage.type || "").trim().toLowerCase() === "deploy";
}

/***
 * MARK: readDeployEntryBuild
 * @description Reads the live production build number at stage entry for
 *   the `deployBuildAtEntry` marker. Normalizes every degraded shape —
 *   missing store, missing manager, unreadable build, non-numeric build —
 *   to `null` ("unknown build"), so callers store `null`, never
 *   `undefined`, and reconciliation falls back to the timestamp check.
 * @example readDeployEntryBuild(store) => 41
 * @param {object|null|undefined} store
 * @returns {number|null} Integer build number, or `null` when unknown.
 ***/
export function readDeployEntryBuild(store) {
	try {
		const buildNumber = store?.deployManager?.readBuild?.()?.buildNumber;
		return typeof buildNumber === "number" &&
			Number.isInteger(buildNumber) &&
			buildNumber >= 0
			? buildNumber
			: null;
	} catch {
		return null;
	}
}

/***
 * MARK: findDeployCheckpointByOperationKey
 * @description Finds the newest durable per-attempt checkpoint for a stable
 *   merge/deploy operation key (see `resolveMergeDeployOperationKey` in
 *   stageExecution.js). This is the backstop for the adoption identity: a
 *   re-dispatch that lost its per-dispatch attempt id mints a fresh one and
 *   can no longer address its own checkpoint by filename — but the
 *   operation key is stable across re-dispatches, so the still-running (or
 *   already-settled) deploy is found anyway and no second full deploy
 *   starts. Total: a missing manager, missing list seam, or no match
 *   returns null. A terminal `failed` checkpoint IS returned (the caller
 *   treats it as a genuine-retry signal and re-runs); only the lookup
 *   itself is total — adoption policy lives with the caller.
 * @example findDeployCheckpointByOperationKey(store, 'merge-deploy:abcd:main:sha1:cmd9') => { status: 'running', … }
 * @param {Object} store
 * @param {string} operationKey - `task.deployOperationKey`.
 * @returns {Object|null}
 ***/
export function findDeployCheckpointByOperationKey(store, operationKey) {
	try {
		if (typeof operationKey !== "string" || !operationKey.trim()) return null;
		const list = store?.deployManager?.listAttemptCheckpoints?.();
		if (!Array.isArray(list)) return null;
		const want = operationKey.trim();
		for (const record of list) {
			if (
				record &&
				typeof record === "object" &&
				typeof record.operationKey === "string" &&
				record.operationKey.trim() === want
			) {
				return record;
			}
		}
		return null;
	} catch {
		return null;
	}
}

/***
 * MARK: hashDeployCommand
 * @description Short stable hash of a deploy command string for the
 *   operation key. djb2 over UTF-16 code units, hex, 8 chars — collisions
 *   across distinct commands are possible in theory but the key also
 *   carries the task, branch, and base SHA, so a collision alone cannot
 *   adopt the wrong deploy. Total on untrusted input.
 * @example hashDeployCommand('./deploy.sh --prod') => 'a1b2c3d4'
 * @param {unknown} command - Command string value.
 * @returns {string} 8-char hex digest.
 ***/
export function hashDeployCommand(command) {
	try {
		const text = typeof command === "string" ? command : "";
		let hash = 5381;
		for (let i = 0; i < text.length; i += 1) {
			hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
		}
		return hash.toString(16).padStart(8, "0").slice(-8);
	} catch {
		return "00000000";
	}
}

/***
 * MARK: resolveMergeDeployOperationKey
 * @description Stable identity for one merge/deploy operation across
 *   re-dispatches. The per-dispatch attempt id (`deploy-<task>-<now>`) is
 *   minted fresh whenever the marker is lost, so it cannot prove that two
 *   dispatches are the SAME operation — any liveness gap then starts a
 *   second full deploy (the multi-deploy loop). The operation key instead
 *   binds the task, the integration branch, the pre-merge base SHA, and
 *   the command: two dispatches of the same operation share the key, so
 *   `deploy.sh` and the reconciler adopt the recorded checkpoint instead
 *   of re-running. A genuine retry after new work lands a fresh merge
 *   (new base SHA) and therefore a different key — it re-runs, as it
 *   must. Total on untrusted input.
 * @example resolveMergeDeployOperationKey({ taskId: 'task-1', mainBranch: 'main', preMergeMainSha: 'abc', command: './deploy.sh --prod' }) => 'merge-deploy:task-1:main:abc:<hash>'
 * @param {Object} [args]
 * @param {string} [args.taskId] - Task id.
 * @param {string} [args.mainBranch] - Integration branch name.
 * @param {string} [args.preMergeMainSha] - Base SHA (or null when unknown).
 * @param {string} [args.command] - Deploy command string.
 * @returns {string}
 ***/
export function resolveMergeDeployOperationKey({
	taskId = "",
	mainBranch = "",
	preMergeMainSha = null,
	command = "",
} = {}) {
	try {
		const short = String(taskId || "").slice(0, 8) || "unknown";
		const branch =
			typeof mainBranch === "string" && mainBranch.trim() ? mainBranch.trim() : "main";
		const sha =
			typeof preMergeMainSha === "string" && preMergeMainSha.trim()
				? preMergeMainSha.trim()
				: "unknown-base";
		return `merge-deploy:${short}:${branch}:${sha}:${hashDeployCommand(command)}`;
	} catch {
		return "merge-deploy:unknown:main:unknown-base:00000000";
	}
}

/***
 * MARK: resolveDeployOperationKey
 * @description Reuses the operation key already recorded on the task when
 *   present (same operation, re-dispatched); otherwise derives it from the
 *   current attempt inputs. Callers that know the merge inputs pass them;
 *   everyone else reuses the recorded key.
 * @example resolveDeployOperationKey({ deployOperationKey: 'k' }, {}) => 'k'
 * @param {Object} [task] - Current task entity.
 * @param {Object} [inputs] - Merge/deploy inputs for a fresh derivation.
 * @returns {string}
 ***/
export function resolveDeployOperationKey(task, inputs = {}) {
	try {
		const existing =
			typeof task?.deployOperationKey === "string" ? task.deployOperationKey.trim() : "";
		if (existing) return existing;
		return resolveMergeDeployOperationKey(inputs);
	} catch {
		return "merge-deploy:unknown:main:unknown-base:00000000";
	}
}

/***
 * MARK: resolveDeployBaseSha
 * @description Resolves the base SHA that identifies the tree a deploy
 *   operation is verified/deployed against: the live pre-merge marker
 *   (`task.preMergeMainSha`, set by an in-flight merge) or, once the
 *   merge has passed, the frozen review baseline's `mainSha` (the same SHA
 *   the merge recorded, kept for exactly this continuation). Both the
 *   operation key derivation and the shared-gate attribution read this, so a
 *   deploy stage that runs AFTER the merge still binds to the pre-merge base
 *   instead of degrading to `unknown-base` — which would let a later
 *   operation adopt a stale checkpoint and would read the post-merge HEAD as
 *   pristine main. Total: returns `null` (never throws) when neither marker
 *   resolves.
 * @example resolveDeployBaseSha({ preMergeMainSha: 'abc' }) => 'abc'
 * @example resolveDeployBaseSha({ reviewBaseline: { mainSha: 'def' } }) => 'def'
 * @param {Object} [task] - Current task entity.
 * @returns {string|null} Trimmed SHA, or `null` when unknown.
 ***/
export function resolveDeployBaseSha(task) {
	try {
		const preMerge =
			typeof task?.preMergeMainSha === "string" ? task.preMergeMainSha.trim() : "";
		if (preMerge) return preMerge;
		const baseline = task?.reviewBaseline;
		const baselineSha =
			baseline && typeof baseline === "object" && typeof baseline.mainSha === "string"
				? baseline.mainSha.trim()
				: "";
		return baselineSha || null;
	} catch {
		return null;
	}
}

/***
 * MARK: deployFailureSkipsFailback
 * @description Whether a deploy-stage failure must park instead of failing
 *   back and auto-retrying. Always false: a deploy-command stage is an
 *   ordinary ci stage, so its failure routes to the configured fallback
 *   like any other ci failure and an agent fixes it from normal stage
 *   output. Retained (rather than deleted) so the historical call-site
 *   contract stays greppable: no caller may reintroduce deploy-specific
 *   park/skip-failback behaviour. Total: false on untrusted input.
 * @example deployFailureSkipsFailback({ reviewBaseline: { mergedAt: '…' } }, { type: 'ci', command: './deploy.sh --prod' }) => false
 * @example deployFailureSkipsFailback({}, { type: 'ci', command: './deploy.sh --prod' }) => false
 * @param {Object} [task] - Current task entity (ignored).
 * @param {Object} [stage] - The failing stage (ignored).
 * @returns {boolean} Always false.
 ***/
export function deployFailureSkipsFailback(_task, _stage) {
	return false;
}

/***
 * MARK: readDeployAttemptCheckpoint
 * @description Reads the deploy script's durable per-attempt checkpoint
 *   (`attempt-<deployAttemptId>.json`). Total: a missing manager, missing
 *   file, malformed JSON, array payload, or missing id all return null so
 *   callers degrade to their pre-checkpoint behavior.
 * @param {Object} store
 * @param {string} attemptId - `task.deployAttemptId`.
 * @returns {Object|null}
 ***/
export function readDeployAttemptCheckpoint(store, attemptId) {
	try {
		if (typeof attemptId !== "string" || !attemptId.trim()) return null;
		const checkpoint = store?.deployManager?.readJson?.(
			`attempt-${attemptId.trim()}.json`,
		);
		if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
			return null;
		}
		return checkpoint;
	} catch {
		return null;
	}
}

/***
 * MARK: DEPLOY_CHECKPOINT_FRESH_MS
 * @description How recently a `running` attempt checkpoint must have been
 *   refreshed (its `updatedAt`) to count as independent liveness evidence.
 *   `deploy.sh` refreshes `updatedAt` on every heartbeat tick (default 60s),
 *   so 180s tolerates two missed beats plus scheduling slack while still
 *   expiring minutes after the deploy process actually dies. A leaked ticker
 *   cannot suppress stalls forever: it exits when its parent pid is gone.
 ***/
export const DEPLOY_CHECKPOINT_FRESH_MS = 180000;

/***
 * MARK: isDeployCheckpointFresh
 * @description Whether a `running` attempt checkpoint was refreshed recently
 *   enough to prove the deploy is still executing, WITHOUT consulting the
 *   pid. This is the backstop for `isDeployAttemptInFlight`: pid liveness
 *   can misread (a `/proc`-hidden pid, a pid-namespace boundary, a stale
 *   pid field) while the deploy's heartbeat ticker keeps moving `updatedAt`
 *   forward every minute. Only a `running` status with a parseable
 *   `updatedAt` (falling back to `startedAt`) inside `maxAgeMs` reads as
 *   fresh; terminal statuses, missing timestamps, unparseable timestamps,
 *   and future timestamps never do — so a dead deploy still fails/stalls
 *   loudly instead of waiting forever.
 * @example isDeployCheckpointFresh({ status: 'running', updatedAt: new Date().toISOString() }) => true
 * @param {Object|null|undefined} checkpoint
 * @param {Object} [opts]
 * @param {number} [opts.now] - Wall-clock ms (defaults to Date.now()).
 * @param {number} [opts.maxAgeMs] - Freshness window (defaults to DEPLOY_CHECKPOINT_FRESH_MS).
 * @returns {boolean}
 ***/
export function isDeployCheckpointFresh(
	checkpoint,
	{ now = Date.now(), maxAgeMs = DEPLOY_CHECKPOINT_FRESH_MS } = {},
) {
	try {
		if (!checkpoint || typeof checkpoint !== "object") return false;
		if (String(checkpoint.status || "").toLowerCase() !== "running") return false;
		const stamp = checkpoint.updatedAt || checkpoint.startedAt;
		if (typeof stamp !== "string" || !stamp) return false;
		const at = new Date(stamp).getTime();
		if (!Number.isFinite(at)) return false;
		const age = now - at;
		return age >= 0 && age <= maxAgeMs;
	} catch {
		return false;
	}
}

/***
 * MARK: isDeployAttemptInFlight
 * @description Whether a `running` attempt checkpoint proves the deploy for
 *   this attempt is still executing: the checkpoint records the owning
 *   process pid and that pid is alive. A dead pid, a missing pid, or a
 *   missing liveness probe reads as NOT in flight so callers fall back to
 *   their resume/stall path instead of waiting forever.
 * @param {Object} store
 * @param {Object} checkpoint
 * @returns {boolean}
 ***/
export function isDeployAttemptInFlight(store, checkpoint) {
	try {
		if (String(checkpoint?.status || "").toLowerCase() !== "running") {
			return false;
		}
		const pid = Number(checkpoint?.pid);
		if (!Number.isInteger(pid) || pid <= 0) return false;
		return store?.deployManager?.isPidAlive?.(pid) === true;
	} catch {
		return false;
	}
}

/***
 * MARK: isDeployResultNewerThanEntry
 * @description Whether a durable deploy result proves the deploy ran for
 *   THIS stage attempt. True when the result carries this attempt's id, OR
 *   when its build number advanced past the entry marker (build freshness
 *   — covers clock skew and coarse timestamps), OR when the result started
 *   at/after the stage entry (timestamp freshness). A missing/unparseable
 *   result start with no id or build proof is never fresh.
 * @example isDeployResultNewerThanEntry({ task, lastResult }) => true
 * @param {object} args
 * @param {object} args.task - Task carrying `enteredStageAt` / `deployBuildAtEntry`.
 * @param {object} args.lastResult - Durable result with `startedAt` / `buildNumber`.
 * @returns {boolean}
 ***/
export function isDeployResultNewerThanEntry({ task, lastResult } = {}) {
	if (!task || typeof task !== "object") return false;
	if (!lastResult || typeof lastResult !== "object") return false;
	if (
		task.deployAttemptId &&
		lastResult.deployAttemptId &&
		task.deployAttemptId !== lastResult.deployAttemptId
	) {
		return false;
	}
	if (
		task.deployAttemptId &&
		lastResult.deployAttemptId &&
		task.deployAttemptId === lastResult.deployAttemptId
	) {
		return true;
	}
	if (!lastResult.startedAt) return false;
	const startedAt = new Date(lastResult.startedAt).getTime();
	if (Number.isNaN(startedAt)) return false;
	const entryBuild = task.deployBuildAtEntry;
	const resultBuild = lastResult.buildNumber;
	const buildAdvanced =
		typeof entryBuild === "number" &&
		typeof resultBuild === "number" &&
		Number.isInteger(resultBuild) &&
		resultBuild > entryBuild;
	if (buildAdvanced) return true;
	const enteredAt = new Date(task.enteredStageAt || 0).getTime();
	if (Number.isNaN(enteredAt)) return startedAt >= 0;
	return startedAt >= enteredAt;
}
