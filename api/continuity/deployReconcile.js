// Domain: KainBain self-deploy continuity — implementation-specific.
//
// This module owns the cross-restart deploy continuity that protects
// KainBain during its own redeploy: deploy attempt checkpoints, the
// production deploy lock deferral, `last-result.json` reconciliation, and
// the once-only park/failback decisions for deploy interruptions.
//
// It is intentionally OUTSIDE the generic pipeline (`api/flow`). Generic
// code never imports this module; it runs only when the KainBain
// self-deploy plugin (`./kainbainSelfDeploy.js`) is installed, which happens
// only when `KAINBAIN_SELF_DEPLOY_CONTINUITY=1`. A deploy-command stage is
// an ordinary CI stage to the generic engine — this module re-attaches the
// self-deploy semantics for this implementation only.
//
// This module MAY import generic flow helpers; generic flow MUST NOT import
// this module.
import { _appendProcessLog, AUTO_REPORT_MARKER } from "../watch/index.js";
import { stageElapsedSeconds } from "../flow/stagePolicy.js";
import {
	resolveCandidateStage,
	resolveStagesForTask,
} from "../flow/stageResolution.js";
import {
	autoResumeTask,
	collectResumeEvidence,
	hasRehydrationMarkers,
} from "../flow/taskScheduler.js";
import {
	DEPLOY_CHECKPOINT_FRESH_MS,
	findDeployCheckpointByOperationKey,
	isDeployAttemptInFlight,
	isDeployCheckpointFresh,
	isDeployCommand,
	isDeployResultNewerThanEntry,
	readDeployAttemptCheckpoint,
	readDeployEntryBuild,
	resolveDeployBaseSha,
	resolveDeployOperationKey,
} from "./deployMarkers.js";
import {
	attachDeployFailureFields,
	deployFailureReasonText,
	resolveDeployFailureContext,
} from "./deployStageFailure.js";

/***
 * MARK: isContinuityDeployStage
 * @description Implementation-owned deploy detection: an explicitly-marked
 *   legacy `deploy`-typed stage, or any stage whose command runs the deploy
 *   script. The generic pipeline MUST NOT use this — to the generic engine
 *   a deploy-command stage is an ordinary ci stage. Only the KainBain
 *   self-deploy continuity plugin matches on command text.
 * @example isContinuityDeployStage({ type: 'ci', command: './deploy.sh --prod' }) => true
 * @param {Object} [stage]
 * @returns {boolean}
 ***/
export function isContinuityDeployStage(stage) {
	if (!stage || typeof stage !== "object") return false;
	if (String(stage.type || "").trim().toLowerCase() === "deploy") return true;
	return isDeployCommand(stage.command ?? stage.script);
}

/***
 * MARK: hasContinuityRehydrationMarkers
 * @description Continuity-owned rehydration proof: the generic merge markers
 *   plus the deploy entry markers (`deployBuildAtEntry` / `deployAttemptId`)
 *   that the generic engine no longer reads.
 * @param {Object} task
 * @returns {boolean}
 ***/
export function hasContinuityRehydrationMarkers(task) {
	try {
		if (hasRehydrationMarkers(task)) return true;
		if (
			task?.deployBuildAtEntry !== undefined &&
			task?.deployBuildAtEntry !== null
		) {
			return true;
		}
		return (
			typeof task?.deployAttemptId === "string" &&
			task.deployAttemptId.trim() !== ""
		);
	} catch {
		return false;
	}
}

/***
 * MARK: collectContinuityResumeEvidence
 * @description Generic resume evidence plus the deploy entry markers, so the
 *   continuity reconcile message can name what it resumed from.
 * @param {Object} store
 * @param {Object} task
 * @param {string} [verdict]
 * @returns {{ markers: Array<string>, shas: Object, lastResultAgeMs: (number|null), verdict: string }}
 ***/
export function collectContinuityResumeEvidence(
	store,
	task,
	verdict = "auto-resumed",
) {
	const evidence = collectResumeEvidence(store, task, verdict);
	const markers = [...(evidence?.markers || [])];
	try {
		if (
			task?.deployBuildAtEntry !== undefined &&
			task?.deployBuildAtEntry !== null &&
			!markers.includes("deployBuildAtEntry")
		) {
			markers.push("deployBuildAtEntry");
		}
		if (
			typeof task?.deployAttemptId === "string" &&
			task.deployAttemptId.trim() &&
			!markers.includes("deployAttemptId")
		) {
			markers.push("deployAttemptId");
		}
	} catch {
		// Marker reads are best-effort.
	}
	return { ...evidence, markers };
}

