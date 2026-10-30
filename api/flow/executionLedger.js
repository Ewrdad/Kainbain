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
/***
 * MARK: MAX_RUNNER_INTERRUPTS
 * @description Bound on consecutive Runner-death interrupts for one
 *   task+stage (G7): a Runner that keeps dying mid-stage re-queues as
 *   `interrupted` each time, but past this many in a row the interrupt
 *   escalates (history entry + `interruptEscalations` monitor counter +
 *   `escalated` reply flag) so the death loop gets operator attention
 *   instead of spinning forever. A successful completion resets the count.
 * @example MAX_RUNNER_INTERRUPTS => 5
 ***/
export const MAX_RUNNER_INTERRUPTS = 5;
export { formatPosture, servingModelFor } from "./runnerPosture.js";

/***
 * MARK: ExecutionLedger
 * @description In-memory receiving side for Runner progress/logs/complete/
 *   interrupt keyed by lease (D1 fencing, R01/R14); consecutive Runner-death
 *   interrupts escalate past MAX_RUNNER_INTERRUPTS (G7). See the module
 *   block above for the full fencing contract.
 * @example const ledger = new ExecutionLedger()
 * @example ledger.snapshot() => { progressRecorded: 0, … }
 ***/
export class ExecutionLedger {
	constructor() {
		this.seenProgress = new Set();
		this.logNextSeq = new Map();
		this.lastStage = new Map();
		this.stagePrompt = new Map();
		this.stageServing = new Map();
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
			interruptEscalations: 0,
			divergences: 0,
			unverifiedSha: 0,
			verifiedSha: 0,
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
		prompt = null,
		harness = null,
		model = null,
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
		// Stage prompt payload (observability only): the exact prompt the
		// Runner curated for this execution, capped at ingest. Kept per
		// live execution and dropped on complete/interrupt with the rest
		// of the per-execution state.
		if (event === "prompted" && typeof prompt === "string" && prompt) {
			this.stagePrompt.set(executionId, prompt.slice(0, 20000));
		}
		// Serving harness/model (observability only): what the Runner
		// actually runs this execution on. Same lifecycle as the prompt.
		if (event === "prompted" && ((typeof harness === "string" && harness.trim()) || (typeof model === "string" && model.trim()))) {
			this.stageServing.set(executionId, {
				harness: typeof harness === "string" && harness.trim() ? harness.trim() : null,
				model: typeof model === "string" && model.trim() ? model.trim() : null,
			});
		}
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
				{ runnerId },
			);
		} else {
			this.counters.logFrames += 1;
		}
		_appendProcessLog(task, `[runner ${runnerId}] ${bytes}`, {
			runnerId,
			executionId,
			seq,
		});
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
			// Deferred verification (Step 3): the backend cannot fetch the
			// remote (D2), so the reported SHA stays pending until a Runner
			// with a fresh fetch confirms it via noteRemoteVerification
			// (POST /tasks/:id/verify-sha). Visible per task, not just as a
			// monitor counter.
			if (task && branch) {
				task.pendingPushVerification = {
					sha,
					branch,
					verified: false,
					reportedAt: new Date().toISOString(),
					reportedBy: runnerId,
				};
			}
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
		// G7: a finished stage breaks the death loop — the next stage (or
		// a later retry of this one after real progress) counts from zero.
		if (task) {
			delete task.runnerInterruptCount;
			delete task.runnerInterruptStage;
		}
		this.lastStage.delete(executionId);
		this.logNextSeq.delete(executionId);
		this.stagePrompt.delete(executionId);
		this.stageServing.delete(executionId);
		return { accepted: true, duplicate: false, shaState, reportedStage };
	}

	/***
	 * MARK: noteRemoteVerification
	 * @description Confirms (or refutes) a previously reported push SHA
	 *   against a Runner's fresh fetch of the remote (Step 3 deferred
	 *   verification). Fenced by the task-claim lease exactly like progress
	 *   and logs: a stale execution's confirmation is rejected, never
	 *   recorded. Sets `task.pendingPushVerification.verified` and counts
	 *   `verifiedSha`; a refuted SHA leaves `verified: false` with the
	 *   refuting Runner named, so the task visibly needs a re-push.
	 * @example ledger.noteRemoteVerification({ claimStore, taskStore, projectId: 'p', taskId: 't', runnerId: 'r', executionId: 'e', epoch: 1, sha: 'abc', present: true }) => { verified: true }
	 ***/
	noteRemoteVerification({
		claimStore,
		taskStore,
		projectId,
		taskId,
		runnerId,
		executionId,
		epoch,
		sha,
		present,
	}) {
		const hold = this._holdOrThrow(claimStore, taskId, executionId, epoch);
		if (hold.runnerId !== runnerId) {
			this.counters.staleRejected += 1;
			throw ExecutionLedger._stale(taskId, "lease belongs to another Runner");
		}
		if (!sha || typeof sha !== "string") {
			const err = new Error("verify-sha requires a sha.");
			err.statusCode = 400;
			err.code = "INVALID_VERIFY_ARGS";
			throw err;
		}
		const task = taskStore.getTask(projectId, taskId);
		const verified = present !== false;
		if (task) {
			task.pendingPushVerification = {
				...(task.pendingPushVerification || {}),
				sha,
				verified,
				verifiedAt: new Date().toISOString(),
				verifiedBy: runnerId,
			};
			task?.history?.push({
				timestamp: new Date().toISOString(),
				action: verified
					? `Runner ${runnerId} verified push SHA ${sha.slice(0, 7)} against the remote.`
					: `Runner ${runnerId} could NOT find push SHA ${sha.slice(0, 7)} on the remote — task needs a re-push.`,
			});
		}
		if (verified) this.counters.verifiedSha += 1;
		else this.counters.unverifiedSha += 1;
		return { verified };
	}

	interruptExecution({
		claimStore,
		taskStore,
		projectId,
		taskId,
		runnerId,
		executionId = null,
		reason = null,
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
		// G7: consecutive interrupts per task+stage. A stage change (or a
		// successful completion, which clears both fields) restarts the
		// count — only a Runner dying repeatedly on the SAME stage trips
		// the bound.
		const stageId = task?.currentStageId ?? null;
		const prevStage = task?.runnerInterruptStage ?? null;
		const prevCount = Number.isInteger(task?.runnerInterruptCount) ? task.runnerInterruptCount : 0;
		const interruptCount = prevStage === stageId ? prevCount + 1 : 1;
		const escalated = interruptCount >= MAX_RUNNER_INTERRUPTS;
		if (task) {
			task.runnerInterruptStage = stageId;
			task.runnerInterruptCount = interruptCount;
			task.status = "interrupted";
			const cleanReason =
				typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : "";
			task?.history?.push({
				timestamp: new Date().toISOString(),
				action: `Runner ${runnerId} interrupted execution ${executionId ?? hold?.executionId ?? "?"} — lease dropped, re-queues as interrupted.${cleanReason ? ` Reason: ${cleanReason}` : ""}`,
			});
			if (escalated) {
				this.counters.interruptEscalations += 1;
				task?.history?.push({
					timestamp: new Date().toISOString(),
					action: `Runner deaths escalated: ${interruptCount} consecutive interrupts on stage ${stageId ?? "?"} (bound ${MAX_RUNNER_INTERRUPTS}) — needs operator attention, auto re-queue continues.`,
				});
			}
		}
		for (const id of [hold?.executionId, executionId]) {
			if (id) {
				this.lastStage.delete(id);
				this.logNextSeq.delete(id);
				this.stagePrompt.delete(id);
				this.stageServing.delete(id);
			}
		}
		return { interrupted: true, interruptCount, escalated };
	}

	/***
	 * MARK: stageFor
	 * @description Current stage reported by a live execution (progress
	 *   `started`/`finished` events). Null when unknown or finished —
	 *   per-runner monitor widgets join this to the claim hold.
	 * @example ledger.stageFor('exec-1') => 'stage-a'
	 * @param {string} executionId - Lease execution id.
	 * @returns {string|null} Last reported stage id.
	 ***/
	stageFor(executionId) {
		return this.lastStage.get(executionId) ?? null;
	}

	/***
	 * MARK: promptFor
	 * @description Exact stage prompt a live execution reported at start
	 *   (`prompted` progress event). Null when unreported or finished —
	 *   per-runner monitor widgets render the with-prompt card from this.
	 * @example ledger.promptFor('exec-1') => '# Task\n...'
	 * @param {string} executionId - Lease execution id.
	 * @returns {string|null} Reported stage prompt.
	 ***/
	promptFor(executionId) {
		return this.stagePrompt.get(executionId) ?? null;
	}

	/***
	 * MARK: servingFor
	 * @description Serving harness/model a live execution reported at start
	 *   (`prompted` progress event). Null when unreported or finished —
	 *   per-runner monitor widgets show these pills instead of the fleet
	 *   advertised capabilities.
	 * @example ledger.servingFor('exec-1') => { harness: 'pi', model: 'x' }
	 * @param {string} executionId - Lease execution id.
	 * @returns {Object|null} Serving `{ harness, model }`.
	 ***/
	servingFor(executionId) {
		return this.stageServing.get(executionId) ?? null;
	}

	snapshot() {
		return { ...this.counters };
	}
}
