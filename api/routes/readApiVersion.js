import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/***
 * MARK: readApiVersion
 * @description Loads the backend API version from api/version.json (the only
 *   API-version source, DA1). Loaded once at module load; a missing or
 *   invalid file yields null, never a crash.
 * @example readApiVersion() => '1.0.0'
 * @returns {string|null}
 ***/
export function readApiVersion() {
	try {
		const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "version.json");
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		return typeof parsed?.apiVersion === "string" && /^\d+\.\d+\.\d+$/.test(parsed.apiVersion)
			? parsed.apiVersion
			: null;
	} catch {
		return null;
	}
}
