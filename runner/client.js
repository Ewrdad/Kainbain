const TRANSIENT_BACKEND_STATUSES = new Set([502, 503, 504]);
// Node system codes (ECONN*) plus undici fetch-failure codes (UND_ERR_*,
// e.g. a destroyed socket surfaces as UND_ERR_SOCKET on Node 20/22/24).
// Deliberately NOT matched: bare `TypeError: fetch failed` with no
// recognized code (e.g. a misconfigured backendUrl) — ambiguous failures
// stay loud rather than spinning the loop forever.
const TRANSIENT_NETWORK_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"EAI_AGAIN",
	"ENOTFOUND",
	"EPIPE",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"ENETDOWN",
	"UND_ERR_SOCKET",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
]);

/***
 * MARK: isTransientBackendError
 * @description Explicit non-fatal set for backend outages (S4): HTTP
 *   502/503/504 (the backend or its proxy is restarting) plus
 *   network-layer fetch rejections where the backend never answered
 *   (refused/reset connection, timeout, DNS failure, dropped socket —
 *   matched on stable `code`/`cause.code` signals, never message text).
 *   Everything else returns false — STALE_EPOCH, auth rejections (401
 *   INVALID_CREDENTIAL, 403), 429, 500, and unknown errors stay fatal
 *   by construction, so new failure modes stay loud. Pure predicate:
 *   no logging, no dependencies.
 * @example isTransientBackendError(Object.assign(new Error('x'), { statusCode: 502 })) => true
 * @param {*} err - Thrown value from a backend call.
 * @returns {boolean} True only for the enumerated transient set.
 ***/
