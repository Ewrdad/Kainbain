import {
	config,
} from '../../config.js';
import {
	collectTaskImageRefs,
} from '../../work/taskAssets.js';
import {
	resolveTaskBranch,
} from '../../work/taskBranches.js';
import {
	getCommitRangeDiffStat,
} from '../../work/taskDiffStat.js';
import {
	_appendProcessLog,
	_replaceLogEntries,
	generateStageReportContent,
} from '../../watch/index.js';
import {
	recordReliabilitySample,
} from '../../watch/reliabilityShared.js';
import {
	classifyStageError,
} from '../../work/index.js';
import {
	isTerminalTaskStatus,
	resolveStageTimeout,
	stageElapsedSeconds,
	isEngineOwnerOf,
	resolveStageLabel,
} from '../stagePolicy.js';
import {
	buildTimelineAttribution,
	stampArrivalRowAttribution,
} from '../runAttribution.js';
import {
	runCommandStage,
	executeMergeStage,
	resolveTaskExecutionCwd,
} from '../commandStages.js';
import {
	recordStageHeartbeat,
	clearStageHeartbeat,
	clearStallHandled,
	recoverWedgedQueueEntry,
} from '../stageHeartbeat.js';
import {
	EQUEUE_TIMEOUT_CODE,
} from '../executionQueue.js';
import {
	circuitSnapshot,
	isCanaryTask,
	isTripped,
} from '../circuitBreaker.js';
import {
	emitAlert,
} from '../../observability/alerts.js';
import {
	hasHarness,
} from '../../agent/harnessRegistry.js';
import {
	stageWantsReport,
} from '../../promptCuration.js';
import {
	parkTaskForSurvey,
} from './parkTaskForSurvey.js';
import {
	GitDirtyTreeError,
	resolveSha,
} from '../../git.js';
import {
	normalizeStageType,
} from '../../projectStore.js';
import { harnessName } from './harnessName.js';
import { resolveRunHarnessFallback } from './resolveRunHarnessFallback.js';
import { peekStageDisplayTarget } from './peekStageDisplayTarget.js';
import { displayModelForInit } from './displayModelForInit.js';
import { routeStageError } from './routeStageError.js';
import { buildRetryFailureDetails } from './buildRetryFailureDetails.js';
import { resolveCommandStageRuntime } from './resolveCommandStageRuntime.js';
import { isDispatchServable } from '../dispatch/isDispatchServable.js';

/***
 * MARK: executeStage
 * @description Executes the current stage for a task according to its stage type.
 * @example await executeStage(store, "p1", "t1", { stages }) => { status: "complete", … }
 ***/
