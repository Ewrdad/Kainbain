// Domain: The Work — unit tests for timeline diff-stat persistence.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect, vi } from "vitest";
import {
	saveTaskMarkdown,
	parseTaskMarkdown,
	recordTimeline,
	recordTimelineWithDiffStat,
	_isTaskStillRegistered,
	_entryBoundary,
	formatTimelineDiffStat,
	parseTimelineDiffStat,
} from "./taskPersistence.js";
import { NO_VERDICT_REJECTION_DIAGNOSTIC } from "./remediateNoVerdictRejections.js";
import { _formatFrontmatterValue } from "./taskFiles.js";

// Real-git range tests run inside throwaway temp directories — never the
// KainBain repo itself. They skip (rather than fail) on machines without git.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const flushAsyncCapture = async () => {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
};

const flushDeferredCapture = async () => {
	await flushAsyncCapture();
	await new Promise((resolve) => setTimeout(resolve, 20));
	await flushAsyncCapture();
};

function stubStore({ cwd = null, onSave = null } = {}) {
	return {
		_resolveProjectCwd: () => cwd,
		_saveTaskMarkdown: onSave || (() => {}),
	};
}

function mapBackedStore(baseDir) {
	const map = new Map();
	const store = {
		_resolveProjectCwd: () => baseDir,
		getTask: (projectId, taskId) =>
			projectId === "p1" ? map.get(taskId) : undefined,
		_saveTaskMarkdown: () => {},
		__map: map,
	};
	return store;
}

function gatedWorkingTreeDiff(rows = [
	{ path: "a.js", additions: 9, deletions: 4 },
]) {
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	return {
		release: () => release(rows),
		fn: () => gate,
	};
}

function liveTask(id = "t-live") {
	return {
		id,
		projectId: "p1",
		title: id,
		status: "in_stage",
		timeline: [],
		history: [],
		reports: [],
	};
}

describe("The Work: reliability-sample persistence", () => {
	it("round-trips reliabilitySamples through task.md frontmatter", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-reliability-persist-"));
		const store = stubStore({ cwd: dir });
		const task = {
			id: "task-reliability-1",
			projectId: "proj-1",
			title: "Reliability persistence task",
			status: "in_stage",
			createdAt: "2026-10-01T00:00:00.000Z",
			updatedAt: "2026-10-01T00:00:00.000Z",
			history: [],
			reports: [],
			reliabilitySamples: [
				{
					harnessId: "vibe",
					failureKind: "none",
					at: 1760000000000,
					atRaw: "2026-10-09T10:13:20.000Z",
					stageId: "a1",
					aliasName: "worker",
					modelRef: "mistral::large",
					targetIndex: 0,
				},
				{
					harnessId: "antigravity",
					failureKind: "infrastructure",
					at: 1760000000001,
					stageId: "a1",
				},
			],
		};

		saveTaskMarkdown(store, dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-reliability-1", "task.md"),
			"utf8",
		);

		const rehydrated = parseTaskMarkdown(store, content, "task-reliability-1", "proj-1");
		expect(rehydrated.reliabilitySamples).toHaveLength(2);
		expect(rehydrated.reliabilitySamples[0]).toMatchObject({
			harnessId: "vibe",
			failureKind: "none",
			at: 1760000000000,
			atRaw: "2026-10-09T10:13:20.000Z",
			stageId: "a1",
			aliasName: "worker",
			modelRef: "mistral::large",
			targetIndex: 0,
		});
		expect(rehydrated.reliabilitySamples[1]).toMatchObject({
			harnessId: "antigravity",
			failureKind: "infrastructure",
		});
	});

	it("keeps an empty sample list for tasks with no samples (no fake history)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-reliability-empty-"));
		const store = stubStore({ cwd: dir });
		const task = {
			id: "task-reliability-2",
			projectId: "proj-1",
			title: "No samples task",
			status: "in_stage",
			createdAt: "2026-10-01T00:00:00.000Z",
			updatedAt: "2026-10-01T00:00:00.000Z",
			history: [],
			reports: [],
		};

		saveTaskMarkdown(store, dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-reliability-2", "task.md"),
			"utf8",
		);

		const rehydrated = parseTaskMarkdown(store, content, "task-reliability-2", "proj-1");
		expect(rehydrated.reliabilitySamples).toEqual([]);
	});

	it("backfills samples from attributed reports on load (pre-feature history)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-reliability-backfill-"));
		const store = stubStore({ cwd: dir });
		const attributedReport = {
			filename: "r-1.md",
			stageName: "Work",
			stageId: "a1",
			status: "PASSED",
			createdAt: "2026-10-01T10:00:00.000Z",
			harnessId: "vibe",
			failureKind: "none",
			aliasName: "worker",
			modelRef: "mistral::large",
			targetIndex: 0,
		};
		const task = {
			id: "task-reliability-3",
			projectId: "proj-1",
			title: "Legacy report task",
			status: "in_stage",
			createdAt: "2026-10-01T00:00:00.000Z",
			updatedAt: "2026-10-01T00:00:00.000Z",
			history: [],
			reports: [attributedReport],
		};

		saveTaskMarkdown(store, dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-reliability-3", "task.md"),
			"utf8",
		);

		const rehydrated = parseTaskMarkdown(store, content, "task-reliability-3", "proj-1");
		expect(rehydrated.reliabilitySamples).toHaveLength(1);
		expect(rehydrated.reliabilitySamples[0]).toMatchObject({
			harnessId: "vibe",
			failureKind: "none",
			stageId: "a1",
			aliasName: "worker",
			modelRef: "mistral::large",
			targetIndex: 0,
		});
	});
});

describe("The Work: timeline run-attribution persistence", () => {
	it("round-trips attributed timeline rows through task.md frontmatter", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-attribution-persist-"));
		const store = stubStore({ cwd: dir });
		const task = {
			id: "task-attribution-1",
			projectId: "proj-1",
			title: "Attribution persistence task",
			status: "in_stage",
			createdAt: "2026-10-01T00:00:00.000Z",
			updatedAt: "2026-10-01T00:00:00.000Z",
			history: [],
			reports: [],
			timeline: [
				{
					stage: "In Progress",
					status: "Moved",
					duration: "12s",
					durationSeconds: 12,
					durationStageId: "a1",
					timestamp: "2026-10-01T00:00:12.000Z",
					harnessId: "pi",
					modelRef: "llama-cloud-direct::glm-5.3-flash:cloud",
					aliasName: "worker",
					targetIndex: 1,
				},
				{
					// CI / human rows carry no attribution fields at all: the
					// round trip must keep them absent, never placeholder them.
					stage: "CI",
					status: "Advanced",
					duration: "4s",
					durationStageId: "c1",
					timestamp: "2026-10-01T00:00:16.000Z",
				},
			],
		};

		saveTaskMarkdown(store, dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-attribution-1", "task.md"),
			"utf8",
		);

		const rehydrated = parseTaskMarkdown(store, content, "task-attribution-1", "proj-1");
		expect(rehydrated.timeline).toHaveLength(2);
		expect(rehydrated.timeline[0]).toMatchObject({
			stage: "In Progress",
			status: "Moved",
			harnessId: "pi",
			modelRef: "llama-cloud-direct::glm-5.3-flash:cloud",
			aliasName: "worker",
			targetIndex: 1,
		});
		expect(rehydrated.timeline[1]).toMatchObject({
			stage: "CI",
			status: "Advanced",
		});
		expect(rehydrated.timeline[1].harnessId).toBeUndefined();
		expect(rehydrated.timeline[1].modelRef).toBeUndefined();
		expect(rehydrated.timeline[1].aliasName).toBeUndefined();
		expect(rehydrated.timeline[1].targetIndex).toBeUndefined();
		expect(String(content)).not.toContain("no model");
		expect(String(content)).not.toContain("automated");
	});
});