/***
 * MARK: recordContinuityStageEntry
 * @description Entry hook for the self-deploy continuity plugin: when a
 *   command stage enters and it is a continuity deploy stage, records the
 *   per-attempt entry markers on the task (`deployBuildAtEntry`,
 *   `deployAttemptId`, `deployOperationKey`) and contributes the attempt
 *   environment for the child. A re-dispatch of the same stage attempt
 *   reuses the recorded ids so the deploy script recognises its own
 *   per-attempt checkpoint instead of starting a second full deploy; only a
 *   stage attempt with no id yet mints a fresh one. Non-deploy stages
 *   resolve to null (no markers, no environment). Never throws.
 * @example await recordContinuityStageEntry(store, { projectId: 'p', taskId: 't', stage: { type: 'ci', command: './deploy.sh --prod' } }) => { env: { KAINBAIN_DEPLOY_ATTEMPT_ID: '…' } }
 * @param {Object} store
 * @param {Object} [args]
 * @returns {Promise<{ env: Object }|null>}
 ***/
export async function recordContinuityStageEntry(
	store,
	{ projectId, taskId, stage, cwd } = {},
) {
	try {
		if (!isContinuityDeployStage(stage)) return null;
		const task = store?.getTask?.(projectId, taskId);
		if (!task) return null;
		const entryBuild = readDeployEntryBuild(store);
		const recordedAttempt =
			typeof task.deployAttemptId === "string" ? task.deployAttemptId.trim() : "";
		const attemptId =
			recordedAttempt || `deploy-${String(taskId).slice(0, 8)}-${Date.now()}`;
		const operationKey = resolveDeployOperationKey(task, {
			taskId,
			preMergeMainSha: resolveDeployBaseSha(task),
			command: stage.command || stage.script || "",
		});
		try {
			store.updateTask?.(
				projectId,
				taskId,
				{
					deployBuildAtEntry: entryBuild,
					deployAttemptId: attemptId,
					deployOperationKey: operationKey,
				},
				cwd,
			);
		} catch {
			// Marker persistence is best-effort; the env below still flows.
		}
		const env = {};
		if (attemptId) env.KAINBAIN_DEPLOY_ATTEMPT_ID = attemptId;
		if (operationKey) env.KAINBAIN_DEPLOY_OPERATION_KEY = operationKey;
		return { env };
	} catch {
		return null;
	}
}

/***
 * MARK: DEPLOY_LOCK_WAIT_NOTE_INTERVAL_MS
 * @description Minimum gap between "waiting for deploy lock" notes on the
 *   same task. The deferral check runs every scheduler tick (seconds), but
 *   the task history must not gain an entry per tick.
 ***/
export const DEPLOY_LOCK_WAIT_NOTE_INTERVAL_MS = 120000;

/***
 * MARK: isDeployDispatchBlocked
 * @description Whether a deploy-like stage dispatch must wait instead of
 *   running now. Blocked when a sibling task in the same project already
 *   holds a live deploy/merge run, or when the production deploy lock on
 *   disk is held by any process (a foreign engine instance or a manual
 *   `./deploy.sh` run — the single-active queue cannot see those). Total
 *   (never throws): a missing probe reads as unblocked so dispatch falls
 *   back to `deploy.sh`'s own blocking wait.
 * @example isDeployDispatchBlocked(store, { projectId: 'p1', taskId: 't1', stage }) => { blocked: false, reason: '' }
 * @param {Object} store - Task store (projectStore, listTasks, deployManager).
 * @param {Object} [args]
 * @param {string} [args.projectId] - Project the candidate belongs to.
 * @param {string} [args.taskId] - Candidate task id (never blocks itself).
 * @param {Object} [args.stage] - Resolved candidate stage.
 * @returns {{ blocked: boolean, reason: string }}
 ***/
export function isDeployDispatchBlocked(store, { projectId, taskId, stage } = {}) {
	try {
		if (!stage || !isContinuityDeployStage(stage)) return { blocked: false, reason: "" };
		try {
			const project = store?.projectStore?.getProject?.(projectId);
			const siblings = store?.listTasks?.(projectId, project?.cwd) || [];
			for (const sibling of siblings) {
				if (!sibling || sibling.id === taskId) continue;
				const status = String(sibling.status || "");
				if (status === "running_deploy" || status === "running_merge") {
					return {
						blocked: true,
						reason: `task ${String(sibling.id).slice(0, 8)} holds a live ${status} run`,
					};
				}
			}
		} catch {
			// Sibling scan failure degrades to the lock probe below.
		}
		try {
			if (store?.deployManager?.isDeployLocked?.() === true) {
				return {
					blocked: true,
					reason: "the production deploy lock is held by another process",
				};
			}
		} catch {
			// Probe failure reads as unblocked (fail-open by design).
		}
		return { blocked: false, reason: "" };
	} catch {
		return { blocked: false, reason: "" };
	}
}

