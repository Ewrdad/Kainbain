/***
 * MARK: taskWatchRoutes
 * @description Watching The Work: log streams, advisory stuck-check diagnoses,
 *   and stage markdown reports.
 ***/

export async function registerTaskWatchRoutes(app, deps) {
	const { resolveAndGuardProject, projectStore, taskStore, stuckChecker } = deps;

	/***
	 * MARK: Task Log Feed
	 * @description One dedicated log feed per call. `feed` selects the stream
	 *   (main|thinking|tools|telemetry|raw, default main); `format` selects
	 *   the payload (entries default, or text — a derived view rendered from
	 *   the task's structured logEntries at read time). Structured entries
	 *   are the only stored log representation; prefer this endpoint over
	 *   scraping text.
	 ***/
	app.get(
		"/tasks/:id/logs",
		{
			schema: {
				querystring: {
					type: "object",
					properties: {
						// Deliberately permissive: values are validated in-handler so
						// invalid input keeps the plain `{ error }` 400 body. Allowed
						// values are documented here for the OpenAPI spec.
						feed: {
							type: "string",
							description:
								"Log feed to read: main | thinking | tools | telemetry | raw (default main).",
						},
						format: {
							type: "string",
							description:
								"Payload format: entries (default, structured logEntries) or text (derived view rendered at read time).",
						},
					},
				},
			},
		},
		async (request, reply) => {
			const id = resolveAndGuardProject(request.query?.projectId, reply);
			if (!id) return;

			const feed = request.query.feed || "main";
			const format = request.query.format || "entries";
			if (!["main", "thinking", "tools", "telemetry", "raw"].includes(feed)) {
				return reply.status(400).send({
					error: `Unknown log feed '${feed}' (expected main, thinking, tools, telemetry or raw)`,
				});
			}
			if (!["entries", "text"].includes(format)) {
				return reply.status(400).send({
					error: `Unknown log format '${format}' (expected entries or text)`,
				});
			}

			const payload = taskStore.getTaskLogFeed(id, request.params.id, {
				feed,
				format,
			});
			if (!payload) return reply.status(404).send({ error: "Task not found" });
			return payload;
		},
	);

	/***
	 * MARK: Task Stuck Check
	 * @description Advisory "is it stuck?" diagnosis over the current stage's
	 *   recent logs (one-shot, tools-free model run, never mutates the task).
	 *   Accepts an additive `harness` field naming the harness to diagnose
	 *   with; blank/missing resolves as before (single-harness default).
	 * @example POST /tasks/:id/stuck-check { projectId, model: 'pi::ollama-cloud::gpt-oss:20b-cloud', harness: 'pi', question? }
	 ***/
	app.post("/tasks/:id/stuck-check", async (request, reply) => {
		const id = resolveAndGuardProject(request.body?.projectId, reply);
		if (!id) return;

		const task = taskStore.getTask(id, request.params.id);
		if (!task) return reply.status(404).send({ error: "Task not found" });

		try {
			const result = await stuckChecker.checkStuck({
				projectId: id,
				taskId: request.params.id,
				model: request.body?.model,
				harness: request.body?.harness,
				question: request.body?.question,
			});
			return result;
		} catch (err) {
			const statusCode = err?.statusCode || 502;
			app.log.error(err, "Task stuck check failed");
			return reply
				.status(statusCode)
				.send({ error: err?.message || "Stuck check failed" });
		}
	});

	/***
	 * MARK: Get Task Reports
	 ***/
	app.get("/tasks/:id/reports", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.query?.projectId || request.body?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const reports = taskStore.getTaskReports(id, request.params.id, project?.cwd);
		const seen = new Set();
		const deduplicated = [];
		for (const r of reports) {
			const key = r.filename || r.path;
			if (key && !seen.has(key)) {
				seen.add(key);
				deduplicated.push(r);
			}
		}
		return deduplicated;
	});

	/***
	 * MARK: Save Task Report
	 ***/
	app.post("/tasks/:id/report", async (request, reply) => {
		const { stageName, content } = request.body || {};
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const report = taskStore.saveStageReport(id, request.params.id, {
			stageName,
			content,
			auto: false,
			projectCwd: project?.cwd,
		});
		if (!report) return reply.status(404).send({ error: "Task not found" });
		return { status: "created", report };
	});
}