export function isTransientBackendError(err) {
	if (!err || (typeof err !== "object" && typeof err !== "function")) return false;
	// A status means the backend answered: only gateway outages are
	// transient — 401/403/409/429/500 and friends stay fatal/loud.
	const status = Number(err.statusCode);
	if (Number.isFinite(status)) return TRANSIENT_BACKEND_STATUSES.has(status);
	// No status: fetchImpl itself rejected. Walk the cause chain (undici
	// nests the system error under `cause`) for a recognized code.
	let current = err;
	for (let depth = 0; depth < 4 && current && (typeof current === "object" || typeof current === "function"); depth += 1) {
		if (typeof current.code === "string" && TRANSIENT_NETWORK_CODES.has(current.code)) return true;
		current = current.cause;
	}
	return false;
}

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
		register({ runnerId, joinToken, facts, joinNonce }) {
			return call("/runners/register", {
				method: "POST",
				body: { runnerId, joinToken, facts, joinNonce },
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
		claimHeartbeat({ taskId, projectId, executionId, epoch }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/claim-heartbeat`, {
				method: "POST",
				body: { projectId, executionId, epoch },
			});
		},
		dispatchClaim({ projectIds } = {}) {
			return call("/runners/dispatch", {
				method: "POST",
				body: { ...(projectIds?.length ? { projectIds } : {}) },
			});
		},
		integrationHeartbeat({ projectId, targetBranch, executionId, epoch }) {
			return call(`/runners/integration/heartbeat`, {
				method: "POST",
				body: { projectId, targetBranch, executionId, epoch },
			});
		},
		integrationReport({ projectId, targetBranch, executionId, epoch, outcome, mergeSha = null, detail = null }) {
			return call(`/runners/integration/report`, {
				method: "POST",
				body: { projectId, targetBranch, executionId, epoch, outcome, ...(mergeSha ? { mergeSha } : {}), ...(detail ? { detail } : {}) },
			});
		},
		verifySha({ taskId, projectId, executionId, epoch, sha, present }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/verify-sha`, {
				method: "POST",
				body: { projectId, executionId, epoch, sha, present: present !== false },
			});
		},
		steerAck({ taskId, projectId, executionId, epoch, steerId, ok, detail }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/steer-ack`, {
				method: "POST",
				body: {
					projectId,
					executionId,
					epoch,
					steerId,
					ok: ok !== false,
					...(typeof detail === "string" && detail ? { detail: detail.slice(0, 500) } : {}),
				},
			});
		},
		progress({ taskId, projectId, executionId, epoch, stageId, event, prompt = null, harness = null, model = null }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/progress`, {
				method: "POST",
				body: {
					projectId,
					executionId,
					epoch,
					stageId,
					event,
					// Stage prompt payload (observability only, capped like
					// stage output): reported once per assignment so the
					// monitor can show what the Runner was actually told,
					// and on which harness/model it runs.
					...(typeof prompt === "string" && prompt
						? { prompt: prompt.slice(0, 20000) }
						: {}),
					...(typeof harness === "string" && harness.trim() ? { harness: harness.trim() } : {}),
					...(typeof model === "string" && model.trim() ? { model: model.trim() } : {}),
				},
			});
		},
		logs({ taskId, projectId, executionId, epoch, seq, bytes }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/logs`, {
				method: "POST",
				body: { projectId, executionId, epoch, seq, bytes },
			});
		},
		logEvents({ taskId, projectId, executionId, epoch, seq, events }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/log-events`, {
				method: "POST",
				body: { projectId, executionId, epoch, seq, events },
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
			model = null,
			outcome,
			output,
			summary,
			modifiedFiles,
			harnessId,
			failureKind,
			failureReason,
			gitFailure = null,
			durationMs,
			taskFiles,
			configHash = null,
			committed = undefined,
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
					// Stage attestation (additive): the config hash this run
					// attested in its wrap-up commit, plus whether this run
					// actually committed (CI stages and clean trees report a
					// HEAD SHA without producing a commit). Old backends ignore
					// both keys; explicit `committed: false` must survive.
					...(typeof configHash === "string" && configHash.trim()
						? { configHash: configHash.trim() }
						: {}),
					...(typeof committed === "boolean" ? { committed } : {}),
					// Explicit served-model field (observability): the posture
					// string also carries the model as its last segment, but
					// model ids may contain single `:` so the segment is not
					// safely parseable — this field is. Omitted entirely when
					// null/blank (CI, merge, harness-managed) so the backend
					// never has to guess.
					...(typeof model === "string" && model.trim() ? { model: model.trim() } : {}),
					...(outcome ? { outcome } : {}),
					...(output ? { output } : {}),
					...(summary ? { summary } : {}),
					...(modifiedFiles ? { modifiedFiles } : {}),
					...(harnessId ? { harnessId } : {}),
					...(failureKind ? { failureKind } : {}),
					...(failureReason ? { failureReason } : {}),
					// Structured commit/hook failure (additive): passed
					// through verbatim; old backends ignore the unknown key.
					...(gitFailure && typeof gitFailure === "object" ? { gitFailure } : {}),
					...(Number.isFinite(durationMs) ? { durationMs } : {}),
				...(Array.isArray(taskFiles) && taskFiles.length ? { taskFiles } : {}),
				},
			});
		},
		interrupt({ taskId, projectId, executionId, reason = null }) {
			return call(`/tasks/${encodeURIComponent(taskId)}/interrupt`, {
				method: "POST",
				body: {
					projectId,
					...(executionId ? { executionId } : {}),
					...(typeof reason === "string" && reason.trim() ? { reason: reason.trim().slice(0, 500) } : {}),
				},
			});
		},
		getProject(projectId) {
			return call(`/projects/${encodeURIComponent(projectId)}`);
		},
		listProjects() {
			return call("/projects");
		},
		getTask(projectId, taskId) {
			return call(`/tasks/${encodeURIComponent(taskId)}?projectId=${encodeURIComponent(projectId)}`);
		},
		impromptuPoll() {
			return call("/runners/impromptu/poll", { method: "POST", body: {} });
		},
		impromptuProgress({ jobId, seq, delta }) {
			return call(`/runners/impromptu/${encodeURIComponent(jobId)}/progress`, {
				method: "POST",
				body: { seq, delta },
			});
		},
		impromptuComplete({ jobId, outcome, output, error }) {
			return call(`/runners/impromptu/${encodeURIComponent(jobId)}/complete`, {
				method: "POST",
				body: { outcome, ...(output !== undefined ? { output } : {}), ...(error !== undefined ? { error } : {}) },
			});
		},
		getWorkflow(projectId) {
			return call(`/projects/${encodeURIComponent(projectId)}/workflow`);
		},
	};
}
