import os from "node:os";
import path from "node:path";

/***
 * MARK: resolveStatePath
 * @description Resolves one durable state file path.
 * @example resolveStatePath('/x.json', null, 's.json') => '/x.json'
 * @param {string} [explicit] - Explicit path (tests win).
 * @param {string} [configured] - Schema-configured path (env).
 * @param {string} fallbackName - File name under `~/.kainbain/engine/`.
 * @returns {string} Resolved path.
 ***/
export function resolveStatePath(explicit, configured, fallbackName) {
	if (typeof explicit === "string" && explicit.trim()) return explicit;
	if (typeof configured === "string" && configured.trim()) return configured;
	return path.join(os.homedir(), ".kainbain", "engine", fallbackName);
}

