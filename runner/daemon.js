import { listOrphanWorkdirs, prepareWorkdir } from "./project.js";
import { runHarnessStage } from "./harness.js";
import { commitAndPush } from "./gitOps.js";

export const RUNNER_VERSION = "0.1.0";

/***
 * MARK: defaultLoadHarness
 * @description Resolves a harness implementation by id for loopback runs.
 *   Anything HarnessSession-conforming works; only the ids below are
 *   wired (anything else fails fast naming what is supported).
 * @example const h = await defaultLoadHarness('mock')
 * @param {string} harnessId - Harness id (mock, pi).
 * @returns {Promise<Object>} Harness with `createSession`.
 ***/
export async function defaultLoadHarness(harnessId) {
	if (harnessId === "mock") {
		const { createMockHarness } = await import(
			"../api/agent/harnesses/mock/mockHarness.js"
		);
		return createMockHarness({ models: [] });
	}
	if (harnessId === "pi") {
		const { createPiHarness } = await import("../api/agent/harnesses/pi/piHarness.js");
		return createPiHarness({});
	}
	throw new Error(`Unknown harness ${harnessId} (supported: mock, pi).`);
}

function factsFor({ config, harnessVersions }) {
	return {
		harnesses: [{ id: config.harnessId, version: harnessVersions?.[config.harnessId] ?? "unknown" }],
		models: config.model ? [config.model] : [],
		tiers: config.tiers,
		diskHeadroomMb: null,
		versions: { protocol: "v1", runner: RUNNER_VERSION },
	};
}

/***
 * MARK: runSingleAssignment
 * @description One explicit task assignment over the wire (ADR 0009 steps
 *   1–6, loopback): register (or poll a pending join until the human
 *   approves, then exit asking for the pasted credential), heartbeat,
 *   claim, load (clone/pull or adopt + per-task worktree), run the stage
 *   through the harness, stream sequenced logs, commit/push (push skipped
 *   `no-remote`), and complete with the SHA. Any failure after the claim
 *   interrupts the task so it re-queues as interrupted, never
 *   failed/complete. Orphaned workdirs are surfaced at boot, never
 *   deleted. Capability-aware dispatch (which task to run) is Phase 3 —
 *   the assignment comes from config.
 * @example await runSingleAssignment({ config, client, loadHarness }) => { executionId, epoch, sha }
 * @param {Object} opts - Options.
 * @param {Object} opts.config - Normalized runner config.
 * @param {Object} opts.client - Runner backend client.
 * @param {Function} [opts.loadHarness] - Harness loader (tests inject fakes).
 * @param {Object} [opts.logger] - Logger (defaults to console).
 * @returns {Promise<Object>} Execution summary.
 ***/
