import { spawnSync } from "node:child_process";

/***
 * MARK: throwClassifiedMuseProbeFailure
 * @description Throws one muse `serve` probe failure as a classified error
 *   (`{ code, message, hint }` in the backend catalogue's `MUSE_MSP_*`
 *   vocabulary), so strict callers land a named cause in the discovery
 *   status slot instead of a bare Error. Lenient callers never reach here.
 * @example throwClassifiedMuseProbeFailure('MUSE_MSP_TIMEOUT', 'timed out', 'retry')
 * @param {string} failureCode - Stable status-slot code.
 * @param {string} failureMessage - Human-readable cause.
 * @param {string} [fixHint] - Operator fix, shown in Settings.
 ***/
function throwClassifiedMuseProbeFailure(failureCode, failureMessage, fixHint = "") {
	const failure = new Error(failureMessage);
	failure.code = failureCode;
	failure.hint = fixHint;
	throw failure;
}

/***
 * MARK: describeMuseSpawnFailure
 * @description Sorts one failed `muse serve` spawn into the classified
 *   `{code,message,hint}` the strict probe throws: a missing binary
 *   (ENOENT on spawn or on a thrown error) reads as `MUSE_MSP_BIN_MISSING`
 *   with the install fix; a killed/timed-out child reads as
 *   `MUSE_MSP_TIMEOUT`; anything else reads as
 *   `MUSE_MSP_DISCOVERY_FAILED` with the run-it-by-hand hint. Pure
 *   classifier — no spawning, safe to unit-test with fake results.
 * @example describeMuseSpawnFailure({ spawnError: Object.assign(new Error('spawn muse ENOENT'), { code: 'ENOENT' }), bin: 'muse' }).code => 'MUSE_MSP_BIN_MISSING'
 * @param {Object} [opts] - Labelled inputs.
 * @param {unknown} [opts.spawnError] - `result.error` or the thrown spawn error.
 * @param {Object} [opts.spawnResult] - Full spawn result (for killed/timed-out signals).
 * @param {string} [opts.bin] - Binary the probe attempted (named in messages).
 * @returns {{code: string, message: string, hint: string}} Classified failure.
 ***/
function describeMuseSpawnFailure({ spawnError, spawnResult, bin } = {}) {
	const attemptedBinary = typeof bin === "string" && bin ? bin : "muse";
	const detail = String(spawnError?.message || spawnError || "unknown error");
	if (/ENOENT/i.test(detail) || spawnError?.code === "ENOENT") {
		return {
			code: "MUSE_MSP_BIN_MISSING",
			message: `The muse CLI was not found ('${attemptedBinary}' is not runnable).`,
			hint: "Install the Muse CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_MUSE_BIN to its absolute path.",
		};
	}
	const timedOut =
		/ETIMEDOUT|timed out/i.test(detail) ||
		spawnError?.code === "ETIMEDOUT" ||
		(spawnResult?.status === null && typeof spawnResult?.signal === "string");
	if (timedOut) {
		return {
			code: "MUSE_MSP_TIMEOUT",
			message: `The muse serve probe timed out (${detail.trim().slice(-200)}).`,
			hint: "The host may be hanging — retry; a persistent hang means the muse install needs attention.",
		};
	}
	return {
		code: "MUSE_MSP_DISCOVERY_FAILED",
		message: `The muse serve probe failed (${detail.trim().slice(-300)}).`,
		hint: "Run 'muse serve --provider echo' by hand to see the full error.",
	};
}

