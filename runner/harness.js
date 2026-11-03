/***
 * MARK: runHarnessStage
 * @description Runs one stage through any HarnessSession-conforming harness
 *   (ADR 0009 step 3 execution). Subscribes first so no frame is missed,
 *   forwards text deltas (`assistant_delta.delta`, `harness_log.text`) to
 *   `onLog` in order, and EVERY normalized session event to `onEvent`
 *   (structured transport: tool calls/results, thinking, usage, permissions,
 *   plans, errors). The `onLog` derivation is byte-identical to the
 *   pre-structured behavior so existing callers are unaffected. Disposes the
 *   session even when prompting throws.
 * @example await runHarnessStage({ harness, prompt: 'do X', onLog: () => {} }) => { output: '...' }
 * @param {Object} opts - Options.
 * @param {Object} opts.harness - Harness with `createSession(project, meta)`.
 * @param {Object} opts.project - Project entity passed to createSession.
 * @param {string} opts.workdir - Stage working directory (passed via meta).
 * @param {string} opts.taskId - Task id (session meta).
 * @param {string} opts.stageId - Stage id (session meta).
 * @param {string} [opts.model] - Model pin (session meta).
 * @param {string} opts.prompt - Stage prompt text.
 * @param {Function} [opts.onLog] - Called with each log string, in order.
 * @param {Function} [opts.onEvent] - Called with each normalized session event, in order.
 * @param {Function} [opts.onSession] - Called with the live session after creation (steering delivery, WP-3.4).
 * @returns {Promise<Object>} `{ output }` — the final assistant text.
 ***/
export async function runHarnessStage({
	harness,
	project,
	workdir,
	taskId,
	stageId,
	model = "",
	prompt,
	onLog = () => {},
	onEvent = null,
	onSession = null,
}) {
	if (!harness || typeof harness.createSession !== "function") {
		throw new Error("runHarnessStage needs a harness with createSession.");
	}
	if (typeof prompt !== "string" || !prompt) {
		throw new Error("runHarnessStage needs a prompt string.");
	}
	const session = await harness.createSession(project, {
		taskId,
		stageId,
		sessionDir: workdir,
		...(model ? { model } : {}),
	});
	if (typeof onSession === "function") {
		try {
			onSession(session);
		} catch {
			// Observer only: a throwing hook must never break the run.
		}
	}
	const seen = new Set();
	const unsubscribe = session.subscribe((event) => {
		if (!event || typeof event !== "object") return;
		// Structured transport first: every normalized event reaches onEvent
		// in subscription order. A throwing observer must never break the
		// run (same observer-only contract as onSession below).
		if (typeof onEvent === "function") {
			try {
				onEvent(event);
			} catch {
				// Observer only: a throwing hook must never break the run.
			}
		}
		if (event.type === "assistant_delta" && typeof event.delta === "string" && !seen.has(event)) {
			seen.add(event);
			onLog(event.delta);
		} else if (event.type === "harness_log" && typeof event.text === "string" && !seen.has(event)) {
			seen.add(event);
			onLog(event.text);
		}
	});
	try {
		const output = await session.prompt(prompt);
		if (typeof session.getLastAssistantText === "function") {
			const last = session.getLastAssistantText();
			if (typeof last === "string" && last) return { output: last };
		}
		return { output: typeof output === "string" ? output : "" };
	} catch (err) {
		// Mark prompt-phase throws as stage failures: the backend's
		// routeStageError classifies them (infrastructure vs stage failure),
		// mirroring the embedded engine's catch around the same call.
		if (err && typeof err === "object") {
			err.failedOutcome = err?.message || String(err);
		}
		throw err;
	} finally {
		if (typeof unsubscribe === "function") unsubscribe();
		if (typeof session.dispose === "function") await session.dispose();
	}
}
