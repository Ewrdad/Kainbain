import path from "node:path";
import { rm } from "node:fs/promises";
import { runChatTurn } from "../api/routes/retrospectiveChat.js";

/***
 * MARK: workRootForImpromptu
 * @description Absolute work root for one Runner config (impromptu session
 *   scratch dirs live directly under it). Kept here instead of importing
 *   the daemon's helper so the impromptu module never pulls the whole
 *   dispatch loop in (the daemon already imports this file — the reverse
 *   import would be a module cycle).
 * @example workRootForImpromptu({ workRoot: 'runner-work' }) => '<cwd>/runner-work'
 * @param {Object} [config] - Normalized runner config.
 * @returns {string} Absolute work root, or "" when none is configured.
 ***/
const workRootForImpromptu = (config = {}) => {
	const raw = typeof config?.workRoot === "string" && config.workRoot ? config.workRoot : "";
	return raw ? path.resolve(raw) : "";
};

/***
 * MARK: runImpromptuJob
 * @description Executes one impromptu T0 read-only job on the runner (ADR 0014): picks the required harness, creates a read-only session without worktree/git/claim, prompts with the backend-compiled prompt, streams deltas via impromptuProgress, and completes with the final text. Prompting, streaming, and timeout reuse the shared route helper so the Runner and the backend can never disagree on the winner rule. The job's scratch dir is removed best-effort afterwards so idle turns never leak disk. Never throws for model/session failures (they are reported as failed completions and returned); only transport failures (progress/complete calls) throw so the dispatch loop can log and continue.
 * @example await runImpromptuJob({ config, client, logger, harnesses, job })
 * @param {Object} opts - Options (config, client, logger, harnesses, job).
 * @returns {Promise<Object>} `{ jobId, outcome }` (`completed`, `failed`, or `skipped`).
 ***/
export async function runImpromptuJob({ config, client, logger, harnesses, job }) {
	const jobId = job?.jobId;
	if (!jobId || typeof job?.prompt !== "string" || !job.prompt) {
		logger?.warn?.(`Impromptu job missing jobId/prompt; skipping without a completion.`);
		return { jobId: jobId ?? null, outcome: "skipped" };
	}
	const harnessId = job.harness || (config?.harnessId ?? Object.keys(harnesses ?? {})[0] ?? "");
	let harness = harnesses?.[harnessId];
	if (!harness) {
		const fallbackId = Object.keys(harnesses ?? {})[0];
		if (fallbackId) {
			logger?.warn?.(`Impromptu job wants harness '${harnessId}' (not loaded); serving with '${fallbackId}'.`);
			harness = harnesses[fallbackId];
		}
	}
	if (!harness) {
		const error = `No harness available for impromptu job (wanted '${harnessId}').`;
		try {
			await client.impromptuComplete({ jobId, outcome: "failed", error });
		} catch {}
		return { jobId, outcome: "failed" };
	}

	let project = null;
	if (job.projectId) {
		try { project = await client.getProject(job.projectId); } catch { project = null; }
	}
	const fallbackCwd = workRootForImpromptu(config) || process.cwd();
	const projectForSession = project ?? { id: job.projectId ?? "unknown", cwd: fallbackCwd, docsDirName: null };

	const workRoot = workRootForImpromptu(config);
	const sessionDir = workRoot ? path.join(workRoot, `impromptu-${jobId}`) : null;
	let session = null;
	try {
		session = await harness.createSession(projectForSession, {
			taskId: "impromptu",
			stageId: jobId,
			...(sessionDir ? { sessionDir } : {}),
			...(job.model ? { model: job.model } : {}),
			readOnly: true,
		});
	} catch (err) {
		const error = String(err?.message || err).slice(0, 2000);
		try {
			await client.impromptuComplete({ jobId, outcome: "failed", error });
		} catch {}
		return { jobId, outcome: "failed" };
	}

	let seq = 0;
	let winningSource = null;
	const reportProgress = (delta, source) => {
		if (typeof delta !== "string" || !delta) return;
		// First-stream-wins (same rule as the shared tail finalizer):
		// several harnesses re-emit one assistant delta through BOTH
		// channels, so forwarding both would scroll every line twice.
		if (!winningSource) winningSource = source || "chunk";
		if (source && source !== winningSource) return;
		const thisSeq = seq++;
		// Best-effort: a dropped progress frame only loses live scroll —
		// the unary completion below stays truthful.
		try {
			client.impromptuProgress({ jobId, seq: thisSeq, delta }).catch(() => {});
		} catch { /* best-effort */ }
	};
	try {
		// The job carries the queue's remaining TTL: a hung model can never
		// wedge the dispatch loop past it (a non-positive/odd value degrades
		// to no ceiling inside the helper — the backend TTL still bounds the
		// user-visible turn, and the late completion lands as a no-op).
		const { replyText, output } = await runChatTurn({
			session,
			promptText: job.prompt,
			timeoutMs: job.timeoutMs,
			onProgress: (delta, source) => reportProgress(delta, source),
		});
		// The final text wins; the streamed tail is only a fallback for a
		// harness whose settle value is empty (never the reverse — the tail
		// is capped and front-truncated, the reply is not).
		const finalText = (typeof replyText === "string" && replyText) || output || "";
		await client.impromptuComplete({ jobId, outcome: "completed", output: finalText });
		return { jobId, outcome: "completed" };
	} catch (err) {
		const error = String(err?.message || err).slice(0, 2000);
		// runChatTurn already folded streamed deltas into partialOutput;
		// prefer it so the chat card keeps what arrived before the failure.
		const partialOutput = typeof err?.partialOutput === "string" ? err.partialOutput : "";
		try {
			await client.impromptuComplete({
				jobId,
				outcome: "failed",
				error,
				...(partialOutput ? { output: partialOutput } : {}),
			});
		} catch {}
		return { jobId, outcome: "failed" };
	} finally {
		try { await session?.dispose?.(); } catch {}
		// Scratch dirs are per-job: remove best-effort so idle turns never
		// leak disk. Absolute-only (a relative root would risk the cwd).
		if (sessionDir) {
			try { await rm(sessionDir, { recursive: true, force: true }); } catch {}
		}
	}
}
