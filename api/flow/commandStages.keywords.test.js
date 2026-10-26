import { describe, it, expect, vi, beforeEach } from "vitest";

// Characterization baseline for CI command handling (Phase 0 of the CI
// keywords plan): a token-free command must reach the runner, history, and
// report byte-identical to the legacy format. Keyword resolution (later
// phases) must preserve this contract for plain commands.

const gitMocks = vi.hoisted(() => ({
	withCheckedOutBranch: vi.fn(async (_cwd, _branch, fn) => fn()),
}));

const workspaceMocks = vi.hoisted(() => ({
	resolveTaskCwd: vi.fn(),
}));

vi.mock("../work/taskWorkspace.js", () => ({
	resolveTaskCwd: workspaceMocks.resolveTaskCwd,
}));

vi.mock("../reviewDiff.js", () => ({
	resolveSha: vi.fn(async () => null),
}));

vi.mock("../git.js", async () => {
	const actual = await vi.importActual("../git.js");
	return {
		...actual,
		withCheckedOutBranch: gitMocks.withCheckedOutBranch,
	};
});

const {
	runCommandStage,
	buildCommandKeywordContext,
	expandStageCommand,
	buildCommandStageEnv,
} = await import("./commandStages.js");

function stubStore(overrides = {}) {
	return {
		eventBridge: null,
		getTask: vi.fn(),
		updateTask: vi.fn(),
		saveStageReport: vi.fn(),
		_saveTaskMarkdown: vi.fn(),
		_isBranchModeEnabled: vi.fn(() => false),
		finalizeTaskBranch: vi.fn(async () => ({})),
		advanceStage: vi.fn(),
		handleStageFailure: vi.fn(async () => ({ status: "failed" })),
		...overrides,
	};
}

function ciTask() {
	return {
		id: "task-1",
		projectId: "proj-1",
		branch: "kb/task-1",
		status: "in_stage",
		history: [],
		logEntries: [],
	};
}

const baseOptions = {
	stages: [],
	cwd: "/repo",
	kind: "ci",
	label: "CI",
	logTag: "CI/CMD",
	reportTitle: "CI Stage Report",
	statusValue: "running_ci",
	defaultCommand: "echo hi",
};

describe("commandStages characterization: token-free commands", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("passes a token-free stage command unchanged to the exec runner", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		const seen = [];
		const execRunner = vi.fn(async (command, opts) => {
			seen.push([command, opts]);
			return { exitCode: 0, stdout: "ok", stderr: "" };
		});

		await runCommandStage(
			store,
			"proj-1",
			"task-1",
			{ id: "ci-1", name: "CI", type: "ci", command: "npm run test:unit" },
			{ ...baseOptions, execRunner },
		);

		expect(execRunner).toHaveBeenCalledTimes(1);
		expect(seen[0][0]).toBe("npm run test:unit");
	});

	it("records history, process log, and report byte-identical to the legacy format", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		const execRunner = vi.fn(async () => ({
			exitCode: 0,
			stdout: "ok",
			stderr: "",
		}));

		await runCommandStage(
			store,
			"proj-1",
			"task-1",
			{ id: "ci-1", name: "CI", type: "ci", command: "npm run test:unit" },
			{ ...baseOptions, execRunner },
		);

		const historyAction = task.history.find((h) =>
			String(h.action || "").startsWith("Running CI command:"),
		)?.action;
		expect(historyAction).toBe("Running CI command: npm run test:unit");

		const logText = (task.logEntries || []).map((e) => e.text).join("\n");
		expect(logText).toContain(
			"[CI/CMD] Starting CI command: npm run test:unit",
		);

		expect(store.saveStageReport).toHaveBeenCalledTimes(1);
		const reportContent = store.saveStageReport.mock.calls[0][2].content;
		expect(reportContent).toContain("**Command:** `npm run test:unit`");
		expect(reportContent).not.toContain("Command (configured)");
		expect(reportContent).not.toContain("Command (expanded)");
	});
});

