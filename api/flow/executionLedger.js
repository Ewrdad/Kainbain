import { _appendProcessLog } from "../watch/index.js";
import { git } from "../git.js";

/***
 * MARK: ExecutionLedger
 * @description Backend receiving side of the Runner wire protocol (ADR 0009
 *   lifecycle steps 4–6): sequenced progress events, sequenced log frames,
 *   idempotent completion, and interruption. Every mutating call first
 *   checks the ClaimStore lease — a stale epoch is rejected before any
 *   state changes, which is what makes a partitioned zombie's late report
 *   a 409 instead of a double completion (R01). Dedupe is per execution:
 *   a retried report is a recorded no-op, never a duplicate stage (step 4).
 *   Log gaps are represented in the data ("frames missing — Runner
 *   disconnected"), never papered over (R14). Completion records the
 *   Runner's report (SHA/branch/posture) and releases the lease; stage
 *   advancement stays engine-owned until the dispatch integration lands.
 *   Monitor counters back the Phase 2 "pageable-zero" reconcile/divergence
 *   signals. In-memory for Phase 2 (same durability story as ClaimStore).
 * @example const ledger = new ExecutionLedger()
 * @param {Object} [opts] - Options.
 ***/
/***
 * MARK: ExecutionLedger
 * @description In-memory receiving side for Runner progress/logs/complete/
 *   interrupt keyed by lease. See the module block for the fencing contract.
 * @example const ledger = new ExecutionLedger(); ledger.snapshot() => { progressRecorded: 0, ... }
 ***/
export class ExecutionLedger {
	constructor() {
		this.seenProgress = new Set();
		this.logNextSeq = new Map();
		this.lastStage = new Map();
		this.counters = {
			progressRecorded: 0,
			progressDuplicates: 0,
			logFrames: 0,
			logGaps: 0,
			logDuplicates: 0,
			completions: 0,
			completionDuplicates: 0,
			staleRejected: 0,
			interrupts: 0,
			divergences: 0,
			unverifiedSha: 0,
		};
	}

	static _stale(taskId, why) {
		const err = new Error(`Stale execution for task ${taskId}: ${why}.`);
		err.statusCode = 409;
		err.code = "STALE_EPOCH";
		return err;
	}

	_holdOrThrow(claimStore, taskId, executionId, epoch) {
		const hold = claimStore.describe(taskId);
		if (
			!hold ||
			hold.executionId !== executionId ||
			hold.epoch !== epoch
		) {
			this.counters.staleRejected += 1;
			throw ExecutionLedger._stale(taskId, "epoch or execution mismatch");
		}
		return hold;
	}

	recordProgress({
		claimStore,
		taskStore,
		projectId,
		taskId,
		runnerId,
		executionId,
		epoch,
		stageId,
		event,
	}) {
		const hold = this._holdOrThrow(claimStore, taskId, executionId, epoch);
		if (hold.runnerId !== runnerId) {
			this.counters.staleRejected += 1;
			throw ExecutionLedger._stale(taskId, "lease belongs to another Runner");
		}
		if (!stageId || !event) {
			const err = new Error("progress requires stageId and event.");
			err.statusCode = 400;
			err.code = "INVALID_PROGRESS_ARGS";
			throw err;
		}
		const key = `${executionId}|${stageId}|${event}`;
		if (this.seenProgress.has(key)) {
			this.counters.progressDuplicates += 1;
			return { recorded: true, duplicate: true };
		}
		this.seenProgress.add(key);
		this.lastStage.set(executionId, stageId);
		this.counters.progressRecorded += 1;
		const task = taskStore.getTask(projectId, taskId);
		task?.history?.push({
			timestamp: new Date().toISOString(),
			action: `Runner ${runnerId} stage ${stageId}: ${event}`,
		});
		return { recorded: true, duplicate: false };
	}