describe("The Work: markdown log persistence (single storage path)", () => {
	it("persists only the structured # Log Entries section (no rendered text)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-log-single-path-"));
		const store = stubStore({ cwd: dir });
		const task = {
			id: "task-logs-1",
			projectId: "proj-1",
			title: "Log path task",
			status: "in_stage",
			createdAt: "2026-09-24T00:00:00.000Z",
			updatedAt: "2026-09-24T00:00:00.000Z",
			history: [],
			logEntries: [
				{ id: 1, ts: "2026-01-01T00:00:00.000Z", feed: "main", feeds: ["main"], kind: "assistant", turn: 1, text: "narrative", meta: {} },
			],
		};
		saveTaskMarkdown(store, dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-logs-1", "task.md"),
			"utf8",
		);
		expect(content).toContain("# Log Entries");
		expect(content).not.toContain("# Process Logs");

		const rehydrated = parseTaskMarkdown(store, content, "task-logs-1", "proj-1");
		expect(rehydrated.logEntries).toHaveLength(1);
		expect(rehydrated.logEntries[0]).toMatchObject({ kind: "assistant", text: "narrative" });
		// No rendered text copy is carried on the parsed task.
		expect(rehydrated).not.toHaveProperty("processLogs");
	});

	it("writes no log sections when the task has neither entries nor legacy text", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-log-empty-"));
		const store = stubStore({ cwd: dir });
		const task = {
			id: "task-logs-2",
			projectId: "proj-1",
			title: "Empty logs task",
			status: "in_stage",
			createdAt: "2026-09-24T00:00:00.000Z",
			updatedAt: "2026-09-24T00:00:00.000Z",
			history: [],
		};
		saveTaskMarkdown(store, dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-logs-2", "task.md"),
			"utf8",
		);
		expect(content).not.toContain("# Process Logs");
		expect(content).not.toContain("# Log Entries");
	});

	it("rehydrates a legacy task.md with only # Process Logs into structured entries", () => {
		const store = stubStore();
		const legacy = [
			"---",
			"id: task-legacy",
			"projectId: proj-1",
			"title: Legacy Logs",
			"status: in_stage",
			"---",
			"",
			"# Goal",
			"Old goal",
			"",
			"# History",
			"- (no history recorded)",
			"",
			"# Process Logs",
			"[AGENT] old narrative",
			"[TOOL] write(\"x\")",
			"[TOOL] write(\"x\")",
		].join("\n");

		const task = parseTaskMarkdown(store, legacy, "task-legacy", "proj-1");
		// Blank lines dropped, consecutive duplicates de-duped, tag grammar applied.
		expect(task.logEntries.map((e) => e.text)).toEqual([
			"[AGENT] old narrative",
			'[TOOL] write("x")',
		]);
		expect(task.logEntries[1]).toMatchObject({ kind: "tool", feed: "tools" });
		// The legacy text is never carried forward as a stored field.
		expect(task).not.toHaveProperty("processLogs");

		// Re-saving converts the file to the entries-only shape.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-log-legacy-"));
		saveTaskMarkdown(stubStore({ cwd: dir }), dir, task);
		const saved = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-legacy", "task.md"),
			"utf8",
		);
		expect(saved).toContain("# Log Entries");
		expect(saved).not.toContain("# Process Logs");
	});

	it("keeps timeline parsing anchored when # Log Entries directly follows it", () => {
		const store = stubStore();
		const content = [
			"---",
			"id: task-tl",
			"---",
			"",
			"# Goal",
			"Goal",
			"",
			"# History",
			"- (no history recorded)",
			"",
			"# Timeline",
			"- 2026-09-24T00:00:00.000Z: Idea | Moved | 5s",
			"",
			"# Log Entries",
			"```json",
			JSON.stringify([
				{ id: 1, ts: "t", feed: "main", feeds: ["main"], kind: "assistant", turn: 1, text: "hello", meta: {} },
			]),
			"```",
		].join("\n");

		const task = parseTaskMarkdown(store, content, "task-tl", "proj-1");
		expect(task.timeline).toHaveLength(1);
		expect(task.timeline[0]).toMatchObject({ stage: "Idea", status: "Moved" });
		expect(task.logEntries.map((e) => e.text)).toEqual(["hello"]);
	});

	it("round-trips the startup-recovery priority marker", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-resume-marker-"));
		const task = {
			id: "task-resume-1",
			projectId: "proj-1",
			title: "Resume marker task",
			status: "in_stage",
			resumedAfterInterruption: true,
			interruptedAt: "2026-09-24T09:00:00.000Z",
			createdAt: "2026-09-24T00:00:00.000Z",
			updatedAt: "2026-09-24T00:00:00.000Z",
			history: [],
		};
		saveTaskMarkdown(stubStore({ cwd: dir }), dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-resume-1", "task.md"),
			"utf8",
		);
		expect(content).toContain("resumedAfterInterruption: true");
		const rehydrated = parseTaskMarkdown(stubStore(), content, "task-resume-1", "proj-1");
		expect(rehydrated.resumedAfterInterruption).toBe(true);
		expect(rehydrated.interruptedAt).toBe("2026-09-24T09:00:00.000Z");
	});

	it("round-trips the survey-parked flag so restarts keep the survey entry point", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-survey-pending-"));
		const task = {
			id: "task-survey-pending-1",
			projectId: "proj-1",
			title: "Survey parked task",
			status: "waiting_human",
			surveyPending: true,
			createdAt: "2026-10-19T00:00:00.000Z",
			updatedAt: "2026-10-19T00:00:00.000Z",
			history: [],
		};
		saveTaskMarkdown(stubStore({ cwd: dir }), dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-survey-pending-1", "task.md"),
			"utf8",
		);
		expect(content).toContain("surveyPending: true");
		const rehydrated = parseTaskMarkdown(stubStore(), content, "task-survey-pending-1", "proj-1");
		expect(rehydrated.surveyPending).toBe(true);
		expect(rehydrated.status).toBe("waiting_human");
	});

	it("defaults the survey flag to false for tasks saved without it", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-survey-plain-"));
		const task = {
			id: "task-survey-pending-2",
			projectId: "proj-1",
			title: "Plain task",
			status: "in_stage",
			createdAt: "2026-10-19T00:00:00.000Z",
			updatedAt: "2026-10-19T00:00:00.000Z",
			history: [],
		};
		saveTaskMarkdown(stubStore({ cwd: dir }), dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-survey-pending-2", "task.md"),
			"utf8",
		);
		const rehydrated = parseTaskMarkdown(stubStore(), content, "task-survey-pending-2", "proj-1");
		expect(rehydrated.surveyPending).toBe(false);
	});

	it("defaults the marker to unset for tasks saved without it", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-resume-plain-"));
		const task = {
			id: "task-resume-2",
			projectId: "proj-1",
			title: "Plain task",
			status: "in_stage",
			createdAt: "2026-09-24T00:00:00.000Z",
			updatedAt: "2026-09-24T00:00:00.000Z",
			history: [],
		};
		saveTaskMarkdown(stubStore({ cwd: dir }), dir, task);
		const content = fs.readFileSync(
			path.join(dir, "docs", "tasks", "task-resume-2", "task.md"),
			"utf8",
		);
		const rehydrated = parseTaskMarkdown(stubStore(), content, "task-resume-2", "proj-1");
		expect(rehydrated.resumedAfterInterruption).toBe(false);
		expect(rehydrated.interruptedAt).toBeNull();
	});
});

