import path from "node:path";
import fs from "node:fs";
import { resolveProjectConfigPath, isValidKainbainDirName } from "../kainbainDir.js";

/***
 * MARK: _isKainbainConfig
 * @description Whether a parsed JSON object matches the shape of a KainBain
 *   project config: either its `cwd` matches the project directory, or it
 *   carries an id and stages / workflows / kainbainDirName. Coincidental
 *   `project.json` files from other tooling (e.g. NX, Angular) are ignored.
 * @param {unknown} parsed
 * @param {string} projectDir
 * @returns {boolean}
 * @private
 ***/
export function _isKainbainConfig(parsed, projectDir) {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
	if (
		typeof parsed.cwd === "string" &&
		path.resolve(parsed.cwd) === path.resolve(projectDir)
	) {
		return true;
	}
	if (
		typeof parsed.id === "string" &&
		(Array.isArray(parsed.stages) ||
			Array.isArray(parsed.workflows) ||
			typeof parsed.kainbainDirName === "string")
	) {
		return true;
	}
	return false;
}

/***
 * MARK: _findProjectConfigFile
 * @description Locates a project's `project.json`, honouring custom state
 *   folders. A self-describing custom folder wins when present: the
 *   immediate child directories are scanned in sorted order for a
 *   `project.json` that both names this directory as its `cwd` and whose
 *   `kainbainDirName` matches the folder it lives in. That outranks the
 *   default `<dir>/.kainbain/project.json`, so a setting change is not
 *   silently reverted on the next restart while a stale default config
 *   lingers. When no self-describing config exists the default wins (zero
 *   behavior change for existing and legacy projects); a moved checkout whose
 *   config has no persisted name is then chosen by cwd, else first parseable
 *   config matching a KainBain shape. Bounded to one level and to files
 *   literally named `project.json`, so a large checkout never triggers a deep
 *   walk. `.git` and `node_modules` are never candidates.
 * @example _findProjectConfigFile('/repo') => '/repo/.kainbain/project.json'
 * @param {string} projectDir
 * @returns {string|null}
 ***/
export function _findProjectConfigFile(projectDir) {
	if (!projectDir || typeof projectDir !== "string") return null;
	const fallback = resolveProjectConfigPath(projectDir, {});
	let defaultExists = false;
	try {
		defaultExists = !!(fallback && fs.existsSync(fallback));
	} catch {
		defaultExists = false;
	}
	let firstCandidate = null;
	let cwdCandidate = null;
	let selfDescribingCandidate = null;
	try {
		const entries = fs
			.readdirSync(projectDir, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			if (entry.name === ".kainbain") continue;
			const candidate = path.join(projectDir, entry.name, "project.json");
			let parsed = null;
			try {
				if (!fs.existsSync(candidate)) continue;
				parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
			} catch {
				continue;
			}
			if (!_isKainbainConfig(parsed, projectDir)) continue;
			const cwdMatch =
				typeof parsed.cwd === "string" &&
				path.resolve(parsed.cwd) === path.resolve(projectDir);
			// Self-describing: the config names this directory as its cwd *and*
			// its persisted state-folder name is the folder it was found in.
			const selfDescribing =
				cwdMatch &&
				typeof parsed.kainbainDirName === "string" &&
				parsed.kainbainDirName.trim() === entry.name &&
				isValidKainbainDirName(entry.name, parsed);
			if (selfDescribing && !selfDescribingCandidate) {
				selfDescribingCandidate = candidate;
			}
			if (cwdMatch && !cwdCandidate) cwdCandidate = candidate;
			if (!firstCandidate) firstCandidate = candidate;
		}
	} catch {
		// Unreadable directory: fall back to the default config below.
	}
	// A self-describing custom folder outranks the default (see marker doc).
	if (selfDescribingCandidate) return selfDescribingCandidate;
	if (defaultExists) return fallback;
	return cwdCandidate || firstCandidate;
}