/***
 * MARK: noteDeployLockWait
 * @description Records a throttled "waiting for deploy lock" note on a
 *   deferred task (history entry + process log, at most one per
 *   DEPLOY_LOCK_WAIT_NOTE_INTERVAL_MS). The task stays `in_stage` (or
 *   `interrupted` for a Rule-0 candidate): it waits without failing, and
 *   the next scheduler tick retries the dispatch. Best-effort persistence:
 *   a store without markdown helpers still gets the in-memory note.
 * @param {Object} store - Task store.
 * @param {Object} task - Deferred task (mutated in place).
 * @param {string} [projectCwd] - Project cwd for markdown persistence.
 * @param {string} [reason] - Why the dispatch is blocked.
 ***/
export function noteDeployLockWait(store, task, projectCwd, reason = "") {
	try {
		if (!task || typeof task !== "object") return;
		const now = Date.now();
		const last = Number(task.deployLockWaitLoggedAt || 0);
		if (Number.isFinite(last) && now - last < DEPLOY_LOCK_WAIT_NOTE_INTERVAL_MS) {
			return;
		}
		task.deployLockWaitLoggedAt = now;
		const detail = reason
			? `Waiting for the production deploy lock (${reason}) — dispatch deferred, task not failed`
			: "Waiting for the production deploy lock — dispatch deferred, task not failed";
		if (!Array.isArray(task.history)) task.history = [];
		task.history.push({
			timestamp: new Date(now).toISOString(),
			action: detail,
		});
		_appendProcessLog(task, `[DEPLOY] ${detail}`);
		try {
			const cwd =
				typeof store?._resolveProjectCwd === "function"
					? store._resolveProjectCwd(task.projectId, projectCwd)
					: projectCwd;
			store?._saveTaskMarkdown?.(cwd, task);
		} catch {
			// Persistence is best-effort; the in-memory note stands.
		}
	} catch {
		// Noting must never fail a dispatch decision.
	}
}


/***
 * MARK: isLockContentionResult
 * @description Whether a durable deploy result describes lock contention by
 *   a WAITER rather than a real deploy attempt. Pre-fix `deploy.sh` wrote
 *   `write_result "failed"` ("Another deployment is already in progress",
 *   `failedCommand: "flock"`) on lock-busy aborts, clobbering the real
 *   holder's outcome in `last-result.json`. Such records are contention
 *   noise: reconciliation must ignore them instead of parking tasks FAILED
 *   on evidence no deploy ever ran. Post-fix waiters write a `lock-busy`
 *   sidecar that reconciliation never reads, so this predicate only fires
 *   on legacy clobbered records.
 * @example isLockContentionResult({ status: 'failed', failedCommand: 'flock', message: 'Another deployment is already in progress' }) => true
 * @param {Object} [lastResult] - Durable result from `last-result.json`.
 * @returns {boolean}
 ***/
export function isLockContentionResult(lastResult) {
	try {
		if (!lastResult || typeof lastResult !== "object") return false;
		if (String(lastResult.status || "").toLowerCase() !== "failed") return false;
		if (String(lastResult.failedCommand || "").toLowerCase() !== "flock") return false;
		return /already in progress/i.test(String(lastResult.message || ""));
	} catch {
		return false;
	}
}

/***
 * MARK: hasDeployAttemptWaitMarker
 * @description Whether the task is parked waiting for its own in-flight
 *   deploy. `reconcileInterruptedDeploys` sets
 *   `task.deployAttemptInFlightNoted` while this attempt's per-attempt
 *   checkpoint shows a live deploy process, and Rule 0 must not re-dispatch
 *   the stage during that window — that second dispatch is the resume loop.
 *   Cleared by reconcile once the deploy settles (or its process is gone) and
 *   by `completeDeployStage` on advance. Total on untrusted input.
 * @param {Object} task
 * @returns {boolean}
 ***/
export function hasDeployAttemptWaitMarker(task) {
	try {
		if (!task || typeof task !== "object") return false;
		const marker = task.deployAttemptInFlightNoted;
		if (marker === true) return true;
		return typeof marker === "string" && marker.trim() !== "";
	} catch {
		return false;
	}
}

/***


/***
 * MARK: completeDeployStage
 * @description Marks an interrupted deploy stage as passed (using the durable deploy result)
 * and advances the task, without re-running the deploy.
 ***/