describe("The Work: timeline diff-stat persistence", () => {
	describe("formatTimelineDiffStat", () => {
		it("renders the fourth segment for entries with diff data", () => {
			expect(
				formatTimelineDiffStat({ additions: 12, deletions: 3 }),
			).toBe("+12 -3");
			expect(formatTimelineDiffStat({ additions: 0, deletions: 0 })).toBe(
				"+0 -0",
			);
		});

		it("renders nothing without integer diff data", () => {
			expect(formatTimelineDiffStat({ stage: "Idea" })).toBe("");
			expect(formatTimelineDiffStat({ additions: 5 })).toBe("");
			expect(formatTimelineDiffStat({ additions: "5", deletions: 1 })).toBe(
				"",
			);
			expect(formatTimelineDiffStat({ additions: -1, deletions: 1 })).toBe(
				"",
			);
			expect(formatTimelineDiffStat(null)).toBe("");
		});
	});

	describe("parseTimelineDiffStat", () => {
		it("reads the fourth segment back into counts", () => {
			expect(parseTimelineDiffStat("+12 -3")).toEqual({
				additions: 12,
				deletions: 3,
			});
			expect(parseTimelineDiffStat("  +0 -0  ")).toEqual({
				additions: 0,
				deletions: 0,
			});
		});

		it("ignores legacy and malformed segments", () => {
			expect(parseTimelineDiffStat(undefined)).toBeNull();
			expect(parseTimelineDiffStat("not a stat")).toBeNull();
			expect(parseTimelineDiffStat("+12")).toBeNull();
			expect(parseTimelineDiffStat("12 -3")).toBeNull();
		});
	});

	describe("markdown round-trip", () => {
		it("keeps diff data through save and parse", () => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "kainbain-timeline-stat-"),
			);
			const store = stubStore({ cwd: dir });
			const task = {
				id: "task-1",
				projectId: "proj-1",
				title: "Stat task",
				status: "in_stage",
				createdAt: "2026-09-23T00:00:00.000Z",
				updatedAt: "2026-09-23T00:00:00.000Z",
				history: [],
				timeline: [
					{
						stage: "Idea",
						status: "Moved",
						duration: "5s",
						timestamp: "2026-09-23T00:01:00.000Z",
						additions: 12,
						deletions: 3,
					},
					{
						stage: "Plan",
						status: "Moved",
						duration: "6s",
						timestamp: "2026-09-23T00:02:00.000Z",
					},
				],
			};
			saveTaskMarkdown(store, dir, task);
			const content = fs.readFileSync(
				path.join(dir, "docs", "tasks", "task-1", "task.md"),
				"utf8",
			);
			expect(content).toContain(
				"- 2026-09-23T00:01:00.000Z: Idea | Moved | 5s | +12 -3",
			);
			expect(content).toContain(
				"- 2026-09-23T00:02:00.000Z: Plan | Moved | 6s",
			);
			expect(content).not.toContain("Plan | Moved | 6s |");

			const rehydrated = parseTaskMarkdown(store, content, "task-1", "proj-1");
			expect(rehydrated.timeline).toHaveLength(2);
			expect(rehydrated.timeline[0]).toMatchObject({
				stage: "Idea",
				additions: 12,
				deletions: 3,
			});
			expect(rehydrated.timeline[1]).not.toHaveProperty("additions");
			expect(rehydrated.timeline[1]).not.toHaveProperty("deletions");
		});

		it("round-trips the frozen review baseline through save and parse", () => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "kainbain-review-baseline-"),
			);
			const store = stubStore({ cwd: dir });
			const baseline = {
				baseSha: "a".repeat(40),
				headSha: "b".repeat(40),
				mainSha: "a".repeat(40),
				mergedAt: "2026-09-24T00:00:00.000Z",
				stageId: "merge-1",
			};
			const task = {
				id: "task-1",
				projectId: "proj-1",
				title: "Baseline task",
				status: "in_stage",
				createdAt: "2026-09-23T00:00:00.000Z",
				updatedAt: "2026-09-23T00:00:00.000Z",
				history: [],
				timeline: [],
				reviewBaseline: baseline,
			};
			saveTaskMarkdown(store, dir, task);
			const content = fs.readFileSync(
				path.join(dir, "docs", "tasks", "task-1", "task.md"),
				"utf8",
			);
			expect(content).toContain("reviewBaseline:");

			const rehydrated = parseTaskMarkdown(store, content, "task-1", "proj-1");
			expect(rehydrated.reviewBaseline).toMatchObject(baseline);
		});

		it("leaves the baseline absent for legacy tasks and corrupt values", () => {
			const store = stubStore();
			const legacy = [
				"---",
				"id: task-9",
				"---",
				"",
				"# Goal",
				"Legacy task",
				"",
				"# History",
				"- (no history recorded)",
			].join("\n");
			expect(
				parseTaskMarkdown(store, legacy, "task-9", "proj-1").reviewBaseline,
			).toBeUndefined();

			const corrupt = legacy.replace(
				"id: task-9",
				'id: task-9\nreviewBaseline: "{not json}"',
			);
			expect(
				parseTaskMarkdown(store, corrupt, "task-9", "proj-1").reviewBaseline,
			).toBeUndefined();
		});

		it("ignores a stale no-verdict ledger field from pre-revert tasks", () => {
			const store = stubStore();
			const legacy = [
				"---",
				"id: task-9",
				'verdictImplicitPassStages: "{\\"stage-a\\":true}"',
				"---",
				"",
				"# Goal",
				"Legacy task",
				"",
				"# History",
				"- (no history recorded)",
			].join("\n");
			const rehydrated = parseTaskMarkdown(store, legacy, "task-9", "proj-1");
			expect(rehydrated.verdictImplicitPassStages).toBeUndefined();
		});

		it("drops a spurious pre-revert no-verdict rejection on load", () => {
			const store = stubStore();
			const spurious = {
				stage: "Plan",
				status: "Failed",
				timestamp: "2026-10-10T21:59:22.494Z",
				reason: `[Agent Review Rejection] ${NO_VERDICT_REJECTION_DIAGNOSTIC}. An explicit KAINBAIN_VERDICT is required.`,
			};
			const genuine = {
				stage: "Deep Review",
				status: "Failed",
				timestamp: "2026-10-10T22:10:00.000Z",
				reason: "[Agent Review Rejection] real bug",
			};
			const rejectedReport = {
				filename: "plan.md",
				stageName: "Plan",
				status: "FAILED",
				createdAt: "2026-10-10T21:59:22.494Z",
				failureKind: "rejected",
			};
			const genuineReport = {
				filename: "deep.md",
				stageName: "Deep Review",
				status: "FAILED",
				createdAt: "2026-10-10T22:10:00.000Z",
				failureKind: "rejected",
			};
			const legacy = [
				"---",
				"id: task-9",
				`timelineMetadata: ${_formatFrontmatterValue(JSON.stringify([spurious, genuine]))}`,
				`reportMetadata: ${_formatFrontmatterValue(JSON.stringify([rejectedReport, genuineReport]))}`,
				"---",
				"",
				"# Goal",
				"Legacy task",
			].join("\n");

			const rehydrated = parseTaskMarkdown(store, legacy, "task-9", "proj-1");
			expect(rehydrated.timeline).toHaveLength(1);
			expect(rehydrated.timeline[0].stage).toBe("Deep Review");
			const repaired = rehydrated.reports.find((r) => r.filename === "plan.md");
			expect(repaired.status).toBe("PASSED");
			expect(repaired.failureKind).toBeUndefined();
			const untouched = rehydrated.reports.find((r) => r.filename === "deep.md");
			expect(untouched.status).toBe("FAILED");
		});

		it("heals a spurious no-verdict rejection on save", () => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "kainbain-remediate-save-"),
			);
			const store = stubStore({ cwd: dir });
			const task = {
				id: "task-1",
				projectId: "proj-1",
				title: "Stale task",
				status: "in_stage",
				createdAt: "2026-10-10T21:00:00.000Z",
				updatedAt: "2026-10-10T21:00:00.000Z",
				history: [],
				outputReport: "",
				timeline: [
					{
						stage: "Plan",
						status: "Failed",
						timestamp: "2026-10-10T21:59:22.494Z",
						reason: `[Agent Review Rejection] ${NO_VERDICT_REJECTION_DIAGNOSTIC}. x`,
					},
				],
				reports: [
					{
						filename: "plan.md",
						stageName: "Plan",
						status: "FAILED",
						createdAt: "2026-10-10T21:59:22.494Z",
						failureKind: "rejected",
					},
				],
			};
			saveTaskMarkdown(store, dir, task);
			const content = fs.readFileSync(
				path.join(dir, "docs", "tasks", "task-1", "task.md"),
				"utf8",
			);
			expect(content).not.toContain(NO_VERDICT_REJECTION_DIAGNOSTIC);
			expect(task.timeline).toHaveLength(0);
			expect(task.reports[0].status).toBe("PASSED");
		});

		it("round-trips fired failback-warning thresholds through save and parse", () => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "kainbain-failback-warnings-"),
			);
			const store = stubStore({ cwd: dir });
			const task = {
				id: "task-1",
				projectId: "proj-1",
				title: "Warning task",
				status: "in_stage",
				createdAt: "2026-09-23T00:00:00.000Z",
				updatedAt: "2026-09-23T00:00:00.000Z",
				history: [],
				timeline: [],
				failbackWarningsSent: [50],
			};
			saveTaskMarkdown(store, dir, task);
			const content = fs.readFileSync(
				path.join(dir, "docs", "tasks", "task-1", "task.md"),
				"utf8",
			);
			expect(content).toContain("failbackWarningsSent:");

			const rehydrated = parseTaskMarkdown(store, content, "task-1", "proj-1");
			expect(rehydrated.failbackWarningsSent).toEqual([50]);
		});

		it("defaults failback warnings to empty for legacy tasks and corrupt values", () => {
			const store = stubStore();
			const legacy = [
				"---",
				"id: task-9",
				"---",
				"",
				"# Goal",
				"Legacy task",
				"",
				"# History",
				"- (no history recorded)",
			].join("\n");
			expect(
				parseTaskMarkdown(store, legacy, "task-9", "proj-1")
					.failbackWarningsSent,
			).toEqual([]);

			const corrupt = legacy.replace(
				"id: task-9",
				'id: task-9\nfailbackWarningsSent: "{not json}"',
			);
			expect(
				parseTaskMarkdown(store, corrupt, "task-9", "proj-1")
					.failbackWarningsSent,
			).toEqual([]);

			const phantom = legacy.replace(
				"id: task-9",
				'id: task-9\nfailbackWarningsSent: "[50, 99]"',
			);
			expect(
				parseTaskMarkdown(store, phantom, "task-9", "proj-1")
					.failbackWarningsSent,
			).toEqual([50]);
		});

		it("parses legacy three-segment lines and malformed segments", () => {
			const store = stubStore();
			const content = [
				"---",
				"id: task-9",
				"---",
				"",
				"# Goal",
				"Legacy task",
				"",
				"# History",
				"- (no history recorded)",
				"",
				"# Timeline",
				"- 2026-09-20T00:00:00.000Z: Idea | Moved | 5s",
				"- 2026-09-21T00:00:00.000Z: Plan | Moved | 6s | nonsense",
				"- 2026-09-22T00:00:00.000Z: Build | Failed | 7s | +4 -1",
			].join("\n");
			const task = parseTaskMarkdown(store, content, "task-9", "proj-1");
			expect(task.timeline).toHaveLength(3);
			expect(task.timeline[0]).not.toHaveProperty("additions");
			expect(task.timeline[1]).toMatchObject({ stage: "Plan" });
			expect(task.timeline[1]).not.toHaveProperty("additions");
			expect(task.timeline[2]).toMatchObject({
				stage: "Build",
				additions: 4,
				deletions: 1,
			});
		});
	});

	describe("recordTimelineWithDiffStat", () => {
		it("records the entry synchronously even with no working directory", () => {
			const task = { id: "t1", projectId: "p1" };
			const saved = recordTimelineWithDiffStat(
				stubStore(),
				task,
				{ stage: "Idea", status: "Moved", duration: "1s" },
				null,
			);
			expect(task.timeline).toHaveLength(1);
			expect(saved).toBe(task.timeline[0]);
			expect(saved).toMatchObject({ stage: "Idea", status: "Moved" });
			expect(saved).not.toHaveProperty("additions");
		});

		it("opens the new stage at +0 -0 on a fresh baseline and re-saves", async () => {
			const onSave = vi.fn();
			const task = { id: "t2", projectId: "p1", branch: "kb/t2" };
			const store = stubStore({ cwd: "/repo", onSave });
			const saved = recordTimelineWithDiffStat(
				store,
				task,
				{ stage: "Plan", status: "Advanced", duration: "2s" },
				"/repo",
				{
					useBranches: true,
					defaultBranchFn: async () => "main",
					diffFilesFn: async () => [
						{ path: "a.js", additions: 9, deletions: 4, binary: false },
					],
				},
			);
			expect(saved).toMatchObject({ stage: "Plan" });
			expect(saved).not.toHaveProperty("additions");
			await flushAsyncCapture();
			// First row: nothing before it to backfill, so the stage opens
			// at zero on the freshly measured cumulative baseline.
			expect(saved).toMatchObject({
				additions: 0,
				deletions: 0,
				baseAdditions: 9,
				baseDeletions: 4,
			});
			expect(onSave).toHaveBeenCalledWith("/repo", task);
		});

		it("keeps a plain entry when git fails", async () => {
			const onSave = vi.fn();
			const task = { id: "t3", projectId: "p1" };
			const store = stubStore({ cwd: "/repo", onSave });
			recordTimelineWithDiffStat(
				store,
				task,
				{ stage: "Build", status: "Failed", duration: "3s" },
				"/repo",
				{
					workingTreeDiffFn: async () => {
						throw new Error("no git here");
					},
				},
			);
			await flushAsyncCapture();
			expect(task.timeline).toHaveLength(1);
			expect(task.timeline[0]).not.toHaveProperty("additions");
			expect(onSave).not.toHaveBeenCalled();
		});

		it("keeps a plain entry when cwd resolution throws", async () => {
			const task = { id: "t4", projectId: "p1" };
			const store = {
				_resolveProjectCwd: () => {
					throw new Error("no project");
				},
				_saveTaskMarkdown: vi.fn(),
			};
			recordTimelineWithDiffStat(
				store,
				task,
				{ stage: "Idea", status: "Moved" },
				"/repo",
			);
			await flushAsyncCapture();
			expect(task.timeline).toHaveLength(1);
			expect(task.timeline[0]).not.toHaveProperty("additions");
			expect(store._saveTaskMarkdown).not.toHaveBeenCalled();
		});

		it("still passes metadata through like recordTimeline", () => {
			const task = { id: "t5", projectId: "p1" };
			recordTimelineWithDiffStat(
				stubStore(),
				task,
				{ stage: "Plan", status: "Failed", reason: "boom" },
				null,
			);
			expect(task.timeline[0]).toMatchObject({ reason: "boom" });
			const plain = { id: "t6" };
			recordTimeline(plain, { stage: "Idea", status: "Moved" });
			expect(plain.timeline).toHaveLength(1);
		});

		it("still re-saves a live task when the store has a membership API", async () => {
			const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "diffstat-live-"));
			try {
				const store = mapBackedStore(baseDir);
				const saveSpy = vi.fn((cwd, task) =>
					saveTaskMarkdown(store, cwd, task),
				);
				store._saveTaskMarkdown = saveSpy;
				const task = liveTask("t-live");
				store.__map.set(task.id, task);
				const saved = recordTimelineWithDiffStat(
					store,
					task,
					{ stage: "Plan", status: "Advanced", duration: "2s" },
					baseDir,
					{
						workingTreeDiffFn: async () => [
							{ path: "a.js", additions: 9, deletions: 4 },
						],
					},
				);
				expect(saved).not.toHaveProperty("additions");
				await flushDeferredCapture();
				expect(saved).toMatchObject({
					additions: 0,
					deletions: 0,
					baseAdditions: 9,
					baseDeletions: 4,
				});
				expect(saveSpy).toHaveBeenCalledWith(baseDir, task);
				expect(
					fs.existsSync(
						path.join(baseDir, "docs", "tasks", task.id, "task.md"),
					),
				).toBe(true);
			} finally {
				fs.rmSync(baseDir, { recursive: true, force: true });
			}
		});

		it("does not resurrect a task deleted before git answers", async () => {
			const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "diffstat-race-"));
			try {
				const store = mapBackedStore(baseDir);
				const saveSpy = vi.fn((cwd, task) =>
					saveTaskMarkdown(store, cwd, task),
				);
				store._saveTaskMarkdown = saveSpy;
				const task = liveTask("t-gone");
				store.__map.set(task.id, task);
				store._saveTaskMarkdown(baseDir, task);
				const taskMdPath = path.join(
					baseDir,
					"docs",
					"tasks",
					task.id,
					"task.md",
				);
				expect(fs.existsSync(taskMdPath)).toBe(true);
				saveSpy.mockClear();
				const gate = gatedWorkingTreeDiff();
				const saved = recordTimelineWithDiffStat(
					store,
					task,
					{ stage: "Plan", status: "Advanced", duration: "2s" },
					baseDir,
					{ workingTreeDiffFn: gate.fn },
				);
				expect(task.timeline).toHaveLength(1);
				// Mid-flight delete: drop from the registry and remove the docs
				// dir, exactly like deleteTask does.
				store.__map.delete(task.id);
				fs.rmSync(path.join(baseDir, "docs", "tasks", task.id), {
					recursive: true,
					force: true,
				});
				gate.release();
				await flushDeferredCapture();
				expect(saveSpy).not.toHaveBeenCalled();
				expect(saved).not.toHaveProperty("additions");
				expect(fs.existsSync(taskMdPath)).toBe(false);
			} finally {
				fs.rmSync(baseDir, { recursive: true, force: true });
			}
		});

		it("ignores the stale entry when the task id was recreated mid-flight", async () => {
			const baseDir = fs.mkdtempSync(
				path.join(os.tmpdir(), "diffstat-stale-"),
			);
			try {
				const store = mapBackedStore(baseDir);
				const saveSpy = vi.fn((cwd, task) =>
					saveTaskMarkdown(store, cwd, task),
				);
				store._saveTaskMarkdown = saveSpy;
				const task = liveTask("t-reused");
				store.__map.set(task.id, task);
				const gate = gatedWorkingTreeDiff();
				const saved = recordTimelineWithDiffStat(
					store,
					task,
					{ stage: "Plan", status: "Advanced", duration: "2s" },
					baseDir,
					{ workingTreeDiffFn: gate.fn },
				);
				// The id is recreated with a fresh object before git answers.
				const replacement = liveTask("t-reused");
				store.__map.set(replacement.id, replacement);
				gate.release();
				await flushDeferredCapture();
				expect(saveSpy).not.toHaveBeenCalled();
				expect(saved).not.toHaveProperty("additions");
				expect(replacement.timeline).toHaveLength(0);
			} finally {
				fs.rmSync(baseDir, { recursive: true, force: true });
			}
		});
	});

	describe("_entryBoundary", () => {
		it("reads the canonical boundary fields", () => {
			expect(
				_entryBoundary({ boundaryStartSha: "aaa", boundaryEndSha: "bbb" }),
			).toEqual({ start: "aaa", end: "bbb" });
		});

		it("accepts the legacy baseSha/headSha aliases", () => {
			expect(
				_entryBoundary({ baseSha: "aaa", headSha: "bbb" }),
			).toEqual({ start: "aaa", end: "bbb" });
		});

		it("prefers the canonical fields over legacy aliases", () => {
			expect(
				_entryBoundary({
					boundaryStartSha: "canon",
					baseSha: "legacy",
					boundaryEndSha: "canon-end",
					headSha: "legacy-end",
				}),
			).toEqual({ start: "canon", end: "canon-end" });
		});

		it("distinguishes partial from legacy boundary data", () => {
			expect(_entryBoundary({ boundaryStartSha: "aaa" })).toEqual({
				start: "aaa",
				end: null,
			});
			expect(_entryBoundary({ stage: "Idea" })).toEqual({
				start: null,
				end: null,
			});
			expect(_entryBoundary(null)).toEqual({ start: null, end: null });
		});

		it("treats blank SHAs as missing", () => {
			expect(
				_entryBoundary({ boundaryStartSha: "  ", boundaryEndSha: "" }),
			).toEqual({ start: null, end: null });
		});
	});

	describe("range-based badges", () => {
		it("attributes an explicit range directly to its own row", async () => {
			const onSave = vi.fn();
			const task = { id: "t-range", projectId: "p1", branch: "kb/t-range" };
			const store = stubStore({ cwd: "/repo", onSave });
			const saved = recordTimelineWithDiffStat(
				store,
				task,
				{
					stage: "In Progress",
					status: "Advanced",
					duration: "2s",
					boundaryStartSha: "base",
					boundaryEndSha: "head",
				},
				"/repo",
				{
					rangeFilesFn: async () => [
						{ path: "a.js", additions: 9, deletions: 4, binary: false },
					],
				},
			);
			expect(saved).not.toHaveProperty("additions");
			await flushAsyncCapture();
			expect(saved).toMatchObject({
				additions: 9,
				deletions: 4,
				baseAdditions: 9,
				baseDeletions: 4,
			});
			expect(onSave).toHaveBeenCalledWith("/repo", task);
		});

		it("keeps the editing stage's badge on its own row when the testing stage is empty", async () => {
			// The reported bug: a testing stage showing the editing stage's
			// diff. With explicit ranges each row measures only its own
			// commits, so the edit row keeps +9 -4 and the test row is +0 -0.
			const task = { id: "t-misattr", projectId: "p1", branch: "kb/t-misattr" };
			const store = stubStore({ cwd: "/repo" });
			const editRow = recordTimelineWithDiffStat(
				store,
				task,
				{
					stage: "In Progress",
					status: "Advanced",
					duration: "2s",
					boundaryStartSha: "s0",
					boundaryEndSha: "s1",
				},
				"/repo",
				{
					rangeFilesFn: async () => [
						{ path: "a.js", additions: 9, deletions: 4, binary: false },
					],
				},
			);
			const testRow = recordTimelineWithDiffStat(
				store,
				task,
				{
					stage: "Automated tests",
					status: "Advanced",
					duration: "3s",
					boundaryStartSha: "s1",
					boundaryEndSha: "s1",
				},
				"/repo",
				{ rangeFilesFn: async () => [] },
			);
			// Two serialized per-task jobs: allow both to drain.
			await flushDeferredCapture();
			expect(editRow).toMatchObject({ additions: 9, deletions: 4 });
			expect(testRow).toMatchObject({ additions: 0, deletions: 0 });
		});

		it("leaves partial boundary data badge-less instead of guessing", async () => {
			const onSave = vi.fn();
			const task = { id: "t-partial", projectId: "p1" };
			const store = stubStore({ cwd: "/repo", onSave });
			const saved = recordTimelineWithDiffStat(
				store,
				task,
				{
					stage: "Plan",
					status: "Advanced",
					duration: "1s",
					boundaryStartSha: "only-start",
				},
				"/repo",
				{
					rangeFilesFn: async () => {
						throw new Error("must not measure a partial range");
					},
				},
			);
			await flushAsyncCapture();
			expect(saved).not.toHaveProperty("additions");
			expect(onSave).toHaveBeenCalledWith("/repo", task);
		});

		it("attributes a failed stage's own range to the Failed row", async () => {
			const task = { id: "t-failrange", projectId: "p1" };
			const store = stubStore({ cwd: "/repo" });
			const saved = recordTimelineWithDiffStat(
				store,
				task,
				{
					stage: "In Progress",
					status: "Failed",
					duration: "1s",
					boundaryStartSha: "s0",
					boundaryEndSha: "s1",
				},
				"/repo",
				{
					rangeFilesFn: async () => [
						{ path: "a.js", additions: 5, deletions: 5, binary: false },
					],
				},
			);
			await flushAsyncCapture();
			expect(saved).toMatchObject({ additions: 5, deletions: 5 });
		});

		it("leaves a failed range measurement badge-less", async () => {
			const task = { id: "t-rangefail", projectId: "p1" };
			const store = stubStore({ cwd: "/repo" });
			const saved = recordTimelineWithDiffStat(
				store,
				task,
				{
					stage: "Plan",
					status: "Advanced",
					duration: "1s",
					boundaryStartSha: "s0",
					boundaryEndSha: "s1",
				},
				"/repo",
				{
					rangeFilesFn: async () => {
						throw new Error("no git here");
					},
				},
			);
			await flushAsyncCapture();
			expect(saved).not.toHaveProperty("additions");
			expect(saved.baseAdditions).toBeNull();
		});

		it("canonicalises legacy baseSha/headSha aliases onto the boundary fields", async () => {
			const task = { id: "t-alias", projectId: "p1" };
			const store = stubStore({ cwd: "/repo" });
			const saved = recordTimelineWithDiffStat(
				store,
				task,
				{
					stage: "Plan",
					status: "Advanced",
					duration: "1s",
					baseSha: "s0",
					headSha: "s1",
				},
				"/repo",
				{ rangeFilesFn: async () => [] },
			);
			expect(saved.boundaryStartSha).toBe("s0");
			expect(saved.boundaryEndSha).toBe("s1");
			await flushAsyncCapture();
			expect(saved).toMatchObject({ additions: 0, deletions: 0 });
		});

		it.skipIf(!gitAvailable)(
			"fail-then-retry keeps the edit diff on the edit row (real git ranges)",
			async () => {
				// The reported bug without any injected diffs: an edit stage
				// commits work, the following testing stage commits nothing,
				// and each row's badge measures only its own commit range —
				// the edit keeps its diff, the test shows `+0 -0`.
				const dir = fs.mkdtempSync(
					path.join(os.tmpdir(), "kainbain-range-retry-"),
				);
				try {
					const git = (...args) =>
						execFileSync("git", args, {
							cwd: dir,
							stdio: ["ignore", "pipe", "pipe"],
						})
							.toString()
							.trim();
					git("init", "-b", "main");
					git("config", "user.email", "kainbain-test@example.com");
					git("config", "user.name", "KainBain Test");
					fs.writeFileSync(path.join(dir, "a.js"), "one\n");
					git("add", "-A");
					git("commit", "-m", "base");
					const s0 = git("rev-parse", "HEAD");
					// Failed edit attempt, bounded by its own commit (the
					// `... (failed)` commit the failure path writes).
					fs.writeFileSync(path.join(dir, "a.js"), "one\ntwo\nthree\n");
					git("add", "-A");
					git("commit", "-m", "edit ... (failed)");
					const s1 = git("rev-parse", "HEAD");
					expect(s1).not.toBe(s0);

					const task = { id: "t-retry", projectId: "p1" };
					const store = stubStore({ cwd: dir });
					const editRow = recordTimelineWithDiffStat(
						store,
						task,
						{
							stage: "In Progress",
							status: "Failed",
							duration: "1s",
							boundaryStartSha: s0,
							boundaryEndSha: s1,
						},
						dir,
					);
					const testRow = recordTimelineWithDiffStat(
						store,
						task,
						{
							stage: "Automated tests",
							status: "Advanced",
							duration: "1s",
							boundaryStartSha: s1,
							boundaryEndSha: s1,
						},
						dir,
					);
					// Two serialized per-task jobs: allow both to drain. Real
					// git spawns subprocesses, so poll until both rows settle
					// instead of assuming the unit-test flush is enough.
					const deadline = Date.now() + 10000;
					while (
						(Date.now() < deadline &&
							(editRow.additions === undefined ||
								testRow.additions === undefined))
					) {
						await flushDeferredCapture();
					}
					expect(editRow).toMatchObject({ additions: 2, deletions: 0 });
					expect(testRow).toMatchObject({ additions: 0, deletions: 0 });
				} finally {
					try {
						fs.rmSync(dir, { recursive: true, force: true });
					} catch {
						// ignore teardown errors
					}
				}
			},
		);
	});

	describe("per-stage badges", () => {
		// Each entry is the cumulative total the stubbed git answers with at
		// the next transition; `null` simulates a git failure (unknown diff).
		// The stub replays the last entry once the script runs out.
		function scriptedWorkingTreeDiff(script) {
			let calls = 0;
			return async () => {
				const total = script[Math.min(calls, script.length - 1)];
				calls += 1;
				if (total == null) throw new Error("no git here");
				return [
					{
						path: "a.js",
						additions: total.additions,
						deletions: total.deletions,
						binary: false,
					},
				];
			};
		}

		function stageTask(id = "t-stage") {
			return {
				id,
				projectId: "p1",
				title: id,
				status: "in_stage",
				timeline: [],
				history: [],
				reports: [],
			};
		}

		function record(store, task, stage, status, diffFn) {
			return recordTimelineWithDiffStat(
				store,
				task,
				{ stage, status, duration: "1s" },
				"/repo",
				{ workingTreeDiffFn: diffFn },
			);
		}

		it("shows each stage only its own delta, with no-op stages at +0 -0", async () => {
			const store = stubStore({ cwd: "/repo", onSave: () => {} });
			const task = stageTask();
			const diffFn = scriptedWorkingTreeDiff([
				{ additions: 0, deletions: 0 },
				{ additions: 1000, deletions: 0 },
				{ additions: 1000, deletions: 0 },
			]);
			record(store, task, "Implement", "Advanced", diffFn);
			record(store, task, "AutomatedTest", "Advanced", diffFn);
			record(store, task, "AutomatedTest", "Completed", diffFn);
			await flushDeferredCapture();
			expect(task.timeline).toHaveLength(3);
			expect(task.timeline[0]).toMatchObject({
				stage: "Implement",
				additions: 1000,
				deletions: 0,
				baseAdditions: 0,
				baseDeletions: 0,
			});
			expect(task.timeline[1]).toMatchObject({
				stage: "AutomatedTest",
				status: "Advanced",
				additions: 0,
				deletions: 0,
				baseAdditions: 1000,
				baseDeletions: 0,
			});
			expect(task.timeline[2]).toMatchObject({
				stage: "AutomatedTest",
				status: "Completed",
				additions: 0,
				deletions: 0,
				baseAdditions: 1000,
				baseDeletions: 0,
			});
		});

		it("measures from zero when the entry baseline was never observed", async () => {
			const store = stubStore({ cwd: "/repo", onSave: () => {} });
			const task = stageTask("t-null-base");
			const diffFn = scriptedWorkingTreeDiff([
				null,
				{ additions: 1000, deletions: 0 },
				{ additions: 1000, deletions: 0 },
			]);
			record(store, task, "Implement", "Advanced", diffFn);
			record(store, task, "AutomatedTest", "Advanced", diffFn);
			await flushDeferredCapture();
			expect(task.timeline).toHaveLength(2);
			expect(task.timeline[0]).toMatchObject({
				additions: 1000,
				deletions: 0,
			});
			expect(task.timeline[1]).toMatchObject({
				additions: 0,
				deletions: 0,
				baseAdditions: 1000,
				baseDeletions: 0,
			});
		});

		it("lets the Failed row own the failing stage's delta", async () => {
			const store = stubStore({ cwd: "/repo", onSave: () => {} });
			const task = stageTask("t-failed");
			const diffFn = scriptedWorkingTreeDiff([
				{ additions: 0, deletions: 0 },
				{ additions: 40, deletions: 2 },
				{ additions: 40, deletions: 2 },
			]);
			record(store, task, "Implement", "Moved", diffFn);
			record(store, task, "Implement", "Failed", diffFn);
			// Failback re-enters a stage: the closing Failed row must keep
			// its delta, not be backfilled to the failback-time total.
			record(store, task, "Plan", "Failed back", diffFn);
			await flushDeferredCapture();
			expect(task.timeline).toHaveLength(3);
			expect(task.timeline[0]).toMatchObject({
				stage: "Implement",
				status: "Moved",
				additions: 0,
				deletions: 0,
			});
			expect(task.timeline[1]).toMatchObject({
				stage: "Implement",
				status: "Failed",
				additions: 40,
				deletions: 2,
				baseAdditions: 40,
				baseDeletions: 2,
			});
			expect(task.timeline[2]).toMatchObject({
				stage: "Plan",
				additions: 0,
				deletions: 0,
				baseAdditions: 40,
				baseDeletions: 2,
			});
		});

		it("never rewrites legacy rows that carry no baseline", async () => {
			const store = stubStore({ cwd: "/repo", onSave: () => {} });
			const task = stageTask("t-legacy");
			task.timeline.push({
				stage: "Idea",
				status: "Moved",
				duration: "5s",
				timestamp: "2026-09-20T00:00:00.000Z",
				additions: 12,
				deletions: 3,
			});
			const diffFn = scriptedWorkingTreeDiff([
				{ additions: 20, deletions: 5 },
			]);
			record(store, task, "Plan", "Advanced", diffFn);
			await flushDeferredCapture();
			expect(task.timeline).toHaveLength(2);
			expect(task.timeline[0]).toEqual({
				stage: "Idea",
				status: "Moved",
				duration: "5s",
				timestamp: "2026-09-20T00:00:00.000Z",
				additions: 12,
				deletions: 3,
			});
			expect(task.timeline[1]).toMatchObject({
				stage: "Plan",
				additions: 0,
				deletions: 0,
				baseAdditions: 20,
				baseDeletions: 5,
			});
		});

		it("clamps the delta at zero when history was rewritten below the baseline", async () => {
			const store = stubStore({ cwd: "/repo", onSave: () => {} });
			const task = stageTask("t-rebase");
			const diffFn = scriptedWorkingTreeDiff([
				{ additions: 100, deletions: 10 },
				{ additions: 5, deletions: 1 },
			]);
			record(store, task, "Implement", "Advanced", diffFn);
			record(store, task, "AutomatedTest", "Advanced", diffFn);
			await flushDeferredCapture();
			expect(task.timeline[0]).toMatchObject({
				additions: 0,
				deletions: 0,
			});
			expect(task.timeline[1]).toMatchObject({
				additions: 0,
				deletions: 0,
				baseAdditions: 5,
				baseDeletions: 1,
			});
		});

		it("keeps unknown diffs badge-less while still tracking the baseline", async () => {
			const onSave = vi.fn();
			const store = stubStore({ cwd: "/repo", onSave });
			const task = stageTask("t-unknown");
			const diffFn = scriptedWorkingTreeDiff([
				{ additions: 7, deletions: 1 },
				null,
				{ additions: 10, deletions: 1 },
			]);
			record(store, task, "Implement", "Advanced", diffFn);
			record(store, task, "AutomatedTest", "Advanced", diffFn);
			record(store, task, "Review", "Advanced", diffFn);
			await flushDeferredCapture();
			expect(task.timeline).toHaveLength(3);
			// The git failure leaves the middle row without a badge (honest
			// unknown, not a zero), but it inherits the last known baseline
			// so the following stage still measures its own delta.
			expect(task.timeline[1]).not.toHaveProperty("additions");
			expect(task.timeline[1]).not.toHaveProperty("deletions");
			expect(task.timeline[1]).toMatchObject({
				baseAdditions: 7,
				baseDeletions: 1,
			});
			expect(task.timeline[2]).toMatchObject({
				additions: 3,
				deletions: 0,
			});
			expect(onSave).toHaveBeenCalled();
		});

		it("attributes rapid enter-to-fail transitions in call order", async () => {
			const store = stubStore({ cwd: "/repo", onSave: () => {} });
			const task = stageTask("t-order");
			const enterGate = gatedWorkingTreeDiff([
				{ path: "a.js", additions: 0, deletions: 0 },
			]);
			const failGate = gatedWorkingTreeDiff([
				{ path: "a.js", additions: 8, deletions: 0 },
			]);
			record(store, task, "Implement", "Moved", enterGate.fn);
			record(store, task, "Implement", "Failed", failGate.fn);
			// Release out of order: the queue must still measure the entry
			// first so the Failed row owns exactly the stage's delta.
			failGate.release();
			enterGate.release();
			await flushDeferredCapture();
			expect(task.timeline).toHaveLength(2);
			expect(task.timeline[0]).toMatchObject({
				stage: "Implement",
				status: "Moved",
				additions: 0,
				deletions: 0,
				baseAdditions: 0,
				baseDeletions: 0,
			});
			expect(task.timeline[1]).toMatchObject({
				stage: "Implement",
				status: "Failed",
				additions: 8,
				deletions: 0,
				baseAdditions: 8,
				baseDeletions: 0,
			});
		});
	});
});