/***
 * MARK: discoverClaudeModels
 * @description Lists the models the installed `muse` CLI can serve, by
 *   asking it over its own MSP wire protocol (`muse serve` stdio):
 *   `initialize` → `initialized` → `model/list` (no session needed). Uses
 *   the box's own login, so the runner never reads keys or calls provider
 *   billing APIs — only model ids come back. Rows map to the fleet id
 *   grammar `muse::<providerId>::<modelId>` (e.g.
 *   `muse::meta::muse-spark-1.3`); malformed rows are skipped, ids deduped.
 *   The spawn mirrors the backend MSP probe (same `--provider` default and
 *   handshake shape, `api/agent/harnesses/muse/msp/museMspSupport.js`), so
 *   the runner leg and the backend catalogue read the same host the same
 *   way — a provider the host must be told about (`meta` by default) is
 *   passed explicitly instead of relying on the CLI's implicit default.
 *   Lenient by default: any failure (missing CLI, timeout, unparsable
 *   output) resolves to `[]`, never throws, so discovery can never break
 *   boot. Strict mode (`strict: true`, used by the discovery leg) throws
 *   the same classified `MUSE_MSP_*` failures the backend catalogue
 *   reports, so an empty scan lands a named cause in Settings instead of
 *   a silent zero. A CLI that answers `model/list` with zero rows still
 *   resolves to `[]` in both modes — the leg reports that as
 *   `MUSE_MSP_MODELS_EMPTY`.
 * @example await discoverClaudeModels() => ['muse::meta::muse-spark-1.3']
 * @example await discoverClaudeModels({ strict: true }) // throws MUSE_MSP_BIN_MISSING when the CLI is missing
 * @param {Object} [opts]
 * @param {string} [opts.bin='muse'] - CLI binary to spawn.
 * @param {number} [opts.timeoutMs=20000] - Whole round-trip budget.
 * @param {Function} [opts.spawnSyncFn=spawnSync] - Test seam.
 * @param {boolean} [opts.strict=false] - Throw classified failures instead of resolving `[]`.
 * @param {string} [opts.provider='meta'] - Provider passed as `--provider` (the backend MSP default).
 * @param {string[]} [opts.args] - Full argv override after the binary (test seam; defaults to the serve plan).
 * @returns {Promise<string[]>} Discovered catalogue ids (possibly empty).
 ***/
export async function discoverClaudeModels({ bin = "muse", timeoutMs = 20000, spawnSyncFn = spawnSync, strict = false, provider = "meta", args } = {}) {
	const messages = [
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "kainbain", version: "1.0.0" }, capabilities: {} } },
		{ jsonrpc: "2.0", method: "initialized", params: {} },
		{ jsonrpc: "2.0", id: 2, method: "model/list", params: {} },
	].map((m) => `${JSON.stringify(m)}\n`).join("");
	const serveArgs = Array.isArray(args) && args.length > 0
		? [...args]
		: ["serve", "--provider", String(provider || "meta"), "--no-session-log"];
	let res;
	try {
		res = spawnSyncFn(bin, serveArgs, { input: messages, timeout: timeoutMs, encoding: "utf8" });
	} catch (spawnError) {
		if (!strict) return [];
		const classified = describeMuseSpawnFailure({ spawnError, bin });
		throwClassifiedMuseProbeFailure(classified.code, classified.message, classified.hint);
	}
	if (!res || res.error || typeof res.stdout !== "string") {
		if (!strict) return [];
		const classified = describeMuseSpawnFailure({ spawnError: res?.error, spawnResult: res, bin });
		throwClassifiedMuseProbeFailure(classified.code, classified.message, classified.hint);
	}
	const ids = [];
	let answeredModelList = false;
	let reportedServeError = "";
	for (const line of res.stdout.split("\n")) {
		const text = line.trim();
		if (!text.startsWith("{")) continue;
		let msg;
		try {
			msg = JSON.parse(text);
		} catch {
			continue;
		}
		if (msg && typeof msg === "object" && msg.error && !reportedServeError) {
			const serveDetail = String(msg.error?.message || msg.error?.code || "").trim().slice(-300);
			if (serveDetail) reportedServeError = serveDetail;
		}
		const rows = msg?.result?.models;
		if (!Array.isArray(rows)) continue;
		answeredModelList = true;
		for (const row of rows) {
			const provider = typeof row?.providerId === "string" ? row.providerId.trim() : "";
			const model = typeof row?.modelId === "string" ? row.modelId.trim() : "";
			// Grammar-aligned with parseModelKey: segments must be
			// non-empty and free of the `::` separator — single `:`
			// inside an id (muse-spark-1.4:cloud) is legal and served.
			if (!provider || !model || provider.includes("::") || model.includes("::")) continue;
			const id = `muse::${provider}::${model}`;
			if (!ids.includes(id)) ids.push(id);
		}
	}
	// The CLI ran but never answered model/list (old CLI without the
	// method, crashed host, foreign stdout): lenient callers read that as
	// "nothing usable", strict callers get the named failure.
	if (!answeredModelList && strict) {
		const reported = reportedServeError ? ` The host reported: ${reportedServeError}.` : "";
		throwClassifiedMuseProbeFailure(
			"MUSE_MSP_DISCOVERY_FAILED",
			`The muse CLI ran but did not answer model/list.${reported}`,
			"Check the muse version supports 'muse serve', or run 'muse serve --provider echo' by hand to see the full error.",
		);
	}
	return ids;
}

