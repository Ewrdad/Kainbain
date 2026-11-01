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
	// Auto-detect is the default: an empty harness config or a literal
	// "auto" token means the daemon probes PATH on boot (see
	// detectAvailableHarnesses in daemon.js) and fail-fasts when nothing
	// is found. Pass --manual --harness NAME at install time to pin.
	const isAutoToken = (h) => String(h ?? "").trim().toLowerCase() === "auto";
	let harnessAuto = false;
	const harnessIds = str("KAINBAIN_RUNNER_HARNESSES", "")
		.split(",")
		.map((h) => h.trim())
		.filter(Boolean)
		.filter((h) => {
			if (isAutoToken(h)) {
				harnessAuto = true;
				return false;
			}
			return true;
		});
	const singularHarness = str("KAINBAIN_RUNNER_HARNESS", "");
	if (isAutoToken(singularHarness)) {
		harnessAuto = true;
	} else if (harnessIds.length === 0 && singularHarness) {
		harnessIds.push(singularHarness);
	}
	if (harnessIds.length === 0 && !singularHarness) {
		// Default behaviour: auto-detect (no --manual flag given).
		harnessAuto = true;
	}
	const harnessId = harnessIds[0] ?? "";
	// Servable model advertisement (capability matching is backend-side, so
	// the list is the operator's claim of what this host can run; the
	// dispatch answer carries the required model per assignment and the
	// daemon serves exactly that). KAINBAIN_RUNNER_MODELS (csv) wins when
	// set; otherwise the singular KAINBAIN_RUNNER_MODEL seeds a 1-element
	// list; when both are empty, periodic model auto-discovery fills in
	// (muse serve model/list every KAINBAIN_RUNNER_MODEL_DISCOVERY_INTERVAL_MS,
	// default 12h, 0 disables) — empty everywhere means unpinned
	// (matches model-less tasks only).
	// The "default" sentinel means harness-managed (no pinned model),
	// never a model this host can serve, so it is never advertised:
	// an operator who sets KAINBAIN_RUNNER_MODEL=default gets the
	// unpinned behaviour, not a fake capability the backend could
	// match against. Duplicates carry no information either.
	const isServableModelName = (name) =>
		Boolean(name) && name.toLowerCase() !== "default";
	const model = str("KAINBAIN_RUNNER_MODEL", "");
	const cleanedSingularModel = isServableModelName(model) ? model : "";
	const models = str("KAINBAIN_RUNNER_MODELS", "")
		.split(",")
		.map((m) => m.trim())
		.filter(isServableModelName)
		.filter((m, index, all) => all.indexOf(m) === index);
	if (models.length === 0 && cleanedSingularModel) models.push(cleanedSingularModel);
	const projectId = str("KAINBAIN_RUNNER_PROJECT_ID", "");
	const taskId = str("KAINBAIN_RUNNER_TASK_ID", "");
	if (!runnerId) errors.push("KAINBAIN_RUNNER_ID is required (stable per host).");
	if (!harnessId && !harnessAuto)
		errors.push("KAINBAIN_RUNNER_HARNESS is required (e.g. pi, codex, mock).");
	const dispatch = str("KAINBAIN_RUNNER_DISPATCH", "") === "1";
	if (!dispatch && !projectId) {
		errors.push("KAINBAIN_RUNNER_PROJECT_ID is required (or set KAINBAIN_RUNNER_DISPATCH=1).");
	}
	if (!dispatch && !taskId) {
		errors.push("KAINBAIN_RUNNER_TASK_ID is required (or set KAINBAIN_RUNNER_DISPATCH=1).");
	}

	// Self-update channel (Option A, ADR 0012): pull-based, idle-only, and
	// signature-verified against the pinned key in runner/updates/verify.js.
	// KAINBAIN_RUNNER_UPDATE_URL overrides the release pointer for
	// air-gapped mirrors (full manifest.json URL or a base serving
	// manifest.json + manifest.json.minisig + assets).
	const updateUrl = str(
		"KAINBAIN_RUNNER_UPDATE_URL",
		"https://api.github.com/repos/Ewrdad/Kainbain/releases/latest",
	);
	const autoUpdate = str("KAINBAIN_RUNNER_AUTO_UPDATE", "1") !== "0";
	const updateCheckIntervalMs = Number.parseInt(
		str("KAINBAIN_RUNNER_UPDATE_CHECK_INTERVAL_MS", "3600000"),
		10,
	);

	// Model auto-discovery cadence (muse serve model/list), default 12h.
	// 0 disables discovery; the operator's explicit MODELS/MODEL list
	// always wins over discovered ids. Invalid values fall back to 12h.
	const modelDiscoveryIntervalMs = Number.parseInt(
		str("KAINBAIN_RUNNER_MODEL_DISCOVERY_INTERVAL_MS", "43200000"),
		10,
	);
	const heartbeatMs = Number.parseInt(str("KAINBAIN_RUNNER_HEARTBEAT_MS", "15000"), 10);
	const approvalPollMs = Number.parseInt(str("KAINBAIN_RUNNER_APPROVAL_POLL_MS", "5000"), 10);
	const approvalTimeoutMs = Number.parseInt(str("KAINBAIN_RUNNER_APPROVAL_TIMEOUT_MS", "300000"), 10);
	const dispatchPollMs = Number.parseInt(str("KAINBAIN_RUNNER_DISPATCH_POLL_MS", "5000"), 10);
	const dispatchIdleLimit = Number.parseInt(str("KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT", "3"), 10);

	return {
		backendUrl,
		installRoot: str("KAINBAIN_RUNNER_INSTALL_ROOT", ""),
		updateUrl,
		autoUpdate,
		updateCheckIntervalMs:
			Number.isFinite(updateCheckIntervalMs) && updateCheckIntervalMs >= 300000
				? updateCheckIntervalMs
				: 3600000,
		joinToken: str("KAINBAIN_RUNNER_JOIN_TOKEN", ""),
		credential: str("KAINBAIN_RUNNER_CREDENTIAL", ""),
		runnerId,
		harnessId,
		harnessIds,
		harnessAuto,
		model: cleanedSingularModel,
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
		modelDiscoveryIntervalMs:
			Number.isFinite(modelDiscoveryIntervalMs) && modelDiscoveryIntervalMs >= 0
				? modelDiscoveryIntervalMs
				: 43200000,
		approvalPollMs: Number.isFinite(approvalPollMs) && approvalPollMs > 0 ? approvalPollMs : 5000,
		approvalTimeoutMs:
			Number.isFinite(approvalTimeoutMs) && approvalTimeoutMs > 0 ? approvalTimeoutMs : 300000,
		errors,
	};
}
