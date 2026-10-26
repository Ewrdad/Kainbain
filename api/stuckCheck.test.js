import { describe, it, expect, vi } from "vitest";
import {
	STUCK_VERDICTS,
	STUCK_CHECK_SYSTEM_PROMPT,
	tailLogText,
	buildStuckCheckUserPrompt,
	parseStuckVerdict,
	gatherStuckCheckLogs,
	disposeSessionQuietly,
	runDiagnosisPrompt,
	createStuckChecker,
} from "./stuckCheck.js";
import { SessionStore } from "./sessionStore.js";
import { registerHarness } from "./agent/harnessRegistry.js";
import { selectAliasTarget } from "./aliasSelector.js";

/** Unique suffixes for harnesses/projects registered by the alias-rotation tests. */
let aliasProbeUnique = 9000;
const nextAliasProbeId = (prefix) => `${prefix}-${++aliasProbeUnique}`;

/**
 * MARK: Stuck Check Unit
 * @description Verifies the "is it stuck?" diagnosis core: log tail bounding,
 *   prompt assembly, tolerant verdict parsing, log gathering over the task log
 *   feeds, and the full checkStuck flow against a fake harness + session —
 *   including failure paths (unknown task, unresolvable model, no harness,
 *   model failure, timeout) and the read-only guarantee (no task mutation).
 */