/***
 * MARK: resolveAdvertisedModels
 * @description Picks the model list a heartbeat advertises. Default is
 *   pin-UNION-discovered (survey q2 — a newly detected harness model must
 *   appear automatically): the operator's explicit `config.models` /
 *   `config.model` pin is always advertised, and every grammar-validated
 *   discovered id joins it, so a brand-new model (e.g. a fresh Muse
 *   release) is selectable without editing the pin — while the pin itself
 *   can never be lost to a broken scan (upgrade-safe). Opt in to
 *   discovery-wins with `config.modelDiscoveryWins` (env
 *   `KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1`): a non-empty discovery cache
 *   then replaces the pin, and the pin only fills in when discovery
 *   yielded nothing yet. Empty everywhere means unpinned (matches
 *   model-less tasks only) — never invents a capability.
 * @example resolveAdvertisedModels({ models: ['a'] }, ['b']) => ['a', 'b']
 * @example resolveAdvertisedModels({ models: ['a'], modelDiscoveryWins: true }, ['b']) => ['b']
 * @param {Object} [config] - Runner config (`models` array / `model` / `modelDiscoveryWins`).
 * @param {string[]} [discovered] - Last discovery result.
 * @returns {string[]} Advertised model ids.
 ***/
export function resolveAdvertisedModels(config, discovered) {
	const discoveredIds = Array.isArray(discovered) ? [...discovered] : [];
	const pinnedModels = Array.isArray(config?.models) && config.models.length > 0 ? [...config.models] : null;
	const pinnedModel = typeof config?.model === "string" && config.model.trim() ? [config.model.trim()] : null;
	const pin = pinnedModels ?? pinnedModel ?? [];
	if (config?.modelDiscoveryWins) {
		if (discoveredIds.length > 0) return discoveredIds;
		return pin;
	}
	// Default: pin ∪ discovered (pin order first, discovered ids appended
	// deduped) — the pin is never dropped, discovery only adds.
	if (pin.length > 0) {
		const out = [...pin];
		for (const id of discoveredIds) {
			if (!out.includes(id)) out.push(id);
		}
		return out;
	}
	return discoveredIds;
}

/***
 * MARK: resolveAdvertisedModelSource
 * @description Names which list a heartbeat advertises: `pinned` (the
 *   operator's explicit `config.models`/`config.model` wins),
 *   `discovered` (the discovery cache fills in), or `unpinned` (empty
 *   everywhere — matches model-less tasks only). Mirrors
 *   `resolveAdvertisedModels` branch-for-branch so the label can never
 *   disagree with the advertised list; the backend surfaces it per
 *   runner so operators see WHY a model list looks the way it does.
 * @example resolveAdvertisedModelSource({ models: ['a'] }, ['b']) => 'pinned+discovered'
 * @example resolveAdvertisedModelSource({ models: ['a'] }, []) => 'pinned'
 * @example resolveAdvertisedModelSource({ models: ['a'], modelDiscoveryWins: true }, ['b']) => 'discovered'
 * @example resolveAdvertisedModelSource({}, []) => 'unpinned'
 * @param {Object} [config] - Runner config (`models` array / `model` / `modelDiscoveryWins`).
 * @param {string[]} [discovered] - Last discovery result.
 * @returns {"pinned"|"pinned+discovered"|"discovered"|"unpinned"} Effective advertisement source.
 ***/
export function resolveAdvertisedModelSource(config, discovered) {
	const discoveredIds = Array.isArray(discovered) ? discovered : [];
	const pinned =
		(Array.isArray(config?.models) && config.models.length > 0) ||
		(typeof config?.model === "string" && config.model.trim() !== "");
	if (config?.modelDiscoveryWins) {
		if (discoveredIds.length > 0) return "discovered";
		return pinned ? "pinned" : "unpinned";
	}
	if (pinned) return discoveredIds.length > 0 ? "pinned+discovered" : "pinned";
	return discoveredIds.length > 0 ? "discovered" : "unpinned";
}

/***
 * MARK: MODEL_DISCOVERY_INTERVAL_MS_DEFAULT
 * @description Default model-discovery cadence: every 12 hours. Discovery
 *   is a periodic refresh, not a per-heartbeat probe — model menus change
 *   slowly and each round-trip spawns the harness CLI.
 ***/
export const MODEL_DISCOVERY_INTERVAL_MS_DEFAULT = 12 * 60 * 60 * 1000;
