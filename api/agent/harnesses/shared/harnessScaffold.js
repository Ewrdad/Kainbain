import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { isWindows } from "../../../utils/platform.js";
import { killProcessTree } from "../../../utils/processTree.js";

/**
 * MARK: harnessScaffold
 * @description The ONE tested home for the three lifecycles every CLI-spawning
 *   harness re-implements: child-process supervision (spawn options, watchdog
 *   first-signal→SIGKILL escalation on POSIX and taskkill tree-kill on
 *   Windows, abort wiring, single-settle guards), child-env
 *   redaction (allowlist projection with secret-shaped names dropped), and
 *   NDJSON/JSONL stream framing (chunk→line buffering, noise/partial-line
 *   tolerance, per-line classification left to the caller).
 *
 *   Harnesses keep ONLY protocol mapping here: argv shape, run-outcome
 *   semantics, event translation, and model semantics. Anything harness-shaped
 *   (binary names, `[AGY]`/`[MUSE]` log tags, raw wire discriminators, model
 *   flags) arrives via options/callbacks — this module names none of it, so
 *   `api/agent/harnessBoundary.test.js` keeps passing: only node builtins are
 *   imported (plus the shared platform/process-tree utils), never a harness SDK.
 *
 *   Adoption is opt-in per lifecycle, per harness: the pi harness is
 *   in-process (no child to supervise), opencode manages a server rather than
 *   a per-turn CLI, and mock simulates rather than spawns. Those harnesses
 *   adopt only the helpers that remove real code (see the per-harness table
 *   in the R6 implementation report) — partial adoption with a clean seam
 *   beats forced uniformity.
 */

/***
 * MARK: SECRET_NAME_PATTERN
 * @description Classifies an env VAR NAME as secret-shaped (case-insensitive).
 *   Matching is by MEANING (suffix/prefix fragments), not by an enumerated
 *   allowlist of full names, so long/synonym forms (`PROD_DATABASE_PASSWORD`,
 *   `MY_API_KEYS_BACKUP`, `AUTH_CREDENTIAL`) are dropped even when no test
 *   ever listed them. Redaction always wins over the keep-allowlist.
 * @example SECRET_NAME_PATTERN.test("GEMINI_API_KEY") // => true
 * @example SECRET_NAME_PATTERN.test("PATH") // => false
 ***/
export const SECRET_NAME_PATTERN = /SECRET|TOKEN|PASSWORD|KEY|CREDENTIAL/i;

/***
 * MARK: buildChildEnv
 * @description Pure child-env builder: projects a parent environment onto a
 *   minimal allowlist (exact names + name prefixes), drops every
 *   secret-shaped name (redaction wins over the allowlist), skips non-string
 *   values, and merges `extra` assignments last (explicit per-run values such
 *   as credentials parsed from a command line). Never mutates its inputs.
 * @example buildChildEnv({ PATH: "/bin", GEMINI_API_KEY: "s3cr3t" }, { keepExact: ["PATH"] }) => { PATH: "/bin" }
 * @param {Object} [baseEnv] - The parent environment (defaults to process.env).
 * @param {Object} [opts]
 * @param {Array<string>} [opts.keepExact] - Exact env names to inherit.
 * @param {Array<string>} [opts.keepPrefixes] - Env-name prefixes to inherit.
 * @param {Object} [opts.extra] - Explicit assignments merged over the projection.
 * @returns {Object} The redacted child environment (a fresh object).
 ***/
export function buildChildEnv(
	baseEnv = process.env,
	{ keepExact = [], keepPrefixes = [], extra = {} } = {},
) {
	const keepExactSet = new Set(keepExact);
	const childEnv = {};
	for (const [name, value] of Object.entries(baseEnv || {})) {
		if (typeof value !== "string") continue;
		if (!keepExactSet.has(name) && !keepPrefixes.some((prefix) => name.startsWith(prefix))) {
			continue;
		}
		if (SECRET_NAME_PATTERN.test(name)) continue; // redaction wins over the allowlist
		// eslint-disable-next-line security/detect-object-injection -- name comes from iterating baseEnv and is allowlist/secret-filtered above
		childEnv[name] = value;
	}
	return { ...childEnv, ...extra };
}