describe("_isTaskStillRegistered", () => {
	it("is true for the exact live object, false once deleted or replaced", () => {
		const store = mapBackedStore("/repo");
		const task = liveTask("t-reg");
		expect(_isTaskStillRegistered(store, task)).toBe(false);
		store.__map.set(task.id, task);
		expect(_isTaskStillRegistered(store, task)).toBe(true);
		store.__map.delete(task.id);
		expect(_isTaskStillRegistered(store, task)).toBe(false);
		store.__map.set(task.id, liveTask("t-reg"));
		expect(_isTaskStillRegistered(store, task)).toBe(false);
	});

	it("is null when liveness is unknowable", () => {
		const task = liveTask("t-unknown");
		expect(_isTaskStillRegistered(stubStore(), task)).toBe(null);
		expect(_isTaskStillRegistered(null, task)).toBe(null);
		expect(_isTaskStillRegistered(mapBackedStore("/repo"), null)).toBe(null);
		expect(_isTaskStillRegistered(mapBackedStore("/repo"), { id: "x" })).toBe(
			null,
		);
	});
});

describe("per-stage badges: badge-less rows stay unbackfilled", () => {
	// Regression coverage for the per-stage badge invariant: a row whose own
	// measurement failed (honest unknown, git failure at entry) is never
	// backfilled later — a later measurement cannot tell how much of its
	// delta belongs to that stage. Helpers mirror the "per-stage badges"
	// describe above so this block stays self-contained at file scope.
	function scriptedWorkingTreeDiff(script) {
		let calls = 0;
		return async () => {
			const total = script[Math.min(calls, script.length - 1)];
			calls += 1;
			if (total == null) throw new Error("no git here");
			return [
				{
					path: "a.js",
					additions: total.additions,
					deletions: total.deletions,
					binary: false,
				},
			];
		};
	}

	function stageTask(id = "t-stage") {
		return {
			id,
			projectId: "p1",
			title: id,
			status: "in_stage",
			timeline: [],
			history: [],
			reports: [],
		};
	}

	function record(store, task, stage, status, diffFn) {
		return recordTimelineWithDiffStat(
			store,
			task,
			{ stage, status, duration: "1s" },
			"/repo",
			{ workingTreeDiffFn: diffFn },
		);
	}

	it("never backfills a badge-less row once its stage has closed", async () => {
		const store = stubStore({ cwd: "/repo", onSave: () => {} });
		const task = stageTask("t-unknown-late");
		const diffFn = scriptedWorkingTreeDiff([
			{ additions: 7, deletions: 1 },
			null,
			{ additions: 10, deletions: 1 },
			{ additions: 12, deletions: 1 },
		]);
		record(store, task, "Implement", "Advanced", diffFn);
		record(store, task, "AutomatedTest", "Advanced", diffFn);
		record(store, task, "Review", "Advanced", diffFn);
		record(store, task, "Deploy", "Advanced", diffFn);
		await flushDeferredCapture();
		expect(task.timeline).toHaveLength(4);
		// The unknown row stays badge-less even after two later stages
		// measured successfully — only badged rows are ever backfilled.
		// Review first absorbs the delta since the last known baseline
		// ({3,0}), then self-corrects to its own true stage delta
		// ({2,0}) once Deploy measures against Review's baseline; the
		// unknowable remainder stays honestly unbadged.
		expect(task.timeline[1]).not.toHaveProperty("additions");
		expect(task.timeline[1]).not.toHaveProperty("deletions");
		expect(task.timeline[2]).toMatchObject({
			additions: 2,
			deletions: 0,
			baseAdditions: 10,
			baseDeletions: 1,
		});
		expect(task.timeline[3]).toMatchObject({
			additions: 0,
			deletions: 0,
			baseAdditions: 12,
			baseDeletions: 1,
		});
	});
});

