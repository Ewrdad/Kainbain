/***
 * MARK: loadRunnerConfig
 * @description Reads Runner daemon configuration from the environment.
 *   The credential is operator-pasted after human approval (D4): when it
 *   is absent the daemon registers, polls until the join is approved, then
 *   exits with instructions instead of running unapproved. Assignment is
 *   explicit (project + task ids) by default; set KAINBAIN_RUNNER_DISPATCH=1
 *   for the capability-aware dispatch loop (WP-3.1), optionally scoped with
 *   KAINBAIN_RUNNER_PROJECTS.
 * @example loadRunnerConfig({ KAINBAIN_RUNNER_ID: 'r1' }) => { runnerId: 'r1', ... }
 * @param {Object} [env] - Environment mapping (defaults to process.env).
 * @returns {Object} Normalized config.
 ***/
export function loadRunnerConfig(env = process.env) {
	const errors = [];
	const str = (key, fallback = "") => {
		const value = env[key] ?? fallback;
		return typeof value === "string" ? value.trim() : String(value ?? "").trim();
	};

	const backendUrl = str("KAINBAIN_RUNNER_BACKEND", "http://localhost:3100").replace(/\/+$/, "");
	const runnerId = str("KAINBAIN_RUNNER_ID", "");
	// Multi-harness service (one Runner, several harnesses): the csv
	// KAINBAIN_RUNNER_HARNESSES wins when set; otherwise the singular
	// KAINBAIN_RUNNER_HARNESS seeds a 1-element list. The first entry
	// stays the primary harness (single-assignment default, posture).
	const harnessIds = str("KAINBAIN_RUNNER_HARNESSES", "")
		.split(",")
		.map((h) => h.trim())
		.filter(Boolean);
	const singularHarness = str("KAINBAIN_RUNNER_HARNESS", "");
	if (harnessIds.length === 0 && singularHarness) harnessIds.push(singularHarness);
	const harnessId = harnessIds[0] ?? "";
	// Servable model advertisement (capability matching is backend-side, so
	// the list is the operator's claim of what this host can run; the
	// dispatch answer carries the required model per assignment and the
	// daemon serves exactly that). KAINBAIN_RUNNER_MODELS (csv) wins when
	// set; otherwise the singular KAINBAIN_RUNNER_MODEL seeds a 1-element
	// list; empty means unpinned (matches model-less tasks only).
	const model = str("KAINBAIN_RUNNER_MODEL", "");
	const models = str("KAINBAIN_RUNNER_MODELS", "")
		.split(",")
		.map((m) => m.trim())
		.filter(Boolean);
	if (models.length === 0 && model) models.push(model);
	const projectId = str("KAINBAIN_RUNNER_PROJECT_ID", "");
	const taskId = str("KAINBAIN_RUNNER_TASK_ID", "");
	if (!runnerId) errors.push("KAINBAIN_RUNNER_ID is required (stable per host).");
	if (!harnessId) errors.push("KAINBAIN_RUNNER_HARNESS is required (e.g. pi, codex, mock).");
	const dispatch = str("KAINBAIN_RUNNER_DISPATCH", "") === "1";
	if (!dispatch && !projectId) {
		errors.push("KAINBAIN_RUNNER_PROJECT_ID is required (or set KAINBAIN_RUNNER_DISPATCH=1).");
	}
	if (!dispatch && !taskId) {
		errors.push("KAINBAIN_RUNNER_TASK_ID is required (or set KAINBAIN_RUNNER_DISPATCH=1).");
	}

	const heartbeatMs = Number.parseInt(str("KAINBAIN_RUNNER_HEARTBEAT_MS", "15000"), 10);
	const approvalPollMs = Number.parseInt(str("KAINBAIN_RUNNER_APPROVAL_POLL_MS", "5000"), 10);
	const approvalTimeoutMs = Number.parseInt(str("KAINBAIN_RUNNER_APPROVAL_TIMEOUT_MS", "300000"), 10);
	const dispatchPollMs = Number.parseInt(str("KAINBAIN_RUNNER_DISPATCH_POLL_MS", "5000"), 10);
	const dispatchIdleLimit = Number.parseInt(str("KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT", "3"), 10);

	return {
		backendUrl,
		joinToken: str("KAINBAIN_RUNNER_JOIN_TOKEN", ""),
		credential: str("KAINBAIN_RUNNER_CREDENTIAL", ""),
		runnerId,
		harnessId,
		harnessIds,
		model,
		models,
		tiers: str("KAINBAIN_RUNNER_TIERS", "T0,T1")
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean),
		workRoot: str("KAINBAIN_RUNNER_WORK_ROOT", "runner-work"),
		projectId,
		taskId,
		dispatch,
		projectIds: str("KAINBAIN_RUNNER_PROJECTS", "")
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean),
		dispatchPollMs: Number.isFinite(dispatchPollMs) && dispatchPollMs > 0 ? dispatchPollMs : 5000,
		dispatchIdleLimit:
			Number.isFinite(dispatchIdleLimit) && dispatchIdleLimit >= 0 ? dispatchIdleLimit : 3,
		heartbeatMs: Number.isFinite(heartbeatMs) && heartbeatMs > 0 ? heartbeatMs : 15000,
		approvalPollMs: Number.isFinite(approvalPollMs) && approvalPollMs > 0 ? approvalPollMs : 5000,
		approvalTimeoutMs:
			Number.isFinite(approvalTimeoutMs) && approvalTimeoutMs > 0 ? approvalTimeoutMs : 300000,
		errors,
	};
}