export function completeDeployStage(
	store,
	projectId,
	taskId,
	stage,
	stages,
	projectCwd,
	lastResult,
) {
	const task = store.getTask(projectId, taskId);
	if (!task || !lastResult || typeof lastResult !== "object") return null;
	const cwd =
		typeof store._resolveProjectCwd === "function"
			? store._resolveProjectCwd(projectId, projectCwd)
			: projectCwd;

	task.status = "in_stage";
	task.wasInterrupted = false;
	task.updatedAt = new Date().toISOString();
	// Consume the single-attempt deploy markers exactly like the in-stage pass
	// path (runCommandStage) does. They attribute ONE attempt's durable result
	// to this stage; leaving them set would let a later deploy-like stage reuse
	// the attempt id and adopt THIS attempt's success checkpoint without
	// deploying. `reviewBaseline.mergedAt` (the no-rewind landed marker) is
	// deliberately untouched.
	delete task.deployAttemptId;
	delete task.deployBuildAtEntry;
	delete task.deployOperationKey;
	delete task.deployAttemptInFlightNoted;
	delete task.continuityHold;
	// Mirror the merge-kind pass path too: the reconcile path advances the
	// stage without ever running `runCommandStage`, so the merge rehydration
	// markers must be consumed here as well or they would misreport a later
	// interruption at a different stage as rehydratable. `reviewBaseline`
	// (the landed no-rewind marker) is deliberately untouched.
	if (String(stage?.type || "").toLowerCase() === "merge") {
		delete task.mergeAttemptId;
		delete task.preMergeMainSha;
	}
	// Fail-safe: a task file without a history array (hand-edited or
	// pre-schema) must still reconcile instead of throwing mid-flip and
	// leaving a half-applied state for the per-task catch to park.
	if (!Array.isArray(task.history)) task.history = [];
	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Deploy completed successfully (build ${lastResult.buildNumber}) — reconciled after server restart`,
	});
	_appendProcessLog(
		task,
		`[DEPLOY] Deploy succeeded (build ${lastResult.buildNumber}) — reconciled after restart`,
	);
	if (typeof store._saveTaskMarkdown === "function") {
		store._saveTaskMarkdown(cwd, task);
	}

	store.saveStageReport(projectId, taskId, {
		stageName: stage?.name || stage?.id || "Deploy",
		stageId: stage?.id,
		duration: stageElapsedSeconds(
			task,
			Date.parse(lastResult.finishedAt) || Date.now(),
		),
		status: "PASSED",
		content: [
			AUTO_REPORT_MARKER,
			`# Deploy Stage Report: ${stage?.name || stage?.id}`,
			"**Status:** PASSED (reconciled after server restart)",
			`**Build:** ${lastResult.buildNumber}`,
			`**Finished:** ${lastResult.finishedAt}`,
			`**Message:** ${lastResult.message || ""}`,
		].join("\n"),
		projectCwd: cwd,
	});

	store.advanceStage(projectId, taskId, stages, store.eventBridge, cwd);
	return store.getTask(projectId, taskId) || task;
}

/***
 * MARK: isRolledBackResult
 * @description Whether a durable deploy result proves the deploy was rolled
 *   back (`.prev` restore): such a task must fail back with evidence, never
 *   resume — re-running the stage would re-deploy over a deliberate restore.
 *   Total on untrusted input.
 * @param {Object} [lastResult] - Durable result from `last-result.json`.
 * @returns {boolean}
 * @example isRolledBackResult({ status: "rolled-back" }) => true
 ***/
export function isRolledBackResult(lastResult) {
	try {
		if (!lastResult || typeof lastResult !== "object") return false;
		const status = String(lastResult.status || "").toLowerCase();
		if (status === "rolled-back" || status === "rolled_back") return true;
		if (lastResult.rolledBack === true) return true;
		return false;
	} catch {
		return false;
	}
}

/***
 * MARK: DEPLOY_RECONCILE_PARK_REASON
 * @description Canonical history line for a markerless deploy/merge
 *   interruption parked by reconciliation. A single constant (not an inline
 *   string) so the recorded reason and the once-only dedup check can never
 *   drift apart.
 ***/
export const DEPLOY_RECONCILE_PARK_REASON =
	"Deploy reconcile parked: no rehydration markers and no fresh last-result.json — pre-WP6 task or unknown stage attempt, needs operator resume";

/***
 * MARK: DEPLOY_ATTEMPT_IN_FLIGHT_REASON
 * @description Canonical history line for a deploy-like interruption whose
 *   per-attempt checkpoint proves the deploy is still running. A single
 *   constant so the recorded reason and the once-only dedup cannot drift.
 ***/
export const DEPLOY_ATTEMPT_IN_FLIGHT_REASON =
	"Deploy reconcile parked: this attempt's deploy is still in flight (live attempt checkpoint) — waiting for its durable result instead of re-running the merge/deploy stage";