/***
 * MARK: withRunContextVars
 * @description Pins the run-context variables onto a child environment: the
 *   workspace root (`PROJECT_CWD`, always set — the child runs pinned to the
 *   project directory) and the stage's task id (`TASK_ID`, only when present).
 *   Returns a fresh object; the input is never mutated.
 * @example withRunContextVars({}, { cwd: "/repo", taskId: "t1" }) => { PROJECT_CWD: "/repo", TASK_ID: "t1" }
 * @param {Object} [env] - The child environment so far.
 * @param {Object} [opts]
 * @param {string} [opts.cwd] - The project working directory.
 * @param {string} [opts.taskId] - The stage's task id (omitted for interactive chats).
 * @returns {Object} A fresh environment with the context vars pinned.
 ***/
export function withRunContextVars(env = {}, { cwd, taskId } = {}) {
	return {
		...env,
		PROJECT_CWD: cwd,
		...(taskId ? { TASK_ID: taskId } : {}),
	};
}

/***
 * MARK: createStderrRing
 * @description A small ring buffer of a child's stderr lines (last N kept)
 *   for enriching run_error diagnostics — CLIs report startup failures (bad
 *   workspace, bad model, auth errors) on stderr, sometimes with zero stdout
 *   events. Bounded in both dimensions (line count AND retained chars) so a
 *   chatty child cannot grow memory unboundedly.
 * @example const ring = createStderrRing(); ring.push("boom\n"); ring.text() => "boom"
 * @param {Object} [opts]
 * @param {number} [opts.maxLines] - Lines retained (default 50).
 * @param {number} [opts.maxChars] - Chars retained in text() (default 2000).
 * @returns {Object} The ring: { push(chunk), text() }.
 ***/
export function createStderrRing({ maxLines = 50, maxChars = 2000 } = {}) {
	const lines = [];
	return {
		push(chunk) {
			for (const line of String(chunk).split("\n")) {
				if (!line.trim()) continue;
				lines.push(line.trim());
				while (lines.length > maxLines) lines.shift();
			}
		},
		text() {
			return lines.join("\n").slice(-maxChars);
		},
	};
}

/** Default single-line cap: a stream line larger than 1 MiB is dropped. */
export const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;

/***
 * MARK: createJsonLinesParser
 * @description Builds an incremental NDJSON/JSONL parser for a child stdout
 *   stream with the harness's per-line classification plugged in. Feed decoded
 *   stdout chunks to `push` (returns the rows completed by that chunk); call
 *   `flush` when the stream ends to collect a final unterminated line.
 *   Framing owns every tolerance: `\r\n` line endings, empty lines,
 *   non-JSON noise lines (skipped — never thrown on), and the oversized-line
 *   cap (trips INCREMENTALLY on the partial line, so a pathological stream is
 *   never fully buffered). `classify` owns ONLY the wire format: it receives
 *   a parsed JSON object and returns the harness's row, or null/undefined for
 *   unknown-but-well-formed lines (forward tolerance). A throwing classify is
 *   counted as noise, never propagated — stream parsing must not throw on data.
 *
 *   Performance: `push` is LINE-ORIENTED (indexOf scanning over each chunk,
 *   retaining only the partial tail) — O(chunk) per push, never per-character
 *   work — so multi-hundred-KB tool-output lines cannot pin the event loop.
 * @example const parser = createJsonLinesParser({ classify: (json) => json });
 * @example parser.push('{"a":1}\n') => [{ a: 1 }]
 * @example parser.push('{"a":'); parser.push('1}\n') => [{ a: 1 }]
 * @param {Object} opts
 * @param {Function} opts.classify - (jsonObject) => row|null (unknown discriminator).
 * @param {number} [opts.maxLineBytes] - Single-line byte cap (default 1 MiB).
 * @returns {Object} The parser: { push(chunk), flush(), stats() }.
 ***/