export async function executeStage(
	store,
	projectId,
	taskId,
	{
		stages = [],
		projectCwd,
		execRunner,
		agentRunner,
		promptEngine,
		eventBridge: overrideBridge,
		priority = "normal",
	} = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;

	let projectName = projectId;
	let projectEntity = null;
	if (store.projectStore && typeof store.projectStore.getProject === "function") {
		const project = store.projectStore.getProject(projectId);
		if (project?.name) projectName = project.name;
		projectEntity = project || null;
	}

	const stage = stages.find(
		(s) =>
			String(s.id) === String(task.currentStageId) ||
			(s.name &&
				String(s.name).toLowerCase() ===
					String(task.currentStageId).toLowerCase()),
	) ||
		stages[0] || {
			id: "stage",
			name: "Stage",
			type: "agent",
			prompt: "Execute",
		};

	// Normalize the stage type at the dispatch boundary so legacy aliases
	// classify exactly as everywhere else: `review` -> human (parks at the
	// checkpoint instead of running an agent), `script` -> ci (command
	// stage), unknown -> agent. Without this, a legacy `review` stage rode
	// the fall-through agent path and could be failed by the agent verdict
	// gate even though it is a human checkpoint.
	const stageType = normalizeStageType(stage.type);
	const isPaused = stage.paused === true;
	const bridge = overrideBridge || store.eventBridge;
	const taskShortId = task.id.slice(0, 4).toUpperCase();

	// Tier-5 containment gate at the dispatch boundary: while the engine is
	// tripped, no task may enter the execution queue — except the single
	// half-open canary the scheduler already claimed. This is the third gate
	// (after `scheduleTick` and `findNextCandidateTask`) and it is what stops
	// a direct `/tasks/:id/execute` call or any manual enqueue from bypassing
	// containment. Queued work is deferred with budgets untouched.
	if (isTripped(store) && !isCanaryTask(store, taskId)) {
		return {
			task,
			stageType,
			status: "deferred",
			message: "Engine is tripped; dispatch deferred",
			deferred: "tripped",
			circuit: circuitSnapshot(store),
		};
	}

	// Whether the task is already finished at dispatch: an explicit re-run of
	// finished work is allowed (retry and the Env-probe contract depend on
	// it), but a job that was queued while the task was live must not
	// restart it after it finished meanwhile — that check happens after the
	// queue, using terminalAtEntry.
	const terminalAtEntry = isTerminalTaskStatus(task.status);

	// A manually paused task stays paused even when execution is triggered
	// directly (the scheduler already skips it; this covers manual dispatch).
	if (String(task.status).toLowerCase() === "paused") {
		return {
			task,
			stageType,
			status: "paused",
			message: "Task is paused",
		};
	}

	// Guard: Dependency / Blocking Check
	const blockCheck = store.isTaskBlocked(projectId, taskId);
	if (blockCheck.blocked) {
		const blockerList = blockCheck.blockers.join(", ");
		const errorMsg = `Task is blocked by unresolved dependencies: ${blockerList}`;
		bridge?.emitSystemLog?.(
			projectId,
			`[BLOCKED] Task #KB-${taskShortId} cannot execute: blocked by ${blockerList}`,
			{ taskId: task.id, stageId: stage.id, blockers: blockCheck.blockers },
		);
		return {
			task,
			stageType,
			status: "blocked",
			message: errorMsg,
			blockers: blockCheck.blockers,
		};
	}

	// If stage is paused, do not run automation; update engine status to paused.
	// Never clobber another task's live running state: this path runs before
	// the queue, so a paused dispatch racing a running job would otherwise
	// strand the engine on a stale owner (and the running job's reset would
	// then be skipped as "not mine").
	if (isPaused) {
		const engine = store.engineState;
		if (engine.status !== "running" || isEngineOwnerOf(engine, taskId)) {
			store.setEngineState({
				status: "paused",
				activeTaskId: taskId,
				activeProjectId: projectId,
				activeProjectName: projectName,
				activeStageId: stage.id,
				activeStageName: stage.name,
				activeStageType: stageType,
			});
		}
		return {
			task,
			stageType,
			status: "paused",
			message: "Stage is paused",
		};
	}

	// Runner-only execution by default (`KAINBAIN_RUNNER_EXECUTION_ONLY`,
	// default true): a model stage a Runner can serve over the wire is
	// left for dispatch instead of spawning an in-process agent child.
	// Explicit `false` restores legacy embedded execution — emergency
	// rollback hatch only, kept tested by the embedded suites. Pure skip —
	// no budget touched, no state mutated, candidacy intact for the next
	// tick and for the dispatch poll. Human checkpoints, commands, CI
	// stages, unresolvable aliases, and circuit-canary probes keep their
	// embedded behavior (canary bypass preserves the half-open probe).
	if (
		config.runnerExecutionOnly !== false &&
		!isCanaryTask(store, taskId) &&
		isDispatchServable({ project: projectEntity || {}, task, stages, stage })
	) {
		return {
			task,
			stageType,
			status: "deferred",
			deferred: "runner-dispatch",
			message: "Runner execution only; stage left for wire dispatch",
		};
	}

	bridge?.emitSystemLog?.(
		projectId,
		`[SYSTEM] Enqueued task #KB-${taskShortId} for stage '${stage.name || stage.id}'`,
		{ taskId: task.id, stageId: stage.id, priority },
	);

	const executeTaskAction = async () => {
		const cwd = store._resolveProjectCwd(projectId, projectCwd);
		const startTime = Date.now();

		// Re-validate after leaving the queue: the task may have been
		// completed, paused, or moved while this job waited behind a
		// long-running stage. Running it now would resurrect or duplicate work.
		const liveTask = store.getTask(projectId, taskId) || task;
		// Skip only when the task FINISHED while this job waited: an
		// explicitly re-dispatched finished task (terminal at entry) still
		// runs. This is what keeps a manual complete sticky when a duplicate
		// run was already queued behind the live one.
		if (isTerminalTaskStatus(liveTask.status) && !terminalAtEntry) {
			return {
				task: liveTask,
				stageType,
				status: liveTask.status,
				message: `Task became ${liveTask.status} while queued; not running`,
			};
		}
		if (String(liveTask.status).toLowerCase() === "paused") {
			return {
				task: liveTask,
				stageType,
				status: "paused",
				message: "Task was paused while queued",
			};
		}

		const liveStage = stages.find(
			(s) =>
				String(s.id) === String(liveTask.currentStageId) ||
				(s.name &&
					String(s.name).toLowerCase() ===
						String(liveTask.currentStageId).toLowerCase()),
		);
		if (liveStage && stage && String(liveStage.id) !== String(stage.id)) {
			// Normalized so legacy `review` checkpoints classify as human
			// (verified: normalizeStageType('review') === 'human'); the raw
			// type would mislabel them and drop the checkpoint engine state.
			const liveStageType = normalizeStageType(liveStage?.type);
			const isHuman = liveStageType === "human";
			store.setEngineState({
				status: isHuman ? "checkpoint" : "idle",
				activeTaskId: isHuman ? taskId : null,
				activeProjectId: isHuman ? projectId : null,
				activeProjectName: isHuman ? projectName : null,
				activeStageId: isHuman ? liveStage.id : null,
				activeStageName: isHuman ? liveStage.name : null,
				activeStageType: isHuman ? liveStageType : null,
			});
			return {
				task: store.getTask(projectId, taskId) || task,
				stageType,
				status: "superseded",
				message: `Stale duplicate executor skipped (task now in stage '${liveStage.name || liveStage.id}')`,
			};
		}

		// The stage may have been paused while this job waited in the queue;
		// running it now would ignore the operator's pause.
		const livePaused =
			(liveStage || stage)?.paused === true || isPaused;
		if (livePaused) {
			const engine = store.engineState;
			if (engine.status !== "running" || isEngineOwnerOf(engine, taskId)) {
				store.setEngineState({
					status: "paused",
					activeTaskId: taskId,
					activeProjectId: projectId,
					activeProjectName: projectName,
					activeStageId: (liveStage || stage).id,
					activeStageName: (liveStage || stage).name,
					activeStageType: stageType,
				});
			}
			return {
				task: liveTask,
				stageType,
				status: "paused",
				message: "Stage was paused while queued",
			};
		}

		// Terminal-COMPLETED tasks never re-run a MERGE stage: completion with
		// the task sitting at a merge stage means that merge already happened
		// (or the task completed without a merge in front of it). This exact
		// duplicate — the human-checkpoint pass's fire-and-forget auto-execute
		// landing after an explicit /execute finished the fast merge — used to
		// re-run the merge command, hit `countUniqueCommits == 0` ("no commits
		// of its own") and PARK A COMPLETED TASK AS FAILED (2026-10-06 canary
		// pr-review report). Explicit re-dispatch of completed tasks keeps
		// working for every other stage type (env-probe / CI re-probe
		// contract), and a terminal-FAILED task's merge re-run stays allowed:
		// that is the recovery path (retryStage).
		if (
			stageType === "merge" &&
			["completed", "done", "cancelled"].includes(
				String(liveTask.status).toLowerCase(),
			)
		) {
			return {
				task: liveTask,
				stageType,
				status: liveTask.status,
				message: `Task already ${liveTask.status}; merge stage not re-run`,
			};
		}

		const priorFailure = task.failureReason || task.lastError?.message || null;
		const priorFailedStage =
			task.lastError?.stageName || task.lastError?.stageId || null;
		const priorFailedStageType = task.lastError?.stageType || null;
		const priorStderr = task.lastError?.stderr || null;
		const priorStdout = task.lastError?.stdout || null;

		const wasRetrying = task.autoRetrying === true;
		task.failureReason = null;
		task.lastError = null;
		task.autoRetrying = false;
		if (wasRetrying) task.retryState = "running";

		store.setEngineState({
			status: stageType === "human" ? "checkpoint" : "running",
			activeTaskId: taskId,
			activeProjectId: projectId,
			activeProjectName: projectName,
			activeStageId: stage.id,
			activeStageName: stage.name,
			activeStageType: stageType,
		});

		try {
			if (stageType === "human") {
				if (store._isBranchModeEnabled(projectId)) {
					// Human checkpoints never switch branches: ensure the
					// task-branch ref exists (create-only, no checkout/commit)
					// and always park in waiting_human, even when git is
					// unusable.
					try {
						await store.ensureTaskBranchRef(task, cwd, {
							bridge,
							stageName: stage.name || stage.id,
						});
					} catch (branchError) {
						_appendProcessLog(
							task,
							`[WARN] Task-branch ref provisioning skipped: ${branchError?.message || branchError}`,
						);
						try {
							store._saveTaskMarkdown(cwd, task);
						} catch {
							// Parking the checkpoint matters more than the warning.
						}
					}
				}
				store.updateTask(projectId, taskId, { status: "waiting_human" }, cwd);
				task.history.push({
					timestamp: new Date().toISOString(),
					action: `Stage checkpoint: waiting for human approval in stage ${stage.name || stage.id}`,
				});
				_appendProcessLog(
					task,
					`[HUMAN] Checkpoint: Waiting for human approval in stage ${stage.name || stage.id}`,
				);
				store._saveTaskMarkdown(cwd, task);

				bridge?.emitProcessEvent?.(projectId, "stage:enter", {
					taskId,
					stageId: stage.id,
					stageName: stage.name,
					stageType: "human",
					projectName,
				});
				// Scheduled checkpoint, same as the manual moveToStage path:
				// the WebSocket emission is unchanged, but it is routed
				// through the alert seam as `task.checkpoint_wait`/`info`
				// so external sinks see the scheduled-vs-unscheduled
				// distinction on the run-loop path too. Fire-and-forget:
				// a dead sink never affects the parked checkpoint.
				void emitAlert(bridge, {
					event: "task.checkpoint_wait",
					severity: "info",
					projectId,
					taskId,
					stage: { id: stage.id, name: stage.name, type: "human" },
					message: "Awaiting human approval",
					ui: {
						event: "stage:checkpoint_wait",
						payload: {
							taskId,
							stageId: stage.id,
							stageName: stage.name,
							projectName,
							message: "Awaiting human approval",
						},
					},
				});
				return {
					task,
					stageType: "human",
					status: "waiting_human",
					message: "Awaiting human approval",
				};
			}

			// Every stage type except human and merge runs on a provisioned
			// task branch when branch mode is enabled, command stages
			// included: a command stage runs its command and nothing else.
			// Only a COMMAND stage runs commands: an agent/human stage that
			// happens to carry a stray `command` field must still get its
			// task branch, exactly as before.
			const runsCommandStage = stageType === "ci" || stageType === "script";
			const runtime = runsCommandStage ? resolveCommandStageRuntime(stage) : null;
			if (
				store._isBranchModeEnabled(projectId) &&
				stageType !== "human" &&
				stageType !== "merge"
			) {
				try {
					await store.ensureTaskBranch(task, cwd, { bridge });
				} catch (branchError) {
					if (branchError instanceof GitDirtyTreeError) {
						_appendProcessLog(task, `[ERROR] ${branchError.message}`);
						store._saveTaskMarkdown(cwd, task);
					}
					// Branch-provisioning failures route through the single
					// taxonomy: lock contention retries in place, aborts
					// settle quietly, everything else fails back or parks.
					return routeStageError(store, projectId, taskId, stage, branchError, {
						stages,
						bridge,
						projectCwd: cwd,
					});
				}
			}

			if (stageType === "agent" || stageType === "review") {
				const useBranches = !!store._isBranchModeEnabled?.(projectId);
				task.currentStageStartSha = null;
				task.currentStageEndSha = null;
				if (useBranches) {
					// Human-checkpoint snapshot (plan §2.3): a checkpoint
					// records the task-branch tip on entry without committing.
					// Prefer that snapshot so this stage measures only its own
					// range even if the tip moved since; otherwise resolve now.
					if (
						typeof task.humanCheckpointStartSha === "string" &&
						task.humanCheckpointStartSha.trim()
					) {
						task.currentStageStartSha = task.humanCheckpointStartSha.trim();
					} else {
						try {
							task.currentStageStartSha = await resolveSha(
								cwd,
								resolveTaskBranch(task),
							);
						} catch {
							task.currentStageStartSha = null;
						}
					}
					task.humanCheckpointStartSha = null;
				}
			}

			if (runsCommandStage) {
				return await runCommandStage(store, projectId, taskId, stage, {
					stages,
					cwd,
					bridge,
					projectName,
					execRunner,
					kind: runtime.kind,
					label: runtime.label,
					logTag: runtime.logTag,
					reportTitle: runtime.reportTitle,
					statusValue: runtime.statusValue,
					defaultCommand: runtime.defaultCommand,
				});
			}

			if (stageType === "merge") {
				// Git operations only: integrate the task branch into the
				// default branch, auto-commit, push, advance. Later command
				// stages run their own commands after the merge, so a
				// merge-stage failure is always a git failure.
				return await executeMergeStage(store, {
					projectId,
					taskId,
					stage,
					stages,
					cwd,
					bridge,
					projectName,
				});
			}

			// 'agent' or 'review' stage execution
			store.updateTask(projectId, taskId, { status: "running_agent" }, cwd);
			task.history.push({
				timestamp: new Date().toISOString(),
				action: `Dispatched stage ${stage.name || stage.id} (${stageType}) with model ${stage.model || "default"}`,
			});
			_appendProcessLog(
				task,
				`[AGENT] Dispatched stage ${stage.name || stage.id} (${stageType}) with model ${stage.model || "default"}`,
			);
			store._saveTaskMarkdown(cwd, task);

			let projectObj = null;
			if (
				store.projectStore &&
				typeof store.projectStore.getProject === "function"
			) {
				projectObj = store.projectStore.getProject(projectId);
			}
			// The init line reports the RESOLVED harness + model (one peeked
			// display-target read, no rotation consumed), reused below for
			// run attribution so the two can never disagree. Rigs with no
			// session store keep the legacy fallback wording byte-identical.
			// The event payload keeps the raw stage slot (contract unchanged).
			const peekedTarget = peekStageDisplayTarget(store, projectObj, stage);
			const peekedHarnessName =
				typeof peekedTarget?.harnessName === "string"
					? peekedTarget.harnessName.trim()
					: "";
			const initHarness =
				peekedHarnessName && hasHarness(peekedHarnessName)
					? peekedHarnessName
					: harnessName(store);
			const initModel = displayModelForInit(peekedTarget, stage);

			// Per-alias reliability attribution for this run: only a RESOLVED
			// alias names a target. An unresolvable alias ran on the
			// project-default fallback, so crediting the named alias would lie —
			// it stays unattributed. Reuses the SAME peeked target as the init
			// line, so what was logged and what is recorded can never disagree.
			const aliasAttribution =
				peekedTarget?.aliasName && !peekedTarget?.aliasMissing
					? buildTimelineAttribution({
							aliasName: peekedTarget.aliasName,
							modelRef: peekedTarget.modelRef,
							targetIndex: peekedTarget.targetIndex,
						}) ?? {
							// A resolved alias whose pick carries no model ref
							// (harness-managed): the alias still ran, so the
							// reliability/report fields keep the bare alias
							// identity the timeline shape would drop.
							aliasName: peekedTarget.aliasName,
							targetIndex: peekedTarget.targetIndex,
						}
					: {};

			// Timeline attribution for THIS dispatch (in-memory only, the
			// same lifetime class as supersededStageId): the resolved
			// harness/model/alias from the SAME peeked target the init line
			// and reliability attribution read, so the recorded row can
			// never disagree with the logged session. The Completed row
			// consumes it on a stageId match at task completion; command
			// and human paths never set it, so their rows stay blank by
			// omission. Never written to frontmatter: its
			// lifetime is one run, and a restart mid-run writes no timeline
			// row anyway (the retry re-dispatches and re-stamps).
			const pendingAttribution = buildTimelineAttribution({
				harnessId: initHarness,
				modelRef: initModel,
				aliasName: aliasAttribution.aliasName,
				targetIndex: aliasAttribution.targetIndex,
			});
			// Null when nothing ran behind this dispatch: the transition
			// matchers treat null and absent identically (blank row), and no
			// stageId-only husk object is left for a later move to inherit.
			task.currentRunAttribution = pendingAttribution
				? { stageId: stage.id, ...pendingAttribution }
				: null;

			// Stamp the ARRIVAL row into this stage — the row headed with
			// this stage's own name — so a row's badge always names the run
			// of the stage the row is about. Stamping the NEXT transition's
			// row instead (the previous design) put this agent's badge on
			// the following stage's row, visibly attributing a model to a
			// human or CI stage. A re-dispatch re-stamps, so the row always
			// reflects the latest attempt; a missing arrival row (task
			// created in its first stage) stamps nothing — its Failed /
			// Retrying rows still carry their own attribution.
			if (pendingAttribution) {
				const arrivalLabel =
					stage?.name || resolveStageLabel(stage.id, stages);
				const stampedRow = stampArrivalRowAttribution(
					task,
					arrivalLabel,
					pendingAttribution,
				);
				if (stampedRow) {
					store._saveTaskMarkdown(cwd, task);
				}
			}

			bridge?.emitSystemLog?.(
				projectId,
				`[SYSTEM] Initializing agent session (harness: ${initHarness}, Model: ${initModel})...`,
				{ taskId, stageId: stage.id, model: stage.model || "default" },
			);

			bridge?.emitProcessEvent?.(projectId, "stage:enter", {
				taskId,
				stageId: stage.id,
				stageName: stage.name,
				stageType,
				model: stage.model || "default",
				projectName,
			});

			const reports = store.getTaskReports(projectId, taskId, cwd);

			// Retry context for the next attempt: the previous failure reason
			// plus head+tail excerpts of prior output, so the stack-trace
			// root survives truncation (tail-only trimming discarded it).
			const failureDetails = buildRetryFailureDetails({
				priorFailure,
				priorStdout,
				priorStderr,
				priorFailedStage,
				priorFailedStageType,
			});

			// Task images: collected once so the curated prompt (file-path mentions,
			// never bytes) and the dispatch-time byte attach decision share one list.
			let taskImageRefs = [];
			if (cwd && taskId) {
				taskImageRefs = collectTaskImageRefs(
					cwd,
					taskId,
					config.taskImageMaxPromptRefs,
					projectObj,
				);
			}
			const curatedPrompt = promptEngine
				? promptEngine.curatePrompt(task, stage, {
						project: projectObj,
						projectName,
						projectRepo: projectObj?.gitUrl || projectObj?.gitRepo,
						projectCwd: cwd,
						reports,
						failureDetails,
						taskImages: taskImageRefs,
					})
				: [
						stage.prompt || stage.criteria || task.goal,
						failureDetails ? `\n# Failure Details\n${failureDetails}` : null,
					]
						.filter(Boolean)
						.join("\n\n");

			task.prompt = curatedPrompt;
			// Worktree isolation (resolved once: the agent dispatch below
			// and the prompt share it). Falls back to the primary checkout
			// when no worktree is provisioned.
			const agentExecCwd =
				(await resolveTaskExecutionCwd(store, task, cwd)) || cwd;
			const isolatedWorktree = agentExecCwd !== cwd;
			let agentPrompt = curatedPrompt;
			if (store._isBranchModeEnabled(projectId) && task.branch) {
				agentPrompt = `${curatedPrompt}\n\n# Git Context\nAll work in this stage happens on git branch \`${task.branch}\` (created for this task). You can verify it with \`git branch --show-current\`.` +
					(isolatedWorktree
						? ` Your working directory is the isolated worktree \`${agentExecCwd}\` — stay inside it; files you leave outside it are invisible to your task.`
						: ``) +
					` Do NOT checkout, merge, rebase, push, or delete branches — the engine owns the branch lifecycle (default branch → task branch → commit → push when a remote exists → back to the default branch) and the pipeline's merge stage integrates your work into the main branch after this stage passes.`;
			}
			store._saveTaskMarkdown(cwd, task);

			try {
				recordStageHeartbeat(store, taskId, { stageId: stage.id, kind: "agent" });
			} catch {
				// Heartbeats are best-effort monitoring; never break dispatch.
			}
			bridge?.emitProcessEvent?.(projectId, "process:start", {
				taskId,
				stageId: stage.id,
				stageName: stage.name,
				stageType: "agent",
				prompt: curatedPrompt,
				cwd: agentExecCwd,
				projectName,
			});

			let streamedOutput = "";
			let finalOutput = "";
			let summary = "";
			let modifiedFiles = [];
			let runHarnessId;
			let runFailureKind;

			if (agentRunner) {
				const logEntryStartIndex = Array.isArray(task.logEntries)
					? task.logEntries.length
					: 0;
				const onChunk = (chunk) => {
					if (!chunk) return;
					try {
						recordStageHeartbeat(store, taskId, { stageId: stage.id, kind: "agent" });
					} catch {
						// Heartbeats are best-effort monitoring; never break streaming.
					}
					streamedOutput += chunk;
					if (streamedOutput.length > config.processLogMaxBytes) {
						streamedOutput = streamedOutput.slice(-config.processLogMaxBytes);
					}
					_appendProcessLog(task, chunk);
				};

				try {
					const timeout = resolveStageTimeout(stage, stageType, config, projectObj);
					const result = await agentRunner(agentPrompt, {
						cwd: agentExecCwd,
						taskId,
						stage,
						projectId,
						model: stage.model,
						timeout,
						onChunk,
						branch: task.branch || null,
						imageFiles: taskImageRefs,
					});

					if (
						result &&
						typeof result === "object" &&
						Array.isArray(result.logEntries)
					) {
						_replaceLogEntries(task, logEntryStartIndex, result.logEntries);
					}

					let failedByAgent = false;
					let agentFailureReason = null;

					if (typeof result === "string") {
						finalOutput = result;
					} else if (result && typeof result === "object") {
						finalOutput = result.output || result.content || streamedOutput;
						summary = result.summary || "";
						modifiedFiles = result.modifiedFiles || result.files || [];
						// The session's reported identity wins; a blank one
						// (pre-contract sessions) falls back to the peeked
						// stage/project resolution so the run still attributes —
						// reusing the SAME peeked target the init line logged
						// (re-peeking only when the init read was unavailable).
						const reportedHarnessId =
							typeof result.harnessId === "string" && result.harnessId.trim()
								? result.harnessId.trim()
								: null;
						runHarnessId =
							reportedHarnessId ??
							(peekedHarnessName && hasHarness(peekedHarnessName)
								? peekedHarnessName
								: resolveRunHarnessFallback(store, projectObj, stage));
						runFailureKind = result.failureKind;
						if (
							result.failed === true ||
							result.isFailure === true ||
							result.failureReason
						) {
							failedByAgent = true;
							agentFailureReason =
								result.failureReason ||
								result.reason ||
								"Stage failed by agent request";
						}
					} else {
						finalOutput = streamedOutput;
					}

					if (failedByAgent) {
						const agentError = new Error(agentFailureReason);
						// Reliability sample for agent-chosen failures: recorded
						// regardless of the report opt-in, with the same resolved
						// harness attribution the report path uses.
						const failureAt = Date.now();
						recordReliabilitySample(store, projectId, taskId, {
							harnessId: runHarnessId,
							failureKind: runFailureKind || "infrastructure",
							at: failureAt,
							atRaw: new Date(failureAt).toISOString(),
							stageId: stage.id,
							...aliasAttribution,
						});
						// Reliability attribution rides alongside the collapsed
						// error so failure routing can record which harness
						// ran and how it failed (routing behavior unchanged).
						// Uses the resolved ids (fallback included), not the
						// raw result fields.
						const runOutcome =
							result && typeof result === "object"
								? {
										harnessId: runHarnessId,
										failureKind: runFailureKind,
										...aliasAttribution,
									}
								: {};
						// Single taxonomy: the runner outcome (failureKind plus
						// the collapsed reason — the same signals the old
						// dual checks read) drives classification, while the
						// derived agent Error drives stored failure messages.
						return routeStageError(
							store,
							projectId,
							taskId,
							stage,
							agentError,
							{
								stages,
								bridge,
								projectCwd: cwd,
								runOutcome,
								classifyAs: {
									failureKind: runFailureKind,
									failureReason: agentFailureReason,
								},
							},
						);
					}

					// Success: exactly one reliability sample per run, recorded
					// regardless of the report opt-in (reports stay opt-in;
					// samples never are). `runHarnessId` is resolved for object
					// results; plain-string results fall back to the same
					// peeked/fallback precedence so every success attributes.
					const successAt = Date.now();
					recordReliabilitySample(store, projectId, taskId, {
						harnessId:
							runHarnessId ??
							(peekedHarnessName && hasHarness(peekedHarnessName)
								? peekedHarnessName
								: resolveRunHarnessFallback(store, projectObj, stage)),
						failureKind: "none",
						at: successAt,
						atRaw: new Date(successAt).toISOString(),
						stageId: stage.id,
						...aliasAttribution,
					});
				} catch (err) {
					// A throw carries no runner result (timeouts, spawn and
					// connectivity blows up), but the run still happened: it
					// counts as an infrastructure attempt — EXCEPT operator
					// aborts, which are scheduled interventions, not
					// reliability signal. The harness half reuses the same
					// peeked/fallback precedence as the result path, and the
					// peeked alias target for THIS run is already known, so the
					// failed attempt attributes instead of vanishing from the
					// rate. `routeStageError` derives the `infrastructure`
					// outcome kind for the transient retry report. Every branch
					// still routes through the one `classifyStageError` call
					// site — Tier 2 vs Tier 3 vs Tier 4 can never depend on
					// call-site check order.
					const thrownHarnessId =
						peekedHarnessName && hasHarness(peekedHarnessName)
							? peekedHarnessName
							: resolveRunHarnessFallback(store, projectObj, stage);
					if (classifyStageError(err).kind !== "operator-abort") {
						const thrownAt = Date.now();
						recordReliabilitySample(store, projectId, taskId, {
							harnessId: thrownHarnessId,
							failureKind: "infrastructure",
							at: thrownAt,
							atRaw: new Date(thrownAt).toISOString(),
							stageId: stage.id,
							...aliasAttribution,
						});
					}
					return routeStageError(store, projectId, taskId, stage, err, {
						stages,
						bridge,
						projectCwd: cwd,
						runOutcome: {
							harnessId: thrownHarnessId,
							...aliasAttribution,
						},
					});
				}

				const duration = ((Date.now() - startTime) / 1000).toFixed(1);
				bridge?.emitSystemLog?.(
					projectId,
					`[SYSTEM] Stage '${stage.name || stage.id}' completed in ${duration}s`,
					{ taskId, stageId: stage.id, duration },
				);

				bridge?.emitProcessEvent?.(projectId, "process:exit", {
					taskId,
					stageId: stage.id,
					exitCode: 0,
					status: "passed",
					projectName,
				});

				// Engine success report (writer #2) — OPT-IN only. A default
				// agent stage writes NO report on success: neither the prompt
				// instruction (promptCuration.js) nor this engine save fire.
				// Stages that opt in via `stage.report` or the `stage-report`
				// skill keep exactly one report — this structured save is the
				// single deterministic writer (it carries duration, model,
				// and modified files). Non-agent paths never reach this
				// block and are unaffected.
				if (stageWantsReport(stage)) {
					const reportContent = generateStageReportContent({
						task,
						stage,
						output: finalOutput || streamedOutput,
						summary,
						modifiedFiles,
						status: "PASSED",
						duration,
					});

					store.saveStageReport(projectId, taskId, {
						stageName: stage.name || stage.id,
						stageId: stage.id,
						duration: stageElapsedSeconds(task),
						status: "PASSED",
						content: reportContent,
						projectCwd: cwd,
						harnessId: runHarnessId,
						failureKind: runFailureKind,
						...aliasAttribution,
					});
				}

				task.history.push({
					timestamp: new Date().toISOString(),
					action: `Agent stage completed: ${stage.name || stage.id}`,
				});

				if (store._isBranchModeEnabled(projectId)) {
					const finalSummary = await store.finalizeTaskBranch(task, cwd, {
						bridge,
						stageName: stage.name || stage.id,
						startSha: task.currentStageStartSha,
					});
					// Record the explicit commit boundary for this stage and
					// attribute its own diff from that range instead of the
					// cumulative whole-branch total.
					const boundaryStart =
						task.currentStageStartSha || finalSummary?.startSha || null;
					const boundaryEnd = finalSummary?.endSha || null;
					if (boundaryStart && boundaryEnd) {
						task.currentStageStartSha = boundaryStart;
						task.currentStageEndSha = boundaryEnd;
						const stageLabel = stage.name || stage.id;
						const rows = task.timeline.filter(
							(r) => String(r?.stage ?? "") === String(stageLabel),
						);
						let targetRow = rows.length ? rows[rows.length - 1] : null;
						if (!targetRow) {
							store._recordTimeline(task, {
								stage: stageLabel,
								status: "Advanced",
								duration: "--",
								timestamp: new Date().toISOString(),
							});
							targetRow =
								task.timeline && task.timeline.length
									? task.timeline[task.timeline.length - 1]
									: null;
						}
						if (targetRow) {
							targetRow.boundaryStartSha = boundaryStart;
							targetRow.boundaryEndSha = boundaryEnd;
							try {
								const stat = await getCommitRangeDiffStat(
									cwd,
									boundaryStart,
									boundaryEnd,
								);
								if (stat) {
									targetRow.additions = stat.additions;
									targetRow.deletions = stat.deletions;
									targetRow.baseAdditions = stat.additions;
									targetRow.baseDeletions = stat.deletions;
								}
							} catch {
								// Boundary is still persisted; the deferred
								// range attribution handles the rest.
							}
						}
					}
					task.currentStageStartSha = null;
					task.currentStageEndSha = null;
					if (finalSummary?.commitError) {
						return routeStageError(
							store,
							projectId,
							taskId,
							stage,
							new Error(
								`Auto-commit after stage '${stage.name || stage.id}' failed: ${finalSummary.commitError}`,
							),
							{
								stages,
								bridge,
								projectCwd: cwd,
							},
						);
					}
					if (finalSummary?.returnError) {
						// Single taxonomy: branch-cleanup failures route like
						// every other stage error (git-lock retries in place,
						// aborts settle quietly) instead of bypassing the
						// [CLASSIFY] decision log.
						return routeStageError(
							store,
							projectId,
							taskId,
							stage,
							new Error(
								`Could not return to the default branch after stage '${stage.name || stage.id}': ${finalSummary.returnError}`,
							),
							{
								stages,
								bridge,
								projectCwd: cwd,
							},
						);
					}
				}

				bridge?.emitProcessEvent?.(projectId, "stage:complete", {
					taskId,
					stageId: stage.id,
					stageName: stage.name,
					exitCode: 0,
					projectName,
				});

				// Question-me gate (shared with the Runner-report finish so a
				// remote run can never skip the human survey the embedded
				// path would require).
				const surveyPark = parkTaskForSurvey({
					store,
					projectId,
					taskId,
					task,
					stage,
					projectObj,
					cwd,
					bridge,
					stageType,
					finalOutput,
					streamedOutput,
					summary,
					modifiedFiles,
					duration,
				});
				if (surveyPark.parked) return surveyPark.response;

				task.surveyPending = false;
				task.infraRetryCount = 0;
				store.advanceStage(projectId, taskId, stages, bridge, cwd);

				store.lastCompletedTask = { projectId, taskId, timestamp: Date.now() };
				if (store.schedulerRunning) {
					setTimeout(() => {
						store.scheduleTick().catch(() => {});
					}, 50);
				}

				return {
					task,
					stageType,
					status: "passed",
					output: finalOutput || streamedOutput,
					summary,
					modifiedFiles,
					model: stage.model || null,
					duration,
				};
			}

			bridge?.emitSystemLog?.(
				projectId,
				`[WARN] No agentRunner available for stage '${stage.name || stage.id}' on task #KB-${taskShortId}`,
				{ taskId: task.id, stageId: stage.id },
			);
			// No runner, no run: the pending attribution must not survive
			// into a later transition's row for a stage that never ran.
			task.currentRunAttribution = null;
			store.updateTask(projectId, taskId, { status: "in_stage" }, cwd);
			return {
				task,
				stageType,
				status: "in_stage",
				model: stage.model || null,
				prompt: curatedPrompt,
			};
		} finally {
			try {
				clearStageHeartbeat(store, taskId);
				// Stage exited: drop any unconsumed stall-handled marker so it can
				// never suppress a genuine failure of a later attempt.
				clearStallHandled(store, taskId);
			} catch {
				// Heartbeat cleanup is best-effort; never break stage exit.
			}
			if (
				isEngineOwnerOf(store.engineState, taskId) &&
				store.engineState.status !== "checkpoint"
			) {
				// A mid-run pause leaves the engine at "paused", but when the
				// run advanced the task past the pause the owner is stale: a
				// paused engine pointing at a task that is no longer paused
				// would mislead the UI and suppress the fast idle re-tick.
				// Only a task that is still genuinely paused keeps the state.
				const stillPaused =
					store.engineState.status === "paused" &&
					(store.getTask(projectId, taskId) || task)?.status === "paused";
				if (!stillPaused) {
					store.setEngineState({
						status: "idle",
						activeTaskId: null,
						activeProjectId: null,
						activeProjectName: null,
						activeStageId: null,
						activeStageName: null,
						activeStageType: null,
					});
				}
			}
		}
	};

	try {
		return await store.executionQueue.enqueue(executeTaskAction, {
			priority,
			projectId,
			taskId,
		});
	} catch (err) {
		// Settle-guarantee timeout: the entry outlived `queueEntryTimeoutMs`
		// without settling, so the queue released the latch and rejected
		// with EQUEUE_TIMEOUT while the run is still in flight. Rescue the
		// occupant exactly like a scheduler wedge (terminate + transient
		// route + stall discipline + once-per-episode push) and return the
		// routing result flagged for the scheduler, instead of letting a
		// never-settling run park the queue behind it. Any other rejection
		// is the run's own failure and propagates unchanged.
		if (!err || err.code !== EQUEUE_TIMEOUT_CODE) throw err;
		const routed = recoverWedgedQueueEntry(store, {
			projectId,
			taskId,
			stage,
			error: err,
			reason: "entry-timeout",
			bridge,
			projectCwd,
		});
		if (routed && typeof routed === "object") {
			return { ...routed, queueEntryTimeout: true };
		}
		return {
			task: store.getTask?.(projectId, taskId) ?? task ?? null,
			stageType,
			status: "wedged-timeout",
			message: `Stage run exceeded the queue settle guarantee (${EQUEUE_TIMEOUT_CODE}); routed to transient retry`,
			queueEntryTimeout: true,
		};
	}
}
