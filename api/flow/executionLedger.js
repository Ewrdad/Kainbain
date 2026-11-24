import { _appendLogEntries, _appendProcessLog } from "../watch/index.js";
import { config } from "../config.js";
import { git } from "../git.js";
import { createLogProcessor } from "../agent/logStream/logProcessor.js";
import { attachAttestationToEntry } from "../../shared/stageAttestation.js";
import { cleanSingleLineText } from "./cleanSingleLineText.js";

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
import { cleanReportedPosture } from "./runnerPosture.js";

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
 *   WP1 tenant fence (AUDIT H-4): the lease also names its home project
 *   (`hold.projectId`), and every guarded write must name the same one —
 *   a mismatch throws 409 PROJECT_FENCE_MISMATCH, counts
 *   `fencedRejected`, audits on the lease's home task, and leaves the
 *   original hold untouched. Consecutive Runner-death interrupts escalate
 *   past MAX_RUNNER_INTERRUPTS (G7). Monitor counters back the Phase 2
 *   "pageable-zero" reconcile/divergence signals. In-memory for Phase 2
 *   (same durability story as ClaimStore).
 * @example const ledger = new ExecutionLedger()
 * @example ledger.snapshot() => { progressRecorded: 0, … }
 ***/
export class ExecutionLedger {
	constructor() {
		this.seenProgress = new Set();
		this.logNextSeq = new Map();
		this.logEventNextSeq = new Map();
		this.logProcessors = new Map();
		this.lastStage = new Map();
		this.stagePrompt = new Map();
		this.stageServing = new Map();
		this.counters = {
			progressRecorded: 0,
			progressDuplicates: 0,
			logFrames: 0,
			logGaps: 0,
			logDuplicates: 0,
			logEventBatches: 0,
			logEventGaps: 0,
			logEventDuplicates: 0,
			logEventsDropped: 0,
			completions: 0,
			completionDuplicates: 0,
			staleRejected: 0,
			fencedRejected: 0,
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

	static _fenceMismatch(taskId, why) {
		const err = new Error(`Cross-project lease use rejected for task ${taskId}: ${why}.`);
		err.statusCode = 409;
		err.code = "PROJECT_FENCE_MISMATCH";
		return err;
	}

	_holdOrThrow(claimStore, taskId, executionId, epoch, projectId = undefined, taskStore = null) {
		const hold = claimStore.describe(taskId);
		if (
			!hold ||
			hold.executionId !== executionId ||
			hold.epoch !== epoch
		) {
			this.counters.staleRejected += 1;
			throw ExecutionLedger._stale(taskId, "epoch or execution mismatch");
		}
		return this._assertProjectFence({ taskStore, taskId, projectId, hold });
	}

	_assertProjectFence({ taskStore, taskId, projectId, hold }) {
		// WP1 tenant fence (AUDIT H-4): the lease names its home project and
		// every guarded write must name the same one. Fail closed on a real
		// mismatch, but honor legacy holds (claimed before projectId existed)
		// and pre-fence direct callers that name no project — strictness for
		// new requests comes from the route-level 400, not from here.
		// The hold is never touched on a mismatch: the rejection counts and
		// audits, then throws, leaving the legitimate lease usable.
		if (!hold) return hold;
		if (hold.projectId == null) return hold;
		if (projectId == null) return hold;
		if (hold.projectId === projectId) return hold;
		this.counters.fencedRejected += 1;
		// Security audit, written to the lease's HOME task — writing it to
		// the request-named project would itself be a cross-project write.
		// Best-effort: an audit failure must never mask the rejection.
		try {
			const home = taskStore?.getTask?.(hold.projectId, taskId);
			home?.history?.push({
				timestamp: new Date().toISOString(),
				action:
					`Security: rejected a cross-project write naming project ${projectId} ` +
					`against this task's lease (execution ${hold.executionId}, epoch ${hold.epoch}) — ` +
					`original lease untouched.`,
				code: "PROJECT_FENCE_MISMATCH",
			});
		} catch {
			// ignore audit failures; the throw below is the contract
		}
		throw ExecutionLedger._fenceMismatch(
			taskId,
			`lease belongs to project ${hold.projectId}, request names ${projectId}`,
		);
	}

	/***
	 * MARK: checkProjectFence
	 * @description Project-fence check for the lease-guarded routes that do
	 *   not go through `_holdOrThrow` (claim-heartbeat, steer-ack): rejects
	 *   a request whose `projectId` differs from the live hold's home
	 *   project with 409 `PROJECT_FENCE_MISMATCH`, leaving the hold
	 *   untouched. Returns the live hold (or null when there is none) so
	 *   callers can run their own runner/execution checks afterwards.
	 * @example ledger.checkProjectFence({ claimStore, taskStore, taskId: 't', projectId: 'p' }) => hold or null
	 ***/
	checkProjectFence({ claimStore, taskStore, taskId, projectId }) {
		const hold = claimStore.describe(taskId);
		return this._assertProjectFence({ taskStore, taskId, projectId, hold });
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
		const hold = this._holdOrThrow(claimStore, taskId, executionId, epoch, projectId, taskStore);
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
		// The "default" sentinel counts as no model: Runners older than
		// the servingModelFor fix report `config.model || "default"`, and
		// the engine uses "default" to mean harness-managed (no pinned
		// model). Storing it verbatim would render the fake `default`
		// pill the fix removes, so ingest normalizes it to null and the
		// UI hides the pill until every Runner has upgraded.
		const servingModel =
			typeof model === "string" && model.trim() && model.trim().toLowerCase() !== "default"
				? model.trim()
				: null;
		if (event === "prompted" && ((typeof harness === "string" && harness.trim()) || servingModel)) {
			this.stageServing.set(executionId, {
				harness: typeof harness === "string" && harness.trim() ? harness.trim() : null,
				model: servingModel,
			});
		}
		this.counters.progressRecorded += 1;
		const task = taskStore.getTask(projectId, taskId);
		task?.history?.push({
			timestamp: new Date().toISOString(),
			action: `Runner ${runnerId} stage ${stageId}: ${event}`,
			// Structured Runner id alongside the prose, so consumers
			// need not parse the action string.
			...(typeof runnerId === "string" && runnerId.trim()
				? { runnerId: runnerId.trim() }
				: {}),
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
		this._holdOrThrow(claimStore, taskId, executionId, epoch, projectId, taskStore);
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

	processorFor(executionId) {
		let processor = this.logProcessors.get(executionId);
		if (!processor) {
			processor = createLogProcessor({
				maxEntries: config.logEntriesMaxCount,
				telemetryMaxCount: config.telemetryMaxCount,
				rawMaxCount: config.rawMaxCount,
				rawMaxBytes: config.rawMaxBytes,
			});
			this.logProcessors.set(executionId, processor);
		}
		return processor;
	}

	ingestLogEvents({
		claimStore,
		taskStore,
		projectId,
		taskId,
		runnerId,
		executionId,
		epoch,
		seq,
		events,
	}) {
		this._holdOrThrow(claimStore, taskId, executionId, epoch, projectId, taskStore);
		if (
			!Number.isInteger(seq) ||
			seq < 0 ||
			!Array.isArray(events) ||
			events.length === 0 ||
			events.length > 200
		) {
			const err = new Error(
				"log-events requires an integer seq and 1–200 events.",
			);
			err.statusCode = 400;
			err.code = "INVALID_LOG_EVENTS_ARGS";
			throw err;
		}
		const next = this.logEventNextSeq.get(executionId) ?? 0;
		if (seq < next) {
			this.counters.logEventDuplicates += 1;
			return { accepted: true, duplicate: true, seq };
		}
		// JSON-safe clone per event: functions and undefined die here so a
		// hostile or hand-built runner payload can never poison the stored
		// task (which serializes to markdown) with unserializable values.
		// This runs BEFORE any task mutation: an invalid batch must be
		// rejected without writing a spurious gap marker, and the seq
		// cursor stays put so a corrected retry of the same seq is not
		// mistaken for a gap.
		const clean = [];
		for (const event of events) {
			if (!event || typeof event !== "object") continue;
			try {
				const roundTripped = JSON.parse(JSON.stringify(event));
				if (
					roundTripped &&
					typeof roundTripped === "object" &&
					typeof roundTripped.type === "string"
				) {
					clean.push(roundTripped);
				}
			} catch {
				this.counters.logEventsDropped += 1;
			}
		}
		if (clean.length === 0) {
			const err = new Error("log-events carries no usable typed events.");
			err.statusCode = 400;
			err.code = "INVALID_LOG_EVENTS_ARGS";
			throw err;
		}
		const task = taskStore.getTask(projectId, taskId);
		this.counters.logEventBatches += 1;
		if (seq > next) {
			this.counters.logEventGaps += 1;
			_appendProcessLog(
				task,
				`[runner ${runnerId}] event frames truncated — Runner disconnected (frames ${next}–${seq - 1} missing)`,
				{ runnerId },
			);
		}
		// The processor redacts every record (text + structured payloads) at
		// creation, so secrets never reach task.logEntries from this path.
		const processor = this.processorFor(executionId);
		const appended = [];
		for (const event of clean) {
			try {
				appended.push(...processor.handleEvent(event));
			} catch {
				this.counters.logEventsDropped += 1;
			}
		}
		// Stamp runner identity for stored/live dedupe (the frontend drops a
		// live entry once the same executionId:seq lands in a refetch) and
		// for the per-runner log filter. Ids stay processor-assigned —
		// identical to the embedded path's per-stage streamers.
		for (const entry of appended) {
			if (entry && typeof entry === "object") {
				entry.meta = {
					...(entry.meta || {}),
					source: "runner-structured",
					runnerId,
					executionId,
					seq,
				};
			}
		}
		_appendLogEntries(task, appended);
		this.logEventNextSeq.set(executionId, seq + 1);
		return {
			accepted: true,
			duplicate: false,
			seq,
			entryCount: appended.length,
		};
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
		configHash = null,
		committed = undefined,
	}) {
		// WP1 tenant fence: a cross-project completion must neither release
		// A's lease nor write into B — so the fence runs BEFORE
		// claimStore.complete() consumes the hold. The peek preserves the
		// exec-first error ordering (a wrong execution/epoch stays
		// STALE_EPOCH exactly as claimStore.complete would report it) without
		// consuming anything on either rejection path.
		const preHold = claimStore.describe(taskId);
		if (
			preHold &&
			(preHold.executionId !== executionId || preHold.epoch !== epoch)
		) {
			this.counters.staleRejected += 1;
			throw ExecutionLedger._stale(taskId, "epoch or execution mismatch");
		}
		this._assertProjectFence({ taskStore, taskId, projectId, hold: preHold });
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

		// Old Runners report `tiers:harness:default` on every stage
		// (the regression this task fixes). Clean the wire value here,
		// the last place before storage, so a mixed-version rollout
		// never writes the fake model segment into the task history.
		const cleanedPosture = cleanReportedPosture(posture);
		const postureBits = [
			runnerId && `runner ${runnerId}`,
			`epoch ${epoch}`,
			sha && `sha ${sha} (${shaState})`,
			branch && `branch ${branch}`,
			cleanedPosture && `posture ${cleanedPosture}`,
		]
			.filter(Boolean)
			.join(", ");
		// Stage attestation: the Runner-reported hash names the commit the
		// Runner actually made, so it wins; the dispatch-stashed hash covers
		// old Runners that report none. A Runner that reports committed:false
		// (CI stages, clean trees) attests the config it ran under with an
		// explicit null commit — its reported HEAD is prose context above,
		// never the attested SHA. A conflict between reported and dispatched
		// is flagged loudly but never rejects the completion.
		const reportedHash =
			typeof configHash === "string" && configHash.trim() ? configHash.trim() : null;
		const dispatchedHash =
			typeof task?.currentStageConfigHash === "string" && task.currentStageConfigHash.trim()
				? task.currentStageConfigHash.trim()
				: null;
		const attestedHash = reportedHash || dispatchedHash || null;
		const attestedSha = committed === false ? null : (sha ?? null);
		const hashConflict = Boolean(reportedHash && dispatchedHash && reportedHash !== dispatchedHash);
		const completionEntry = {
			timestamp: new Date().toISOString(),
			action:
				`Runner completed execution ${executionId} (${postureBits}). Lease released.` +
				(hashConflict
					? ` Config hash conflict: Runner reported ${reportedHash} but dispatch recorded ${dispatchedHash}.`
					: ""),
			// Structured Runner id alongside the prose, same as the
			// progress entries above, so consumers need not parse the
			// action string.
			...(typeof runnerId === "string" && runnerId.trim()
				? { runnerId: runnerId.trim() }
				: {}),
		};
		const attestedStageId = reportedStage ?? task?.currentStageId;
		if (
			attestedHash &&
			typeof attestedStageId === "string" &&
			attestedStageId.trim()
		) {
			attachAttestationToEntry(completionEntry, {
				taskId,
				stageId: attestedStageId,
				configHash: attestedHash,
				commitSha: attestedSha,
			});
		}
		if (hashConflict) {
			completionEntry.configHashMismatch = true;
			this.counters.divergences += 1;
		}
		task?.history?.push(completionEntry);
		// G7: a finished stage breaks the death loop — the next stage (or
		// a later retry of this one after real progress) counts from zero.
		// The S6 last-interrupt marker goes with it: real progress means a
		// later crash resume must read as a restart, not as this old death.
		if (task) {
			delete task.runnerInterruptCount;
			delete task.runnerInterruptStage;
			delete task.interruptedBy;
		}
		this.lastStage.delete(executionId);
		this.logNextSeq.delete(executionId);
		this.logEventNextSeq.delete(executionId);
		this.logProcessors.delete(executionId);
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
		const hold = this._holdOrThrow(claimStore, taskId, executionId, epoch, projectId, taskStore);
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
		// WP1 tenant fence: a cross-project interrupt must not drop A's
		// lease — so the fence runs BEFORE claimStore.invalidate(). It sits
		// after the execution check above to keep the exec-first error
		// ordering shared with _holdOrThrow.
		this._assertProjectFence({ taskStore, taskId, projectId, hold });
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
			// Runner-supplied text lands in single-line history strings here
			// and in the resume label, so it collapses to one bounded line
			// first: an embedded newline would otherwise drop (or forge)
			// history lines on the task.md round-trip.
			const cleanReason = cleanSingleLineText({ text: reason });
			const cleanRunnerId = cleanSingleLineText({ text: runnerId });
			// The execution id also arrives in the request body and reaches
			// the history line below, so it gets the same treatment (a
			// no-lease interrupt never validates it against a hold).
			const cleanExecutionId = cleanSingleLineText({
				text: executionId ?? hold?.executionId ?? "?",
			});
			// S6: structured last-interrupt marker. `autoResumeTask` reads it
			// (via `resolveResumeLabel`) to name the runner route in history;
			// the crash path stamps nothing, so its resumes keep the
			// server-restart string. In-memory only, like the G7 counters
			// above — a restart wipes it, which correctly re-labels a
			// post-restart resume as a restart recovery. Consumed (deleted)
			// by every path out of `interrupted`, overwritten by the next
			// interrupt, and cleared by stage completion — so it always
			// names the CURRENT interruption, never a stale one.
			task.interruptedBy = {
				runnerId: cleanRunnerId,
				reason: cleanReason,
				at: new Date().toISOString(),
			};
			task?.history?.push({
				timestamp: new Date().toISOString(),
				action: `Runner ${cleanRunnerId || "?"} interrupted execution ${cleanExecutionId} — lease dropped, re-queues as interrupted.${cleanReason ? ` Reason: ${cleanReason}` : ""}`,
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
				this.logEventNextSeq.delete(id);
				this.logProcessors.delete(id);
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
