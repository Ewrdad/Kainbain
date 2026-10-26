import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	SECRET_NAME_PATTERN,
	buildChildEnv,
	withRunContextVars,
	createStderrRing,
	createJsonLinesParser,
	parseJsonLinesText,
	startSupervisedSpawn,
	DEFAULT_KILL_GRACE_MS,
	DEFAULT_MAX_LINE_BYTES,
} from "./harnessScaffold.js";

/**
 * MARK: harnessScaffold tests
 * @description Unit tests for the shared harness scaffold: env redaction,
 *   run-context pinning, the stderr ring, incremental JSONL framing, and
 *   supervised spawn (watchdog escalation, abort, settle guards). Spawn tests
 *   use tiny fixture CLIs (`node -e` scripts) and the checked-in wire
 *   fixtures as oracle data — never a real agent CLI, never the harness code
 *   itself (the fixtures are the oracle, so these tests stay independent of
 *   any harness implementation).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGY_FIXTURE = path.join(HERE, "..", "antigravity", "fixtures", "success.ndjson");
const MUSE_FIXTURE = path.join(HERE, "..", "muse", "fixtures", "success.echo.jsonl");

// Wire-faithful discriminators re-declared here (NOT imported from harness
// code) so these tests pin the framing contract, not the harness modules.
const AGY_EVENTS = new Set(["init", "step_update", "result"]);
const MUSE_PAYLOADS = new Set([
	"run.lifecycle.started",
	"run.output.delta",
	"run.terminal.completed",
	"run.terminal.failed",
]);

/** Waits until `predicate()` is true (poll) or rejects after `timeoutMs`. */
function waitFor(predicate, { timeoutMs = 5000, intervalMs = 10 } = {}) {
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const tick = () => {
			let done = false;
			try {
				done = predicate();
			} catch (err) {
				reject(err);
				return;
			}
			if (done) return resolve();
			if (Date.now() - started > timeoutMs) {
				return reject(new Error("waitFor timed out"));
			}
			setTimeout(tick, intervalMs);
		};
		tick();
	});
}

describe("SECRET_NAME_PATTERN", () => {
	it("matches short codes and long/synonym forms by meaning", () => {
		for (const name of [
			"SECRET",
			"API_KEY",
			"TOKEN",
			"PASSWORD",
			"CREDENTIAL",
			"GEMINI_API_KEY",
			"PROD_DATABASE_PASSWORD",
			"MY_API_KEYS_BACKUP", // plural + compound: still secret-shaped
			"AUTH_CREDENTIAL",
			"github_token", // lowercase still matches (case-insensitive)
			"X509_CERT_KEY_FILE",
		]) {
			expect(SECRET_NAME_PATTERN.test(name), name).toBe(true);
		}
	});

	it("passes benign names, including tricky near-misses", () => {
		for (const name of ["PATH", "HOME", "LANG", "AGY_BIN", "MUSE_TIMEOUT", "MONITOR_INTERVAL"]) {
			expect(SECRET_NAME_PATTERN.test(name), name).toBe(false);
		}
		// "KEY" as a substring matches by design (fail closed): a caller that
		// needs such a name passes it via `extra`, explicitly.
		expect(SECRET_NAME_PATTERN.test("TURKEY")).toBe(true);
	});
});

describe("buildChildEnv", () => {
	it("projects the allowlist and drops secret-shaped names (redaction wins)", () => {
		const base = {
			PATH: "/bin",
			HOME: "/home/u",
			GEMINI_API_KEY: "s3cr3t", // prefix-kept but secret-shaped: dropped
			AGY_BIN: "/usr/bin/agy",
			AGY_AUTH_TOKEN: "tok", // dropped
			PROD_DATABASE_PASSWORD: "pw", // not allowlisted anyway
			UNRELATED: "x",
			NUMERIC: 42, // non-string: skipped
		};
		const out = buildChildEnv(base, {
			keepExact: ["PATH", "HOME"],
			keepPrefixes: ["AGY_", "GEMINI_"],
		});
		expect(out).toEqual({ PATH: "/bin", HOME: "/home/u", AGY_BIN: "/usr/bin/agy" });
	});

	it("merges extra assignments over the projection", () => {
		const out = buildChildEnv({ PATH: "/bin" }, {
			keepExact: ["PATH"],
			extra: { PLAN_KEY: "from-plan", PATH: "/override" },
		});
		expect(out).toEqual({ PATH: "/override", PLAN_KEY: "from-plan" });
	});

	it("never mutates its inputs and tolerates a nullish base", () => {
		const base = { PATH: "/bin" };
		const extra = { A: "1" };
		const out = buildChildEnv(base, { keepExact: ["PATH"], extra });
		expect(base).toEqual({ PATH: "/bin" });
		expect(extra).toEqual({ A: "1" });
		expect(out).not.toBe(base);
		expect(buildChildEnv(null, { keepExact: ["PATH"] })).toEqual({});
		expect(buildChildEnv(undefined, {})).toEqual({});
	});

	it("probes an unlisted protected-class variant (fail closed)", () => {
		// A synonym/long form no test ever enumerated must still be dropped.
		const out = buildChildEnv(
			{ MONITORED_SERVICE_ACCOUNT_CREDENTIALS_JSON: "{...}", KEEP_ME: "yes" },
			{ keepExact: ["MONITORED_SERVICE_ACCOUNT_CREDENTIALS_JSON", "KEEP_ME"] },
		);
		expect(out).toEqual({ KEEP_ME: "yes" });
	});
});

