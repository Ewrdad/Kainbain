import path from "node:path";
import { collectInvalidSkillReferences } from "../kbReferences.js";
import {
	defaultModelIdsFor,
	validateAliasTargetModels,
	validateDefaultModelCombination,
} from "../aliasTargets.js";
import { hasHarness } from "../agent/harnessRegistry.js";
import { selectAliasTarget } from "../aliasSelector.js";
import { config } from "../config.js";
import { joinHealthUrl } from "../../shared/appUrl.js";
import {
	DEFAULT_PROBE_TIMEOUT_MS,
	isProbeTargetAllowed,
	probeAppHealth,
} from "../appHealth.js";
import {
	normalizeAliasName,
	validateModelAlias,
} from "../../shared/modelAliases.js";
import { computeAliasReliability } from "../watch/aliasReliability.js";
import { normalizeStageType } from "../projectStore.js";

/***
 * MARK: validateModelAliasesPayload
 * @description Validates an incoming `modelAliases` list for project
 *   create/patch in two tiers: must be an array of `{ name, harness, model }`
 *   records satisfying the shared grammar, with unique names. HARD (returned
 *   `error` naming the offending row, save refused): structurally impossible
 *   target pairings — a `none` harness (muse, custom) with a model string,
 *   an unknown harness id, a malformed model ref. SOFT (returned
 *   `warnings[]`, save succeeds): catalog-miss pairings (valid shape, absent
 *   from the target harness's catalog right now). The catalog probe is
 *   memoized per call so N targets on one harness probe once.
 * @example await validateModelAliasesPayload([{ name: "s", harness: "pi", model: "m" }]) => { error: "…", warnings: [] }
 * @param {unknown} value - Incoming `modelAliases` value.
 * @param {Object} [opts]
 * @param {Function} [opts.modelIdsFor] - Catalog probe override (tests inject; defaults to the registry probe).
 * @returns {Promise<{error: string|null, warnings: string[]}>} The hard error and soft warnings.
 ***/
export async function validateModelAliasesPayload(value, { modelIdsFor } = {}) {
	if (!Array.isArray(value)) {
		return { error: "modelAliases must be an array", warnings: [] };
	}
	const probe = modelIdsFor || defaultModelIdsFor;
	const cache = new Map();
	const memoizedProbe = async (harnessId) => {
		if (!cache.has(harnessId)) cache.set(harnessId, probe(harnessId));
		return cache.get(harnessId);
	};
	const seen = new Set();
	const warnings = [];
	for (let i = 0; i < value.length; i++) {
		const reason = validateModelAlias(value[i]);
		if (reason) return { error: `modelAliases[${i}]: ${reason}`, warnings };
		const name = normalizeAliasName(value[i].name);
		if (seen.has(name)) {
			return {
				error: `modelAliases[${i}]: duplicate alias name "${name}"`,
				warnings,
			};
		}
		seen.add(name);
		const { error, warnings: rowWarnings } = await validateAliasTargetModels(
			value[i],
			{ modelIdsFor: memoizedProbe },
		);
		warnings.push(...rowWarnings);
		if (error) return { error: `modelAliases[${i}]: ${error}`, warnings };
	}
	return { error: null, warnings };
}

/***
 * MARK: effectiveHarnessForValidation
 * @description The harness id a `defaultModel` is validated against: the
 *   explicit choice when one is set, else the server's configured default
 *   (blank = "follow the default" — the default's catalog is what a blank
 *   run resolves against).
 * @example effectiveHarnessForValidation("", "pi") => "pi"
 * @param {unknown} harness - The stored/payload harness value.
 * @param {string} fallback - The server default harness id.
 * @returns {string} The effective harness id.
 ***/
export function effectiveHarnessForValidation(harness, fallback) {
	const trimmed = typeof harness === "string" ? harness.trim() : "";
	return trimmed || fallback || "pi";
}

