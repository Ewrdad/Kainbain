import { git } from "../../git.js";
import {
	isValidReviewBaseline,
	shouldResetReviewBaseline,
} from "../../work/taskBranches.js";
import {
	finalizePassedCommandStage,
	isMergeLanded,
} from "../commandStages.js";
import { _appendProcessLog } from "../../watch/index.js";
import { recordReliabilitySample } from "../../watch/reliabilityShared.js";

/***
 * MARK: applyIntegrationReport
 * @description Engine-owned finish for a Runner-run integration (Step 4):
 *   the integration Runner merged `origin/<taskBranch>` into the target in
 *   an ephemeral worktree and CAS-pushed the target. The backend verifies
 *   read-only (fetch + ancestry — never a checkout, merge, or push), freezes
 *   the PR-review baseline from the reported SHAs, saves the merge report,
 *   and advances. A verification failure parks the task `failed` on the
 *   merge stage (`skipFailback`, sync-blocked diagnostic) instead of
 *   rewinding a merge that may have landed.
 * @example await applyIntegrationReport({ store, projectStore, projectId: 'p', taskId: 't', stage, stages, integration: { mergeSha: 'a', ... } }) => { advanced: true }
 * @param {Object} args - Context.
 * @param {Object} args.store - Task store.
 * @param {Object} args.projectStore - Project store.
 * @param {string} args.projectId - Project id.
 * @param {string} args.taskId - Task id.
 * @param {Object} args.stage - Resolved merge stage.
 * @param {Array} [args.stages] - Full stage list.
 * @param {Object} args.integration - Runner report (`mergeSha`, `targetBranch`, `taskBranch`, `expectedTaskSha`, `expectedTargetSha`, `mergeAttemptId`).
 * @param {string} [args.runnerId] - Reporting Runner.
 * @returns {Promise<Object>} `{ advanced, ... }`.
 ***/
