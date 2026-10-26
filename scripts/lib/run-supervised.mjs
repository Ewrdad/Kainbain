/***
 * MARK: run-supervised.mjs
 * @description Foreground supervisor for long-lived dev children (the `dev`
 *   entry point's process core, dependency-free): spawns every child, streams
 *   each child's stdout/stderr live with a `[name]` prefix, forwards
 *   SIGINT/SIGTERM to all children, and shuts the siblings down as soon as
 *   any child exits — resolving with that child's exit code. A spawn failure
 *   resolves as a failed run carrying the error text, never a throw.
 *   Shutdown kills each child's whole process group on POSIX, so an
 *   npm-wrapped grandchild (Vite under `npm run dev`) dies with its wrapper
 *   instead of orphaning and pinning the supervisor's stdio pipes (which
 *   would stall shutdown and the process exit). Windows has no group kill,
 *   so a lingering grandchild there is reaped on the next dev start, whose
 *   port clearing recovers the port.
 * @example const r = await runSupervised([{ name: "api", file: process.execPath, args: ["index.js"], cwd: "api" }])
 ***/

import { spawn } from "node:child_process";

/***
 * MARK: prefixStream
 * @description Pipes one child stream to the sink with a `[name] ` prefix per
 *   complete line, buffering partial lines until the newline (or EOF) arrives.
 * @example prefixStream(child.stdout, "api", write) => { flush: () => void }
 * @param {Object|null} stream - the child stdout/stderr stream.
 * @param {string} prefix - the child label shown in brackets.
 * @param {Function} write - line sink.
 * @returns {{ flush: Function }} flush() emits any buffered tail.
 ***/
function prefixStream(stream, prefix, write) {
	let buffered = "";
	const tag = `[${prefix}] `;
	if (!stream) return { flush: () => {} };
	stream.on("data", (chunk) => {
		buffered += chunk.toString();
		const parts = buffered.split("\n");
		buffered = parts.pop();
		for (const line of parts) {
			write(`${tag}${line}\n`);
		}
	});
	return {
		flush: () => {
			if (buffered !== "") {
				write(`${tag}${buffered}\n`);
				buffered = "";
			}
		},
	};
}

/***
 * MARK: runSupervised
 * @description Supervises long-lived children until the first exit or signal.
 *   Resolves `{ ok, exitCode, ended, signal }`: `ended` names the child that
 *   exited first (null on signal shutdown), `signal` names the caught signal
 *   (null otherwise). Signal shutdown always resolves ok:true — stopping the
 *   servers with Ctrl-C is the normal path, not a failure.
 * @example const r = await runSupervised(children) => { ok: true, exitCode: 0, ended: null, signal: "SIGINT" }
 * @param {Array<Object>} children - { name, file, args?, cwd?, env? } each.
 * @param {Object} [opts]
 * @param {Function} [opts.write] - line sink, defaults to stdout.
 * @param {Function} [opts.spawnFn] - spawn seam, for tests.
 * @param {number} [opts.shutdownTimeoutMs] - grace period for siblings to die
 *   after the first exit/signal before SIGKILL (default 5000).
 * @returns {Promise<Object>}
 ***/
export async function runSupervised(
	children,
	{ write = (text) => process.stdout.write(text), spawnFn = spawn, shutdownTimeoutMs = 5000 } = {},
) {
	return new Promise((resolve) => {
		const procs = new Map();
		const flushers = [];
		let settled = false;

		const killAll = (signal) => {
			for (const child of procs.values()) {
				if (child.exited || !child.pid) continue;
				try {
					if (process.platform !== "win32") {
						// Group kill: each child leads its own process group
						// (see spawn below), so wrapper grandchildren in the
						// group die with it instead of orphaning.
						process.kill(-child.pid, signal);
					} else {
						child.kill(signal);
					}
				} catch {
					try {
						child.kill(signal);
					} catch {
						// Already gone — the shutdown poll below confirms.
					}
				}
			}
		};

		// Releases our ends of the child pipes so a lingering grandchild
		// that inherited them cannot pin the event loop and stall the
		// supervisor's exit. Only used on the deadline path — the fast
		// path keeps the pipes until every child has closed (full output).
		const destroyPipes = () => {
			for (const child of procs.values()) {
				for (const stream of [child.stdout, child.stderr, child.stdin]) {
					try {
						stream?.destroy();
					} catch {
						// Already closed — nothing to release.
					}
				}
			}
		};

		const settle = (result) => {
			if (settled) return;
			settled = true;
			process.removeListener("SIGINT", onSigint);
			process.removeListener("SIGTERM", onSigterm);
			killAll("SIGTERM");
			const deadline = Date.now() + shutdownTimeoutMs;
			const poll = () => {
				// Liveness comes from the close/error flags below — not
				// `exitCode`, which stays null for signal-killed children
				// (and would stall every shutdown until the SIGKILL deadline).
				const alive = [...procs.values()].some((child) => !child.exited);
				if (!alive) {
					for (const flush of flushers) flush();
					resolve(result);
					return;
				}
				if (Date.now() >= deadline) {
					killAll("SIGKILL");
					destroyPipes();
					for (const flush of flushers) flush();
					resolve(result);
					return;
				}
				setTimeout(poll, 50);
			};
			poll();
		};

		const onSigint = () => settle({ ok: true, exitCode: 0, ended: null, signal: "SIGINT" });
		const onSigterm = () => settle({ ok: true, exitCode: 0, ended: null, signal: "SIGTERM" });
		process.on("SIGINT", onSigint);
		process.on("SIGTERM", onSigterm);

		for (const child of children) {
			let proc;
			try {
				proc = spawnFn(child.file, child.args || [], {
					cwd: child.cwd,
					env: { ...process.env, ...(child.env || {}) },
					// Own process group per child on POSIX so shutdown can
					// group-kill wrapper grandchildren (npm -> Vite). stdio
					// pipes are unaffected by detach; Windows has no group
					// semantics, so it keeps the default.
					detached: process.platform !== "win32",
					windowsHide: true,
				});
			} catch (error) {
				write(`[${child.name}] Failed to start '${child.file}': ${error.message}\n`);
				settle({ ok: false, exitCode: 1, ended: child.name, signal: null });
				return;
			}
			procs.set(child.name, proc);
			flushers.push(prefixStream(proc.stdout, child.name, write).flush);
			flushers.push(prefixStream(proc.stderr, child.name, write).flush);
			proc.on("error", (error) => {
				proc.exited = true;
				write(`[${child.name}] Failed to start '${child.file}': ${error.message}\n`);
				settle({ ok: false, exitCode: 1, ended: child.name, signal: null });
			});
			// Settle on `exit` (process end), not `close` (stdio EOF): a
			// wrapper child that exits while a descendant still holds the
			// stdio pipes open (npm -> Vite) would otherwise never trigger
			// a shutdown at all. Liveness for the shutdown poll still
			// comes from `close`, bounded by the SIGKILL deadline.
			proc.on("exit", (exitCode) => {
				if (settled) return;
				const code = exitCode ?? 1;
				write(`[${child.name}] exited (code ${code})\n`);
				settle({ ok: code === 0, exitCode: code, ended: child.name, signal: null });
			});
			proc.on("close", () => {
				proc.exited = true;
			});
		}
	});
}