/***
 * MARK: noteDeployAttemptInFlight
 * @description Records the explained "waiting for the in-flight deploy"
 *   park AT MOST ONCE per attempt id. `reconcileInterruptedDeploys` runs on
 *   every scheduler tick (~3s), so an unguarded write would append history
 *   and rewrite the task file forever. Dedup is layered: an in-process
 *   marker on the task (cheap) plus a persisted history scan (survives
 *   restarts). Best-effort: a store without markdown helpers still parks.
 * @param {Object} store
 * @param {Object} task
 * @param {string} [cwd]
 * @param {Object} [args]
 * @param {string} [args.attemptId]
 * @param {number} [args.pid]
 * @returns {boolean} Whether this call recorded the reason.
 ***/
export function noteDeployAttemptInFlight(store, task, cwd, { attemptId = "", pid } = {}) {
	try {
		if (!task || typeof task !== "object") return false;
		const key = String(attemptId || "");
		if (key && task.deployAttemptInFlightNoted === key) return false;
		// The action string embeds the attempt id because markdown persistence
		// stores ONLY `timestamp` + `action` — so the restart-surviving dedup
		// must be readable from the action line itself.
		const action = key
			? `${DEPLOY_ATTEMPT_IN_FLIGHT_REASON} (attempt ${key})`
			: DEPLOY_ATTEMPT_IN_FLIGHT_REASON;
		const alreadyRecorded =
			Array.isArray(task.history) &&
			task.history.some((entry) => {
				const recorded = String(entry?.action || "");
				if (!recorded.startsWith(DEPLOY_ATTEMPT_IN_FLIGHT_REASON)) return false;
				return key ? recorded.includes(key) : true;
			});
		if (alreadyRecorded) {
			if (key) task.deployAttemptInFlightNoted = key;
			// Re-assert the generic hold on every pass: it is in-memory only
			// (frontmatter persists the markers, not the hold) and
			// reconciliation always runs before Rule 0, so the hold is fresh
			// whenever Rule 0 reads it.
			task.continuityHold = key || true;
			return false;
		}
		if (key) task.deployAttemptInFlightNoted = key;
		task.continuityHold = key || true;
		if (!Array.isArray(task.history)) task.history = [];
		// History entries carry ONLY `timestamp` + `action` (the codebase
		// convention — see `noteDeployLockWait`): markdown persistence drops
		// anything else, so extra fields would be phantom data that vanishes
		// on reload. Attempt id and pid travel in the action/process-log lines.
		task.history.push({
			timestamp: new Date().toISOString(),
			action,
		});
		let attemptDetail = "";
		if (key) {
			attemptDetail = pid ? ` (attempt ${key}, pid ${pid})` : ` (attempt ${key})`;
		}
		_appendProcessLog(
			task,
			`[DEPLOY] ${DEPLOY_ATTEMPT_IN_FLIGHT_REASON}${attemptDetail}`,
		);
		const resolveCwd =
			typeof store?._resolveProjectCwd === "function"
				? store._resolveProjectCwd(task.projectId, cwd)
				: cwd;
		store?._saveTaskMarkdown?.(resolveCwd, task);
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: noteDeployReconcileParked
 * @description Records the explained park for a markerless deploy/merge
 *   interruption AT MOST ONCE. `reconcileInterruptedDeploys` runs on every
 *   scheduler tick (~3s), so an unguarded history write here would append a
 *   reason and rewrite the task file forever. Idempotency is two-layered: an
 *   in-process flag on the task (cheap, survives a re-scan) plus a history
 *   check that survives restarts (the history entry is persisted in the
 *   task frontmatter). Best-effort: a store without markdown/history helpers
 *   still parks the task. Returns whether this call recorded the reason.
 * @param {Object} store
 * @param {Object} task
 * @param {string} [cwd]
 * @returns {boolean}
 ***/
export function noteDeployReconcileParked(store, task, cwd) {
	try {
		if (!task || typeof task !== "object") return false;
		if (task.deployReconcileParked === true) return false;
		if (
			Array.isArray(task.history) &&
			task.history.some(
				(entry) => entry?.action === DEPLOY_RECONCILE_PARK_REASON,
			)
		) {
			task.deployReconcileParked = true;
			return false;
		}
		task.deployReconcileParked = true;
		store?._recordHistory?.(
			task,
			DEPLOY_RECONCILE_PARK_REASON,
			new Date().toISOString(),
		);
		store?._saveTaskMarkdown?.(cwd, task);
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: reconcileInterruptedDeploys
 * @description Reconciles tasks that were interrupted while running a deploy
 *   stage — a ci stage whose command runs `./deploy.sh` (matched by command;
 *   legacy `deploy`-typed stage objects still match too). A deploy restarts the very
 *   service that ran the stage, so the task is found as `interrupted` (or
 *   still `running_deploy` / `running_merge` when the crash beat the
 *   shutdown hook) with a durable `last-result.json` marker on disk. A
 *   result newer than the stage entry (by timestamp, or by a build number
 *   past `deployBuildAtEntry`) proves the deploy ran for THIS stage attempt:
 *   success advances the task without re-running the deploy; failure parks
 *   the deploy stage with the durable deploy cause (a landed merge on a
 *   legacy composite stage keeps `skipFailback` — merged work is never
 *   rewound to "In Progress").
 *
 *   Decision table (WP6 — no permanent `interrupted` parking for marked stages):
 *     - result fresh for THIS attempt + success → advance without re-running;
 *     - result fresh + failure → park/failback with evidence (landed merges
 *       keep `skipFailback`);
 *     - result rolled-back → failback with evidence, never resume;
 *     - result missing/stale BUT rehydration markers present → resume under
 *       Rule 0 (deploy re-runs flock-serialized idempotent `deploy.sh`;
 *       merge re-enters idempotently via landed-state re-derivation);
 *     - no markers at all (pre-WP6 task file) → stays `interrupted`, WITH a
 *       recorded reason instead of a silent park.
 ***/

/***
 * MARK: buildParkedDeployFailureError
 * @description Builds the parked error for a reconciled deploy/merge failure
 *   with the SAME enrichment as the live path: the durable cause
 *   (`resolveDeployFailureContext`) and the structured alert fields
 *   (project blocker, gate, failed command, attempt id). A prod deploy
 *   restarts the API, so a failure that settles around a restart must not
 *   degrade to a bare "exit 1" with no runbook pointer. Total: any failure
 *   while enriching falls back to the plain message.
 * @example await buildParkedDeployFailureError(store, { project, task, stage, exitCode: 1, message: 'Gate …' }) => Error
 * @param {Object} store
 * @param {Object} args - `{ project, task, stage, exitCode, message }`.
 * @returns {Promise<Error>}
 ***/
async function buildParkedDeployFailureError(
	store,
	{ project, task, stage, exitCode = 1, message = "" } = {},
) {
	const base = message || "Deploy failed";
	try {
		const context = await resolveDeployFailureContext(store, {
			task,
			stage,
			exitCode,
			command: stage?.command || stage?.script || "",
			cwd: project?.cwd || "",
		});
		const reasonText = deployFailureReasonText(context);
		const error = new Error(reasonText ? `${base}\n\n${reasonText}` : base);
		return attachDeployFailureFields(error, context);
	} catch {
		return new Error(base);
	}
}

export async function reconcileInterruptedDeploys(store) {
	if (!store.deployManager) return [];
	const projects =
		store.projectStore && typeof store.projectStore.listProjects === "function"
			? store.projectStore.listProjects()
			: [];
	const reconciled = [];

	for (const project of projects) {
		const tasks = store.listTasks(project.id, project.cwd);
		for (const task of tasks) {
			if (
				task.status !== "interrupted" &&
				task.status !== "running_deploy" &&
				task.status !== "running_merge"
			) {
				continue;
			}

			// Fail-safe: one unreadable task must never block the rest.
			// A per-task failure is recorded in history and reconciliation
			// continues with the next task.
			try {
				const stages = resolveStagesForTask(project, task);
				// Same id-then-name resolution as every other scan, so a
				// task parked under its stage name is still recognised here
				// (and never mistaken for auto-resumable work below).
				const stage = resolveCandidateStage(stages, task.currentStageId);
				if (!stage) continue;

				if (!isContinuityDeployStage(stage)) continue;

				const stageType = String(stage?.type || "agent").toLowerCase();
				const isMergeStage = stageType === "merge";
				// A reconciled deploy failure must park on its own stage, never
				// fail back and auto-retry: post-split the deploy stage's failback
				// target is the git-only merge stage, so a failback would re-enter
				// the merge (idempotent pass) and re-run the full production deploy
				// on every auto-iteration. A legacy composite merge stage keeps its
				// unconditional park (a deploy result implies its merge landed).
				const parkDeployFailure =
					isMergeStage;

				let lastResult = null;
				try {
					lastResult = store.deployManager.readJson("last-result.json");
				} catch {
					lastResult = null;
				}
				const hasResult = Boolean(lastResult && lastResult.startedAt);

				// Lock-contention noise is never deploy evidence: a waiter
				// record (pre-fix `failed`/`flock` clobber, or any future
				// shape the predicate recognises) proves no deploy ran for
				// this attempt, so it must neither advance nor park the task.
				// Silent by design: this scan runs every scheduler tick.
				if (hasResult && isLockContentionResult(lastResult)) {
					continue;
				}

				// Per-attempt checkpoint (written by deploy.sh): the durable fact
				// `last-result.json` alone cannot express, and the MOST precise
				// evidence available because it is scoped to THIS stage attempt
				// rather than the host-wide last result. An in-flight deploy for
				// this attempt therefore WINS over any `last-result.json`
				// attribution: a genuine retry reuses the attempt id, so the
				// previous attempt's terminal `failed` result can still match the
				// id and must not fail the task while the retry is demonstrably
				// running. A `running` status whose process is alive — or whose
				// `updatedAt` was refreshed within DEPLOY_CHECKPOINT_FRESH_MS by
				// the deploy's heartbeat ticker — means the detached deploy
				// survived the restart and is about to write its own result:
				// WAIT (park once, explained) instead of re-dispatching, because
				// a re-dispatched merge stage starts a SECOND full deploy and
				// restarts the service again — the resume loop.
				const attemptId =
					typeof task.deployAttemptId === "string"
						? task.deployAttemptId.trim()
						: "";
				const checkpoint = readDeployAttemptCheckpoint(store, attemptId);
				if (
					checkpoint &&
					String(checkpoint.status || "").toLowerCase() === "running" &&
					(isDeployAttemptInFlight(store, checkpoint) ||
						isDeployCheckpointFresh(checkpoint))
				) {
					noteDeployAttemptInFlight(store, task, project.cwd, {
						attemptId,
						pid: Number(checkpoint.pid),
					});
					continue;
				}
				// Operation-key backstop (C5): when the per-dispatch attempt
				// id was lost (markers cleared, watchdog race) the
				// re-dispatch minted a fresh id that addresses no checkpoint
				// — but the operation key is stable across re-dispatches, so
				// a still-running deploy for THIS operation is found anyway
				// and waited on instead of duplicated. Only the `running`
				// wait adopts here: terminal outcomes keep the last-result
				// attribution below, so a genuine retry after a real gate
				// failure still re-runs.
				const operationKey =
					typeof task.deployOperationKey === "string"
						? task.deployOperationKey.trim()
						: "";
				if (!checkpoint && operationKey) {
					const opCheckpoint = findDeployCheckpointByOperationKey(store, operationKey);
					if (
						opCheckpoint &&
						String(opCheckpoint.status || "").toLowerCase() === "running" &&
						(isDeployAttemptInFlight(store, opCheckpoint) ||
							isDeployCheckpointFresh(opCheckpoint))
					) {
						noteDeployAttemptInFlight(store, task, project.cwd, {
							attemptId:
								opCheckpoint.attemptId || opCheckpoint.deployAttemptId || attemptId,
							pid: Number(opCheckpoint.pid),
						});
						continue;
					}
				}

				const fresh =
					hasResult && isDeployResultNewerThanEntry({ task, lastResult });
				if (fresh) {
					if (lastResult.status === "success" || lastResult.status === "deploying") {
						completeDeployStage(
							store,
							project.id,
							task.id,
							stage,
							stages,
							project.cwd,
							lastResult,
						);
					} else if (isRolledBackResult(lastResult)) {
						// A rolled-back deploy proves a deliberate `.prev`
						// restore: fail back with evidence, never resume. A
						// landed merge keeps `skipFailback` exactly like the
						// generic failure branch below — merged work is never
						// rewound to an earlier stage.
						store.handleStageFailure(
							project.id,
							task.id,
							stage,
							new Error(
								lastResult.message ||
									`Deploy rolled back (status: ${lastResult.status}) — restored last known-good build`,
							),
							{
								stages,
								bridge: store.eventBridge,
								projectCwd: project.cwd,
								...(parkDeployFailure ? { skipFailback: true } : {}),
							},
						);
					} else {
						// A deploy result newer than the stage entry proves the
						// deploy ran for this attempt — on a legacy composite
						// merge stage that only happens after the git merge
						// landed, so a merge-stage failure parks here instead
						// of rewinding merged work to an earlier stage. The parked
						// error carries the same cause + shared-gate attribution as
						// the live path (a prod deploy restarted the API that
						// would otherwise have explained it).
						store.handleStageFailure(
							project.id,
							task.id,
							stage,
							await buildParkedDeployFailureError(store, {
								project,
								task,
								stage,
								exitCode: lastResult.exitCode,
								message:
									lastResult.message ||
									`Deploy failed (status: ${lastResult.status})`,
							}),
							{
								stages,
								bridge: store.eventBridge,
								projectCwd: project.cwd,
								...(parkDeployFailure ? { skipFailback: true } : {}),
							},
						);
					}
					reconciled.push({ projectId: project.id, taskId: task.id });
					continue;
				}

				// A rolled-back marker is evidence even when the freshness
				// predicate cannot attribute it to this attempt (coarse
				// timestamps): it still fails back, never resumes. Landed
				// merges keep `skipFailback` (no rewind).
				if (hasResult && isRolledBackResult(lastResult)) {
					store.handleStageFailure(
						project.id,
						task.id,
						stage,
						new Error(
							lastResult.message ||
								`Deploy rolled back (status: ${lastResult.status}) — restored last known-good build`,
						),
						{
							stages,
							bridge: store.eventBridge,
							projectCwd: project.cwd,
							...(parkDeployFailure ? { skipFailback: true } : {}),
						},
					);
					reconciled.push({ projectId: project.id, taskId: task.id });
					continue;
				}

				// Remaining per-attempt checkpoint outcomes (the in-flight
				// `running` case was handled above, BEFORE the host-wide
				// `last-result.json`): a terminal status means this attempt's
				// deploy already ran — adopt its outcome without re-dispatching.
				if (checkpoint) {
					const checkpointStatus = String(checkpoint.status || "").toLowerCase();
					if (checkpointStatus === "success" || checkpointStatus === "deploying") {
						completeDeployStage(store, project.id, task.id, stage, stages, project.cwd, {
							buildNumber:
								checkpoint.buildNumber ??
								lastResult?.buildNumber ??
								task.deployBuildAtEntry,
							finishedAt:
								checkpoint.updatedAt ||
								checkpoint.startedAt ||
								new Date().toISOString(),
							message:
								checkpoint.message ||
								`Deploy attempt ${attemptId} reached '${checkpointStatus}'`,
						});
						reconciled.push({ projectId: project.id, taskId: task.id });
						continue;
					}
					if (
						checkpointStatus === "failed" ||
						checkpointStatus === "rolled-back" ||
						checkpointStatus === "rolled_back"
					) {
						store.handleStageFailure(
							project.id,
							task.id,
							stage,
							await buildParkedDeployFailureError(store, {
								project,
								task,
								stage,
								exitCode: checkpoint.exitCode,
								message:
									checkpoint.message ||
									`Deploy attempt failed (checkpoint status: ${checkpointStatus})`,
							}),
							{
								stages,
								bridge: store.eventBridge,
								projectCwd: project.cwd,
								...(parkDeployFailure ? { skipFailback: true } : {}),
							},
						);
						reconciled.push({ projectId: project.id, taskId: task.id });
						continue;
					}
					// `running` checkpoint with a dead pid AND a stale updatedAt:
					// the deploy died before writing a result — fall through
					// to the resume path.
				}

				// Missing/stale result BUT rehydration markers prove which
				// attempt was in flight: resume under Rule 0 so the stage
				// re-runs from its known-safe point. A crash that beat the
				// shutdown hook leaves `running_deploy`/`running_merge`;
				// normalise to `interrupted` first so the resume flip applies.
				if (hasContinuityRehydrationMarkers(task)) {
					if (task.status === "running_deploy" || task.status === "running_merge") {
						task.status = "interrupted";
						task.wasInterrupted = true;
						task.updatedAt = new Date().toISOString();
					}
					// Reaching here means no live deploy for this attempt (no
					// checkpoint, a checkpoint whose process is gone, or a killed
					// attempt): clear the wait marker and the generic hold so
					// Rule 0 may resume the stage. Without this the task would
					// stay parked forever.
					if (hasDeployAttemptWaitMarker(task)) {
						delete task.deployAttemptInFlightNoted;
					}
					delete task.continuityHold;
					const evidence = collectContinuityResumeEvidence(store, task, "reconcile-resume");
					const markerList =
						evidence.markers.length > 0 ? evidence.markers.join(", ") : "markers";
					try {
						store._recordHistory?.(
							task,
							`Deploy reconcile: no fresh last-result.json — resuming from ${markerList} (stage re-runs from known-safe point)`,
							new Date().toISOString(),
						);
					} catch {
						// History is best-effort; the resume still applies.
					}
					autoResumeTask(store, project.id, task.id, project.cwd, {
						reason: `reconcile-resume (${markerList})`,
					});
					reconciled.push({ projectId: project.id, taskId: task.id });
					continue;
				}

				// No markers at all (pre-WP6 task file): keep today's park,
				// but record WHY — exactly once — so the `interrupted` is an
				// explained park, not a silent one, and the per-tick scan
				// cannot spam history or rewrite the task file. Not added to
				// `reconciled` (no state was acted on).
				const parkCwd =
					typeof store._resolveProjectCwd === "function"
						? store._resolveProjectCwd(project.id, project.cwd)
						: project.cwd;
				noteDeployReconcileParked(store, task, parkCwd);
			} catch (taskError) {
				try {
					store._recordHistory?.(
						task,
						`Deploy reconciliation skipped: ${taskError?.message || taskError}`,
						new Date().toISOString(),
					);
				} catch {
					// History write is best-effort; reconciliation continues.
				}
			}
		}
	}

	return reconciled;
}