export function createJsonLinesParser({ classify, maxLineBytes = DEFAULT_MAX_LINE_BYTES } = {}) {
	if (typeof classify !== "function") {
		throw new Error("createJsonLinesParser requires a classify(json) function");
	}
	let buffer = ""; // retained partial line (never grows past the cap)
	let bufferBytes = 0; // accumulated UTF-8 byte length of the partial line
	let bufferOverLimit = false; // current line already exceeded the cap
	const counters = {
		lines: 0,
		events: 0,
		skippedNoise: 0,
		droppedOversized: 0,
		droppedUnknown: 0,
	};

	function parseLine(rawLine) {
		const line = rawLine.replace(/\r$/, "").trim();
		counters.lines += 1;
		if (!line) return null;

		if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
			counters.droppedOversized += 1;
			return null;
		}

		let json;
		try {
			json = JSON.parse(line);
		} catch {
			// stderr-style noise that leaked into stdout — skip silently.
			counters.skippedNoise += 1;
			return null;
		}
		if (!json || typeof json !== "object" || Array.isArray(json)) {
			counters.skippedNoise += 1;
			return null;
		}

		let row = null;
		try {
			row = classify(json) || null;
		} catch {
			// A harness classifier must never break the stream on data.
			counters.skippedNoise += 1;
			return null;
		}
		if (!row) {
			// Unknown wire discriminator — ignored by design (forward tolerance).
			counters.droppedUnknown += 1;
			return null;
		}

		counters.events += 1;
		return row;
	}

	return {
		push(chunk) {
			const events = [];
			if (typeof chunk !== "string" || chunk.length === 0) return events;
			const hadPending = buffer.length > 0; // implies !bufferOverLimit
			const text = hadPending ? buffer + chunk : chunk;
			buffer = "";
			let start = 0;
			let newlineIndex;
			while ((newlineIndex = text.indexOf("\n", start)) !== -1) {
				const line = text.slice(start, newlineIndex);
				start = newlineIndex + 1;
				if (bufferOverLimit) {
					// The oversized line's terminator arrived: drop it (already
					// discarded incrementally); framing stays in sync.
					bufferOverLimit = false;
					bufferBytes = 0;
					counters.droppedOversized += 1;
					continue;
				}
				bufferBytes = 0;
				const parsed = parseLine(line);
				if (parsed) events.push(parsed);
			}
			const tail = text.slice(start);
			if (tail.length > 0) {
				if (bufferOverLimit) {
					// Keep discarding the oversized line's tail until its newline.
					return events;
				}
				// Incremental byte accounting: when the previous partial line
				// survived into the tail (no newline consumed it), its tracked
				// bytes carry over and only the new chunk bytes are measured; the
				// complete-line path above resets the accumulator instead.
				bufferBytes =
					hadPending && start === 0
						? bufferBytes + Buffer.byteLength(chunk, "utf8")
						: Buffer.byteLength(tail, "utf8");
				if (bufferBytes > maxLineBytes) {
					// Drop the moment the cap trips — never accumulate an oversized
					// line. counted when its terminator arrives (or silently at
					// flush), matching the framing contract below.
					bufferOverLimit = true;
					bufferBytes = 0;
					return events;
				}
				buffer = tail;
			}
			return events;
		},

		flush() {
			const events = [];
			if (!bufferOverLimit && buffer.trim().length > 0) {
				const parsed = parseLine(buffer);
				if (parsed) events.push(parsed);
			}
			buffer = "";
			bufferBytes = 0;
			bufferOverLimit = false;
			return events;
		},

		stats() {
			return { ...counters };
		},
	};
}