	ingestLogs({
		claimStore,
		taskStore,
		projectId,
		taskId,
		runnerId,
		executionId,
		epoch,
		seq,
		bytes,
	}) {
		this._holdOrThrow(claimStore, taskId, executionId, epoch);
		if (!Number.isInteger(seq) || seq < 0 || typeof bytes !== "string") {
			const err = new Error("logs requires an integer seq and string bytes.");
			err.statusCode = 400;
			err.code = "INVALID_LOG_ARGS";
			throw err;
		}
		const next = this.logNextSeq.get(executionId) ?? 0;
		if (seq < next) {
			this.counters.logDuplicates += 1;
			return { accepted: true, duplicate: true, seq };
		}
		const task = taskStore.getTask(projectId, taskId);
		if (seq > next) {
			this.counters.logGaps += 1;
			this.counters.logFrames += 1;
			_appendProcessLog(
				task,
				`[runner ${runnerId}] logs truncated — Runner disconnected (frames ${next}–${seq - 1} missing)`,
			);
		} else {
			this.counters.logFrames += 1;
		}
		_appendProcessLog(task, `[runner ${runnerId}] ${bytes}`);
		this.logNextSeq.set(executionId, seq + 1);
		return { accepted: true, duplicate: false, seq };
	}

	async completeExecution({
		claimStore,
		taskStore,
		projectStore,
		projectId,
		taskId,
		runnerId,
		executionId,
		epoch,
		sha = null,
		branch = null,
		posture = null,
	}) {
		let outcome;
		try {
			outcome = claimStore.complete(taskId, executionId, epoch);
		} catch (err) {
			this.counters.staleRejected += 1;
			throw err;
		}
		if (outcome.duplicate) {
			this.counters.completionDuplicates += 1;
			return { accepted: true, duplicate: true };
		}
		this.counters.completions += 1;
		const task = taskStore.getTask(projectId, taskId);
		const project = projectStore?.getProject?.(projectId);

		let shaState = "absent";
		if (sha && project?.cwd && !project?.hasUpstreamRepo) {
			try {
				// cat-file -e verifies the object exists; rev-parse alone
				// would echo back any 40-hex string without checking.
				await git(project.cwd, ["cat-file", "-e", `${sha}^{commit}`]);
				shaState = "present";
			} catch {
				shaState = "unverifiable";
				this.counters.unverifiedSha += 1;
			}
		} else if (sha) {
			shaState = "unverified-remote";
			this.counters.unverifiedSha += 1;
		}

		const reportedStage = this.lastStage.get(executionId) ?? null;
		const currentStage = task?.currentStageId ?? null;
		const terminal = ["complete", "failed"].includes(
			String(task?.status).toLowerCase(),
		);
		if ((reportedStage && currentStage && reportedStage !== currentStage) || terminal) {
			this.counters.divergences += 1;
			task?.history?.push({
				timestamp: new Date().toISOString(),
				action: `Reconciler: execution ${executionId} reported stage ${reportedStage ?? "?"} but task is at stage ${currentStage ?? "?"} (status ${task?.status}) — report kept, divergence counted.`,
			});
		}

		const postureBits = [
			runnerId && `runner ${runnerId}`,
			`epoch ${epoch}`,
			sha && `sha ${sha} (${shaState})`,
			branch && `branch ${branch}`,
			posture && `posture ${posture}`,
		]
			.filter(Boolean)
			.join(", ");
		task?.history?.push({
			timestamp: new Date().toISOString(),
			action: `Runner completed execution ${executionId} (${postureBits}). Lease released.`,
		});
		this.lastStage.delete(executionId);
		this.logNextSeq.delete(executionId);
		return { accepted: true, duplicate: false, shaState, reportedStage };
	}

	interruptExecution({
		claimStore,
		taskStore,
		projectId,
		taskId,
		runnerId,
		executionId = null,
	}) {
		const hold = claimStore.describe(taskId);
		if (
			hold &&
			executionId &&
			(executionId !== hold.executionId || runnerId !== hold.runnerId)
		) {
			this.counters.staleRejected += 1;
			throw ExecutionLedger._stale(taskId, "not the lease holder");
		}
		const task = taskStore.getTask(projectId, taskId);
		if (["complete", "failed"].includes(String(task?.status).toLowerCase())) {
			const err = new Error(`Task ${taskId} is already terminal.`);
			err.statusCode = 409;
			err.code = "NOTHING_TO_INTERRUPT";
			throw err;
		}
		claimStore.invalidate(taskId);
		this.counters.interrupts += 1;
		if (task) {
			task.status = "interrupted";
			task?.history?.push({
				timestamp: new Date().toISOString(),
				action: `Runner ${runnerId} interrupted execution ${executionId ?? hold?.executionId ?? "?"} — lease dropped, re-queues as interrupted.`,
			});
		}
		for (const id of [hold?.executionId, executionId]) {
			if (id) {
				this.lastStage.delete(id);
				this.logNextSeq.delete(id);
			}
		}
		return { interrupted: true };
	}

	snapshot() {
		return { ...this.counters };
	}
}