describe("stuckCheck", () => {
	describe("tailLogText", () => {
		it("returns empty string for empty/null input", () => {
			expect(tailLogText("", 100)).toBe("");
			expect(tailLogText(null, 100)).toBe("");
			expect(tailLogText(undefined, 100)).toBe("");
		});

		it("passes through short text unchanged", () => {
			expect(tailLogText("short log", 100)).toBe("short log");
		});

		it("keeps the TAIL of long text and marks the cut", () => {
			const text = Array.from({ length: 100 }, (_, i) => `line-${i}`).join("\n");
			const result = tailLogText(text, 200);
			expect(result.length).toBeLessThanOrEqual(200);
			expect(result).toContain("older log entries truncated");
			expect(result).toContain("line-99"); // most recent line kept
			expect(result).not.toContain("line-0\n"); // oldest dropped
		});

		it("never returns more than the budget even with the marker", () => {
			const text = "x".repeat(5000);
			const result = tailLogText(text, 100);
			expect(result.length).toBeLessThanOrEqual(100);
		});
	});

	describe("buildStuckCheckUserPrompt", () => {
		it("includes goal, stage, main log and the question", () => {
			const prompt = buildStuckCheckUserPrompt({
				goal: "Fix the login bug",
				stageName: "In Progress",
				stageType: "agent",
				mainLog: "[AGENT] running tests",
				toolsLog: "",
			});
			expect(prompt).toContain("Task goal: Fix the login bug");
			expect(prompt).toContain("Current stage: In Progress (type: agent)");
			expect(prompt).toContain("[AGENT] running tests");
			expect(prompt).toContain("does this task's current stage execution look stuck");
			// No tools section when there is no tools log.
			expect(prompt).not.toContain("Tool calls / results");
		});

		it("includes the tools section when a tools log exists", () => {
			const prompt = buildStuckCheckUserPrompt({
				goal: "g",
				stageName: "s",
				mainLog: "m",
				toolsLog: "[TOOL] bash({})",
			});
			expect(prompt).toContain("Tool calls / results from this stage:");
			expect(prompt).toContain("[TOOL] bash({})");
		});

		it("shows a placeholder when there are no logs", () => {
			const prompt = buildStuckCheckUserPrompt({ goal: "g", stageName: "s" });
			expect(prompt).toContain("(no log entries recorded)");
		});

		it("appends the user's focus question", () => {
			const prompt = buildStuckCheckUserPrompt({
				goal: "g",
				stageName: "s",
				mainLog: "m",
				question: "Is it repeating the same test?",
			});
			expect(prompt).toContain("Additional focus from the user: Is it repeating the same test?");
		});

		it("bounds per-feed logs via maxChars", () => {
			const prompt = buildStuckCheckUserPrompt({
				goal: "g",
				stageName: "s",
				mainLog: "a".repeat(500),
				maxChars: 50,
			});
			expect(prompt).toContain("older log entries truncated");
		});
	});

	describe("parseStuckVerdict", () => {
		it("parses STUCK with reasoning", () => {
			const { verdict, summary } = parseStuckVerdict(
				"VERDICT: STUCK\nREASONING: The same bash command repeated 9 times with identical errors.",
			);
			expect(verdict).toBe("stuck");
			expect(summary).toBe("The same bash command repeated 9 times with identical errors.");
		});

		it("parses NOT_STUCK with a space", () => {
			const { verdict } = parseStuckVerdict("VERDICT: NOT STUCK\nREASONING: steady progress");
			expect(verdict).toBe("not_stuck");
		});

		it("parses NOT_STUCK with an underscore", () => {
			const { verdict } = parseStuckVerdict("VERDICT: NOT_STUCK\nREASONING: fine");
			expect(verdict).toBe("not_stuck");
		});

		it("parses UNCLEAR", () => {
			const { verdict } = parseStuckVerdict("VERDICT: UNCLEAR\nREASONING: not enough logs");
			expect(verdict).toBe("unclear");
		});

		it("handles bolded markdown verdicts", () => {
			const { verdict, summary } = parseStuckVerdict(
				"**VERDICT:** STUCK\n**REASONING:** looping",
			);
			expect(verdict).toBe("stuck");
			expect(summary).toBe("looping");
		});

		it("degrades an empty answer to unclear", () => {
			const { verdict, summary } = parseStuckVerdict("   ");
			expect(verdict).toBe("unclear");
			expect(summary).toContain("empty answer");
		});

		it("degrades a chatty non-conforming answer to unclear with the raw text", () => {
			const raw = "The task seems to be progressing normally, no loops observed.";
			const { verdict, summary } = parseStuckVerdict(raw);
			expect(verdict).toBe("unclear");
			expect(summary).toBe(raw);
		});

		it("covers every canonical verdict", () => {
			expect(STUCK_VERDICTS).toEqual(["stuck", "not_stuck", "unclear"]);
		});
	});

	describe("gatherStuckCheckLogs", () => {
		it("collects main and tools feed texts and bounds them", () => {
			const taskStore = {
				getTaskLogFeed: vi.fn((_p, _t, { feed }) => ({
					taskId: "t1",
					feed,
					format: "text",
					text: feed === "main" ? "m".repeat(300) : "[TOOL] x",
				})),
			};
			const { mainLog, toolsLog } = gatherStuckCheckLogs({
				taskStore,
				projectId: "p1",
				taskId: "t1",
				maxChars: 100,
			});
			expect(mainLog.length).toBeLessThanOrEqual(100);
			expect(mainLog).toContain("older log entries truncated");
			expect(toolsLog).toBe("[TOOL] x");
			expect(taskStore.getTaskLogFeed).toHaveBeenCalledWith("p1", "t1", {
				feed: "main",
				format: "text",
			});
			expect(taskStore.getTaskLogFeed).toHaveBeenCalledWith("p1", "t1", {
				feed: "tools",
				format: "text",
			});
		});
	});

	describe("disposeSessionQuietly", () => {
		it("aborts and disposes without throwing", async () => {
			const session = { abort: vi.fn(async () => {}), dispose: vi.fn() };
			await disposeSessionQuietly(session);
			expect(session.abort).toHaveBeenCalled();
			expect(session.dispose).toHaveBeenCalled();
		});

		it("swallows abort/dispose errors", async () => {
			const session = {
				abort: vi.fn(async () => {
					throw new Error("abort boom");
				}),
				dispose: vi.fn(() => {
					throw new Error("dispose boom");
				}),
			};
			await expect(disposeSessionQuietly(session)).resolves.toBeUndefined();
		});

		it("tolerates a missing session", async () => {
			await expect(disposeSessionQuietly(null)).resolves.toBeUndefined();
		});
	});

	describe("runDiagnosisPrompt", () => {
		it("returns the assistant text and disposes the session", async () => {
			const session = {
				prompt: vi.fn(async () => {}),
				getLastAssistantText: vi.fn(() => "VERDICT: STUCK\nREASONING: loop"),
				abort: vi.fn(async () => {}),
				dispose: vi.fn(),
			};
			const answer = await runDiagnosisPrompt({ session, prompt: "p", timeoutMs: 5000 });
			expect(answer).toBe("VERDICT: STUCK\nREASONING: loop");
			expect(session.prompt).toHaveBeenCalledWith("p");
			expect(session.dispose).toHaveBeenCalled();
		});

		it("aborts and rejects when the run exceeds the timeout", async () => {
			const session = {
				prompt: vi.fn(() => new Promise(() => {})), // never resolves
				getLastAssistantText: vi.fn(() => ""),
				abort: vi.fn(async () => {}),
				dispose: vi.fn(),
			};
			await expect(
				runDiagnosisPrompt({ session, prompt: "p", timeoutMs: 30 }),
			).rejects.toThrow("timed out");
			// The abort happens in the finally-cleanup; give the microtask queue a tick.
			await new Promise((r) => setTimeout(r, 10));
			expect(session.dispose).toHaveBeenCalled();
		});

		it("disposes the session when the prompt throws", async () => {
			const session = {
				prompt: vi.fn(async () => {
					throw new Error("provider down");
				}),
				getLastAssistantText: vi.fn(() => ""),
				abort: vi.fn(async () => {}),
				dispose: vi.fn(),
			};
			await expect(
				runDiagnosisPrompt({ session, prompt: "p", timeoutMs: 1000 }),
			).rejects.toThrow("provider down");
			expect(session.dispose).toHaveBeenCalled();
		});
	});

	describe("createStuckChecker.checkStuck", () => {
		const MODEL = { key: "prov::small-model", provider: "prov", id: "small-model", name: "Small" };

		function fakeHarness({ answer = "VERDICT: STUCK\nREASONING: same error 6 times" } = {}) {
			const sessions = [];
			return {
				resolveModelRef: vi.fn(async (ref) => (ref === MODEL.key ? MODEL : null)),
				createDiagnosisSession: vi.fn(async () => {
					const session = {
						prompt: vi.fn(async () => {}),
						getLastAssistantText: vi.fn(() => answer),
						abort: vi.fn(async () => {}),
						dispose: vi.fn(),
					};
					sessions.push(session);
					return session;
				}),
				sessions,
			};
		}

		function fakeStores({ task, stages = [] } = {}) {
			const taskStore = {
				getTask: vi.fn(() => task),
				getTaskLogFeed: vi.fn((_p, _t, { feed }) => ({
					taskId: task?.id,
					feed,
					format: "text",
					text: feed === "main" ? "[AGENT] step 1\n[AGENT] step 1" : "[TOOL] bash({})",
				})),
				updateTask: vi.fn(),
			};
			const projectStore = {
				getProject: vi.fn(() => ({ id: "p1", cwd: "/p", name: "P", stages })),
			};
			return { taskStore, projectStore };
		}

		it("runs the check end to end and returns the parsed verdict", async () => {
			const task = { id: "t1", goal: "Ship it", currentStageId: "s2" };
			const { taskStore, projectStore } = fakeStores({
				task,
				stages: [
					{ id: "s1", name: "Plan", type: "agent" },
					{ id: "s2", name: "In Progress", type: "agent" },
				],
			});
			const harness = fakeHarness();
			const checker = createStuckChecker({ taskStore, projectStore, harnessOverride: harness });

			const result = await checker.checkStuck({
				projectId: "p1",
				taskId: "t1",
				model: MODEL.key,
			});

			expect(result.taskId).toBe("t1");
			expect(result.stage).toEqual({ id: "s2", name: "In Progress", type: "agent" });
			expect(result.model).toEqual({
				key: MODEL.key,
				id: "small-model",
				name: "Small",
				provider: "prov",
			});
			expect(result.verdict).toBe("stuck");
			expect(result.summary).toBe("same error 6 times");
			expect(result.answer).toContain("VERDICT: STUCK");

			// The diagnosis prompt carries the goal, stage and both log feeds.
			const session = harness.sessions[0];
			expect(session.prompt).toHaveBeenCalledTimes(1);
			const prompt = session.prompt.mock.calls[0][0];
			expect(prompt).toContain("Task goal: Ship it");
			expect(prompt).toContain("Current stage: In Progress (type: agent)");
			expect(prompt).toContain("[AGENT] step 1");
			expect(prompt).toContain("[TOOL] bash({})");

			// The session is disposed after the run.
			expect(session.dispose).toHaveBeenCalled();

			// READ-ONLY guarantee: nothing is written back to the task.
			expect(taskStore.updateTask).not.toHaveBeenCalled();
		});

		it("passes the resolved model object and system prompt to the diagnosis session", async () => {
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const { taskStore, projectStore } = fakeStores({ task });
			const harness = fakeHarness();
			const checker = createStuckChecker({ taskStore, projectStore, harnessOverride: harness });

			await checker.checkStuck({ projectId: "p1", taskId: "t1", model: MODEL.key });

			expect(harness.createDiagnosisSession).toHaveBeenCalledTimes(1);
			const [, opts] = harness.createDiagnosisSession.mock.calls[0];
			expect(opts.model).toBe(MODEL);
			expect(opts.systemPrompt).toBe(STUCK_CHECK_SYSTEM_PROMPT);
			expect(STUCK_CHECK_SYSTEM_PROMPT).toContain("no tools");
		});

		it("throws 404 for an unknown task", async () => {
			const { taskStore, projectStore } = fakeStores({ task: undefined });
			const checker = createStuckChecker({
				taskStore,
				projectStore,
				harnessOverride: fakeHarness(),
			});
			await expect(
				checker.checkStuck({ projectId: "p1", taskId: "missing", model: MODEL.key }),
			).rejects.toMatchObject({ statusCode: 404 });
		});

		it("throws 400 when the requested model cannot be resolved", async () => {
			const { taskStore, projectStore } = fakeStores({
				task: { id: "t1", goal: "g", currentStageId: "s1" },
			});
			const checker = createStuckChecker({
				taskStore,
				projectStore,
				harnessOverride: fakeHarness(),
			});
			await expect(
				checker.checkStuck({ projectId: "p1", taskId: "t1", model: "prov::nope" }),
			).rejects.toMatchObject({ statusCode: 400 });
		});

		it("throws 503 when no harness is available", async () => {
			const { taskStore, projectStore } = fakeStores({
				task: { id: "t1", goal: "g", currentStageId: "s1" },
			});
			const checker = createStuckChecker({
				taskStore,
				projectStore,
				harnessOverride: null,
				sessionStore: {},
			});
			await expect(
				checker.checkStuck({ projectId: "p1", taskId: "t1", model: MODEL.key }),
			).rejects.toMatchObject({ statusCode: 503 });
		});

		it("throws 502 when the diagnosis run fails", async () => {
			const { taskStore, projectStore } = fakeStores({
				task: { id: "t1", goal: "g", currentStageId: "s1" },
			});
			const harness = fakeHarness();
			harness.createDiagnosisSession = vi.fn(async () => ({
				prompt: vi.fn(async () => {
					throw new Error("provider exploded");
				}),
				getLastAssistantText: vi.fn(() => ""),
				abort: vi.fn(async () => {}),
				dispose: vi.fn(),
			}));
			const checker = createStuckChecker({ taskStore, projectStore, harnessOverride: harness });
			await expect(
				checker.checkStuck({ projectId: "p1", taskId: "t1", model: MODEL.key }),
			).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining("provider exploded") });
		});

		it("routes the check to the requested harness via the session store", async () => {
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const { taskStore, projectStore } = fakeStores({ task });
			const harnessPi = fakeHarness();
			const harnessOther = fakeHarness();
			const sessionStore = {
				getHarness: vi.fn((project, name) =>
					name === "pi" ? harnessPi : harnessOther,
				),
			};
			const checker = createStuckChecker({ taskStore, projectStore, sessionStore });

			const result = await checker.checkStuck({
				projectId: "p1",
				taskId: "t1",
				model: MODEL.key,
				harness: "pi",
			});

			expect(sessionStore.getHarness).toHaveBeenCalledWith(
				expect.objectContaining({ id: "p1" }),
				"pi",
				{ peek: true },
			);
			expect(harnessPi.createDiagnosisSession).toHaveBeenCalledTimes(1);
			expect(harnessOther.createDiagnosisSession).not.toHaveBeenCalled();
			expect(result.verdict).toBe("stuck");
		});

		it("resolves through the store default when no harness is requested", async () => {
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const { taskStore, projectStore } = fakeStores({ task });
			const harness = fakeHarness();
			const sessionStore = { getHarness: vi.fn(() => harness) };
			const checker = createStuckChecker({ taskStore, projectStore, sessionStore });

			await checker.checkStuck({ projectId: "p1", taskId: "t1", model: MODEL.key });

			// Blank means "behave exactly as before": inherit the store default
			// (peek-only, so an advisory check never consumes an alias step).
			expect(sessionStore.getHarness).toHaveBeenCalledWith(
				expect.objectContaining({ id: "p1" }),
				undefined,
				{ peek: true },
			);
			expect(harness.createDiagnosisSession).toHaveBeenCalledTimes(1);
		});

		it("resolves an alias project default peek-only so the check never consumes a rotation step", async () => {
			// Regression: the advisory stuck check used to resolve the harness
			// without peek, stealing a step from a weighted project-default
			// alias's rotation and skewing the stage-dispatch split.
			const firstName = nextAliasProbeId("stuck-alias-first");
			const secondName = nextAliasProbeId("stuck-alias-second");
			registerHarness(firstName, () => fakeHarness(), {
				description: "stuck-check alias rotation probe",
			});
			registerHarness(secondName, () => fakeHarness(), {
				description: "stuck-check alias rotation probe",
			});
			const projectId = nextAliasProbeId("p-stuck-alias");
			const project = {
				id: projectId,
				cwd: "/p",
				name: "P",
				harness: "alias",
				defaultModel: "mix",
				stages: [{ id: "s1", name: "Build", type: "agent" }],
				modelAliases: [
					{
						name: "mix",
						targets: [
							{ harness: firstName, model: "m1", percent: 50 },
							{ harness: secondName, model: "m2", percent: 50 },
						],
					},
				],
			};
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const taskStore = {
				getTask: vi.fn(() => task),
				getTaskLogFeed: vi.fn(() => ({ text: "[AGENT] step 1" })),
				updateTask: vi.fn(),
			};
			const projectStore = { getProject: vi.fn(() => project) };
			const sessionStore = new SessionStore({});
			const checker = createStuckChecker({ taskStore, projectStore, sessionStore });

			const peeked = selectAliasTarget(project, "mix", {
				isHarnessKnown: () => true,
				peek: true,
			}).targetIndex;
			const result = await checker.checkStuck({
				projectId,
				taskId: "t1",
				model: MODEL.key,
			});
			expect(result.verdict).toBe("stuck");
			// The live rotation still serves the peeked target first: the
			// advisory check consumed nothing.
			const live = selectAliasTarget(project, "mix", { isHarnessKnown: () => true });
			expect(live.targetIndex).toBe(peeked);
		});

		it("runs the diagnosis on the alias target for an explicit alias choice", async () => {
			const targetName = nextAliasProbeId("stuck-alias-target");
			const harness = fakeHarness();
			registerHarness(targetName, () => harness, {
				description: "stuck-check explicit alias probe",
			});
			const projectId = nextAliasProbeId("p-stuck-explicit");
			const project = {
				id: projectId,
				cwd: "/p",
				name: "P",
				harness: "pi",
				stages: [{ id: "s1", name: "Build", type: "agent" }],
				modelAliases: [
					{ name: "small", harness: targetName, model: MODEL.key },
				],
			};
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const taskStore = {
				getTask: vi.fn(() => task),
				getTaskLogFeed: vi.fn(() => ({ text: "[AGENT] step 1" })),
				updateTask: vi.fn(),
			};
			const projectStore = { getProject: vi.fn(() => project) };
			const sessionStore = new SessionStore({});
			const checker = createStuckChecker({ taskStore, projectStore, sessionStore });

			const result = await checker.checkStuck({
				projectId,
				taskId: "t1",
				model: "small",
				harness: "alias",
			});

			expect(result.verdict).toBe("stuck");
			expect(result.model).toMatchObject({ key: MODEL.key, id: MODEL.id });
			expect(harness.createDiagnosisSession).toHaveBeenCalledTimes(1);
			const [, opts] = harness.createDiagnosisSession.mock.calls[0];
			expect(opts.model).toBe(MODEL);
		});

		it("peeks an explicit alias choice without consuming the rotation", async () => {
			const firstName = nextAliasProbeId("stuck-explicit-first");
			const secondName = nextAliasProbeId("stuck-explicit-second");
			registerHarness(firstName, () => fakeHarness(), {
				description: "stuck-check explicit alias rotation probe",
			});
			registerHarness(secondName, () => fakeHarness(), {
				description: "stuck-check explicit alias rotation probe",
			});
			const projectId = nextAliasProbeId("p-stuck-explicit-mix");
			const project = {
				id: projectId,
				cwd: "/p",
				name: "P",
				harness: "pi",
				stages: [{ id: "s1", name: "Build", type: "agent" }],
				modelAliases: [
					{
						name: "mix",
						targets: [
							{ harness: firstName, model: MODEL.key, percent: 50 },
							{ harness: secondName, model: MODEL.key, percent: 50 },
						],
					},
				],
			};
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const taskStore = {
				getTask: vi.fn(() => task),
				getTaskLogFeed: vi.fn(() => ({ text: "[AGENT] step 1" })),
				updateTask: vi.fn(),
			};
			const projectStore = { getProject: vi.fn(() => project) };
			const sessionStore = new SessionStore({});
			const checker = createStuckChecker({ taskStore, projectStore, sessionStore });

			const peeked = selectAliasTarget(project, "mix", {
				isHarnessKnown: () => true,
				peek: true,
			}).targetIndex;
			const result = await checker.checkStuck({
				projectId,
				taskId: "t1",
				model: "mix",
				harness: "alias",
			});
			expect(result.verdict).toBe("stuck");
			const live = selectAliasTarget(project, "mix", { isHarnessKnown: () => true });
			expect(live.targetIndex).toBe(peeked);
		});

		it("throws 400 naming the alias and the available aliases for an unknown alias choice", async () => {
			const targetName = nextAliasProbeId("stuck-alias-known");
			registerHarness(targetName, () => fakeHarness(), {
				description: "stuck-check unknown alias probe",
			});
			const projectId = nextAliasProbeId("p-stuck-ghost");
			const project = {
				id: projectId,
				cwd: "/p",
				name: "P",
				harness: "pi",
				stages: [{ id: "s1", name: "Build", type: "agent" }],
				modelAliases: [
					{ name: "small", harness: targetName, model: MODEL.key },
				],
			};
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const taskStore = {
				getTask: vi.fn(() => task),
				getTaskLogFeed: vi.fn(() => ({ text: "[AGENT] step 1" })),
				updateTask: vi.fn(),
			};
			const projectStore = { getProject: vi.fn(() => project) };
			const sessionStore = new SessionStore({});
			const checker = createStuckChecker({ taskStore, projectStore, sessionStore });

			const failure = await checker
				.checkStuck({
					projectId,
					taskId: "t1",
					model: "ghost",
					harness: "alias",
				})
				.then(
					() => null,
					(err) => err,
				);
			expect(failure).toMatchObject({ statusCode: 400 });
			expect(failure?.message).toContain("Unknown model alias 'ghost'");
			expect(failure?.message).toContain("small");
			expect(failure?.message).not.toContain("Unknown harness");
		});

		it("throws 400 naming the available harnesses for an unknown harness", async () => {
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const { taskStore, projectStore } = fakeStores({ task });
			const sessionStore = { getHarness: vi.fn(() => fakeHarness()) };
			const checker = createStuckChecker({ taskStore, projectStore, sessionStore });

			const failure = await checker
				.checkStuck({
					projectId: "p1",
					taskId: "t1",
					model: MODEL.key,
					harness: "no-such-harness",
				})
				.then(
					() => null,
					(err) => err,
				);
			expect(failure).toMatchObject({ statusCode: 400 });
			expect(failure?.message).toContain("Unknown harness 'no-such-harness'");
			expect(failure?.message).toContain("pi");
			// No diagnosis session may run for an unresolvable harness name.
			expect(sessionStore.getHarness).not.toHaveBeenCalled();
		});

		it("throws 503 naming the harness when it has no diagnosis session", async () => {
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const { taskStore, projectStore } = fakeStores({ task });
			const checker = createStuckChecker({
				taskStore,
				projectStore,
				harnessOverride: {
					resolveModelRef: vi.fn(async () => MODEL),
				},
			});

			await expect(
				checker.checkStuck({
					projectId: "p1",
					taskId: "t1",
					model: MODEL.key,
					harness: "pi",
				}),
			).rejects.toMatchObject({
				statusCode: 503,
				message: expect.stringContaining("'pi' does not support the stuck check"),
			});
		});

		it("runs model-free on a modelSelection none harness and returns a null model", async () => {
			const task = { id: "t1", goal: "g", currentStageId: "s1" };
			const { taskStore, projectStore } = fakeStores({ task });
			const harness = fakeHarness();
			harness.modelSelection = "none";
			const checker = createStuckChecker({ taskStore, projectStore, harnessOverride: harness });

			const result = await checker.checkStuck({
				projectId: "p1",
				taskId: "t1",
				harness: "custom",
			});

			// The harness owns its model: resolution is skipped, the session
			// runs on null, and the result carries no model (the panel hides
			// the model line for it).
			expect(harness.resolveModelRef).not.toHaveBeenCalled();
			const [, opts] = harness.createDiagnosisSession.mock.calls[0];
			expect(opts.model).toBeNull();
			expect(result.model).toBeNull();
			expect(result.verdict).toBe("stuck");
		});

		it("falls back to the task's currentStageId when the project has no stages", async () => {
			const task = { id: "t1", goal: "g", currentStageId: "stage-5" };
			const { taskStore, projectStore } = fakeStores({ task, stages: [] });
			const checker = createStuckChecker({
				taskStore,
				projectStore,
				harnessOverride: fakeHarness(),
			});
			const result = await checker.checkStuck({
				projectId: "p1",
				taskId: "t1",
				model: MODEL.key,
			});
			expect(result.stage.name).toBe("stage-5");
		});
	});
});