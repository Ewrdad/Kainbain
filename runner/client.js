/***
 * MARK: createRunnerClient
 * @description Thin fetch wrapper over the Runner-facing backend API
 *   (ADR 0009). Holds the per-Runner credential after approval and sends
 *   it as `x-runner-credential`; every call throws the backend's
 *   `{ error, code }` shape on non-2xx so the daemon can branch on codes.
 * @example const client = createRunnerClient({ backendUrl: 'http://localhost:3100' })
 * @param {Object} opts - Options.
 * @param {string} opts.backendUrl - Backend origin (no trailing slash).
 * @param {Function} [opts.fetchImpl] - Fetch implementation (tests inject a stub).
 * @returns {Object} Runner API client.
 ***/
export function createRunnerClient({ backendUrl, fetchImpl = fetch }) {
	const base = String(backendUrl).replace(/\/+$/, "");
	let credential = "";

	async function call(path, { method = "GET", body, credential: override } = {}) {
		const cred = override ?? credential;
		const res = await fetchImpl(`${base}${path}`, {
			method,
			headers: {
				...(body !== undefined ? { "content-type": "application/json" } : {}),
				...(cred ? { "x-runner-credential": cred } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		let data = null;
		try {
			data = await res.json();
		} catch {
			data = null;
		}
		if (!res.ok) {
			const err = new Error(data?.error || `Backend ${res.status} on ${path}`);
			err.statusCode = res.status;
			err.code = data?.code ?? null;
			throw err;
		}
		return data;
	}

	return {
		setCredential(next) {
			credential = next;
		},
		register({ runnerId, joinToken, facts }) {
			return call("/runners/register", {
				method: "POST",
				body: { runnerId, joinToken, facts },
			});
		},
		heartbeat({ runnerId, facts }) {
			return call("/runners/heartbeat", {
				method: "POST",
				body: { runnerId, facts },
			});
		},
		claim({ taskId, projectId, runnerId }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/claim`, {
				method: "POST",
				body: { projectId, ...(runnerId ? { runnerId } : {}) },
			});
		},
		progress({ taskId, projectId, executionId, epoch, stageId, event }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/progress`, {
				method: "POST",
				body: { projectId, executionId, epoch, stageId, event },
			});
		},
		logs({ taskId, projectId, executionId, epoch, seq, bytes }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/logs`, {
				method: "POST",
				body: { projectId, executionId, epoch, seq, bytes },
			});
		},
		complete({
			taskId,
			projectId,
			executionId,
			epoch,
			sha,
			branch,
			posture,
			outcome,
			output,
			summary,
			modifiedFiles,
			harnessId,
			failureKind,
			failureReason,
			durationMs,
		}) {
			return call(`/tasks/${encodeURIComponent(taskId)}/complete-execution`, {
				method: "POST",
				body: {
					projectId,
					executionId,
					epoch,
					...(sha ? { sha } : {}),
					...(branch ? { branch } : {}),
					...(posture ? { posture } : {}),
					...(outcome ? { outcome } : {}),
					...(output ? { output } : {}),
					...(summary ? { summary } : {}),
					...(modifiedFiles ? { modifiedFiles } : {}),
					...(harnessId ? { harnessId } : {}),
					...(failureKind ? { failureKind } : {}),
					...(failureReason ? { failureReason } : {}),
					...(Number.isFinite(durationMs) ? { durationMs } : {}),
				},
			});
		},
		interrupt({ taskId, projectId, executionId }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/interrupt`, {
				method: "POST",
				body: {
					projectId,
					...(executionId ? { executionId } : {}),
				},
			});
		},
		getProject(projectId) {
			return call(`/projects/${encodeURIComponent(projectId)}`);
		},
		getTask(projectId, taskId) {
			return call(`/tasks/${encodeURIComponent(taskId)}?projectId=${encodeURIComponent(projectId)}`);
		},
	};
}