export async function runSingleAssignment({
	config,
	client,
	loadHarness = defaultLoadHarness,
	logger = console,
}) {
	if (config.errors?.length) {
		throw new Error(`Invalid Runner config: ${config.errors.join(" ")}`);
	}
	const orphans = listOrphanWorkdirs(config.workRoot, config.taskId);
	if (orphans.length) {
		logger.warn(`Orphaned workdirs (left alone, may hold unpushed work): ${orphans.join(", ")}`);
	}

	if (!config.credential) {
		if (!config.joinToken) {
			throw new Error("No credential and no KAINBAIN_RUNNER_JOIN_TOKEN: cannot join.");
		}
		const deadline = Date.now() + config.approvalTimeoutMs;
		for (;;) {
			const reg = await client.register({
				runnerId: config.runnerId,
				joinToken: config.joinToken,
				facts: factsFor({ config }),
			});
			if (reg.status === "active") break;
			if (Date.now() > deadline) {
				throw new Error(`Join for ${config.runnerId} still ${reg.status} after timeout.`);
			}
			logger.log(`Join ${reg.status}; waiting for human approval in Settings › Harness › Runners…`);
			await new Promise((r) => setTimeout(r, config.approvalPollMs));
		}
		throw new Error(
			`Join for ${config.runnerId} approved. Paste the one-time credential shown in Settings › Harness › Runners into KAINBAIN_RUNNER_CREDENTIAL and restart.`,
		);
	}
	client.setCredential(config.credential);

	const harness = await loadHarness(config.harnessId);
	const facts = factsFor({ config });
	const beat = await client.heartbeat({ runnerId: config.runnerId, facts });
	if (beat.status !== "active") {
		throw new Error(`Runner ${config.runnerId} is ${beat.status}; need an active registration.`);
	}
	const heartbeatTimer = setInterval(() => {
		client.heartbeat({ runnerId: config.runnerId, facts }).catch((err) => {
			logger.warn(`Heartbeat failed: ${err?.message || err}`);
		});
	}, config.heartbeatMs);
	if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();

	try {
		const project = await client.getProject(config.projectId);
		const task = await client.getTask(config.projectId, config.taskId);
		const stageId = String(task.currentStageId ?? task.stages?.[0]?.id ?? "stage");

		const runStartedAt = Date.now();
		const { executionId, epoch } = await client.claim({
			taskId: config.taskId,
			projectId: config.projectId,
		});
		try {
			await client.progress({
				taskId: config.taskId,
				projectId: config.projectId,
				executionId,
				epoch,
				stageId,
				event: "started",
			});
			const { workdir, branch, mode, reused } = await prepareWorkdir({
				repoUrl: project.gitUrl || project.repoUrl || null,
				localPath: project.cwd || null,
				workRoot: config.workRoot,
				taskId: config.taskId,
			});
			logger.log(`Workdir ${workdir} (${mode}${reused ? ", reused" : ""}).`);

			let seq = 0;
			const sendLogs = async (bytes) => {
				for (const chunk of String(bytes).split("\n")) {
					if (!chunk) continue;
					await client.logs({
						taskId: config.taskId,
						projectId: config.projectId,
						executionId,
						epoch,
						seq: seq++,
						bytes: chunk.slice(0, 4000),
					});
				}
			};

			const prompt = [
				`Task goal: ${task.goal || task.title || config.taskId}`,
				`Stage: ${stageId}`,
				`Working directory: ${workdir}`,
				`Branch: ${branch}`,
				"Implement the stage goal in the working directory. Keep changes scoped to the task.",
			].join("\n");

			const { output } = await runHarnessStage({
				harness,
				project,
				workdir,
				taskId: config.taskId,
				stageId,
				model: config.model,
				prompt,
				onLog: (text) => {
					sendLogs(text).catch((err) => {
						logger.warn(`Log ingest failed: ${err?.message || err}`);
					});
				},
			});
			await client.progress({
				taskId: config.taskId,
				projectId: config.projectId,
				executionId,
				epoch,
				stageId,
				event: "finished",
			});

			const { sha, pushed, pushSkipped } = await commitAndPush({
				workdir,
				branch,
				message: `kb/${config.taskId} ${stageId}: Runner ${config.runnerId} stage output`,
			});
			logger.log(`Committed ${sha} (pushed: ${pushed}${pushSkipped ? `, ${pushSkipped}` : ""}).`);
			if (output) {
				await sendLogs(`stage output: ${String(output).slice(0, 4000)}`);
			}
			return await client.complete({
				taskId: config.taskId,
				projectId: config.projectId,
				executionId,
				epoch,
				sha,
				branch,
				posture: `${config.tiers.join("/")}:${config.harnessId}:${config.model || "default"}`,
				outcome: "passed",
				output: String(output || "").slice(0, 20000),
				durationMs: Date.now() - runStartedAt,
			});
		} catch (err) {
			if (err?.code === "STALE_EPOCH") throw err;
			if (err?.failedOutcome) {
				// The harness ran and failed: report through the engine's
				// failure routing (verdict/failback) instead of parking.
				return await client.complete({
					taskId: config.taskId,
					projectId: config.projectId,
					executionId,
					epoch,
					outcome: "failed",
					failureReason: err.failedOutcome,
					posture: `${config.tiers.join("/")}:${config.harnessId}:${config.model || "default"}`,
					durationMs: Date.now() - runStartedAt,
				});
			}
			try {
				await client.interrupt({
					taskId: config.taskId,
					projectId: config.projectId,
					executionId,
				});
			} catch {
				// Interrupting is best-effort: the lease TTL still bounds the damage.
			}
			throw err;
		}
	} finally {
		clearInterval(heartbeatTimer);
	}
}