describe("withRunContextVars", () => {
	it("pins workspace and task vars without mutating the input", () => {
		const env = { PATH: "/bin" };
		const out = withRunContextVars(env, { cwd: "/repo", taskId: "t1" });
		expect(out).toEqual({ PATH: "/bin", PROJECT_CWD: "/repo", TASK_ID: "t1" });
		expect(env).toEqual({ PATH: "/bin" });
	});

	it("omits TASK_ID for interactive chats (no task id)", () => {
		expect(withRunContextVars({}, { cwd: "/repo" })).toEqual({ PROJECT_CWD: "/repo" });
	});
});

describe("createStderrRing", () => {
	it("accumulates lines and skips blanks", () => {
		const ring = createStderrRing();
		ring.push("boom\n\n  \npart ");
		expect(ring.text()).toBe("boom\npart");
	});

	it("keeps only the last N lines and tails chars", () => {
		const ring = createStderrRing({ maxLines: 3, maxChars: 10 });
		ring.push("one\ntwo\nthree\nfour\nfive");
		expect(ring.text()).toBe("\nfour\nfive"); // last 10 chars of "three\nfour\nfive"
		expect(ring.text().length).toBeLessThanOrEqual(10);
	});

	it("starts empty and tolerates non-string chunks", () => {
		const ring = createStderrRing();
		expect(ring.text()).toBe("");
		ring.push(42);
		expect(ring.text()).toBe("42");
	});
});

