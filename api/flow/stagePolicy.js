// Domain: The Flow — preserves the task store's existing public contract.
import { config } from "../config.js";
import { normalizeStageType } from "../projectStore.js";
// NOTE: resolveStageTimeout/resolveProjectTimeout below deliberately use
// raw lowercase comparison instead of normalizeStageType — see the comment
// at resolveStageTimeout for why the fallback contract must stay intact.

/***
 * MARK: clearResumedMarker
 * @description Clears the startup-recovery priority marker in memory only
 *   (no disk write, no store needed). Every state transition that moves a
 *   task away from "sitting where the interruption left it" — stage moves,
 *   manual resume/retry, operator abort, pausing — calls this so the marker
 *   cannot leak onto later, unrelated work. Fails safe: an unset marker is a
 *   no-op and a missing task is ignored. This is the dependency-light twin of
 *   `consumeResumedMarker` (taskScheduler.js), which additionally persists; it
 *   lives here so transition code (stageTransitions/taskControl/
 *   stageFailureRouting) can clear the marker without importing the scheduler
 *   module (which would create a cycle: taskScheduler → stageTransitions is
 *   not currently present, but keeping the predicate layer dependency-free is
 *   the safer direction).
 * @param {Object} task - The task (mutated in place).
 * @returns {boolean} Whether a marker was cleared.
 * @example clearResumedMarker({ resumedAfterInterruption: true, interruptedAt: "…" }) => true
 ***/
export function clearResumedMarker(task) {
	if (!task) return false;
	const hadMarker = task.resumedAfterInterruption === true || !!task.interruptedAt;
	task.resumedAfterInterruption = false;
	task.interruptedAt = null;
	return hadMarker;
}

/***
 * MARK: isTerminalTaskStatus
 * @description Whether a task status is terminal: the engine must never
 *   advance, fail back, retry, or (re)dispatch it. A manual complete
 *   landing mid-run must stick even when the orphaned run settles later.
 * @example isTerminalTaskStatus('completed') => true
 * @example isTerminalTaskStatus('in_stage') => false
 * @param {string} [status] - Task status value.
 * @returns {boolean} True for completed/done/failed/cancelled.
 ***/
export function isTerminalTaskStatus(status) {
	const normalized = String(status || "").toLowerCase();
	return (
		normalized === "completed" ||
		normalized === "done" ||
		normalized === "failed" ||
		normalized === "cancelled"
	);
}

/***
 * MARK: findStageByIdOrName
 * @description Single id-or-name stage lookup shared by every transition and
 *   projection path, so matching semantics cannot drift between writers and
 *   readers (id equality wins; name matches case-insensitively). Fails safe:
 *   a missing/empty ref or stage list resolves to null, never a guess.
 * @example findStageByIdOrName([{ id: '1', name: 'Catchup' }], 'catchup') => { id: '1', name: 'Catchup' }
 * @param {Array<Object>} [stages] - Pipeline stages to search.
 * @param {string} [ref] - Stage id or name.
 * @returns {Object|null} The matched stage, or null.
 ***/
export function findStageByIdOrName(stages, ref) {
	if (ref == null || String(ref).trim() === "") return null;
	if (!Array.isArray(stages)) return null;
	const needle = String(ref);
	return (
		stages.find(
			(s) =>
				String(s?.id) === needle ||
				(s?.name &&
					String(s.name).toLowerCase() === needle.toLowerCase()),
		) || null
	);
}

/***
 * MARK: isEngineOwnerOf
 * @description Whether the given task currently owns the engine (holds the
 *   single-run lock). Ids compare as strings: persisted snapshots and live
 *   records can drift between string and number keys, and a strict compare
 *   would silently treat the owner as a stranger — leaving a stranded engine
 *   behind on operator moves and aborts (task 072e2cfa hardening). Fails
 *   safe: a missing task id or engine owner is never ownership.
 * @example isEngineOwnerOf({ activeTaskId: 't1' }, 't1') => true
 * @param {Object} [engineState] - Engine snapshot.
 * @param {string} [taskId] - Task id to test.
 * @returns {boolean} True when the task holds the engine lock.
 ***/
export function isEngineOwnerOf(engineState, taskId) {
	if (taskId == null || engineState?.activeTaskId == null) return false;
	return String(engineState.activeTaskId) === String(taskId);
}

/***
 * MARK: findStageIndexByIdOrName
 * @description Index twin of `findStageByIdOrName` for ordered-pipeline walks
 *   (advance/failback). Same match semantics; -1 when nothing matches.
 * @example findStageIndexByIdOrName([{ id: '1' }, { id: '2' }], '2') => 1
 * @param {Array<Object>} [stages] - Pipeline stages to search.
 * @param {string} [ref] - Stage id or name.
 * @returns {number} The matched index, or -1.
 ***/
