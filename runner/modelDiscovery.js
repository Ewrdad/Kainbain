import { spawnSync } from "node:child_process";

/***
 * MARK: discoverClaudeModels
 * @description Lists the models the installed `muse` CLI can serve, by
 *   asking it over its own MSP wire protocol (`muse serve` stdio):
 *   `initialize` → `initialized` → `model/list` (no session needed). Uses
 *   the box's own login, so the runner never reads keys or calls provider
 *   billing APIs — only model ids come back. Rows map to the fleet id
 *   grammar `muse::<providerId>::<modelId>` (e.g.
 *   `muse::meta::muse-spark-1.3`); malformed rows are skipped, ids deduped.
 *   Best-effort: any failure (missing CLI, timeout, unparsable output)
 *   resolves to `[]`, never throws, so discovery can never break boot.
 * @example await discoverClaudeModels() => ['muse::meta::muse-spark-1.3']
 * @param {Object} [opts]
 * @param {string} [opts.bin='muse'] - CLI binary to spawn.
 * @param {number} [opts.timeoutMs=20000] - Whole round-trip budget.
 * @param {Function} [opts.spawnSyncFn=spawnSync] - Test seam.
 * @returns {Promise<string[]>} Discovered catalogue ids (possibly empty).
 ***/
export async function discoverClaudeModels({ bin = "muse", timeoutMs = 20000, spawnSyncFn = spawnSync } = {}) {
	const messages = [
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "kainbain", version: "0.1.0" } } },
		{ jsonrpc: "2.0", method: "initialized", params: {} },
		{ jsonrpc: "2.0", id: 2, method: "model/list", params: {} },
	].map((m) => `${JSON.stringify(m)}\n`).join("");
	let res;
	try {
		res = spawnSyncFn(bin, ["serve", "--no-session-log"], { input: messages, timeout: timeoutMs, encoding: "utf8" });
	} catch {
		return [];
	}
	if (!res || res.error || typeof res.stdout !== "string") return [];
	const ids = [];
	for (const line of res.stdout.split("\n")) {
		const text = line.trim();
		if (!text.startsWith("{")) continue;
		let msg;
		try {
			msg = JSON.parse(text);
		} catch {
			continue;
		}
		const rows = msg?.result?.models;
		if (!Array.isArray(rows)) continue;
		for (const row of rows) {
			const provider = typeof row?.providerId === "string" ? row.providerId.trim() : "";
			const model = typeof row?.modelId === "string" ? row.modelId.trim() : "";
			if (!provider || !model || provider.includes(":") || model.includes(":")) continue;
			const id = `muse::${provider}::${model}`;
			if (!ids.includes(id)) ids.push(id);
		}
	}
	return ids;
}

/***
 * MARK: resolveAdvertisedModels
 * @description Picks the model list a heartbeat advertises: survey q4 says
 *   auto-detect wins, so a non-empty discovery cache replaces the
 *   operator's explicit `config.models`/`config.model` pin; the pin only
 *   fills in when discovery yielded nothing yet (fallback, never a
 *   restriction). Empty everywhere means unpinned (matches model-less
 *   tasks only) — never invents a capability.
 * @example resolveAdvertisedModels({ models: ['a'] }, ['b']) => ['b']
 * @param {Object} [config] - Runner config (`models` array / `model`).
 * @param {string[]} [discovered] - Last discovery result.
 * @returns {string[]} Advertised model ids.
 ***/
export function resolveAdvertisedModels(config, discovered) {
	if (Array.isArray(discovered) && discovered.length > 0) return [...discovered];
	if (Array.isArray(config?.models) && config.models.length > 0) return [...config.models];
	if (typeof config?.model === "string" && config.model.trim()) return [config.model.trim()];
	return [];
}

/***
 * MARK: MODEL_DISCOVERY_INTERVAL_MS_DEFAULT
 * @description Default model-discovery cadence: every 12 hours. Discovery
 *   is a periodic refresh, not a per-heartbeat probe — model menus change
 *   slowly and each round-trip spawns the harness CLI.
 ***/
export const MODEL_DISCOVERY_INTERVAL_MS_DEFAULT = 12 * 60 * 60 * 1000;
