import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	collectTaskFiles,
	isSkippedBinary,
	measureCompletionBytes,
	isPayloadTooLarge,
	COMPLETION_FILES_BUDGET_BYTES,
	COMPLETION_FILE_MAX_BYTES,
} from "./daemon.js";

/***
 * MARK: collectTaskFiles completion-envelope budget (task d164fb3f)
 * @description FLIPPED pin for the 413 completion-payload loop (task
 *   d164fb3f, RESPONSE.md S2): binary assets are excluded from the
 *   report, text files are capped per file and in total, and the
 *   composed envelope (`taskFiles` + 20 KiB `output` + JSON overhead)
 *   fits under Fastify's OLD 1 MiB default — so the runner half alone
 *   breaks the loop even against an un-upgraded backend. Companion
 *   unit tests pin the helper predicates' edge cases.
 ***/
describe("collectTaskFiles completion-envelope budget", () => {
	let dirs;
	beforeEach(() => {
		dirs = [];
	});
	afterEach(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
	});

	function seedTaskDocs() {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "kb-413-pin-"));
		dirs.push(base);
		const dir = path.join(base, "docs", "tasks", "t1");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "task.md"), "# task\n");
		for (let i = 0; i < 6; i += 1) {
			fs.writeFileSync(path.join(dir, `shot-${i}.png`), `fakepng-${i}-`.padEnd(204 * 1024, "x"));
		}
		fs.writeFileSync(path.join(dir, "notes.txt"), "useful notes\n");
		return base;
	}

	it("excludes binaries, keeps task prose, and fits under the old 1 MiB default", () => {
		const base = seedTaskDocs();
		const taskFiles = collectTaskFiles({ workdir: base, taskId: "t1" });
		const shipped = taskFiles.map((f) => f.name);
		assert.ok(!shipped.some((name) => name.endsWith(".png")), "no PNG screenshot ships");
		assert.ok(shipped.includes("notes.txt"), "text task docs still ship");
		const filesBytes = taskFiles.reduce(
			(total, file) => total + Buffer.byteLength(file.content, "utf8"),
			0,
		);
		assert.ok(
			filesBytes <= COMPLETION_FILES_BUDGET_BYTES,
			`files stay under the files budget (saw ${filesBytes})`,
		);
		const envelopeBytes = measureCompletionBytes({ taskFiles, output: "o".repeat(20000) });
		assert.ok(
			envelopeBytes < 1024 * 1024,
			`composed envelope fits the old 1 MiB backend default (saw ${envelopeBytes})`,
		);
	});

	it("caps many text files at the files budget with the full envelope under 1 MiB", () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "kb-413-text-"));
		dirs.push(base);
		const dir = path.join(base, "docs", "tasks", "t1");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "task.md"), "# task\n");
		for (let i = 0; i < 8; i += 1) {
			fs.writeFileSync(path.join(dir, `part-${i}.txt`), `part-${i}-`.padEnd(200 * 1024, "x"));
		}
		const taskFiles = collectTaskFiles({ workdir: base, taskId: "t1" });
		assert.ok(taskFiles.length > 0, "some text files ship");
		assert.ok(taskFiles.length < 8, "the total cap drops the overflow");
		const filesBytes = taskFiles.reduce(
			(total, file) => total + Buffer.byteLength(file.content, "utf8"),
			0,
		);
		assert.ok(
			filesBytes <= COMPLETION_FILES_BUDGET_BYTES,
			`files stay under the files budget (saw ${filesBytes})`,
		);
		const envelopeBytes = measureCompletionBytes({ taskFiles, output: "o".repeat(20000) });
		assert.ok(
			envelopeBytes < 1024 * 1024,
			`composed envelope fits the old 1 MiB backend default (saw ${envelopeBytes})`,
		);
	});

	it("skips one over-large text file but keeps the small ones", () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "kb-413-perfile-"));
		dirs.push(base);
		const dir = path.join(base, "docs", "tasks", "t1");
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "task.md"), "# task\n");
		fs.writeFileSync(path.join(dir, "huge.txt"), "h".repeat(COMPLETION_FILE_MAX_BYTES + 1));
		fs.writeFileSync(path.join(dir, "small.txt"), "kept\n");
		const taskFiles = collectTaskFiles({ workdir: base, taskId: "t1" });
		const shipped = taskFiles.map((f) => f.name);
		assert.ok(!shipped.includes("huge.txt"), "over-cap file skipped");
		assert.ok(shipped.includes("small.txt"), "small file kept");
	});

	it("pins the budget arithmetic: files budget + 64 KiB headroom = 1 MiB", () => {
		assert.equal(COMPLETION_FILE_MAX_BYTES, 256 * 1024);
		assert.equal(COMPLETION_FILES_BUDGET_BYTES, 1024 * 1024 - 64 * 1024);
	});
});

describe("isSkippedBinary", () => {
	it("skips common binary extensions case-insensitively", () => {
		for (const name of ["shot.png", "shot.PNG", "doc.pdf", "a.ZIP", "font.woff2", "clip.MP4", "run.exe"]) {
			assert.equal(isSkippedBinary(name), true, name);
		}
	});

	it("keeps text formats, extension-less names, and untrusted input", () => {
		for (const name of ["notes.txt", "plan.md", "data.json", "run.log", "Makefile", "archive.tar.gz2"]) {
			assert.equal(isSkippedBinary(name), false, String(name));
		}
		for (const name of [null, undefined, 42, "", ".png"]) {
			// ".png" IS a binary extension match (dot at 0 still yields ".png").
			assert.equal(isSkippedBinary(name), name === ".png", String(name));
		}
	});
});

describe("measureCompletionBytes", () => {
	it("measures the JSON envelope in UTF-8 bytes", () => {
		const taskFiles = [{ name: "a.txt", content: "héllo" }];
		const output = "ok";
		assert.equal(
			measureCompletionBytes({ taskFiles, output }),
			Buffer.byteLength(JSON.stringify({ taskFiles, output }), "utf8"),
		);
	});

	it("reads unmeasurable input as 0, never throws", () => {
		const circular = {};
		circular.self = circular;
		assert.equal(measureCompletionBytes({ taskFiles: [circular], output: "" }), 0);
		assert.equal(measureCompletionBytes(null), 0);
		assert.equal(measureCompletionBytes(undefined), 0);
	});
});

describe("isPayloadTooLarge", () => {
	it("matches 413 by status code OR Fastify code", () => {
		assert.equal(isPayloadTooLarge({ statusCode: 413 }), true);
		assert.equal(isPayloadTooLarge({ code: "FST_ERR_CTP_BODY_TOO_LARGE" }), true);
		assert.equal(
			isPayloadTooLarge(Object.assign(new Error("Backend 413 on /tasks/t/complete-execution"), {
				statusCode: 413,
				code: "FST_ERR_CTP_BODY_TOO_LARGE",
			})),
			true,
		);
	});

	it("rejects anything else, never throws", () => {
		assert.equal(isPayloadTooLarge(new Error("x")), false);
		assert.equal(isPayloadTooLarge({ statusCode: 500 }), false);
		assert.equal(isPayloadTooLarge({ statusCode: "413" }), false);
		assert.equal(isPayloadTooLarge(null), false);
		assert.equal(isPayloadTooLarge(undefined), false);
		assert.equal(isPayloadTooLarge("413"), false);
	});
});