/***
 * MARK: projectsRoutes
 * @description Project discovery, automated provisioning, and per-project workflow stage management.
 * @example app.register(projectsRoutes, { deps })
 ***/
export default async function projectsRoutes(app, { deps }) {
	const { projectStore, taskStore, skillsRegistry, eventBridge } = deps;

	/***
	 * MARK: List Projects
	 ***/
	app.get("/projects", async () => {
		return projectStore.listProjects();
	});

	/***
	 * MARK: Create Project
	 * Automated provisioning: creates project directory, notes space,
	 * symlinks <projectRoot>/docs -> notes space, and initializes <kainbainDirName>/project.json.
	 ***/
	app.post(
		"/projects",
		{
			schema: {
				body: {
					type: "object",
					required: ["name"],
					properties: {
						name: { type: "string" },
						cwd: { type: "string" },
						agentDir: { type: "string" },
						notesPath: { type: "string" },
						notesDir: { type: "string" },
						gitUrl: { type: "string" },
						gitRepo: { type: "string" },
						useBranches: { type: "boolean" },
						preserveReviewDiffAfterMerge: { type: "boolean" },
						resetReviewBaselineOnMerge: { type: "boolean" },
						workspaceIsolation: { type: "string" },
						dirtyTreeRecovery: { type: "string" },
						defaultModel: { type: "string" },
						maxAutoIterations: { type: ["integer", "null"] },
						maxTransientRetries: { type: ["integer", "null"] },
						autoIterationEnabled: { type: ["boolean", "null"] },
						agentTimeoutMs: { type: ["integer", "null"] },
						ciTimeoutMs: { type: ["integer", "null"] },
						deployTimeoutMs: { type: ["integer", "null"] },
						mergeTimeoutMs: { type: ["integer", "null"] },
						modelAliases: {
							type: "array",
							items: { type: "object", additionalProperties: true },
						},
						harness: { type: "string", default: "" },
						harnessCommand: { type: "string" },
						accentColor: { type: "string" },
						stages: { type: "array", items: { type: "object" } },
						docsDirName: { type: ["string", "null"] },
						centralizedDocs: { type: ["boolean", "null"] },
						kainbainDirName: { type: ["string", "null"] },
					},
				},
				response: {
					201: {
						type: "object",
						additionalProperties: true,
						properties: {
							id: { type: "string" },
							name: { type: "string" },
							slug: { type: "string" },
							cwd: { type: "string" },
							notesPath: { type: "string" },
							notesDir: { type: "string" },
							gitUrl: { type: ["string", "null"] },
							gitRepo: { type: ["string", "null"] },
							defaultModel: { type: "string" },
							modelAliases: {
								type: "array",
								items: { type: "object", additionalProperties: true },
							},
							harness: { type: "string" },
							harnessCommand: { type: "string" },
							maxAutoIterations: { type: ["integer", "null"] },
							maxTransientRetries: { type: ["integer", "null"] },
							autoIterationEnabled: { type: ["boolean", "null"] },
							agentTimeoutMs: { type: ["integer", "null"] },
							ciTimeoutMs: { type: ["integer", "null"] },
							deployTimeoutMs: { type: ["integer", "null"] },
							mergeTimeoutMs: { type: ["integer", "null"] },
							accentColor: { type: "string" },
							docsDirName: { type: "string" },
							centralizedDocs: { type: "boolean" },
							kainbainDirName: { type: "string" },
							stages: {
								type: "array",
								items: { type: "object", additionalProperties: true },
							},
							// Soft combination warnings (save succeeded): declared
							// explicitly so Fastify never strips the field.
							warnings: { type: "array", items: { type: "string" } },
						},
					},
					400: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const {
				name,
				cwd,
				agentDir,
				notesPath,
				notesDir,
				gitUrl,
				gitRepo,
				useBranches,
				preserveReviewDiffAfterMerge,
				resetReviewBaselineOnMerge,
				workspaceIsolation,
				dirtyTreeRecovery,
				defaultModel,
				maxAutoIterations,
				maxTransientRetries,
				autoIterationEnabled,
				agentTimeoutMs,
				ciTimeoutMs,
				deployTimeoutMs,
				mergeTimeoutMs,
				modelAliases,
				harness,
				harnessCommand,
				accentColor,
				stages,
				docsDirName,
				centralizedDocs,
				kainbainDirName,
			} = request.body || {};
			if (!name || typeof name !== "string" || !name.trim()) {
				return reply.status(400).send({ error: "Project name is required" });
			}
			const saveWarnings = [];
			const modelIdsFor = deps.modelIdsFor || defaultModelIdsFor;
			if (modelAliases !== undefined) {
				const { error: aliasesError, warnings } =
					await validateModelAliasesPayload(modelAliases, { modelIdsFor });
				if (aliasesError) {
					return reply.status(400).send({ error: aliasesError });
				}
				saveWarnings.push(...warnings);
			}
			if (defaultModel !== undefined) {
				const { error: defaultError, warnings } =
					await validateDefaultModelCombination(
						{
							defaultModel,
							harness: effectiveHarnessForValidation(
								harness,
								config.defaultHarness,
							),
							fromPayload: true,
						},
						{
							modelIdsFor,
							resolveAliasDefault: () =>
								selectAliasTarget(
									{ modelAliases: modelAliases || [], defaultModel },
									defaultModel,
									{
										isHarnessKnown: (id) => hasHarness(id),
										peek: true,
									},
								),
						},
					);
				if (defaultError) {
					return reply.status(400).send({ error: defaultError });
				}
				saveWarnings.push(...warnings);
			}

			try {
				const project = projectStore.createProject({
					name,
					cwd,
					agentDir,
					notesPath,
					notesDir,
					gitUrl,
					gitRepo,
					useBranches,
					preserveReviewDiffAfterMerge,
					resetReviewBaselineOnMerge,
					workspaceIsolation,
					dirtyTreeRecovery,
					defaultModel,
					maxAutoIterations,
					maxTransientRetries,
					autoIterationEnabled,
					agentTimeoutMs,
					ciTimeoutMs,
					deployTimeoutMs,
					mergeTimeoutMs,
					modelAliases,
					harness,
					harnessCommand,
					accentColor,
					stages,
					docsDirName,
					centralizedDocs,
					kainbainDirName,
				});
				return reply.status(201).send(
					saveWarnings.length > 0 ? { ...project, warnings: saveWarnings } : project,
				);
			} catch (err) {
				return reply.status(400).send({ error: err.message });
			}
		},
	);

	/***
	 * MARK: Register Existing Project
	 * Adopts an existing repository directory as a managed project (custom
	 * state folder included). Idempotent: re-registering a known directory
	 * returns the existing project with a 200 instead of creating a
	 * duplicate (201 on first adoption).
	 ***/
	app.post(
		"/projects/register",
		{
			schema: {
				body: {
					type: "object",
					required: ["path"],
					properties: {
						path: { type: "string" },
						name: { type: "string" },
						kainbainDirName: { type: ["string", "null"] },
					},
				},
			},
		},
		async (request, reply) => {
			const { path: dirPath, name, kainbainDirName } = request.body || {};
			if (!dirPath || typeof dirPath !== "string" || !dirPath.trim()) {
				return reply.status(400).send({ error: "Project path is required" });
			}
			try {
				const alreadyKnown = projectStore
					.listProjects()
					.some(
						(p) =>
							p.cwd &&
							path.resolve(p.cwd) === path.resolve(dirPath.trim()),
					);
				const project = projectStore.registerProject({
					path: dirPath,
					name,
					kainbainDirName,
				});
				return reply.status(alreadyKnown ? 200 : 201).send(project);
			} catch (err) {
				return reply.status(400).send({ error: err.message });
			}
		},
	);

	/***
	 * MARK: Get Project
	 ***/
	app.get(
		"/projects/:id",
		{
			schema: {
				params: { type: "object", properties: { id: { type: "string" } } },
				response: {
					200: {
						type: "object",
						additionalProperties: true,
						properties: {
							id: { type: "string" },
							name: { type: "string" },
							slug: { type: "string" },
							cwd: { type: "string" },
							notesPath: { type: "string" },
							notesDir: { type: "string" },
							gitUrl: { type: ["string", "null"] },
							gitRepo: { type: ["string", "null"] },
							defaultModel: { type: "string" },
							modelAliases: {
								type: "array",
								items: { type: "object", additionalProperties: true },
							},
							harness: { type: "string" },
							harnessCommand: { type: "string" },
							maxAutoIterations: { type: ["integer", "null"] },
							maxTransientRetries: { type: ["integer", "null"] },
							autoIterationEnabled: { type: ["boolean", "null"] },
							agentTimeoutMs: { type: ["integer", "null"] },
							ciTimeoutMs: { type: ["integer", "null"] },
							deployTimeoutMs: { type: ["integer", "null"] },
							mergeTimeoutMs: { type: ["integer", "null"] },
							accentColor: { type: "string" },
							docsDirName: { type: "string" },
							centralizedDocs: { type: "boolean" },
							kainbainDirName: { type: "string" },
							stages: {
								type: "array",
								items: { type: "object", additionalProperties: true },
							},
						},
					},
					404: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const project = projectStore.getProject(request.params.id);
			if (!project) return reply.status(404).send({ error: "Project not found" });
			return project;
		},
	);

	/***
	 * MARK: Patch Project
	 * The body schema validates `harness`, `harnessCommand`, and the
	 * retry/timeout overrides when present (a wrong type is a client error);
	 * every other field keeps passing through to the store unchanged,
	 * matching the schema-free patch behavior that predates it.
	 ***/
	app.patch(
		"/projects/:id",
		{
			schema: {
				body: {
					type: "object",
					properties: {
						harness: { type: "string" },
						harnessCommand: { type: "string" },
						docsDirName: { type: ["string", "null"] },
						centralizedDocs: { type: ["boolean", "null"] },
						kainbainDirName: { type: ["string", "null"] },
						modelAliases: {
							type: "array",
							items: { type: "object", additionalProperties: true },
						},
						maxAutoIterations: { type: ["integer", "null"] },
						maxTransientRetries: { type: ["integer", "null"] },
						autoIterationEnabled: { type: ["boolean", "null"] },
						agentTimeoutMs: { type: ["integer", "null"] },
						ciTimeoutMs: { type: ["integer", "null"] },
						deployTimeoutMs: { type: ["integer", "null"] },
						mergeTimeoutMs: { type: ["integer", "null"] },
					},
				},
			},
		},
		async (request, reply) => {
			const expectedUpdatedAt =
				request.headers["if-match"] || request.body?.expectedUpdatedAt;
			const saveWarnings = [];
			const modelIdsFor = deps.modelIdsFor || defaultModelIdsFor;
			if (request.body?.modelAliases !== undefined) {
				const { error: aliasesError, warnings } =
					await validateModelAliasesPayload(request.body.modelAliases, {
						modelIdsFor,
					});
				if (aliasesError) {
					return reply.status(400).send({ error: aliasesError });
				}
				saveWarnings.push(...warnings);
			}
			// The default↔harness combination is re-checked whenever either
			// half arrives in the payload: a payload ref is held to the hard
			// tier, while a stored ref re-checked under a new harness warns
			// softly only (unrelated saves are never blocked by pre-existing
			// data). Nothing is stored or rewritten by this check.
			if (
				request.body?.defaultModel !== undefined ||
				request.body?.harness !== undefined
			) {
				const stored = projectStore.getProject(request.params.id);
				if (!stored) {
					return reply.status(404).send({ error: "Project not found" });
				}
				const effectiveDefault =
					request.body.defaultModel !== undefined
						? request.body.defaultModel
						: stored.defaultModel;
				const effectiveHarnessRaw =
					request.body.harness !== undefined
						? request.body.harness
						: stored.harness;
				const { error: defaultError, warnings } =
					await validateDefaultModelCombination(
						{
							defaultModel: effectiveDefault,
							harness: effectiveHarnessForValidation(
								effectiveHarnessRaw,
								config.defaultHarness,
							),
							fromPayload: request.body.defaultModel !== undefined,
						},
						{
							modelIdsFor,
							resolveAliasDefault: () =>
								selectAliasTarget(
									{
										modelAliases:
											request.body.modelAliases !== undefined
												? request.body.modelAliases
												: stored.modelAliases || [],
										defaultModel: effectiveDefault,
									},
									effectiveDefault,
									{
										isHarnessKnown: (id) => hasHarness(id),
										peek: true,
									},
								),
						},
					);
				if (defaultError) {
					return reply.status(400).send({ error: defaultError });
				}
				saveWarnings.push(...warnings);
			}
			try {
				const project = projectStore.updateProject(
					request.params.id,
					request.body || {},
					{ expectedUpdatedAt },
				);
				if (!project) return reply.status(404).send({ error: "Project not found" });
				// PATCH carries no response schema, so the additive warnings[]
				// passes through untouched (unlike POST, no schema edit needed).
				return saveWarnings.length > 0
					? { ...project, warnings: saveWarnings }
					: project;
			} catch (err) {
				if (err.statusCode === 409) {
					return reply.status(409).send({ error: err.message });
				}
				if (err.statusCode === 400) {
					return reply.status(400).send({ error: err.message });
				}
				throw err;
			}
		},
	);

	/***
	 * MARK: Delete Project
	 ***/
	app.delete("/projects/:id", async (request, reply) => {
		const ok = projectStore.deleteProject(request.params.id);
		if (!ok) return reply.status(404).send({ error: "Project not found" });
		return { status: "deleted", id: request.params.id };
	});

	/***
	 * MARK: Activate Project
	 ***/
	app.post("/projects/:id/activate", async (request, reply) => {
		const ok = projectStore.setActiveProject(request.params.id);
		if (!ok) return reply.status(404).send({ error: "Project not found" });
		return { status: "activated", projectId: request.params.id };
	});

	/***
	 * MARK: Workflow Stage Management (per project, backward compatible)
	 ***/
	app.get("/projects/:id/workflow", async (request, reply) => {
		const stages = projectStore.getStages(request.params.id);
		if (!stages) return reply.status(404).send({ error: "Project not found" });
		const project = projectStore.getProject(request.params.id);
		const activeWorkflow = projectStore.getActiveWorkflow(request.params.id);
		return {
			stages,
			currentStageId: project?.currentStageId || null,
			activeWorkflowId: project?.activeWorkflowId || null,
			workflows: project?.workflows || [],
			workflow: activeWorkflow,
		};
	});

	/***
	 * MARK: Update Workflow Stages
	 ***/
	app.put("/projects/:id/workflow", async (request, reply) => {
		const { stages, expectedUpdatedAt } = request.body || {};
		if (!Array.isArray(stages)) {
			return reply.status(400).send({ error: "stages array is required" });
		}

		// Save-time semantic validation of skill attachment configs: values of
		// kbRef-declared keywords must resolve to a known project/workflow/stage.
		// Fail-closed on invalid references; everything legacy/unknown stays
		// tolerated (see collectInvalidSkillReferences). When the registry is not
		// wired in (minimal test rigs) or the project is unknown, the existing
		// updateStages flow handles it unchanged.
		const project = projectStore.getProject(request.params.id);
		if (project && skillsRegistry) {
			const details = collectInvalidSkillReferences({
				stages,
				project,
				projectId: request.params.id,
				projectStore,
				skillsRegistry,
			});
			if (details.length > 0) {
				return reply.status(400).send({
					error: "Invalid skill target references in stage.skills",
					details,
				});
			}
		}

		const ifMatch = request.headers["if-match"] || expectedUpdatedAt;
		try {
			const updated = projectStore.updateStages(request.params.id, stages, {
				expectedUpdatedAt: ifMatch,
			});
			if (!updated) return reply.status(404).send({ error: "Project not found" });

			if (taskStore && typeof taskStore.listTasks === "function") {
				const project = projectStore.getProject(request.params.id);
				const tasks = taskStore.listTasks(request.params.id, project?.cwd);
				for (const task of tasks) {
					const stage = updated.find(
						(s) =>
							String(s.id) === String(task.currentStageId) ||
							(s.name &&
								String(s.name).toLowerCase() ===
									String(task.currentStageId).toLowerCase()),
					);
					if (stage) {
						// Normalized so a legacy `review` checkpoint is reclassified
						// as human exactly like an explicit `human` stage.
						const stageType = normalizeStageType(stage.type);
						if (stageType === "human" && task.status === "in_stage") {
							taskStore.updateTask(
								request.params.id,
								task.id,
								{ status: "waiting_human" },
								project?.cwd,
							);
						} else if (stageType !== "human" && task.status === "waiting_human") {
							taskStore.updateTask(
								request.params.id,
								task.id,
								{ status: "in_stage" },
								project?.cwd,
							);
						}
					}
				}
			}

			return { stages: updated };
		} catch (err) {
			if (err.statusCode === 409) {
				return reply.status(409).send({ error: err.message });
			}
			throw err;
		}
	});

	/***
	 * MARK: List Named Workflows for Project
	 ***/
	app.get("/projects/:id/workflows", async (request, reply) => {
		const project = projectStore.getProject(request.params.id);
		if (!project) return reply.status(404).send({ error: "Project not found" });
		const workflows = projectStore.getWorkflows(request.params.id);
		return {
			workflows: workflows || [],
			activeWorkflowId: project.activeWorkflowId,
		};
	});

	/***
	 * MARK: Create Named Workflow for Project
	 ***/
	app.post("/projects/:id/workflows", async (request, reply) => {
		const project = projectStore.getProject(request.params.id);
		if (!project) return reply.status(404).send({ error: "Project not found" });

		const { name, stages, isDefault } = request.body || {};
		if (!name || typeof name !== "string" || !name.trim()) {
			return reply.status(400).send({ error: "Workflow name is required" });
		}

		try {
			const workflow = projectStore.createWorkflow(request.params.id, {
				name,
				stages,
				isDefault,
			});
			return reply.status(201).send(workflow);
		} catch (err) {
			return reply.status(400).send({ error: err.message });
		}
	});

	/***
	 * MARK: Switch Active Workflow for Project
	 ***/
	app.post(
		"/projects/:id/workflows/:workflowId/switch",
		async (request, reply) => {
			const project = projectStore.getProject(request.params.id);
			if (!project) return reply.status(404).send({ error: "Project not found" });

			const result = projectStore.switchWorkflow(
				request.params.id,
				request.params.workflowId,
			);
			if (!result) {
				return reply.status(404).send({ error: "Workflow not found" });
			}
			return result;
		},
	);

	/***
	 * MARK: Update Named Workflow
	 ***/
	app.patch("/projects/:id/workflows/:workflowId", async (request, reply) => {
		const project = projectStore.getProject(request.params.id);
		if (!project) return reply.status(404).send({ error: "Project not found" });

		const updated = projectStore.updateWorkflow(
			request.params.id,
			request.params.workflowId,
			request.body || {},
		);
		if (!updated) {
			return reply.status(404).send({ error: "Workflow not found" });
		}
		return updated;
	});

	/***
	 * MARK: Delete Named Workflow
	 ***/
	app.delete("/projects/:id/workflows/:workflowId", async (request, reply) => {
		const project = projectStore.getProject(request.params.id);
		if (!project) return reply.status(404).send({ error: "Project not found" });

		try {
			const ok = projectStore.deleteWorkflow(
				request.params.id,
				request.params.workflowId,
			);
			if (!ok) return reply.status(404).send({ error: "Workflow not found" });
			return {
				status: "deleted",
				workflowId: request.params.workflowId,
				activeWorkflowId: project.activeWorkflowId,
			};
		} catch (err) {
			return reply.status(400).send({ error: err.message });
		}
	});

	/***
	 * MARK: Stage Jump (Non-linear failback)
	 ***/
	app.post("/projects/:id/workflow/jump", async (request, reply) => {
		const { stageId } = request.body || {};
		if (!stageId) return reply.status(400).send({ error: "stageId is required" });
		const project = projectStore.jumpToStage(request.params.id, stageId);
		if (!project)
			return reply.status(404).send({ error: "Project or stage not found" });
		return { status: "jumped", currentStageId: project.currentStageId };
	});

	/***
	 * MARK: Update App Status ("Go to App" link)
	 * Small script-friendly endpoint: agents (via the update-app-status
	 * skill) and plain curl scripts PATCH the same flat payload to point the
	 * project's link at a dev server. Broadcasts APP_STATUS_UPDATED so every
	 * connected client shows the link without a refresh.
	 ***/
	app.patch(
		"/projects/:id/app-status",
		{
			schema: {
				body: {
					type: "object",
					properties: {
						url: { type: ["string", "null"] },
						networkHost: { type: ["string", "null"] },
						status: { type: "string" },
						healthEndpoint: { type: ["string", "null"] },
					},
				},
			},
		},
		async (request, reply) => {
			const project = projectStore.getProject(request.params.id);
			if (!project) return reply.status(404).send({ error: "Project not found" });
			try {
				const updated = projectStore.updateAppStatus(
					request.params.id,
					request.body || {},
				);
				eventBridge?.broadcastGlobal?.("APP_STATUS_UPDATED", updated);
				return updated;
			} catch (err) {
				if (err.statusCode === 400) {
					return reply.status(400).send({ error: err.message });
				}
				throw err;
			}
		},
	);

	/***
	 * MARK: Probe App Health
	 * Backend proxy probe for the project's "Go to App" link: fetches
	 * `url + healthEndpoint` server-side (no browser CORS issues) with a 3s
	 * budget, records the outcome on the link, and broadcasts it. The SSRF
	 * guard only allows loopback, the project's own stored app hosts, and
	 * `KAINBAIN_APP_HEALTH_HOSTS`; redirects are never followed.
	 ***/
	app.get("/projects/:id/app-status/health", async (request, reply) => {
		const project = projectStore.getProject(request.params.id);
		if (!project) return reply.status(404).send({ error: "Project not found" });
		const link = project.appStatus;
		if (!link?.url) {
			return reply.status(404).send({ error: "No app link configured" });
		}
		const storedHosts = [link.url, link.resolvedUrl]
			.map((candidate) => {
				try {
					return new URL(candidate).hostname;
				} catch {
					return null;
				}
			})
			.filter(Boolean);
		const target = joinHealthUrl(link.url, link.healthEndpoint || "/");
		if (!target || !isProbeTargetAllowed(target, storedHosts)) {
			return reply
				.status(400)
				.send({ error: "App link target is not probeable" });
		}
		const outcome = await probeAppHealth(target, {
			timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
		});
		const updated = projectStore.recordAppHealth(request.params.id, {
			isHealthy: outcome.healthy,
			checkedAt: outcome.checkedAt,
		});
		if (updated) {
			eventBridge?.broadcastGlobal?.("APP_STATUS_UPDATED", updated);
		}
		return { ...outcome, url: target, appStatus: updated?.appStatus || null };
	});

	/***
	 * MARK: Stage Skip
	 ***/
	app.post("/projects/:id/workflow/skip", async (request, reply) => {
		const projectId = request.params.id;
		const project = projectStore.skipStage(projectId);
		if (!project) return reply.status(404).send({ error: "Project not found" });

		if (taskStore) {
			const tasks = taskStore.listTasks(projectId, project?.cwd);
			for (const task of tasks) {
				if (task.status !== "completed" && task.status !== "done") {
					const index = project.stages.findIndex(
						(s) => s.id === task.currentStageId,
					);
					if (index !== -1 && index < project.stages.length - 1) {
						taskStore.updateTask(
							projectId,
							task.id,
							{ currentStageId: project.stages[index + 1].id },
							project?.cwd,
						);
					}
				}
			}
		}
		return { status: "skipped", currentStageId: project.currentStageId };
	});

	/***
	 * MARK: Project Alias Reliability
	 * @description Serves per-alias, per model+harness target reliability for
	 *   ONE project (`computeAliasReliability`, sample-driven: recorded
	 *   reliability samples first, attributed reports as pre-feature
	 *   fallback): counted runs, clean
	 *   successes, infrastructure failures (loop-guard aborts, connectivity
	 *   errors, timeouts, model errors), and the success rate — all-time plus
	 *   the recent window. Deliberate agent stage-fails ride along as
	 *   `excludedRejected` and never touch the rate. Unknown project → 404;
	 *   a project with no attributed runs → `{ aliases: [] }` so the UI shows
	 *   an honest "no data" state, never 0%.
	 ***/
	app.get(
		"/projects/:id/aliases/reliability",
		{
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							aliases: {
								type: "array",
								items: {
									type: "object",
									properties: {
										aliasName: { type: "string" },
										runs: { type: "number" },
										successes: { type: "number" },
										infraFailures: { type: "number" },
										excludedRejected: { type: "number" },
										successRate: { type: ["number", "null"] },
										lastRunAt: { type: ["string", "null"] },
										recent: {
											type: "object",
											properties: {
												runs: { type: "number" },
												successes: { type: "number" },
												infraFailures: { type: "number" },
												excludedRejected: { type: "number" },
												successRate: { type: ["number", "null"] },
											},
											required: [
												"runs",
												"successes",
												"infraFailures",
												"excludedRejected",
												"successRate",
											],
											additionalProperties: false,
										},
										targets: {
											type: "array",
											items: {
												type: "object",
												properties: {
													harness: { type: "string" },
													model: { type: "string" },
													runs: { type: "number" },
													successes: { type: "number" },
													infraFailures: { type: "number" },
													excludedRejected: { type: "number" },
													successRate: { type: ["number", "null"] },
													lastRunAt: { type: ["string", "null"] },
													recent: {
														type: "object",
														properties: {
															runs: { type: "number" },
															successes: { type: "number" },
															infraFailures: { type: "number" },
															excludedRejected: { type: "number" },
															successRate: { type: ["number", "null"] },
														},
														required: [
															"runs",
															"successes",
															"infraFailures",
															"excludedRejected",
															"successRate",
														],
														additionalProperties: false,
													},
												},
												required: [
													"harness",
													"model",
													"runs",
													"successes",
													"infraFailures",
													"excludedRejected",
													"successRate",
													"lastRunAt",
													"recent",
												],
												additionalProperties: false,
											},
										},
									},
									required: [
										"aliasName",
										"runs",
										"successes",
										"infraFailures",
										"excludedRejected",
										"successRate",
										"lastRunAt",
										"recent",
										"targets",
									],
									additionalProperties: false,
								},
							},
						},
					},
				},
			},
		},
		async (request, reply) => {
			const project = projectStore.getProject(request.params.id);
			if (!project) return reply.status(404).send({ error: "Project not found" });
			return { aliases: computeAliasReliability(taskStore, request.params.id) || [] };
		},
	);
}
