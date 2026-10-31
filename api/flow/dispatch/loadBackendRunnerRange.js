import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/***
 * MARK: loadBackendRunnerRange
 * @description Loads the backend's accepted Runner API range from
 *   api/version.json (`accepts.runner`, DA1). Missing/invalid yields null.
 * @example loadBackendRunnerRange() => '>=1.0.0 <2.0.0'
 * @returns {string|null}
 ***/
export function loadBackendRunnerRange() {
	try {
		const file = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
			"..",
			"version.json",
		);
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		const range = parsed?.accepts?.runner;
		return typeof range === "string" && range.trim() ? range.trim() : null;
	} catch {
		return null;
	}
}
