import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { runSupervised } = await import("../scripts/lib/run-supervised.mjs");

/***
 * MARK: run-supervised tests
 * @description Hermetic tests for the dev supervisor
 *   (scripts/lib/run-supervised.mjs): prefixed live output, first-exit
 *   shutdown with the child's code, spawn-failure handling, and signal
 *   forwarding. Children are stub `node -e` processes only — the real API
 *   is never booted here (its scheduler/reconcile would disturb the live
 *   app), so this suite is safe to run on the production host.
 * @example run `node --test tests/run-supervised.test.mjs`
 ***/

const NODE = process.execPath;

// Reports a pid through a file atomically (tmp write + rename) so a sibling
// polling with existsSync can never observe a just-created but not-yet-written
// (torn) file on a loaded host: a direct writeFileSync is stat-visible in the
// gap between creat and the data write, while rename is atomic — after the
// target name appears its content is complete.
const REPORT_PID = (pidFile) =>
	`require("fs").writeFileSync(${JSON.stringify(`${pidFile}.tmp`)}, String(process.pid)); require("fs").renameSync(${JSON.stringify(`${pidFile}.tmp`)}, ${JSON.stringify(pidFile)});`;

// A stub child that prints one line, then sleeps. Reports its pid through a
// file so the test can prove the supervisor killed it.
const SLEEPER = (pidFile, label) =>
	`${REPORT_PID(pidFile)} console.log(${JSON.stringify(label)}); setTimeout(() => {}, 60000);`;

function makeCollector() {
	const lines = [];
	return {
		write: (text) => {
			lines.push(text);
		},
		joined: () => lines.join(""),
	};
}

function pidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitForGone(pid, timeoutMs = 5000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (!pidAlive(pid)) return true;
		if (Date.now() >= deadline) return false;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

describe("runSupervised", () => {
	it("streams each child's output with its prefix", async () => {
		const { join } = await import("node:path");
		const { tmpdir } = await import("node:os");
		const { mkdtempSync } = await import("node:fs");
		const marker = join(mkdtempSync(join(tmpdir(), "supervised-out-")), "printed");
		const out = makeCollector();
		// Coordinated so the assertions are deterministic on loaded hosts:
		// api prints, then drops a marker and sleeps; web prints only after
		// seeing the marker, then exits — so all three lines precede the
		// shutdown the web exit triggers.
		const result = await runSupervised(
			[
				{
					name: "api",
					file: NODE,
					args: [
						"-e",
						`console.log('api-line'); console.error('api-err'); require("fs").writeFileSync(${JSON.stringify(marker)}, "x"); setTimeout(() => {}, 30000);`,
					],
				},
				{
					name: "web",
					file: NODE,
					args: [
						"-e",
						`const fs = require("fs"); const t = setInterval(() => { if (fs.existsSync(${JSON.stringify(marker)})) { clearInterval(t); console.log('web-line'); } }, 25);`,
					],
				},
			],
			{ write: out.write },
		);
		assert.equal(result.ok, true);
		assert.equal(result.exitCode, 0);
		assert.match(out.joined(), /\[api\] api-line/);
		assert.match(out.joined(), /\[api\] api-err/);
		assert.match(out.joined(), /\[web\] web-line/);
	});

	it("resolves with the first child's exit code and stops the sibling", async () => {
		const { mkdtempSync, readFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const dir = mkdtempSync(join(tmpdir(), "supervised-"));
		const pidFile = join(dir, "sleeper.pid");

		const out = makeCollector();
		// The quitter waits for the sibling's pid report before exiting, so
		// the ordering is deterministic on loaded hosts: the supervisor
		// always kills a reported, running sibling.
		const quitter = `const fs = require("fs"); const t = setInterval(() => { if (fs.existsSync(${JSON.stringify(pidFile)})) { clearInterval(t); process.exit(3); } }, 25);`;
		const result = await runSupervised(
			[
				{ name: "quitter", file: NODE, args: ["-e", quitter] },
				{ name: "sleeper", file: NODE, args: ["-e", SLEEPER(pidFile, "sleeper-up")] },
			],
			{ write: out.write },
		);
		assert.equal(result.ok, false);
		assert.equal(result.exitCode, 3);
		assert.equal(result.ended, "quitter");
		assert.match(out.joined(), /\[quitter\] exited \(code 3\)/);

		const sleeperPid = Number(readFileSync(pidFile, "utf8"));
		assert.ok(sleeperPid > 0);
		assert.equal(await waitForGone(sleeperPid), true, "sibling still alive after supervisor resolved");
	});

	it("reaps wrapper grandchildren that inherit stdio (npm/vite shape)", async () => {
		const { mkdtempSync, readFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const dir = mkdtempSync(join(tmpdir(), "supervised-wrap-"));
		const pidFile = join(dir, "grandchild.pid");
		// Wrapper mimics `npm run dev`: it spawns a long-lived grandchild
		// sharing its stdio pipes, waits for the grandchild's pid report,
		// then exits 0 — leaving the grandchild holding the pipes open.
		// The pid report is published atomically (REPORT_PID), so the
		// existsSync poll below can never see a torn (empty) file.
		// Without group kill the supervisor would stall: the wrapper's
		// `close` never arrives while the grandchild holds the pipe ends.
		const wrapper =
			`const { spawn } = require("child_process"); ` +
			`const grand = spawn(${JSON.stringify(NODE)}, ["-e", ${JSON.stringify(`${REPORT_PID(pidFile)} setTimeout(() => {}, 60000);`)}], { stdio: "inherit" }); ` +
			`const fs = require("fs"); const t = setInterval(() => { if (fs.existsSync(${JSON.stringify(pidFile)})) { clearInterval(t); process.exit(0); } }, 25);`;

		const out = makeCollector();
		const startedAt = Date.now();
		const result = await runSupervised([{ name: "wrap", file: NODE, args: ["-e", wrapper] }], {
			write: out.write,
			shutdownTimeoutMs: 4000,
		});
		const elapsedMs = Date.now() - startedAt;
		assert.equal(result.ok, true);
		assert.equal(result.exitCode, 0);
		assert.equal(result.ended, "wrap");

		const grandPid = Number(readFileSync(pidFile, "utf8"));
		assert.ok(grandPid > 0);
		try {
			if (process.platform !== "win32") {
				// POSIX group kill must have reaped the grandchild — and the
				// run must have resolved on the fast path, not the deadline.
				assert.equal(await waitForGone(grandPid), true, "grandchild orphaned the wrapper's pipes");
				assert.ok(elapsedMs < 3500, `shutdown stalled (${elapsedMs}ms) — grandchild held the pipes`);
			} else {
				// Windows has no group kill: reclaim the orphan for hygiene.
				await waitForGone(grandPid, 500);
			}
		} finally {
			try {
				process.kill(grandPid, "SIGKILL");
			} catch {
				// Already reaped by the supervisor — the expected path.
			}
		}
	});

	it("a missing command fails the run instead of hanging", async () => {
		const out = makeCollector();
		const result = await runSupervised(
			[
				{ name: "missing", file: "kainbain-no-such-command-xyz" },
				{ name: "fine", file: NODE, args: ["-e", "setTimeout(() => {}, 60000)"] },
			],
			{ write: out.write },
		);
		assert.equal(result.ok, false);
		assert.equal(result.exitCode, 1);
		assert.equal(result.ended, "missing");
		assert.match(out.joined(), /\[missing\] Failed to start/);
	});

	it("SIGTERM to the supervisor stops every child and resolves ok", async () => {
		const { existsSync, mkdtempSync, readFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const dir = mkdtempSync(join(tmpdir(), "supervised-sig-"));
		const pidFileA = join(dir, "a.pid");
		const pidFileB = join(dir, "b.pid");

		const out = makeCollector();
		const pending = runSupervised(
			[
				{ name: "a", file: NODE, args: ["-e", SLEEPER(pidFileA, "a-up")] },
				{ name: "b", file: NODE, args: ["-e", SLEEPER(pidFileB, "b-up")] },
			],
			{ write: out.write },
		);
		// Wait until both children report their pids (poll, not a fixed
		// sleep: under a loaded gate the spawn can take seconds), then
		// drive the supervisor's SIGTERM handler via emit rather than a
		// real self-signal: Node docs state process.kill with SIGTERM on
		// Windows causes unconditional termination, which would kill the
		// test worker instead of reaching the handler.
		const deadline = Date.now() + 15000;
		while (!existsSync(pidFileA) || !existsSync(pidFileB)) {
			if (Date.now() >= deadline) throw new Error("stub children did not start in time");
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		process.emit("SIGTERM");
		const result = await pending;

		assert.equal(result.ok, true);
		assert.equal(result.exitCode, 0);
		assert.equal(result.signal, "SIGTERM");
		for (const pidFile of [pidFileA, pidFileB]) {
			const pid = Number(readFileSync(pidFile, "utf8"));
			assert.equal(await waitForGone(pid), true, `child ${pid} still alive after SIGTERM shutdown`);
		}
	});
});