describe("commandStages keyword interpolation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function runCi(store, task, stage, execRunner, overrides = {}) {
		store.getTask.mockReturnValue(task);
		return runCommandStage(store, "proj-1", "task-1", stage, {
			...baseOptions,
			execRunner,
			...overrides,
		});
	}

	it("expands task, project, and report keywords before execution", async () => {
		const store = stubStore({
			projectStore: { getProject: () => ({ name: "KainBain" }) },
		});
		const task = {
			...ciTask(),
			reports: [
				{
					stageSlug: "plan",
					stageName: "Plan",
					path: "./docs/tasks/task-1/plan-20261017.md",
					content: "# Plan",
				},
			],
		};
		const execRunner = vi.fn(async () => ({
			exitCode: 0,
			stdout: "ok",
			stderr: "",
		}));

		await runCi(
			store,
			task,
			{
				id: "ci-1",
				name: "Verify plan",
				type: "ci",
				command:
					'test -f "{{taskDocs}}plan-20261017.md" && test -f "{{latestReportPath:plan}}" && echo "{{stageName}} {{project}}"',
			},
			execRunner,
		);

		expect(execRunner).toHaveBeenCalledTimes(1);
		expect(execRunner.mock.calls[0][0]).toBe(
			'test -f "/repo/docs/tasks/task-1/plan-20261017.md" && test -f "./docs/tasks/task-1/plan-20261017.md" && echo "Verify plan KainBain"',
		);
	});

	it("audits both the configured template and the expanded command", async () => {
		const store = stubStore();
		const task = ciTask();
		const execRunner = vi.fn(async () => ({
			exitCode: 0,
			stdout: "ok",
			stderr: "",
		}));

		await runCi(
			store,
			task,
			{ id: "ci-1", name: "CI", type: "ci", command: 'echo "{{taskId}}"' },
			execRunner,
		);

		const reportContent = store.saveStageReport.mock.calls[0][2].content;
		expect(reportContent).toContain('**Command (configured):** `echo "{{taskId}}"`');
		expect(reportContent).toContain('**Command (expanded):** `echo "task-1"`');
		expect(reportContent).not.toContain("**Command:** `echo");

		const logText = (task.logEntries || []).map((e) => e.text).join("\n");
		expect(logText).toContain('[CI/CMD] Configured CI command: echo "{{taskId}}"');
		expect(logText).toContain('[CI/CMD] Starting CI command: echo "task-1"');

		const historyAction = task.history.find((h) =>
			String(h.action || "").startsWith("Running CI command:"),
		)?.action;
		expect(historyAction).toBe('Running CI command: echo "task-1"');
	});

	it("leaves unknown tokens literal so misconfiguration fails visible", async () => {
		const store = stubStore();
		const task = ciTask();
		const execRunner = vi.fn(async () => ({
			exitCode: 0,
			stdout: "ok",
			stderr: "",
		}));

		await runCi(
			store,
			task,
			{ id: "ci-1", name: "CI", type: "ci", command: "echo {{sendMessage}}" },
			execRunner,
		);

		expect(execRunner.mock.calls[0][0]).toBe("echo {{sendMessage}}");
	});

	it("never throws when the project lookup is missing", async () => {
		const store = stubStore();
		const task = { ...ciTask(), id: undefined };
		delete task.id;
		const execRunner = vi.fn(async () => ({
			exitCode: 0,
			stdout: "ok",
			stderr: "",
		}));

		const result = await runCi(
			store,
			task,
			{ id: "ci-1", name: "CI", type: "ci", command: 'echo "{{taskDocs}}"' },
			execRunner,
		);

		expect(result.status).toBe("passed");
		expect(execRunner.mock.calls[0][0]).toBe('echo "/repo/docs/tasks/unassigned/"');
	});

	it("expands keywords for deploy-kind stages too", async () => {
		const store = stubStore();
		const task = ciTask();
		const execRunner = vi.fn(async () => ({
			exitCode: 0,
			stdout: "ok",
			stderr: "",
		}));

		await runCi(
			store,
			task,
			{ id: "deploy-1", name: "Deploy", type: "deploy", command: 'echo "{{taskDocs}}"' },
			execRunner,
			{
				kind: "deploy",
				label: "Deploy",
				logTag: "DEPLOY/CMD",
				reportTitle: "Deploy Stage Report",
				statusValue: "running_deploy",
				defaultCommand: "./deploy.sh --prod",
			},
		);

		expect(execRunner.mock.calls[0][0]).toBe('echo "/repo/docs/tasks/task-1/"');
	});

	it("falls back to the raw command when interpolation throws", async () => {
		const store = stubStore();
		const task = ciTask();
		Object.defineProperty(task, "reports", {
			get() {
				throw new Error("boom");
			},
		});
		const execRunner = vi.fn(async () => ({
			exitCode: 0,
			stdout: "ok",
			stderr: "",
		}));

		const result = await runCi(
			store,
			task,
			{ id: "ci-1", name: "CI", type: "ci", command: 'echo "{{taskDocs}}"' },
			execRunner,
		);

		expect(result.status).toBe("passed");
		expect(execRunner.mock.calls[0][0]).toBe('echo "{{taskDocs}}"');
	});
});

