import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	defaultTaskScreenshotPath,
	resolveOutputPath,
	resolveTaskId,
	sanitizeTaskId,
	verifyPngMagic,
} from "../scripts/capture-screenshot.mjs";

const VALID_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
// The text-round-trip corruption signature: U+FFFD (ef bf bd) where 0x89 belongs.
const CORRUPT_PNG = Buffer.from([
	0xef, 0xbf, 0xbd, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

/***
 * MARK: makeFixtureTree
 * @description Builds a scratch fixture tree under the OS temp dir with the
 *   given repo-relative files (parents created on demand). Callers remove
 *   the tree with fs.rmSync(..., { recursive: true }).
 ***/
function makeFixtureTree(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "capture-verify-"));
	for (const [relPath, content] of Object.entries(files)) {
		const full = path.join(root, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}
	return root;
}

describe("verifyPngMagic", () => {
	it("passes a freshly captured PNG head", () => {
		const root = makeFixtureTree({ "shot-proof.png": VALID_PNG });
		try {
			const result = verifyPngMagic(path.join(root, "shot-proof.png"));
			assert.equal(result.ok, true);
			assert.equal(result.expected, "89504e47");
			assert.ok(result.actual.startsWith("89504e47"), `actual was ${result.actual}`);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails a text-corrupted capture with expected vs actual magic", () => {
		const root = makeFixtureTree({ "shot-proof.png": CORRUPT_PNG });
		try {
			const result = verifyPngMagic(path.join(root, "shot-proof.png"));
			assert.equal(result.ok, false);
			assert.equal(result.expected, "89504e47");
			assert.ok(result.actual.startsWith("efbfbd"), `actual was ${result.actual}`);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails a missing or empty capture instead of passing it", () => {
		const root = makeFixtureTree({ "empty-proof.png": Buffer.alloc(0) });
		try {
			assert.equal(verifyPngMagic(path.join(root, "empty-proof.png")).ok, false);
			const missing = verifyPngMagic(path.join(root, "never-written.png"));
			assert.equal(missing.ok, false);
			assert.equal(missing.actual, null);
			assert.ok(missing.error, "expected an error reason");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("skips non-PNG outputs (the capture may target other image types)", () => {
		const root = makeFixtureTree({ "shot.jpg": Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
		try {
			const result = verifyPngMagic(path.join(root, "shot.jpg"));
			assert.equal(result.ok, true);
			assert.ok(result.skipped);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("resolveTaskId", () => {
	it("prefers $TASK_ID over $KAINBAIN_TASK_ID and the branch", () => {
		assert.equal(
			resolveTaskId({ env: { TASK_ID: "env-task", KAINBAIN_TASK_ID: "other" }, branch: "kb/branch-task" }),
			"env-task",
		);
	});

	it("uses $KAINBAIN_TASK_ID when $TASK_ID is unset", () => {
		assert.equal(
			resolveTaskId({ env: { KAINBAIN_TASK_ID: "kainbain-task" }, branch: "kb/branch-task" }),
			"kainbain-task",
		);
	});

	it("treats empty env values as unset and falls through", () => {
		assert.equal(
			resolveTaskId({ env: { TASK_ID: "", KAINBAIN_TASK_ID: "   " }, branch: "kb/branch-task" }),
			"branch-task",
		);
	});

	it("parses kb/<task-id> branches when no env var is set", () => {
		assert.equal(resolveTaskId({ env: {}, branch: "kb/branch-task" }), "branch-task");
	});

	it("returns null on non-task branches, detached HEAD, or missing git", () => {
		assert.equal(resolveTaskId({ env: {}, branch: "main" }), null);
		assert.equal(resolveTaskId({ env: {}, branch: "" }), null);
		assert.equal(resolveTaskId({ env: {}, branch: null }), null);
		assert.equal(resolveTaskId({ env: {} }), null);
	});
});

describe("sanitizeTaskId", () => {
	it("accepts plain ids and trims padding", () => {
		assert.equal(sanitizeTaskId("9940bbbc"), "9940bbbc");
		assert.equal(sanitizeTaskId("  9940bbbc  "), "9940bbbc");
	});

	it("rejects traversal, separator, whitespace, and empty ids", () => {
		for (const raw of ["", "   ", "../x", "a/b", "a\\b", "a b", "..", "kb/a/b"]) {
			assert.equal(sanitizeTaskId(raw), null, `expected null for ${JSON.stringify(raw)}`);
		}
	});

	it("rejects malicious ids from every source to the fail-fast path", () => {
		assert.equal(resolveTaskId({ env: { TASK_ID: "../x" }, branch: "kb/branch-task" }), null);
		assert.equal(resolveTaskId({ env: {}, branch: "kb/a/b" }), null);
		assert.equal(resolveTaskId({ env: {}, branch: "kb/" }), null);
	});
});

describe("defaultTaskScreenshotPath", () => {
	it("builds docs/tasks/<task-id>/screenshot-<timestamp>.png with a fixed clock", () => {
		const now = new Date(2026, 10, 16, 18, 30, 5);
		assert.equal(
			defaultTaskScreenshotPath("9940bbbc", now),
			"docs/tasks/9940bbbc/screenshot-20261116-183005.png",
		);
	});

	it("pads single-digit timestamp fields", () => {
		const now = new Date(2026, 0, 2, 3, 4, 5);
		assert.equal(
			defaultTaskScreenshotPath("9940bbbc", now),
			"docs/tasks/9940bbbc/screenshot-20260102-030405.png",
		);
	});

	it("refuses to build a traversal path for invalid ids", () => {
		assert.throws(() => defaultTaskScreenshotPath("../x"), /task id/i);
	});
});

describe("resolveOutputPath", () => {
	it("defaults into the task folder when the id is discoverable, never repo root", () => {
		const now = new Date(2026, 10, 16, 18, 30, 5);
		const result = resolveOutputPath({ env: {}, branch: "kb/9940bbbc", now });
		assert.equal(result, "docs/tasks/9940bbbc/screenshot-20261116-183005.png");
		assert.notEqual(result, "screenshot.png");
		assert.ok(result.startsWith("docs/tasks/"), `expected a task-folder path, got ${result}`);
	});

	it("resolves the default from env vars without touching git", () => {
		const now = new Date(2026, 10, 16, 18, 30, 5);
		assert.equal(
			resolveOutputPath({ env: { TASK_ID: "env-task" }, branch: null, now }),
			"docs/tasks/env-task/screenshot-20261116-183005.png",
		);
	});

	it("lets an explicit --out win exactly, even with a discoverable id", () => {
		assert.equal(
			resolveOutputPath({
				outArg: "docs/tasks/9940bbbc/custom-proof.png",
				env: { TASK_ID: "env-task" },
				branch: "kb/9940bbbc",
			}),
			"docs/tasks/9940bbbc/custom-proof.png",
		);
	});

	it("lets an explicit --out win even with no discoverable id", () => {
		assert.equal(
			resolveOutputPath({ outArg: "custom.png", env: {}, branch: null }),
			"custom.png",
		);
	});

	it("fails fast naming the --out form when no task id is discoverable", () => {
		assert.throws(
			() => resolveOutputPath({ env: {}, branch: "main" }),
			(err) => {
				assert.ok(err instanceof Error);
				assert.match(err.message, /--out/);
				assert.match(err.message, /docs\/tasks\/<task-id>\//);
				return true;
			},
		);
	});
});