export async function applyIntegrationReport({
	store,
	projectStore,
	projectId,
	taskId,
	stage,
	stages = [],
	integration,
	runnerId = null,
}) {
	const task = store.getTask(projectId, taskId);
	if (!task) {
		const err = new Error(`Task ${taskId} not found`);
		err.statusCode = 404;
		err.code = "TASK_NOT_FOUND";
		throw err;
	}
	const project = projectStore?.getProject?.(projectId);
	const cwd = project?.cwd;
	const bridge = store.eventBridge;
	const taskShortId = String(task.id).slice(0, 4).toUpperCase();
	const via = runnerId ? `via Runner ${runnerId}` : "via Runner";
	const { mergeSha, targetBranch, taskBranch, expectedTaskSha, expectedTargetSha, mergeAttemptId } = integration || {};

	const parkUnverifiable = (message, diagnostics) => {
		const err = new Error(message);
		err.gitDiagnostics = { kind: "sync-blocked", ...(diagnostics || {}) };
		_appendProcessLog(task, `[ERROR] ${message}`);
		try {
			store._saveTaskMarkdown(cwd, task);
		} catch {
			// Parking matters more than the warning.
		}
		return store.handleStageFailure(projectId, taskId, stage, err, {
			stages,
			bridge,
			projectCwd: cwd,
			skipFailback: true,
		});
	};

	if (!mergeSha || !targetBranch || !taskBranch) {
		return parkUnverifiable(
			`Integration report from ${via} is missing mergeSha/targetBranch/taskBranch — cannot verify the merge; retry the merge stage.`,
			{ taskBranch, mainBranch: targetBranch },
		);
	}

	// Idempotent re-entry: a landed marker for this stage means a duplicate
	// report (retry, resume) must not advance twice.
	if (isMergeLanded(task, { stageId: stage?.id })) {
		_appendProcessLog(task, `[MERGE] Duplicate integration report for '${taskBranch}' ignored (merge already landed ${task.reviewBaseline?.mergedAt || "previously"})`);
		try {
			store._saveTaskMarkdown(cwd, task);
		} catch {
			// Advisory only.
		}
		return { advanced: false, status: "passed", duplicate: true };
	}

	// Read-only verification: fetch, then prove the merge commit is an
	// ancestor of the remote target tip. The backend never checks out,
	// merges, or pushes here.
	let targetTip = null;
	let landed = false;
	try {
		await git(cwd, ["fetch", "origin"], { timeout: 60000 });
		targetTip = (await git(cwd, ["rev-parse", "--verify", `origin/${targetBranch}`])).stdout.trim() || null;
		if (targetTip) {
			await git(cwd, ["merge-base", "--is-ancestor", mergeSha, targetTip]);
			landed = true;
		}
	} catch {
		landed = false;
	}
	if (!landed) {
		return parkUnverifiable(
			`Integration of '${taskBranch}' reported merge ${String(mergeSha).slice(0, 7)} by ${via}, but the backend cannot find it on 'origin/${targetBranch}' (tip ${targetTip ? targetTip.slice(0, 7) : "unknown"}) — the push may not have stuck. Retry the merge stage to re-verify; a landed merge is never rewound.`,
			{ taskBranch, mainBranch: targetBranch, sourceSha: mergeSha, targetSha: targetTip },
		);
	}

	// Freeze the PR-review baseline from the reported SHAs (same shape as
	// the embedded merge path; keep-first projects keep their baseline).
	const mergedAt = new Date().toISOString();
	const existing = isValidReviewBaseline(task.reviewBaseline) ? task.reviewBaseline : null;
	if (!(existing && !shouldResetReviewBaseline(project))) {
		const baseline = {
			baseSha: expectedTargetSha || targetTip,
			headSha: expectedTaskSha || mergeSha,
			mainSha: mergeSha,
			mergedAt,
			stageId: stage?.id || null,
		};
		task.reviewBaseline = baseline;
		task.history.push({
			timestamp: mergedAt,
			action: `Recorded PR-review baseline for '${taskBranch}' at Runner-run merge into '${targetBranch}' (${String(mergeSha).slice(0, 7)})`,
		});
		if (typeof store.updateTask === "function" && task.id) {
			store.updateTask(projectId, taskId, { reviewBaseline: baseline }, cwd);
		}
	}
	task.mergeAttemptId = mergeAttemptId || task.mergeAttemptId;
	task.preMergeMainSha = expectedTargetSha || task.preMergeMainSha;
	task.pendingPushVerification = {
		sha: mergeSha,
		branch: targetBranch,
		verified: true,
		verifiedAt: mergedAt,
		verifiedBy: runnerId || "backend-fetch",
	};

	const at = Date.now();
	recordReliabilitySample(store, projectId, taskId, {
		harnessId: "integration",
		failureKind: "none",
		at,
		atRaw: new Date(at).toISOString(),
		stageId: stage?.id,
	});
	bridge?.emitSystemLog?.(
		projectId,
		`[GIT] Task #KB-${taskShortId}: Runner-run merge landed '${taskBranch}' into '${targetBranch}' (${String(mergeSha).slice(0, 7)} ${via})`,
		{ taskId },
	);

	const reportContent = [
		`# Merge Stage Report: ${stage?.name || stage?.id || "merge"}`,
		`**Task branch:** ${taskBranch}`,
		`**Main branch:** ${targetBranch}`,
		`**Status:** PASSED`,
		`**Merge SHA:** ${mergeSha}`,
		`**Landed at:** ${mergedAt}`,
		`**Integrated by:** ${via} (leased integration, ephemeral worktree)`,
	].join("\n");

	const result = await finalizePassedCommandStage(store, projectId, taskId, stage, {
		stages,
		cwd,
		bridge,
		kind: "merge",
		label: "Merge",
		reportContent,
		historyAction: `Merge stage passed: '${taskBranch}' integrated into '${targetBranch}' by ${via}`,
	});
	_appendProcessLog(task, `[MERGE] Verified Runner-run merge ${String(mergeSha).slice(0, 7)} on 'origin/${targetBranch}' and advanced`);
	try {
		store._saveTaskMarkdown(cwd, task);
	} catch {
		// Finalize already persisted what matters.
	}
	return { ...result, advanced: true, mergeSha, verified: true };
}
