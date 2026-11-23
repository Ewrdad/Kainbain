import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectTaskFiles } from "./daemon.js";

/***
 * MARK: collectTaskFiles completion-envelope overflow (bug pin — RED phase)
 * @description RED-phase pin for the 413 completion-payload loop (task
 *   d164fb3f, RESPONSE.md S2): six 200 KiB PNG screenshots each fit the
 *   256 KiB per-file cap, so today's `collectTaskFiles` ships them and
 *   the composed envelope (`taskFiles` + 20 KiB `output` + JSON
 *   overhead) exceeds Fastify's default 1 MiB limit — the POST the
 *   backend rejects with 413. Passes TODAY (pins the bug). After the
 *   runner shrink this file FLIPS: binaries are excluded and the whole
 *   envelope fits under the old 1 MiB default.
 ***/
describe("collectTaskFiles completion-envelope overflow (bug pin)", () => {
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

	it("pins today's overflow: sub-cap PNGs compose an envelope over 1 MiB", () => {
		const base = seedTaskDocs();
		const taskFiles = collectTaskFiles({ workdir: base, taskId: "t1" });
		const shipped = taskFiles.map((f) => f.name);
		assert.ok(shipped.some((name) => name.endsWith(".png")), "today the PNGs ship");
		const filesBytes = taskFiles.reduce(
			(total, file) => total + Buffer.byteLength(file.content, "utf8"),
			0,
		);
		assert.ok(filesBytes <= 1024 * 1024, `files stay under the 1 MiB files cap (saw ${filesBytes})`);
		const envelopeBytes = Buffer.byteLength(
			JSON.stringify({ taskFiles, output: "o".repeat(20000) }),
			"utf8",
		);
		assert.ok(
			envelopeBytes > 1024 * 1024,
			`composed envelope exceeds the 1 MiB backend default (saw ${envelopeBytes})`,
		);
	});
});
