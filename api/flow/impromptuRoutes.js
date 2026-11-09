import { config } from "../config.js";
import { selectRunnerForImpromptu } from "./dispatch/selectRunnerForImpromptu.js";
import { buildBelowMinimumRefusal } from "./runnerVersionCompat.js";

/***
 * MARK: registerImpromptuRoutes
 * @description Runner-facing impromptu T0 endpoints (ADR 0014): idle Runners
 *   `POST /runners/impromptu/poll` for the oldest queued read-only job they
 *   match, stream `POST /runners/impromptu/:jobId/progress` deltas (fanned
 *   out as `CHAT_PROGRESS` frames by the store's sink), and settle `POST
 *   /runners/impromptu/:jobId/complete`. Same `x-runner-credential` auth and
 *   the same freshness/paused/below-minimum gates as `/runners/dispatch`;
 *   a Runner holding a live task lease is never assigned impromptu work.
 * @example await app.register(registerImpromptuRoutes, { deps })
 ***/
export const registerImpromptuRoutes = async (app, { deps }) => {
	const {
		runnerRegistry,
		claimStore,
		impromptuStore,
		impromptuEnabled = config.impromptuEnabled,
		minRunnerVersion = config.runnerMinVersion,
	} = deps;

	const sendStoreError = (reply, err) => {
		const status = err.statusCode || 500;
		const body = { error: err.message || "Internal error" };
		if (err.code) body.code = err.code;
		return reply.status(status).send(body);
	};

	const authedRunner = (request) => {
		const credential = String(
			request.headers?.["x-runner-credential"] || "",
		).trim();
		return runnerRegistry.authenticate(credential);
	};

	app.post("/runners/impromptu/poll", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		if (impromptuEnabled !== true) {
			return reply.status(409).send({
				error: "Impromptu jobs are disabled on this backend (KAINBAIN_IMPROMPTU_ENABLED=0).",
				code: "IMPROMPTU_DISABLED",
			});
		}
		if (!runnerRegistry.isFresh(runner)) {
			return reply.status(409).send({
				error: `Runner ${runner.runnerId} is stale — heartbeat, then ask again`,
				code: "STALE_RUNNER",
			});
		}
		if (runner.paused === true) {
			return reply.status(409).send({
				error: `Runner ${runner.runnerId} is paused — resume it to take new tasks`,
				code: "RUNNER_PAUSED",
			});
		}
		const belowMinimum = buildBelowMinimumRefusal({ runner, minVersion: minRunnerVersion });
		if (belowMinimum) return reply.status(409).send(belowMinimum);
		// Server-side idle enforcement: a Runner holding a live task lease
		// only polls when idle anyway, but a forged/racy poll must never be
		// assigned impromptu work on top of a task.
		const busyRunnerIds = (claimStore.liveHolds() || [])
			.map((hold) => hold?.runnerId)
			.filter((id) => typeof id === "string");
		if (busyRunnerIds.includes(runner.runnerId)) {
			return { assigned: false, code: "NO_IMPROMPTU_WORK" };
		}
		const assigned = impromptuStore.pollForRunner({
			runnerId: runner.runnerId,
			matchJob: (job) =>
				selectRunnerForImpromptu(
					[runner],
					{
						...(job.harness ? { harness: job.harness } : {}),
						...(job.model ? { model: job.model } : {}),
						...(job.projectId ? { projectId: job.projectId } : {}),
						...(job.pinnedRunnerId ? { pinnedRunnerId: job.pinnedRunnerId } : {}),
					},
					{ staleAfterMs: runnerRegistry.staleAfterMs },
				).record !== null,
		});
		if (!assigned) return { assigned: false, code: "NO_IMPROMPTU_WORK" };
		return { assigned: true, job: assigned };
	});

	app.post("/runners/impromptu/:jobId/progress", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		try {
			const receipt = impromptuStore.progress({
				jobId: request.params.jobId,
				runnerId: runner.runnerId,
				seq: request.body?.seq,
				delta: request.body?.delta,
			});
			return { ok: true, ...(receipt.duplicate ? { duplicate: true } : {}) };
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/impromptu/:jobId/complete", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		try {
			const receipt = impromptuStore.complete({
				jobId: request.params.jobId,
				runnerId: runner.runnerId,
				outcome: request.body?.outcome,
				output: request.body?.output ?? "",
				error: request.body?.error ?? "",
			});
			return { ok: true, ...(receipt.duplicate ? { duplicate: true } : {}) };
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});
};
