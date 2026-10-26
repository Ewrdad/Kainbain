import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { backupPathFor, main, parseArgs, remediateTasks } = await import(
	"../scripts/remediate-no-verdict-rejections.mjs"
);

/***
 * MARK: remediate-no-verdict-rejections tests
 * @description Gate coverage for the one-off no-verdict repair CLI
 *   (scripts/remediate-no-verdict-rejections.mjs): argument handling stays
 *   fail-safe (errors exit non-zero before any write, the default mode never
 *   writes), `--apply` repairs only the spurious rejection and its paired
 *   report, genuine failures are byte-identical, and re-running is a no-op.
 *   Fixtures live in OS temp dirs; nothing touches the live workspace.
 * @example run `node --test tests/remediate-no-verdict-rejections.test.mjs`
 ***/

const DIAGNOSTIC = "No changes made and no verdict rendered";

/** Mirrors `_formatFrontmatterValue` for JSON-in-YAML frontmatter scalars. */
function fm(value) {
	return `"${JSON.stringify(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function spuriousFailure() {
	return {
		stage: "Plan",
		status: "Failed",
		timestamp: "2026-10-10T21:59:22.494Z",
		reason: `[Agent Review Rejection] ${DIAGNOSTIC}. An explicit KAINBAIN_VERDICT is required.`,
		durationStageId: "3",
	};
}

function genuineFailure() {
	return {
		stage: "Deep Review",
		status: "Failed",
		timestamp: "2026-10-10T22:10:00.000Z",
		reason: "[Agent Review Rejection] The diff reintroduces the bug. Fix guidance: revert it.",
		durationStageId: "9",
	};
}

function taskMarkdown({ timeline, reports }) {
	return [
		"---",
		'id: "t1"',
		'projectId: "p1"',
		'title: "A task"',
		'status: "in_stage"',
		`timelineMetadata: ${fm(timeline)}`,
		`reportMetadata: ${fm(reports)}`,
		'verdictImplicitPassStages: "{}"',
		"---",
		"",
		"# Goal",
		"do the thing",
		"",
	].join("\n");
}

function spuriousReportFile() {
	return [
		"<!-- KAINBAIN AUTO-GENERATED REPORT -->",
		"# Stage Report: Plan",
		"",
		"**Status:** FAILED",
		"",
		`Execution failed: [Agent Review Rejection] ${DIAGNOSTIC}`,
		"",
	].join("\n");
}

function seedTasksDir({ timeline, reports, withReportFile = true }) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-remediate-"));
	const taskDir = path.join(root, "task-1");
	fs.mkdirSync(taskDir, { recursive: true });
	const before = taskMarkdown({ timeline, reports });
	fs.writeFileSync(path.join(taskDir, "task.md"), before);
	if (withReportFile) {
		fs.writeFileSync(
			path.join(taskDir, "plan-20261010-225922.md"),
			spuriousReportFile(),
		);
	}
	return { root, taskDir, before };
}

function pairedReports() {
	return [
		{
			filename: "plan-20261010-225922.md",
			stageName: "Plan",
			stageId: "3",
			duration: 18336.231,
			status: "FAILED",
			createdAt: "2026-10-10T21:59:22.494Z",
			failureKind: "rejected",
		},
	];
}

describe("parseArgs", () => {
	it("defaults to a dry run that writes nothing", () => {
		assert.deepEqual(parseArgs([]), {
			apply: false,
			backup: true,
			tasksDir: null,
			log: null,
			help: false,
			error: null,
		});
	});

	it("honours --apply, --no-backup, --tasks-dir, and --log", () => {
		const opts = parseArgs([
			"--apply",
			"--no-backup",
			"--tasks-dir",
			"docs/tasks",
			"--log",
			"remediation.log",
		]);
		assert.equal(opts.apply, true);
		assert.equal(opts.backup, false);
		assert.equal(opts.tasksDir, "docs/tasks");
		assert.equal(opts.log, "remediation.log");
		assert.equal(opts.error, null);
	});

	it("lets the last of --apply/--dry-run win", () => {
		assert.equal(parseArgs(["--apply", "--dry-run"]).apply, false);
		assert.equal(parseArgs(["--dry-run", "--apply"]).apply, true);
	});

	it("records an error instead of throwing when a value is missing", () => {
		assert.equal(parseArgs(["--tasks-dir"]).error, "--tasks-dir requires a value");
		assert.equal(parseArgs(["--log"]).error, "--log requires a value");
	});

	it("ignores unknown flags (a typo degrades to a dry run, never a write)", () => {
		const opts = parseArgs(["--aply"]);
		assert.equal(opts.apply, false);
		assert.equal(opts.error, null);
	});
});

describe("backupPathFor", () => {
	it("appends .bak", () => {
		assert.equal(backupPathFor("task.md"), "task.md.bak");
	});
});

describe("remediateTasks", () => {
	it("reports victims without writing in dry-run mode", () => {
		const { root, taskDir, before } = seedTasksDir({
			timeline: [spuriousFailure()],
			reports: pairedReports(),
		});
		try {
			const result = remediateTasks({ tasksDir: root, apply: false });
			assert.equal(result.error, null);
			assert.equal(result.victims.length, 1);
			assert.equal(result.victims[0].removedFailures, 1);
			assert.equal(result.victims[0].repairedReports, 1);
			assert.equal(
				fs.readFileSync(path.join(taskDir, "task.md"), "utf8"),
				before,
			);
			assert.ok(!fs.existsSync(path.join(taskDir, "task.md.bak")));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("repairs task and report files with backups, then idles on re-run", () => {
		const { root, taskDir } = seedTasksDir({
			timeline: [genuineFailure(), spuriousFailure()],
			reports: pairedReports(),
		});
		try {
			const first = remediateTasks({ tasksDir: root, apply: true });
			assert.equal(first.error, null);
			assert.equal(first.victims.length, 1);

			const taskText = fs.readFileSync(path.join(taskDir, "task.md"), "utf8");
			assert.ok(!taskText.includes(DIAGNOSTIC));
			// The genuine rejection survives the repair.
			assert.ok(taskText.includes("The diff reintroduces the bug"));
			assert.ok(!taskText.includes("verdictImplicitPassStages"));

			const reportText = fs.readFileSync(
				path.join(taskDir, "plan-20261010-225922.md"),
				"utf8",
			);
			assert.ok(reportText.includes("**Status:** PASSED"));

			assert.ok(fs.existsSync(path.join(taskDir, "task.md.bak")));
			assert.ok(
				fs.existsSync(path.join(taskDir, "plan-20261010-225922.md.bak")),
			);

			const second = remediateTasks({ tasksDir: root, apply: true });
			assert.equal(second.error, null);
			assert.deepEqual(second.victims, []);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("leaves a task with only genuine failures byte-identical", () => {
		const { root, taskDir, before } = seedTasksDir({
			timeline: [genuineFailure()],
			reports: [],
			withReportFile: false,
		});
		try {
			const result = remediateTasks({ tasksDir: root, apply: true });
			assert.equal(result.error, null);
			assert.deepEqual(result.victims, []);
			assert.equal(
				fs.readFileSync(path.join(taskDir, "task.md"), "utf8"),
				before,
			);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("returns an error for a missing tasks dir instead of throwing", () => {
		const missing = path.join(
			os.tmpdir(),
			`kainbain-remediate-absent-${Date.now()}`,
		);
		const result = remediateTasks({ tasksDir: missing });
		assert.match(result.error, /tasks dir not found/);
		assert.deepEqual(result.victims, []);
	});
});

describe("main", () => {
	it("exits 2 with usage on argument errors before touching files", () => {
		assert.equal(main(["--tasks-dir"]), 2);
	});

	it("exits 1 on a missing tasks dir", () => {
		assert.equal(main(["--tasks-dir", path.join(os.tmpdir(), "kainbain-remediate-absent")]), 1);
	});

	it("dry-runs a temp tasks dir and exits 0", () => {
		const { root } = seedTasksDir({
			timeline: [spuriousFailure()],
			reports: pairedReports(),
		});
		try {
			assert.equal(main(["--tasks-dir", root]), 0);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