describe("WP6 rehydration markers frontmatter round-trip", () => {
	it("saves and parses deployBuildAtEntry, preMergeMainSha, mergeAttemptId, deployAttemptId, and stallCount", () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-task-persist-"));
		try {
			const taskStore = {
				_resolveProjectCwd: () => tempDir,
			};
			const task = {
				id: "task-wp6-rehydration",
				projectId: "proj-1",
				workflowId: "wf-default",
				title: "WP6 Rehydration Task",
				status: "interrupted",
				deployBuildAtEntry: 42,
				preMergeMainSha: "abc1234567890",
				mergeAttemptId: "merge-task-1234",
				deployAttemptId: "deploy-task-5678",
				stallCount: 2,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			saveTaskMarkdown(taskStore, tempDir, task);

			const taskMdPath = path.join(
				tempDir,
				"docs",
				"tasks",
				task.id,
				"task.md",
			);
			expect(fs.existsSync(taskMdPath)).toBe(true);
			const content = fs.readFileSync(taskMdPath, "utf8");

			expect(content).toContain("deployBuildAtEntry: 42");
			expect(content).toContain('preMergeMainSha: "abc1234567890"');
			expect(content).toContain('mergeAttemptId: "merge-task-1234"');
			expect(content).toContain('deployAttemptId: "deploy-task-5678"');
			expect(content).toContain("stallCount: 2");

			const parsed = parseTaskMarkdown(
				taskStore,
				content,
				task.id,
				task.projectId,
			);
			expect(parsed.deployBuildAtEntry).toBe(42);
			expect(parsed.preMergeMainSha).toBe("abc1234567890");
			expect(parsed.mergeAttemptId).toBe("merge-task-1234");
			expect(parsed.deployAttemptId).toBe("deploy-task-5678");
			expect(parsed.stallCount).toBe(2);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("defaults missing rehydration markers safely on legacy files", () => {
		const legacyContent = `---
id: task-legacy
projectId: proj-1
status: in_stage
---
# Goal
Legacy task
`;
		const parsed = parseTaskMarkdown({}, legacyContent, "task-legacy", "proj-1");
		expect(parsed.deployBuildAtEntry).toBeUndefined();
		expect(parsed.preMergeMainSha).toBeUndefined();
		expect(parsed.mergeAttemptId).toBeUndefined();
		expect(parsed.deployAttemptId).toBeUndefined();
		expect(parsed.stallCount).toBe(0);
	});
});