export function findStageIndexByIdOrName(stages, ref) {
	if (ref == null || String(ref).trim() === "") return -1;
	if (!Array.isArray(stages)) return -1;
	const needle = String(ref);
	return stages.findIndex(
		(s) =>
			String(s?.id) === needle ||
			(s?.name && String(s.name).toLowerCase() === needle.toLowerCase()),
	);
}

/***
 * MARK: stageElapsedSeconds
 * @description Measures time spent in the current stage; absent timestamps are not samples.
 * @example stageElapsedSeconds({ enteredStageAt: '2026-01-01T00:00:00Z' }, Date.UTC(2026, 0, 1, 0, 1)) => 60
 ***/
export function stageElapsedSeconds(task, now = Date.now()) {
	const entered = task.enteredStageAt ? Date.parse(task.enteredStageAt) : NaN;
	return Number.isFinite(entered)
		? Math.max(0, (now - entered) / 1000)
		: undefined;
}

/***
 * MARK: resolveEffectiveStageType
 * @description Derives the effective stage type for timeout and stall
 *   calculations. Legacy `deploy` is a normal `ci` stage now; the runtime kind
 *   is not derived from command text. `merge` keeps the merge budget.
 * @example resolveEffectiveStageType({ type: 'ci' }) => 'ci'
 * @example resolveEffectiveStageType({ type: 'merge', command: './deploy.sh --prod' }) => 'merge'
 * @param {Object} [stage]
 * @returns {string}
 ***/
export function resolveEffectiveStageType(stage) {
	if (!stage || typeof stage !== "object") return "agent";
	const rawType = String(stage.type || "").toLowerCase();
	if (rawType === "merge") return "merge";
	// Legacy alias: the removed `deploy` type reads as `ci` everywhere
	// (a deploy command is an ordinary ci stage).
	if (rawType === "deploy") return "ci";
	return rawType || "agent";
}

/***
 * MARK: resolveStageTimeout
 * @description Resolves the effective execution timeout (ms) for a stage.
 *   Uses explicit per-stage override if positive, otherwise the project's
 *   per-type timeout when set, otherwise type-specific config defaults:
 *     - agent / review: config.agentTimeoutMs (default: 1,800,000 ms / 30 min)
 *     - ci / script: config.ciTimeoutMs (default: 600,000 ms / 10 min)
 *     - merge: config.mergeTimeoutMs (default: 1,800,000 ms / 30 min)
 *     - human / unknown: 300,000 ms safe fallback
 * @example resolveStageTimeout({ type: 'agent' }, 'agent', undefined, { agentTimeoutMs: 60000 }) => 60000
 * @param {Object} [stage] - Stage configuration object.
 * @param {string} [stageType] - Stage type ('agent', 'ci', 'merge', etc.).
 * @param {Object} [cfg=config] - Config object.
 * @param {Object} [project] - Project carrying optional per-type timeout overrides.
 * @returns {number} Wall-clock timeout in milliseconds.
 ***/
export function resolveStageTimeout(stage, stageType, cfg = config, project) {
	if (
		stage?.timeout !== undefined &&
		stage?.timeout !== null &&
		stage?.timeout !== ""
	) {
		const parsed = Number(stage.timeout);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}

	// Raw lowercase comparison (not normalizeStageType) is deliberate here:
	// legacy aliases `review`/`script` are mapped explicitly below, while
	// `human` and unknown types keep the 300000 ms safe fallback. Routing
	// through normalizeStageType would collapse unknown → agent and change
	// the fallback contract locked by characterization tests.
	const normalizedType = String(
		stageType || resolveEffectiveStageType(stage) || "agent",
	).toLowerCase();
	const projectTimeout = resolveProjectTimeout(project, normalizedType);
	if (projectTimeout !== undefined) {
		return projectTimeout;
	}
	if (normalizedType === "agent" || normalizedType === "review") {
		return cfg?.agentTimeoutMs ?? 1800000;
	}
	// Legacy alias: the removed `deploy` type reads as `ci` (a deploy
	// command is an ordinary ci stage with the CI budget).
	if (normalizedType === "ci" || normalizedType === "script" || normalizedType === "deploy") {
		return cfg?.ciTimeoutMs ?? 600000;
	}
	if (normalizedType === "merge") {
		return cfg?.mergeTimeoutMs ?? 1800000;
	}
	return 300000;
}