describe("createJsonLinesParser", () => {
	it("requires a classify function", () => {
		expect(() => createJsonLinesParser()).toThrow();
		expect(() => createJsonLinesParser({})).toThrow();
	});

	it("parses whole, split, and partial lines with identical rows", () => {
		const classify = (json) => ({ echo: json.n });
		const whole = createJsonLinesParser({ classify });
		const split = createJsonLinesParser({ classify });
		const text = '{"n":1}\n{"n":2}\n{"n":3}';
		const wholeRows = [...whole.push(`${text}\n`), ...whole.flush()];
		// Split every chunk at odd boundaries, including mid-JSON.
		let splitRows = [];
		for (let i = 0; i < text.length; i += 3) {
			splitRows = splitRows.concat(split.push(text.slice(i, i + 3)));
		}
		splitRows = splitRows.concat(split.flush());
		expect(splitRows).toEqual(wholeRows);
		expect(wholeRows).toEqual([{ echo: 1 }, { echo: 2 }, { echo: 3 }]);
	});

	it("tolerates noise, empty, CRLF, and unknown-discriminator lines", () => {
		const classify = (json) => (json.known ? { row: json.known } : null);
		const parser = createJsonLinesParser({ classify });
		const rows = parser.push(
			'{"known":1}\r\n\nnot json\n42\n[1,2]\n{"known":2}\n{"other":true}\n',
		);
		expect(rows).toEqual([{ row: 1 }, { row: 2 }]);
		const stats = parser.stats();
		expect(stats.events).toBe(2);
		expect(stats.skippedNoise).toBe(3); // "not json", 42, [1,2]
		expect(stats.droppedUnknown).toBe(1); // {"other":true}
		expect(stats.lines).toBe(7); // every line incl. the empty one is counted
	});

	it("counts a throwing classify as noise instead of propagating", () => {
		const parser = createJsonLinesParser({
			classify: () => {
				throw new Error("classifier bug");
			},
		});
		expect(parser.push('{"a":1}\n')).toEqual([]);
		expect(parser.stats().skippedNoise).toBe(1);
	});

	it("drops oversized lines incrementally and stays in sync", () => {
		const parser = createJsonLinesParser({ classify: (json) => json, maxLineBytes: 16 });
		// A 1 MiB-scale line arrives in pieces: the cap trips before buffering all of it.
		const big = `{"pad":"${"x".repeat(100)}"}\n{"ok":true}\n`;
		const rows = parser.push(big.slice(0, 40));
		expect(rows).toEqual([]);
		const rest = parser.push(big.slice(40));
		expect(rest).toEqual([{ ok: true }]);
		expect(parser.stats().droppedOversized).toBe(1);
	});

	it("ignores non-string/empty pushes and preserves order over large batches", () => {
		const parser = createJsonLinesParser({ classify: (json) => ({ n: json.n }) });
		expect(parser.push("")).toEqual([]);
		expect(parser.push(null)).toEqual([]);
		expect(parser.push(undefined)).toEqual([]);
		let rows = [];
		for (let i = 0; i < 500; i += 1) {
			rows = rows.concat(parser.push(`{"n":${i}}\n`));
		}
		expect(rows).toHaveLength(500);
		expect(rows[0]).toEqual({ n: 0 });
		expect(rows[499]).toEqual({ n: 499 });
	});

	it("parses the checked-in agy fixture identically whole vs byte-split", () => {
		const classify = (json) => (AGY_EVENTS.has(json.event) ? { event: json.event } : null);
		const text = fs.readFileSync(AGY_FIXTURE, "utf8");
		const whole = createJsonLinesParser({ classify });
		const wholeRows = [...whole.push(text), ...whole.flush()];
		expect(wholeRows.length).toBeGreaterThan(0);

		const split = createJsonLinesParser({ classify });
		let splitRows = [];
		for (let i = 0; i < text.length; i += 7) {
			splitRows = splitRows.concat(split.push(text.slice(i, i + 7)));
		}
		splitRows = splitRows.concat(split.flush());
		expect(splitRows).toEqual(wholeRows);
	});

	it("parses the checked-in muse fixture identically whole vs byte-split", () => {
		const classify = (json) =>
			MUSE_PAYLOADS.has(json.payload_type) ? { payloadType: json.payload_type } : null;
		const text = fs.readFileSync(MUSE_FIXTURE, "utf8");
		const whole = createJsonLinesParser({ classify });
		const wholeRows = [...whole.push(text), ...whole.flush()];
		expect(wholeRows.length).toBeGreaterThan(0);

		const split = createJsonLinesParser({ classify });
		let splitRows = [];
		for (let i = 0; i < text.length; i += 11) {
			splitRows = splitRows.concat(split.push(text.slice(i, i + 11)));
		}
		splitRows = splitRows.concat(split.flush());
		expect(splitRows).toEqual(wholeRows);
	});
});