/***
 * MARK: parseJsonLinesText
 * @description Parses whole JSONL text (a file already read into memory) into
 *   its JSON-object lines: blank lines, corrupt lines, and non-object JSON
 *   values are skipped — history/transcript reads never fail over one entry.
 * @example parseJsonLinesText('{"a":1}\nnoise\n') => [{ a: 1 }]
 * @param {string} text - The JSONL text.
 * @returns {Array<Object>} The parsed object lines, in order.
 ***/
export function parseJsonLinesText(text) {
	const rows = [];
	for (const line of String(text ?? "").split("\n")) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				rows.push(parsed);
			}
		} catch {
			// Skip corrupt lines — never fail a read over one entry.
		}
	}
	return rows;
}

/** Grace period between SIGTERM and SIGKILL for a misbehaving child (ms). */
export const DEFAULT_KILL_GRACE_MS = 200;

/***
 * MARK: startSupervisedSpawn
 * @description Spawns ONE supervised child process and owns the supervision
 *   MECHANISM (never the harness's outcome semantics): spawn options
 *   (cwd/env/stdio/detached process group), UTF-8 decoders bridging raw
 *   stdout/stderr Buffers to the string world (a multi-byte character split
 *   across chunk boundaries never corrupts live text), the stderr ring for
 *   run_error diagnostics, the engine-side watchdog (onTimeout state hook,
 *   then the first signal with SIGKILL escalation after `killGraceMs` on
 *   POSIX, or a taskkill tree-kill on Windows), and kill-timer cleanup via
 *   `dispose()`.
 *
 *   The harness keeps its OWN outcome logic: stream wiring
 *   (`sup.child.stdout.on("data")`), error/close handlers with their
 *   single-settle guards, and spawn/settle log lines. It MUST call
 *   `sup.dispose()` when the run settles so the watchdog cannot fire late.
 *   `spawn` may throw synchronously (invalid path shape) — that propagates
 *   for the harness's existing fail-fast path.
 * @example const sup = startSupervisedSpawn("muse", ["exec"], { cwd: "/repo", env: {} });
 * @example sup.kill("SIGTERM"); sup.dispose();
 * @param {string} command - The executable (trusted harness configuration, never request input).
 * @param {Array<string>} args - The argv (built from structured opts, no shell involved).
 * @param {Object} [opts]
 * @param {string} [opts.cwd] - The child working directory (project workspace pin).
 * @param {Object} [opts.env] - The child environment (use buildChildEnv).
 * @param {Array} [opts.stdio] - Stdio config (default ["ignore", "pipe", "pipe"]).
 * @param {boolean} [opts.detached] - Own process group so kill() reaches the whole tree.
 * @param {number} [opts.timeoutMs] - Watchdog duration (0/omitted = no watchdog).
 * @param {Function} [opts.onTimeout] - State hook called at watchdog fire, before SIGTERM.
 * @param {number} [opts.killGraceMs] - First-signal→SIGKILL grace on POSIX (default 200).
 * @param {string} [opts.firstSignal] - Watchdog's first signal on POSIX
 *   (default "SIGTERM"); pass "SIGINT" for interactive CLIs that shut down
 *   cleanly on Ctrl-C. Ignored on Windows (taskkill has no graceful mode).
 * @param {string} [opts.platform] - Platform override for tests (default process.platform).
 * @param {Function} [opts.spawnFn] - Spawn implementation (default node:child_process spawn; injectable for tests).
 * @param {number} [opts.maxStderrLines] - Stderr ring line cap (default 50).
 * @param {number} [opts.maxStderrChars] - Stderr ring char cap (default 2000).
 * @returns {Object} { child, stdoutDecoder, stderrDecoder, stderr, kill(signal, { escalate }), dispose(), timedOut }.
 ***/
