// Domain: The Flow — fast-gate failure-report coherence across engine surfaces.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";
import { excerptLog } from "./stageFailureRouting.js";
import { buildRetryFailureDetails } from "./execution/buildRetryFailureDetails.js";
import { failureLogExcerptLimit } from "./routing/tables/failureLogExcerptLimit.js";
import { retryPromptLogBudget } from "./routing/tables/retryPromptLogBudget.js";

const stages = [
	{ id: "impl", name: "Implementation", type: "agent", failback: "impl" },
	{ id: "ci-1", name: "Automated tests", type: "ci", failback: "impl" },
];

const VERDICT_PATH = "/repo/docs/tasks/task-1/ci-fast-gate-20261116-120000/verdict.json";
const FULL_LOG_PATH =
	"/repo/docs/tasks/task-1/ci-fast-gate-20261116-120000/unit-tests-frontend.full.log";

/***
 * MARK: fast-gate coherence tests
 * @description Proves the Phase-3 coherence claim with a simulated fast-gate
 *   failure: the gate prints its verdict pointers at the head (verdict-dir
 *   line) and the tail (closing banner) of stdout, and every engine surface
 *   the fixing agent reads keeps them — the failure report embeds the full
 *   stdout, `task.lastError` keeps the full streams, and the excerpted
 *   surfaces (timeline row at 3072 chars, retry prompt at 4000 chars) keep
 *   the suite names plus the verdict paths because head+tail placement
 *   survives `excerptLog`. No budget value changes; the budgets themselves
 *   stay pinned by the routing-tables suite.
 */
describe("fast-gate failure-report coherence", () => {
	const cleanups = [];
	afterEach(() => {
		while (cleanups.length > 0) {
			const { store, tempCwd } = cleanups.pop();
			try {
				store.stopScheduler();
			} catch {
				// ignore teardown errors
			}
			try {
				fs.rmSync(tempCwd, { recursive: true, force: true });
			} catch {
				// ignore teardown errors
			}
		}
	});

	function makeStore() {
		const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-fast-gate-coherence-"));
		const projectStore = {
			getProject: () => ({ id: "p1", name: "P1", stages, cwd: tempCwd }),
			listProjects: () => [{ id: "p1", name: "P1", stages, cwd: tempCwd }],
		};
		const store = new TaskStore({ eventBridge: {}, projectStore });
		cleanups.push({ store, tempCwd });
		return { store, tempCwd };
	}

	// A gate run's stdout shape: head pointer line, a noisy failing branch
	// (thousands of lines, like the case study's 24011-line frontend dump),
	// and the repeated closing banner at the tail.
	function gateStdout() {
		const head = [
			"Starting full project verification...",
			`Fast-gate verdict dir: /repo/docs/tasks/task-1/ci-fast-gate-20261116-120000 (verdict.json + untrimmed failed-branch logs land here)`,
			"Running Unit Tests (frontend)... FAIL (217s)",
			"Details for Unit Tests (frontend):",
			`Full log: Unit Tests (frontend) → ${FULL_LOG_PATH}`,
		].join("\n");
		const noisyMiddle = Array.from(
			{ length: 3000 },
			(_, index) => `console-noise-line-${index} · wrap-tests-with-act · https://reactjs.org/link/wrap-tests-with-act`,
		).join("\n");
		const tail = [
			"AssertionError: expected 12 to equal 11 (op-count assertion)",
			"Running Canary Tests... SKIP (fast-gate failed: Unit Tests (frontend); verdict at /repo/docs/tasks/task-1/ci-fast-gate-20261116-120000/verdict.json)",
			'KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Unit Tests (frontend)" canary=skipped_due_to_fast_gate_failure verdict="/repo/docs/tasks/task-1/ci-fast-gate-20261116-120000/verdict.json"',
			"Fast-gate verdict: FAILED — Unit Tests (frontend)",
			`Full log: Unit Tests (frontend) → ${FULL_LOG_PATH}`,
			`Verdict file: ${VERDICT_PATH}`,
		].join("\n");
		return `${head}\n${noisyMiddle}\n${tail}\n`;
	}

	it("keeps budgets pinned (files carry bulk, budgets carry pointers)", () => {
		expect(failureLogExcerptLimit).toBe(3072);
		expect(retryPromptLogBudget).toBe(4000);
	});

	it("embeds the full gate stdout in the failure report and lastError", () => {
		const { store, tempCwd } = makeStore();
		const task = store.createTask("p1", { goal: "coherent", stageId: "ci-1", projectCwd: tempCwd });
		const stdout = gateStdout();
		expect(stdout.length).toBeGreaterThan(100000);
		const error = new Error("CI command failed with exit code 1");
		error.stdout = stdout;
		error.stderr = "";
		store.handleStageFailure("p1", task.id, stages[1], error, {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		const updated = store.getTask("p1", task.id);
		// Full streams on lastError (whitespace-trimmed only).
		expect(updated.lastError.stdout).toContain("unit-tests-frontend.full.log");
		expect(updated.lastError.stdout).toContain("KAINBAIN_FAST_GATE_RESULT");
		expect(updated.lastError.stdout.length).toBeGreaterThan(100000);
		// The failure report file embeds the full stdout.
		const failureReport = (updated.reports || []).find((report) =>
			String(report?.filename || "").includes("failure"),
		);
		expect(failureReport).toBeTruthy();
		const reportPath = path.join(tempCwd, "docs", "tasks", task.id, failureReport.filename);
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- test reads the report it just wrote under a temp dir */
		const reportBody = fs.readFileSync(reportPath, "utf8");
		expect(reportBody).toContain("KAINBAIN_FAST_GATE_RESULT");
		expect(reportBody).toContain(FULL_LOG_PATH);
		expect(reportBody).toContain(VERDICT_PATH);
		expect(reportBody).toContain("AssertionError: expected 12 to equal 11");
	});

	it("keeps suite names and verdict paths in the timeline excerpt (3072 chars)", () => {
		const { store, tempCwd } = makeStore();
		const task = store.createTask("p1", { goal: "coherent", stageId: "ci-1", projectCwd: tempCwd });
		const error = new Error("CI command failed with exit code 1");
		error.stdout = gateStdout();
		store.handleStageFailure("p1", task.id, stages[1], error, {
			stages,
			projectCwd: tempCwd,
			skipFailback: true,
		});
		const failedRow = [...store.getTask("p1", task.id).timeline]
			.reverse()
			.find((entry) => entry.status === "Failed");
		expect(failedRow).toBeTruthy();
		expect(failedRow.stdout.length).toBeLessThanOrEqual(failureLogExcerptLimit);
		expect(failedRow.stdout).toContain("Unit Tests (frontend)");
		expect(failedRow.stdout).toContain("ci-fast-gate-20261116-120000/verdict.json");
	});

	it("keeps suite names, verdict paths, and an assertion line in the retry prompt (4000 chars)", () => {
		const details = buildRetryFailureDetails({
			priorFailure: "CI command failed with exit code 1",
			priorStdout: gateStdout(),
			priorFailedStage: "Automated tests",
			priorFailedStageType: "ci",
		});
		expect(details).toContain("Unit Tests (frontend)");
		expect(details).toContain(VERDICT_PATH);
		expect(details).toContain(FULL_LOG_PATH);
		expect(details).toContain("AssertionError: expected 12 to equal 11");
		// The excerpt itself (not the boilerplate) respects the budget.
		const excerpted = excerptLog(gateStdout(), retryPromptLogBudget);
		expect(excerpted.length).toBeLessThanOrEqual(retryPromptLogBudget);
	});
});
