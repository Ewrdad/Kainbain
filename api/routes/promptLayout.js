// Domain: default prompt layout — HTTP API for settings, preview, and reset.
/***
 * MARK: promptLayoutRoutes
 * @description Fastify routes under `/settings/prompt-layout`:
 *   - `GET /settings/prompt-layout` — current layout state, isDefault, warnings, health counters.
 *   - `PUT /settings/prompt-layout` — validates and updates layout; 400 on contract or unknown token errors.
 *   - `POST /settings/prompt-layout/reset` — restores factory default layout and clears failure counter.
 *   - `POST /settings/prompt-layout/dry-run` — validates and renders against sample data without persisting.
 * @example app.register(promptLayoutRoutes, { deps: { promptEngine } })
 ***/
import {
	DEFAULT_PROMPT_LAYOUT,
	extractLayoutTokens,
	validatePromptLayout,
} from "../../shared/promptLayout.js";
import {
	PromptCurationEngine,
	resolveAutoReinjectedTokens,
} from "../promptCuration.js";
import {
	getPromptLayoutState,
	resetPromptLayout,
	resolvePromptLayoutDir,
	updatePromptLayout,
} from "../promptLayout/layoutStore.js";

const DEFAULT_SAMPLE_TASK = Object.freeze({
	id: "sample-task-1",
	goal: "Implement default prompt layout editor into general app settings",
	project: "kainbain",
});

const DEFAULT_SAMPLE_STAGE = Object.freeze({
	id: "sample-stage-1",
	name: "In Progress",
	type: "agent",
	prompt: "Execute the plan for {{taskGoal}}.",
	report: true,
});

export default async function promptLayoutRoutes(app, { deps } = {}) {
	const dir = deps?.promptLayoutDir || resolvePromptLayoutDir();
	const engine =
		deps?.promptEngine ||
		new PromptCurationEngine({ promptLayoutDir: dir });

	app.get("/settings/prompt-layout", async () => {
		try {
			const state = getPromptLayoutState({ dir });
			const validation = validatePromptLayout(state.layout);
			return {
				...state,
				warnings: validation.warnings,
			};
		} catch {
			return {
				layout: DEFAULT_PROMPT_LAYOUT,
				isDefault: true,
				consecutiveFallbacks: 0,
				degraded: false,
				warnings: [],
			};
		}
	});

	app.put("/settings/prompt-layout", async (request, reply) => {
		const body = request.body || {};
		const layout = body.layout;
		if (typeof layout !== "string") {
			return reply.status(400).send({
				error: "Prompt layout must be a markdown string.",
				errors: ["Prompt layout must be a markdown string."],
				missingMandatory: [],
				unknownTokens: [],
			});
		}

		const validation = validatePromptLayout(layout);
		if (!validation.ok) {
			return reply.status(400).send({
				error: validation.errors.join(" "),
				errors: validation.errors,
				missingMandatory: validation.missingMandatory,
				unknownTokens: validation.unknownTokens,
				warnings: validation.warnings,
			});
		}

		try {
			const state = updatePromptLayout({ dir, layout });
			return {
				...state,
				warnings: validation.warnings,
			};
		} catch (error) {
			const message = error?.message || "Invalid prompt layout";
			if (String(message).startsWith("Invalid prompt layout")) {
				return reply.status(400).send({ error: message });
			}
			return reply.status(500).send({
				error:
					"Could not save prompt layout — check server storage and permissions, then retry",
			});
		}
	});

	app.post("/settings/prompt-layout/reset", async () => {
		const state = resetPromptLayout({ dir });
		return {
			...state,
			warnings: [],
		};
	});

	app.post("/settings/prompt-layout/dry-run", async (request, reply) => {
		const body = request.body || {};
		let candidateLayout = body.layout;

		if (candidateLayout === undefined || candidateLayout === null) {
			const state = getPromptLayoutState({ dir });
			candidateLayout = state.layout;
		}

		if (typeof candidateLayout !== "string") {
			return reply.status(400).send({
				error: "Prompt layout must be a markdown string.",
				errors: ["Prompt layout must be a markdown string."],
				missingMandatory: [],
				unknownTokens: [],
			});
		}

		const validation = validatePromptLayout(candidateLayout);
		if (!validation.ok) {
			return reply.status(400).send({
				error: validation.errors.join(" "),
				errors: validation.errors,
				missingMandatory: validation.missingMandatory,
				unknownTokens: validation.unknownTokens,
				warnings: validation.warnings,
			});
		}

		let sampleTask = DEFAULT_SAMPLE_TASK;
		let sampleStage = DEFAULT_SAMPLE_STAGE;

		// Real-task preview is best-effort: any lookup failure (unknown ids,
		// missing projectId, store error) keeps the fixture sample below.
		if (body.taskId && body.projectId && deps?.taskStore) {
			try {
				const resolvedTask = deps.taskStore.getTask(body.projectId, body.taskId);
				if (resolvedTask) {
					sampleTask = resolvedTask;
					if (body.stageId && Array.isArray(resolvedTask.stages)) {
						const found = resolvedTask.stages.find(
							(s) => s.id === body.stageId || s.name === body.stageId,
						);
						if (found) sampleStage = found;
					}
				}
			} catch {
				// Fall back to fixture
			}
		}

		const sampleOptions = {
			timestamp: "20261012-120000",
			previousReports: [`./docs/tasks/${sampleTask.id || "sample"}/idea-20261012-100000.md`],
			failureDetails: "Sample test failure output: login.spec failed on assertion",
			promptLayout: candidateLayout,
		};

		const layoutTokens = extractLayoutTokens(candidateLayout);
		const autoReinjected = resolveAutoReinjectedTokens(layoutTokens, {
			hasFailureDetails: true,
			stage: sampleStage,
		});

		try {
			const renderedMarkdown = engine.curatePrompt(
				sampleTask,
				sampleStage,
				sampleOptions,
			);
			return {
				renderedMarkdown,
				warnings: validation.warnings,
				autoReinjected,
				fallbackUsed: false,
			};
		} catch (error) {
			// The candidate layout failed to render — retry once on the
			// canonical layout so the preview still shows a usable prompt.
			// If even the canonical render fails, answer 500 (never an
			// unhandled throw): the preview cannot be produced at all.
			let fallbackRender;
			try {
				fallbackRender = engine.curatePrompt(
					sampleTask,
					sampleStage,
					{ ...sampleOptions, promptLayout: DEFAULT_PROMPT_LAYOUT },
				);
			} catch (fallbackError) {
				return reply.status(500).send({
					error: `Could not preview prompt layout: ${fallbackError?.message || error?.message || "render failed"} — check server logs and retry`,
				});
			}
			return {
				renderedMarkdown: fallbackRender,
				warnings: [...validation.warnings, `Render failed: ${error.message}`],
				autoReinjected,
				fallbackUsed: true,
			};
		}
	});
}