export function startSupervisedSpawn(
	command,
	args,
	{
		cwd,
		env,
		stdio = ["ignore", "pipe", "pipe"],
		detached = false,
		timeoutMs = 0,
		onTimeout = null,
		killGraceMs = DEFAULT_KILL_GRACE_MS,
		firstSignal = "SIGTERM",
		platform = process.platform,
		spawnFn = spawn,
		maxStderrLines = 50,
		maxStderrChars = 2000,
	} = {},
) {
	const onWindows = isWindows(platform);
	const child = spawnFn(command, args, { cwd, env, stdio, detached });
	const stdoutDecoder = new StringDecoder("utf8");
	const stderrDecoder = new StringDecoder("utf8");
	const stderr = createStderrRing({ maxLines: maxStderrLines, maxChars: maxStderrChars });
	let timedOut = false;
	let forceKillTimer = null;

	function kill(signal, { escalate = signal === "SIGTERM" } = {}) {
		// NOTE: the guard is deliberately NOT `child.killed`: Node sets
		// `killed=true` once a signal is SENT (even when the child ignores
		// it and keeps running), so a killed-check here would disable both
		// follow-up signals and the SIGKILL escalation below. `exitCode`
		// (null until the child actually exits) plus the ESRCH catch are the
		// correct aliveness checks. The pre-extraction harness copies
		// guarded on `!child.killed` too, which silently disabled their
		// documented SIGTERM→SIGKILL escalation for delivered-but-ignored
		// SIGTERMs — this module fixes that (see the R6 report).
		if (!child.pid || child.exitCode !== null) return;
		if (onWindows) {
			// No graceful signal exists on Windows (child.kill("SIGTERM")
			// is TerminateProcess): fire-and-forget whole-tree terminate and
			// skip the POSIX grace timer. Errors (already gone) are swallowed
			// inside killProcessTree; the promise never rejects.
			killProcessTree(child.pid, { platform, child, spawnFn }).catch(() => {});
			return;
		}
		try {
			if (detached) {
				// Negative pid targets the process group (the child was spawned
				// detached); fall back to the child handle when grouping fails.
				try {
					process.kill(-child.pid, signal);
				} catch {
					child.kill(signal);
				}
			} else {
				child.kill(signal);
			}
		} catch {
			// already gone
		}
		if (escalate) {
			forceKillTimer = setTimeout(() => {
				try {
					// Still running after the grace period (exitCode is null
					// until the child actually exits — see the NOTE above for
					// why `child.killed` is NOT consulted here).
					if (child.exitCode === null) {
						if (detached) {
							try {
								process.kill(-child.pid, "SIGKILL");
							} catch {
								child.kill("SIGKILL");
							}
						} else {
							child.kill("SIGKILL");
						}
					}
				} catch {
					// already gone
				}
			}, killGraceMs);
			if (forceKillTimer.unref) forceKillTimer.unref();
		}
	}

	function dispose() {
		clearTimeout(watchdog);
		if (forceKillTimer) {
			clearTimeout(forceKillTimer);
			forceKillTimer = null;
		}
	}

	// Engine-side watchdog: a hung child must never pin a stage forever. The
	// harness's onTimeout hook records the timeout state BEFORE the kill so a
	// close handler reports the timeout (not a bare crash) when the killed
	// child's close event wins the race.
	const watchdog = timeoutMs > 0 ? setTimeout(() => {
		timedOut = true;
		try {
			onTimeout?.();
		} catch {
			// A state hook must not break the kill escalation.
		}
		// The watchdog always escalates: a child that ignores the first
		// signal (SIGTERM or the SIGINT opt-in) still dies after the grace.
		kill(firstSignal, { escalate: true });
	}, timeoutMs) : null;
	if (watchdog?.unref) watchdog.unref();

	return {
		child,
		stdoutDecoder,
		stderrDecoder,
		stderr,
		kill,
		dispose,
		get timedOut() {
			return timedOut;
		},
	};
}
