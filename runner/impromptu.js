import path from "node:path";
import { effectiveDirectoriesFor } from "./daemon.js";

/***
 * MARK: runImpromptuJob
 * @description Executes one impromptu T0 read-only job on the runner (ADR 0014): picks the required harness, creates a read-only session without worktree/git, prompts with the backend-compiled prompt, streams deltas via impromptuProgress, and completes with final text.
 * @example await runImpromptuJob({ config, client, logger, harnesses, job })
 * @param {Object} opts - Options (config, client, logger, harnesses, job).
 * @returns {Promise<Object>} `{ jobId, outcome }`.
 ***/
export async function runImpromptuJob({ config, client, logger, harnesses, job }) {
	const harnessId = job.harness || (config.harnessId ?? Object.keys(harnesses ?? {})[0] ?? "");
	let harness = harnesses?.[harnessId];
	if (!harness) {
		const fallbackId = Object.keys(harnesses ?? {})[0];
		if (fallbackId) {
			logger?.warn?.(`Impromptu job wants harness '${harnessId}' (not loaded); serving with '${fallbackId}'.`);
			harness = harnesses[fallbackId];
		}
	}
	if (!harness) throw new Error(`No harness available for impromptu job (wanted '${harnessId}').`);

	let project = null;
	if (job.projectId) {
		try { project = await client.getProject(job.projectId); } catch { project = null; }
	}
	const fallbackCwd = effectiveDirectoriesFor(config).worktreeDir || process.cwd();
	const projectForSession = project ?? { id: job.projectId ?? "unknown", cwd: fallbackCwd, docsDirName: null };

	const sessionDir = path.join(config.workRoot ?? "runner-work", `impromptu-${job.jobId}`);
	let seq = 0;
	let chunkUsed = false;
	let subscribedUsed = false;
	const streamDelta = (delta, source) => {
		if (typeof delta !== "string" || !delta) return;
		if (source === "chunk" && subscribedUsed) return;
		if (source === "subscribed" && chunkUsed) return;
		if (source === "chunk") chunkUsed = true;
		if (source === "subscribed") subscribedUsed = true;
		const thisSeq = seq++;
		try {
			client.impromptuProgress({ jobId: job.jobId, seq: thisSeq, delta }).catch(() => {});
		} catch { /* best-effort */ }
	};
	const onChunk = (delta) => { streamDelta(delta, "chunk"); };

	try {
		const session = await harness.createSession(projectForSession, {
			taskId: "impromptu",
			stageId: job.jobId,
			sessionDir,
			...(job.model ? { model: job.model } : {}),
			readOnly: true,
		});
		try {
			if (typeof session.subscribe === "function") {
				try {
					const unsub = session.subscribe((event) => {
						if (event?.type === "assistant_delta" && typeof event.delta === "string" && event.delta) {
							streamDelta(event.delta, "subscribed");
						}
					});
					// keep unsub for cleanup after prompt
					session.__impromptuUnsub = unsub;
				} catch { /* no subscribe */ }
			}
			const result = await session.prompt(job.prompt, { onChunk });
			let output = "";
			if (typeof result === "string") output = result;
			else {
				try {
					if (typeof session.getLastAssistantText === "function") {
						const t = await session.getLastAssistantText();
						if (typeof t === "string" && t) output = t;
					}
				} catch { /* ignore */ }
			}
			if (typeof session.__impromptuUnsub === "function") { try { session.__impromptuUnsub(); } catch {} }
			try { await session.dispose?.(); } catch {}
			await client.impromptuComplete({ jobId: job.jobId, outcome: "completed", output });
			return { jobId: job.jobId, outcome: "completed" };
		} catch (err) {
			if (typeof session?.__impromptuUnsub === "function") { try { session.__impromptuUnsub(); } catch {} }
			try { await session.dispose?.(); } catch {}
			await client.impromptuComplete({ jobId: job.jobId, outcome: "failed", error: String(err?.message || err).slice(0, 2000) }).catch(() => {});
			throw err;
		}
	} catch (err) {
		// If session creation itself failed, report failure
		try {
			await client.impromptuComplete({ jobId: job.jobId, outcome: "failed", error: String(err?.message || err).slice(0, 2000) });
		} catch {}
		throw err;
	}
}