describe("command stage keyword helpers", () => {
	it("expandStageCommand passes non-strings through", () => {
		expect(expandStageCommand(null, {})).toBeNull();
		expect(expandStageCommand(undefined, {})).toBeUndefined();
		expect(expandStageCommand("echo hi", {})).toBe("echo hi");
	});

	it("buildCommandKeywordContext carries task, stage, and project", () => {
		const context = buildCommandKeywordContext({
			task: { id: "t1" },
			stage: { id: "ci-1", name: "CI" },
			project: { name: "KainBain" },
			projectCwd: "/repo",
		});
		expect(expandStageCommand("{{project}} {{stageName}} {{taskDocs}}", context)).toBe(
			"KainBain CI /repo/docs/tasks/t1/",
		);
	});

	it("buildCommandStageEnv mirrors interpolation values as KAINBAIN_* vars", () => {
		const context = buildCommandKeywordContext({
			task: {
				id: "task-1",
				goal: "Prove keywords",
				reports: [
					{
						stageSlug: "plan",
						stageName: "Plan",
						path: "./docs/tasks/task-1/plan.md",
						content: "# Plan",
					},
				],
			},
			stage: { id: "ci-1", name: "Verify plan" },
			project: { name: "KainBain" },
			projectCwd: "/repo",
		});
		const env = buildCommandStageEnv("/repo", "task-1", context);
		expect(env.KAINBAIN_PROJECT).toBe("KainBain");
		expect(env.KAINBAIN_PROJECT_ROOT).toBe("/repo");
		expect(env.KAINBAIN_TASK_ID).toBe("task-1");
		expect(env.KAINBAIN_TASK_DOCS).toBe("/repo/docs/tasks/task-1/");
		expect(env.KAINBAIN_STAGE_NAME).toBe("Verify plan");
		expect(env.KAINBAIN_TASK_GOAL).toBe("Prove keywords");
		expect(env.KAINBAIN_LATEST_REPORT).toBe("./docs/tasks/task-1/plan.md");
		// Env values always agree with command interpolation from the same
		// context (the engine merges context.reports with task.reports, so
		// multi-source lists may repeat entries — env and command match either way).
		expect(env.KAINBAIN_REPORTS).toBe(
			expandStageCommand("{{previousReports}}", context),
		);
		// The sanitized base still stands alongside the keyword vars.
		expect(env.PROJECT_CWD).toBe("/repo");
		expect(env.TASK_ID).toBe("task-1");
		expect(env.PATH).toBeTruthy();
	});

	it("buildCommandStageEnv agrees with the expanded command from the same context", () => {
		const context = buildCommandKeywordContext({
			task: { id: "task-1" },
			stage: { id: "ci-1", name: "CI" },
			project: { name: "KainBain" },
			projectCwd: "/repo",
		});
		const env = buildCommandStageEnv("/repo", "task-1", context);
		expect(expandStageCommand("[ '{{taskDocs}}' = \"$KAINBAIN_TASK_DOCS\" ]", context)).toBe(
			`[ '/repo/docs/tasks/task-1/' = "$KAINBAIN_TASK_DOCS" ]`,
		);
		expect(env.KAINBAIN_TASK_DOCS).toBe("/repo/docs/tasks/task-1/");
	});
});
