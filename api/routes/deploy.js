/***
 * MARK: deployRoutes
 * @description Self-deployment API endpoints. Lets the app trigger its own
 *   production deploy (or a fast deploy), query deploy status/history, read the
 *   deploy log, and roll back to the last known-good deployment.
 * @example app.register(deployRoutes, { deps })
 * @param {Object} app
 * @param {Object} [opts]
 * @param {Object} [opts.deps]
 ***/
export default async function deployRoutes(app, { deps } = {}) {
	const { deployManager } = deps || {};

	/***
	 * MARK: GET /deploy/status
	 * @description Returns whether a deploy is running, the last result, and the
	 *   rollback history. Safe to call any time (even mid-deploy, across restarts).
	 ***/
	app.get("/deploy/status", async () => {
		return deployManager.getStatus();
	});

	/***
	 * MARK: POST /deploy
	 * @description Triggers a production self-deploy. Body may include
	 *   `{ fast: true }` to skip tests/security scans for rapid iteration.
	 *   Returns 409 if a deploy is already running.
	 ***/
	app.post(
		"/deploy",
		{
			schema: {
				response: {
					200: {
						type: "object",
						additionalProperties: true,
						properties: {
							ok: { type: "boolean" },
							pid: { type: "number" },
							fast: { type: "boolean" },
						},
					},
					409: {
						type: "object",
						properties: { ok: { type: "boolean" }, error: { type: "string" } },
					},
				},
			},
		},
		async (request, reply) => {
			const { fast = false } = request.body || {};
			const result = await deployManager.triggerDeploy({ fast });
			if (!result.ok) {
				return reply.status(409).send({ ok: false, error: result.error });
			}
			return result;
		},
	);

	/***
	 * MARK: POST /deploy/rollback
	 * @description Triggers a rollback to the last known-good deployment (.prev).
	 *   Returns 409 if a deploy is already running.
	 ***/
	app.post("/deploy/rollback", async (_request, reply) => {
		const result = await deployManager.triggerRollback();
		if (!result.ok) {
			return reply.status(409).send({ ok: false, error: result.error });
		}
		return result;
	});

	/***
	 * MARK: GET /deploy/log
	 * @description Returns the tail of the deploy log (most recent lines).
	 ***/
	app.get("/deploy/log", async (request) => {
		const maxLines = parseInt(request.query?.maxLines, 10) || 200;
		return { log: deployManager.readLog(maxLines) };
	});

	/***
	 * MARK: GET /deploy/changelog
	 * @description Returns the Kainbain changelog baked into the live deploy
	 *   (`$PROD_DIR/changelog.json`, newest first). `?limit=` clamps how many
	 *   entries are returned (default 100, max = baked entries). When no
	 *   changelog was baked, `changelog` is null with `reason: "not-baked"`;
	 *   when generation failed during the deploy, `reason` is
	 *   `"generation-failed"` with the deploy-time error in `detail`.
	 ***/
	app.get(
		"/deploy/changelog",
		{
			schema: {
				querystring: {
					type: "object",
					properties: {
						limit: { type: "string" },
					},
				},
				response: {
					200: {
						type: "object",
						properties: {
							changelog: { type: ["object", "null"], additionalProperties: true },
							reason: { type: ["string", "null"] },
							detail: { type: "string" },
						},
					},
				},
			},
		},
		async (request) => {
			const data = deployManager.readChangelog();
			if (!data) {
				return { changelog: null, reason: "not-baked" };
			}
			if (typeof data.error === "string") {
				return { changelog: null, reason: "generation-failed", detail: data.error };
			}
			if (!Array.isArray(data.entries)) {
				return { changelog: null, reason: "not-baked" };
			}
			let limit = parseInt(request.query?.limit, 10);
			if (!Number.isInteger(limit) || limit < 1) limit = 100;
			limit = Math.min(limit, data.entries.length);
			return {
				changelog: {
					generatedAt: data.generatedAt,
					branch: data.branch,
					commit: data.commit,
					totalCount: data.totalCount,
					truncated: data.truncated,
					limit,
					entries: data.entries.slice(0, limit),
				},
				reason: null,
			};
		},
	);
}