describe("parseJsonLinesText", () => {
	it("returns object lines in order, skipping blanks/corrupt/non-objects", () => {
		const rows = parseJsonLinesText('{"a":1}\n\ncorrupt\n42\n[1]\n"str"\n{"b":2}');
		expect(rows).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("tolerates nullish input", () => {
		expect(parseJsonLinesText("")).toEqual([]);
		expect(parseJsonLinesText(null)).toEqual([]);
		expect(parseJsonLinesText(undefined)).toEqual([]);
	});
});

describe("startSupervisedSpawn", () => {
	it("runs a child, decodes stdout/stderr, and exposes the stderr ring", async () => {
		const sup = startSupervisedSpawn(
			process.execPath,
			["-e", 'process.stdout.write("héllo\\n"); process.stderr.write("warn\\n");'],
			{ env: {}, killGraceMs: 20 },
		);
		let stdout = "";
		let stderr = "";
		let closeCode = null;
		sup.child.stdout.on("data", (chunk) => {
			stdout += sup.stdoutDecoder.write(chunk);
		});
		sup.child.stderr.on("data", (chunk) => {
			const text = sup.stderrDecoder.write(chunk);
			stderr += text;
			sup.stderr.push(text);
		});
		sup.child.on("close", (code) => {
			stdout += sup.stdoutDecoder.end();
			stderr += sup.stderrDecoder.end();
			sup.stderr.push(sup.stderrDecoder.end());
			closeCode = code;
		});
		await waitFor(() => closeCode !== null);
		sup.dispose();
		expect(closeCode).toBe(0);
		expect(stdout).toBe("héllo\n");
		expect(stderr).toBe("warn\n");
		expect(sup.stderr.text()).toBe("warn");
		expect(sup.timedOut).toBe(false);
	});

	it("decodes a multibyte character split across chunk boundaries", async () => {
		// An emoji's UTF-8 bytes arrive in two writes; naive toString() would
		// corrupt the split, the decoder must not.
		const sup = startSupervisedSpawn(
			process.execPath,
			[
				"-e",
				"const b = Buffer.from('😀', 'utf8'); process.stdout.write(b.subarray(0, 2)); setTimeout(() => process.stdout.write(b.subarray(2)), 20);",
			],
			{ env: {}, killGraceMs: 20 },
		);
		let text = "";
		let closed = false;
		sup.child.stdout.on("data", (chunk) => {
			text += sup.stdoutDecoder.write(chunk);
		});
		sup.child.on("close", () => {
			text += sup.stdoutDecoder.end();
			closed = true;
		});
		await waitFor(() => closed);
		sup.dispose();
		expect(text).toBe("😀");
	});

	it("delivers spawn failure as an error event followed by close (no sync throw)", async () => {
		const sup = startSupervisedSpawn("kainbain-definitely-missing-binary-xyz", [], {
			env: {},
			killGraceMs: 20,
		});
		const seen = [];
		sup.child.on("error", (err) => seen.push(["error", err.code || err.message]));
		sup.child.on("close", (code) => seen.push(["close", code]));
		await waitFor(() => seen.length >= 2);
		sup.dispose();
		expect(seen[0][0]).toBe("error");
		expect(seen[1][0]).toBe("close");
	});

	it("watchdog fires onTimeout then kills (SIGTERM→SIGKILL escalation)", async () => {
		let timeoutCalls = 0;
		const sup = startSupervisedSpawn(
			process.execPath,
			[
				"-e",
				// Install the SIGTERM-ignore handler FIRST, then print readiness:
				// the parent waits for "ready" below, which proves the handler
				// is installed before the parent OBSERVES readiness. It does
				// NOT pause the watchdog (which ticks from spawn), so the
				// timeout below must also exceed worst-case `node -e` spawn
				// latency on an oversubscribed CI box — otherwise the SIGTERM
				// lands mid-startup and the default action kills the child
				// (close SIGTERM) instead of escalating to SIGKILL.
				"process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 50);",
			],
			{
				env: {},
				timeoutMs: 15000,
				killGraceMs: 200,
				onTimeout: () => {
					timeoutCalls += 1;
				},
			},
		);
		let ready = false;
		let closeSignal = null;
		let closeCode = "pending";
		sup.child.stdout.on("data", (chunk) => {
			if (String(chunk).includes("ready")) ready = true;
		});
		sup.child.on("close", (code, signal) => {
			closeCode = code;
			closeSignal = signal;
		});
		await waitFor(() => ready, { timeoutMs: 60000 });
		await waitFor(() => closeCode !== "pending", { timeoutMs: 60000 });
		sup.dispose();
		expect(timeoutCalls).toBe(1);
		expect(sup.timedOut).toBe(true);
		// The child ignored SIGTERM, so the watchdog escalated to SIGKILL.
		expect(closeSignal).toBe("SIGKILL");
	});

	it("a throwing onTimeout hook never breaks the kill escalation", async () => {
		const sup = startSupervisedSpawn(
			process.execPath,
			["-e", "setInterval(() => {}, 50);"],
			{
				env: {},
				timeoutMs: 30,
				killGraceMs: 20,
				onTimeout: () => {
					throw new Error("hook bug");
				},
			},
		);
		let closed = false;
		sup.child.on("close", () => {
			closed = true;
		});
		await waitFor(() => closed);
		sup.dispose();
		expect(sup.timedOut).toBe(true);
	});

	it("kill(SIGTERM) without escalation stops a cooperative child via its signal", async () => {
		const sup = startSupervisedSpawn(
			process.execPath,
			["-e", "setInterval(() => {}, 50);"],
			{ env: {}, killGraceMs: 20 },
		);
		let closeSignal = null;
		let closeCode = "pending";
		sup.child.on("close", (code, signal) => {
			closeCode = code;
			closeSignal = signal;
		});
		sup.kill("SIGTERM", { escalate: false });
		await waitFor(() => closeCode !== "pending");
		sup.dispose();
		expect(closeSignal).toBe("SIGTERM");
		expect(sup.timedOut).toBe(false);
	});

	it("kill() on a detached group reaches the whole tree", async () => {
		const sup = startSupervisedSpawn(
			process.execPath,
			["-e", "setInterval(() => {}, 50);"],
			{ env: {}, detached: true, killGraceMs: 20 },
		);
		let closed = false;
		sup.child.on("close", () => {
			closed = true;
		});
		sup.kill("SIGTERM", { escalate: false });
		await waitFor(() => closed);
		sup.dispose();
		expect(closed).toBe(true);
	});

	it("kill() is a safe no-op after the child already exited", async () => {
		const sup = startSupervisedSpawn(process.execPath, ["-e", ""], {
			env: {},
			killGraceMs: 20,
		});
		let closed = false;
		sup.child.on("close", () => {
			closed = true;
		});
		await waitFor(() => closed);
		expect(() => sup.kill("SIGTERM")).not.toThrow();
		expect(() => sup.kill("SIGKILL")).not.toThrow();
		sup.dispose();
	});

	it("dispose() disarms a pending watchdog (no late onTimeout)", async () => {
		let timeoutCalls = 0;
		const sup = startSupervisedSpawn(
			process.execPath,
			["-e", "setInterval(() => {}, 200);"],
			{
				env: {},
				timeoutMs: 60,
				killGraceMs: 20,
				onTimeout: () => {
					timeoutCalls += 1;
				},
			},
		);
		sup.dispose(); // settle immediately: the watchdog must never fire
		sup.kill("SIGKILL");
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(timeoutCalls).toBe(0);
		expect(sup.timedOut).toBe(false);
	});

	it("exposes the default kill grace", () => {
		expect(DEFAULT_KILL_GRACE_MS).toBe(200);
		expect(DEFAULT_MAX_LINE_BYTES).toBe(1024 * 1024);
	});

	it("watchdog firstSignal opt-in delivers SIGINT before escalating", async () => {
		const sup = startSupervisedSpawn(
			process.execPath,
			[
				"-e",
				// Install the SIGINT handler FIRST, then print readiness: the
				// parent waits for "ready" below, which proves the handler is
				// installed before the parent OBSERVES readiness. It does NOT
				// pause the watchdog (which ticks from spawn), so the timeout
				// below must also exceed worst-case `node -e` spawn latency
				// on an oversubscribed CI box — otherwise the default SIGINT
				// action kills the child (close null) instead of the handler
				// exiting 42.
				"process.on('SIGINT', () => process.exit(42)); process.stdout.write('ready\\n'); setInterval(() => {}, 50);",
			],
			{ env: {}, timeoutMs: 15000, killGraceMs: 500, firstSignal: "SIGINT" },
		);
		let ready = false;
		let closeCode = "pending";
		sup.child.stdout.on("data", (chunk) => {
			if (String(chunk).includes("ready")) ready = true;
		});
		sup.child.on("close", (code) => {
			closeCode = code;
		});
		await waitFor(() => ready, { timeoutMs: 60000 });
		await waitFor(() => closeCode !== "pending", { timeoutMs: 60000 });
		sup.dispose();
		expect(sup.timedOut).toBe(true);
		// The SIGINT handler ran (exit 42) — no SIGKILL escalation needed.
		expect(closeCode).toBe(42);
	});

	it("kill() on Windows issues exactly one taskkill /T /F and never negative-pid signals", async () => {
		const { spawn: realSpawn } = await import("node:child_process");
		const taskkillCalls = [];
		const fakeTaskkill = {
			on(event, cb) {
				if (event === "close") setTimeout(() => cb(0), 5);
				return this;
			},
		};
		const spawnFn = (cmd, args, opts) => {
			if (cmd === "taskkill") {
				taskkillCalls.push([cmd, args, opts]);
				return fakeTaskkill;
			}
			return realSpawn(cmd, args, opts);
		};
		const processKillSpy = [];
		const origKill = process.kill;
		process.kill = (...args) => {
			processKillSpy.push(args);
			return origKill.apply(process, args);
		};
		try {
			const sup = startSupervisedSpawn(
				process.execPath,
				["-e", "setInterval(() => {}, 50);"],
				{ env: {}, detached: true, platform: "win32", spawnFn, killGraceMs: 20 },
			);
			const pid = sup.child.pid;
			sup.kill("SIGTERM");
			// Fire-and-forget taskkill resolves asynchronously.
			await waitFor(() => taskkillCalls.length > 0);
			// Grace-timer silence: no follow-up taskkill may arrive.
			await new Promise((resolve) => setTimeout(resolve, 80));
			expect(taskkillCalls).toHaveLength(1);
			expect(taskkillCalls[0][0]).toBe("taskkill");
			expect(taskkillCalls[0][1]).toEqual(["/PID", String(pid), "/T", "/F"]);
			for (const [target] of processKillSpy) {
				expect(target).toBeGreaterThanOrEqual(0);
			}
			sup.dispose();
			// The child was never really killed (taskkill was mocked): reap it.
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// already gone
			}
		} finally {
			process.kill = origKill;
		}
	});
});
