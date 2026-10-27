import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCiCommand } from "../runner/daemon.js";

function pidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function pidIsZombie(pid) {
	try {
		const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
		return /^State:\s*Z/m.test(status);
	} catch {
		return false;
	}
}

async function waitForGone(pid, budgetMs = 5000) {
	const start = Date.now();
	for (;;) {
		if (!pidAlive(pid) || pidIsZombie(pid)) return true;
		if (Date.now() - start > budgetMs) return false;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

test("CI timeout kills the whole process group, not just the shell", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-ci-timeout-"));
	const pidFile = path.join(root, "grandchild.pid");
	try {
		// Background sleeper (grandchild of the CI shell) plus a foreground
		// sleep: shell-only SIGKILL semantics would orphan the grandchild.
		const result = await runCiCommand({
			command: `sleep 30 & echo $! > ${pidFile}; sleep 30`,
			workdir: root,
			timeoutMs: 400,
			onLog: () => {},
		});
		assert.equal(result.timedOut, true);
		assert.equal(result.exitCode, 124);
		const grandchild = Number(fs.readFileSync(pidFile, "utf8").trim());
		assert.ok(Number.isInteger(grandchild) && grandchild > 0, "expected the command to record its background pid");
		assert.ok(await waitForGone(grandchild), "background sleeper must be dead after the CI timeout");
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("CI timeout reports which budget fired", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-ci-timeout-"));
	try {
		const result = await runCiCommand({
			command: "sleep 30",
			workdir: root,
			timeoutMs: 321,
			onLog: () => {},
		});
		assert.equal(result.timedOut, true);
		assert.equal(result.timeoutMs, 321);
		assert.match(result.output, /timed out after 321ms/);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("CI success and plain failure are unchanged (no timedOut flag)", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-ci-timeout-"));
	try {
		const ok = await runCiCommand({ command: "true", workdir: root, onLog: () => {} });
		assert.deepEqual(
			{ exitCode: ok.exitCode, timedOut: ok.timedOut },
			{ exitCode: 0, timedOut: false },
		);
		const bad = await runCiCommand({ command: "exit 3", workdir: root, onLog: () => {} });
		assert.deepEqual(
			{ exitCode: bad.exitCode, timedOut: bad.timedOut },
			{ exitCode: 3, timedOut: false },
		);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