/***
 * MARK: resolveProjectTimeout
 * @description Reads a project's per-type timeout override (agentTimeoutMs,
 *   ciTimeoutMs, mergeTimeoutMs): review stages share the
 *   agent timeout and legacy script stages share the CI timeout, mirroring
 *   the global fallback mapping. Non-positive or non-numeric values fall
 *   through (undefined) so invalid input can never shorten a stage to zero.
 * @example resolveProjectTimeout({ ciTimeoutMs: 5000 }, 'ci') => 5000
 * @example resolveProjectTimeout({ agentTimeoutMs: 0 }, 'agent') => undefined
 * @param {Object} [project] - Project carrying optional timeout overrides.
 * @param {string} [normalizedType] - Lowercased stage type.
 * @returns {number|undefined} Positive timeout in ms, or undefined to fall through.
 ***/
export function resolveProjectTimeout(project, normalizedType) {
	if (!project || typeof project !== "object") return undefined;
	const key =
		normalizedType === "agent" || normalizedType === "review"
			? "agentTimeoutMs"
			: normalizedType === "ci" || normalizedType === "script"
				? "ciTimeoutMs"
				: normalizedType === "merge"
						? "mergeTimeoutMs"
						: null;
	if (!key) return undefined;
	/* eslint-disable-next-line security/detect-object-injection -- key comes from the fixed type-to-field mapping above */
	const raw = project[key];
	if (raw === undefined || raw === null || raw === "") return undefined;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return Math.floor(parsed);
}

/***
 * MARK: isAutomatedStage
 * @description Whether a stage type is fully scripted (no model runs): `ci`
 *   (absorbs legacy `script` and the removed `deploy` type) or `merge`.
 *   Mirrors the frontend `isAutomatedStage` predicate in
 *   `frontend/src/components/stageTypes.js`; normalization goes through the
 *   single `normalizeStageType` source of truth so legacy types classify
 *   identically everywhere. Unknown/empty types default to `agent`
 *   (fail-visible: monitor pills shown, never silently hidden). A ci stage
 *   whose command runs the deploy script classifies here as automated via
 *   `ci` — no separate arm.
 * @example isAutomatedStage('merge') => true
 * @example isAutomatedStage('agent') => false
 * @param {string} [type] - Stage type value.
 * @returns {boolean} True for ci/merge stages.
 ***/
export function isAutomatedStage(type) {
	if (!type || typeof type !== "string") return false;
	const normalized = normalizeStageType(type);
	return normalized === "ci" || normalized === "merge";
}

/***
 * MARK: resolveStageLabel
 * @description Resolves the human-readable label for a stage reference (id or
 *   name). Matches by stage id first, then case-insensitively by stage name,
 *   and returns the stage's display name when found. Falls back to the
 *   reference itself when no stage matches (or no stages are available), and
 *   to 'unknown' when the reference is empty. Used so history/timeline entries
 *   record stage names, which stay meaningful even after stages are renamed,
 *   reordered, inserted, or deleted.
 * @example resolveStageLabel('1', [{ id: '1', name: 'Idea' }]) => 'Idea'
 * @example resolveStageLabel('idea', [{ id: '1', name: 'Idea' }]) => 'Idea'
 * @example resolveStageLabel('42', [{ id: '1', name: 'Idea' }]) => '42'
 * @example resolveStageLabel('', [{ id: '1', name: 'Idea' }]) => 'unknown'
 * @example resolveStageLabel('1', []) => '1'
 * @param {string} [stageRef] - Stage id or name to resolve.
 * @param {Array<Object>} [stages=[]] - The workflow's stages.
 * @returns {string} Human-readable stage label (stage name when resolvable).
 ***/
export function resolveStageLabel(stageRef, stages = []) {
	const ref =
		stageRef === undefined || stageRef === null ? "" : String(stageRef).trim();
	if (!ref) return "unknown";
	if (Array.isArray(stages)) {
		const match = stages.find(
			(s) =>
				String(s?.id) === ref ||
				(s?.name && String(s.name).toLowerCase() === ref.toLowerCase()),
		);
		if (match?.name) return match.name;
	}
	return ref;
}

/***
 * MARK: resolveStage
 * @description Picks the stage a task lands in: an explicit stageId, else
 *   the project's current stage, else the first stage, else a safe fallback.
 * @example resolveStage(project, '2') => { id: '2', name: 'Plan', ... }
 * @param {Object|undefined} project
 * @param {string|undefined} stageId
 * @returns {Object} The resolved stage.
 ***/
export function resolveStage(project, stageId) {
	if (stageId && Array.isArray(project?.stages)) {
		const found = project.stages.find(
			(s) =>
				String(s.id) === String(stageId) ||
				(s.name && String(s.name).toLowerCase() === String(stageId).toLowerCase()),
		);
		if (found) return found;
	}
	return (
		project?.stages?.[0] ||
		(Array.isArray(project?.stages) &&
			project.stages.find(
				(s) => String(s.id) === String(project.currentStageId),
			)) || {
			id: "initial-step",
			name: "Initial Step",
			prompt: "Execute the task",
			type: "agent",
		}
	);
}

