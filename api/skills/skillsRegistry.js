/***
 * MARK: skillsRegistry
 * @description Pure filesystem registry for *stage skills*: user-authored packages of
 *   `SKILL.md` (YAML frontmatter + markdown body) plus an optional, tolerant
 *   `KB_config.json`. A stage can attach any number of these packages and the prompt
 *   engine injects them (see skillInjection.js).
 *
 * Skill package contract (folder layout, inside the global library dir or a project's
 * `<projectRoot>/skills/` overlay):
 *
 *   <skill-name>/
 *     SKILL.md          # ---\nname: <slug>\ndescription: ...\n---\nmarkdown body
 *     KB_config.json    # optional, tolerant: unknown fields are preserved, never executed
 *
 * Non-declarative tolerance (KB Architecture): unknown KB_config fields are parsed,
 * preserved on the descriptor, and ignored by the engine. An invalid KB_config.json
 * never throws — the skill is listed with `invalid: true` + a parse error instead.
 *
 * Shadowing: a project-overlay skill with the same `name` shadows the global one
 *   for prompt injection (`loadSkill` prefers the overlay), while listing
 *   (`mergeSkillSources`) retains both rows so the UI can show the custom row
 *   with a `Shadows default` badge next to the untouched default.
 *
 * @example import { listSkills, loadSkill } from './skills/skillsRegistry.js'
 ***/

import fs from "node:fs";
import path from "node:path";
import { isPathSafe } from "../routes/files.js";
import { config as appConfig } from "../config.js";

/***
 * MARK: SKILL_NAME_PATTERN
 * @description Skill name slug pattern. Folder names and frontmatter `name` must match.
 * @example SKILL_NAME_PATTERN.test('creating-new-tickets') => true
 ***/
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Max chars for a SKILL.md body — larger files are rejected as invalid (never read whole). */
export const MAX_SKILL_MARKDOWN_CHARS = 256 * 1024;

/** Max chars for a KB_config.json — larger files are rejected as invalid. */
export const MAX_SKILL_CONFIG_CHARS = 64 * 1024;

/** Authoritative delivery modes for a stage skill. */
export const SKILL_MODES = ["direct", "option"];

/***
 * MARK: normalizeSkillMode
 * @description Coerces a requested delivery mode to the authoritative set
 *   ('direct' | 'option'), falling back to `fallbackMode` (default 'direct').
 * @example normalizeSkillMode('OPTION') => 'option'
 * @param {string} [mode]
 * @param {string} [fallbackMode='direct']
 * @returns {'direct'|'option'}
 ***/
export function normalizeSkillMode(mode, fallbackMode = "direct") {
	if (
		typeof mode === "string" &&
		SKILL_MODES.includes(mode.trim().toLowerCase())
	) {
		return /** @type {'direct'|'option'} */ (mode.trim().toLowerCase());
	}
	return SKILL_MODES.includes(fallbackMode) ? fallbackMode : "direct";
}

/***
 * MARK: parseSkillFrontmatter
 * @description Minimal, dependency-free frontmatter parser for SKILL.md files.
 *   Accepts the pi-skill format: an optional leading `---` block of top-level
 *   `key: value` pairs (values may be quoted; continuation lines that are more
 *   indented than their key append to the previous value). Everything after the
 *   closing `---` is the markdown body.
 * @example parseSkillFrontmatter('---\nname: a\n---\n# Body') =>
 *   { frontmatter: { name: 'a' }, body: '# Body' }
 * @param {string} markdown
 * @returns {{ frontmatter: Object, body: string }}
 ***/
export function parseSkillFrontmatter(markdown) {
	const empty = { frontmatter: {}, body: markdown || "" };
	if (typeof markdown !== "string") return empty;

	const normalized = markdown.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---")) return empty;

	const lines = normalized.split("\n");
	if (lines[0].trim() !== "---") return empty;

	const frontmatter = {};
	let i = 1;
	let lastKey = null;
	/* eslint-disable security/detect-object-injection -- lastKey is validated by the ^[A-Za-z0-9_-]+$ frontmatter regex above */
	for (; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "---" || line.trim() === "...") {
			i += 1;
			break;
		}
		const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (kv) {
			lastKey = kv[1].trim();
			let value = kv[2].trim();
			if (
				(value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
				(value.startsWith("'") && value.endsWith("'") && value.length >= 2)
			) {
				value = value.slice(1, -1);
			}
			frontmatter[lastKey] = value;
		} else if (lastKey && line.trim() && /^\s+/.test(line)) {
			// Multi-line continuation: append this (de-indented) line to the previous value.
			frontmatter[lastKey] = `${frontmatter[lastKey]}\n${line.trim()}`;
		} else if (line.trim() === "") {
			continue;
		} else {
			// Not a frontmatter pair and not a continuation — treat as body start.
			break;
		}
	}
	/* eslint-enable security/detect-object-injection */

	return { frontmatter, body: lines.slice(i).join("\n") };
}

/***
 * MARK: parseSkillConfig
 * @description Parses an optional KB_config.json with non-declarative tolerance:
 *   missing file => empty config; invalid JSON => error captured, never thrown.
 *   The known optional fields are `description`, `keywords`, `context`,
 *   `defaults.mode`; every other field is preserved as-is and ignored by the engine.
 * @example parseSkillConfig('{"keywords":{"a":{"value":"b"}}}') => { config: {...}, error: null }
 * @param {string|null} rawJson
 * @returns {{ config: Object, error: string|null }}
 ***/
export function parseSkillConfig(rawJson) {
	if (rawJson === null || rawJson === undefined || rawJson === "") {
		return { config: {}, error: null };
	}
	if (typeof rawJson !== "string") {
		return { config: {}, error: "KB_config.json is not readable text" };
	}
	try {
		const parsed = JSON.parse(rawJson);
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { config: {}, error: "KB_config.json must be a JSON object" };
		}
		return { config: parsed, error: null };
	} catch (err) {
		return { config: {}, error: `KB_config.json parse error: ${err.message}` };
	}
}

/***
 * MARK: normalizeSkillKeywords
 * @description Normalizes the KB_config `keywords` map. Each entry may be a plain
 *   string (the value) or `{ value, description }`. Keys are returned in a stable
 *   plain-object map usable for prompt interpolation.
 * @example normalizeSkillKeywords({ a: 'x', b: { value: 'y' } }) => { a: 'x', b: 'y' }
 * @param {Object} [keywords]
 * @returns {Object}
 ***/
export function normalizeSkillKeywords(keywords) {
	const map = {};
	if (!keywords || typeof keywords !== "object" || Array.isArray(keywords)) {
		return map;
	}
	for (const [key, entry] of Object.entries(keywords)) {
		if (typeof entry === "string") {
			map[key] = entry;
		} else if (
			(typeof entry === "number" && Number.isFinite(entry)) ||
			typeof entry === "boolean"
		) {
			map[key] = String(entry);
		} else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
			if (typeof entry.value === "string") {
				map[key] = entry.value;
			} else if (
				(typeof entry.value === "number" && Number.isFinite(entry.value)) ||
				typeof entry.value === "boolean"
			) {
				map[key] = String(entry.value);
			}
		}
	}
	return map;
}

/***
 * MARK: skillPathForName
 * @description Resolves the SKILL.md path for a skill name inside a skills dir,
 *   enforcing the slug pattern and a traversal-safe join.
 * @example skillDirForName('/lib/skills', 'creating-new-tickets') => '/lib/skills/creating-new-tickets/SKILL.md'
 * @param {string} skillsDir
 * @param {string} name
 * @returns {string|null} The SKILL.md path, or null when the name is not a safe slug.
 ***/
export function skillPathForName(skillsDir, name) {
	if (!skillsDir || typeof name !== "string" || !SKILL_NAME_PATTERN.test(name)) {
		return null;
	}
	const resolvedDir = path.resolve(skillsDir);
	const skillDir = path.join(resolvedDir, name);
	const skillFile = path.join(skillDir, "SKILL.md");
	// Guard against traversal / symlink escape before any filesystem read.
	if (!isPathSafe(resolvedDir, skillDir, [resolvedDir])) return null;
	return skillFile;
}

/***
 * MARK: scanSkillDir
 * @description Scans one skills directory returning raw descriptors for every
 *   `<name>/SKILL.md` package found. Read errors on a single entry never throw —
 *   they are captured on that entry. Pure (no caching).
 * @example scanSkillDir('/lib/skills') => [{ name: 'a', path: '/lib/skills/a/SKILL.md', ... }]
 * @param {string} skillsDir
 * @param {string} source - 'global' | 'project' provenance label.
 * @returns {Array<Object>}
 ***/
export function scanSkillDir(skillsDir, source = "global") {
	if (!skillsDir || typeof skillsDir !== "string") return [];
	const resolvedDir = path.resolve(skillsDir);
	/* eslint-disable security/detect-non-literal-fs-filename -- configured skills root */
	let entries;
	try {
		entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
	} catch {
		return []; // Missing or unreadable library dir is not an error condition.
	}
	/* eslint-enable security/detect-non-literal-fs-filename */

	const descriptors = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
		if (!SKILL_NAME_PATTERN.test(entry.name)) continue;

		const skillDir = path.join(resolvedDir, entry.name);
		const skillFile = path.join(skillDir, "SKILL.md");
		/* eslint-disable security/detect-non-literal-fs-filename -- configured skills root */
		try {
			if (!fs.existsSync(skillFile) || !fs.statSync(skillFile).isFile()) continue;
			const markdown = fs.readFileSync(skillFile, "utf8");
			/* eslint-enable security/detect-non-literal-fs-filename */
			const descriptor = buildDescriptor({
				name: entry.name,
				skillsDir: resolvedDir,
				source,
				markdown,
			});
			descriptors.push(descriptor);
		} catch (err) {
			descriptors.push({
				name: entry.name,
				source,
				path: skillFile,
				description: "",
				hasConfig: false,
				config: {},
				keywords: {},
				markdown: null,
				markdownChars: 0,
				invalid: true,
				error: `SKILL.md unreadable: ${err.message}`,
			});
		}
	}
	return descriptors;
}

/***
 * MARK: buildDescriptor
 * @description Builds a skill descriptor from raw markdown content: frontmatter
 *   parse, KB_config tolerance, and validation flags. Exported for tests.
 * @param {Object} opts
 * @param {string} opts.name - Skill slug (folder name).
 * @param {string} opts.skillsDir - Absolute skills root the folder lives in.
 * @param {string} [opts.source='global'] - 'global' | 'project'.
 * @param {string} [opts.markdown=''] - Raw SKILL.md content.
 * @returns {Object} Descriptor with name/description/config/keywords and validity flags.
 ***/
export function buildDescriptor({
	name,
	skillsDir,
	source = "global",
	markdown = "",
}) {
	const skillFile = path.join(path.resolve(skillsDir), name, "SKILL.md");
	const configFile = path.join(path.resolve(skillsDir), name, "KB_config.json");
	const descriptor = {
		name,
		source,
		path: skillFile,
		configPath: configFile,
		description: "",
		hasConfig: false,
		config: {},
		keywords: {},
		markdown: null,
		markdownChars: 0,
		invalid: false,
		error: null,
		body: "",
	};

	const errors = [];
	if (typeof markdown !== "string" || markdown.length === 0) {
		descriptor.invalid = true;
		descriptor.error = "SKILL.md is empty or unreadable";
		return descriptor;
	}
	if (markdown.length > MAX_SKILL_MARKDOWN_CHARS) {
		descriptor.invalid = true;
		descriptor.error = `SKILL.md exceeds the ${MAX_SKILL_MARKDOWN_CHARS} char cap`;
		return descriptor;
	}

	const { frontmatter, body } = parseSkillFrontmatter(markdown);
	descriptor.body = body;
	const frontName =
		typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
	if (!frontName) {
		errors.push("frontmatter is missing a 'name' field");
	} else if (!SKILL_NAME_PATTERN.test(frontName)) {
		errors.push(`frontmatter name '${frontName}' is not a valid slug`);
	} else if (frontName !== name) {
		errors.push(
			`frontmatter name '${frontName}' does not match folder name '${name}'`,
		);
	}

	const description =
		typeof frontmatter.description === "string"
			? frontmatter.description.trim()
			: "";
	if (!description) {
		errors.push("frontmatter is missing a 'description' field");
	}

	// Optional, tolerant KB_config.json.
	/* eslint-disable security/detect-non-literal-fs-filename -- configured skills root */
	let rawConfig = null;
	try {
		if (fs.existsSync(configFile)) {
			const stat = fs.statSync(configFile);
			if (stat.isFile()) {
				if (stat.size > MAX_SKILL_CONFIG_CHARS) {
					errors.push(
						`KB_config.json exceeds the ${MAX_SKILL_CONFIG_CHARS} char cap`,
					);
				} else {
					rawConfig = fs.readFileSync(configFile, "utf8");
					descriptor.hasConfig = true;
				}
			}
		}
	} catch (err) {
		errors.push(`KB_config.json unreadable: ${err.message}`);
	}
	/* eslint-enable security/detect-non-literal-fs-filename */

	const { config: parsedConfig, error: configError } =
		parseSkillConfig(rawConfig);
	if (configError) errors.push(configError);

	descriptor.description = description || descriptor.description;
	descriptor.config = parsedConfig;
	if (
		typeof parsedConfig.description === "string" &&
		parsedConfig.description.trim()
	) {
		// KB_config description is an optional UI/manifest override.
		descriptor.description = parsedConfig.description.trim();
	}
	descriptor.keywords = normalizeSkillKeywords(parsedConfig.keywords);
	descriptor.markdownChars = markdown.length;
	if (errors.length > 0) {
		descriptor.invalid = true;
		descriptor.error = errors.join("; ");
	}
	return descriptor;
}

/***
 * MARK: sameResolvedDir
 * @description Compares two directory paths for physical equality, accounting for
 *   trailing slashes, `.`/`..` segments, and symlinks (via realpathSync when
 *   both paths exist). Returns false for falsy or non-string inputs.
 *   Why: When KainBain manages itself in its own repository, the project skills folder
 *   and the global library point to the exact same physical directory. Detecting this
 *   prevents duplicate scanning and preserves global provenance for default skills.
 * @example sameResolvedDir({ firstDirectoryPath: '/a/skills', secondDirectoryPath: '/a/skills/' }) => true
 * @example sameResolvedDir({ firstDirectoryPath: '/a/skills', secondDirectoryPath: '/b/skills' }) => false
 * @param {Object} [input] - Labelled directory paths to compare.
 * @param {string} [input.firstDirectoryPath] - First directory path.
 * @param {string} [input.secondDirectoryPath] - Second directory path.
 * @returns {boolean} True if both paths resolve to the same physical directory on disk.
 ***/
export function sameResolvedDir(input = {}) {
	const { firstDirectoryPath, secondDirectoryPath } =
		input && typeof input === "object" && !Array.isArray(input) ? input : {};

	if (
		typeof firstDirectoryPath !== "string" ||
		typeof secondDirectoryPath !== "string" ||
		!firstDirectoryPath.trim() ||
		!secondDirectoryPath.trim()
	) {
		return false;
	}
	try {
		const resolvedFirstRealPath = fs.realpathSync(firstDirectoryPath);
		const resolvedSecondRealPath = fs.realpathSync(secondDirectoryPath);
		return resolvedFirstRealPath === resolvedSecondRealPath;
	} catch {
		try {
			return (
				path.resolve(firstDirectoryPath) === path.resolve(secondDirectoryPath)
			);
		} catch {
			return false;
		}
	}
}

/***
 * MARK: isDistinctOverlay
 * @description Whether a project overlay directory exists and is distinct from
 *   the global skills library directory (and therefore should be scanned as a
 *   separate source). False when there is no overlay, when either path is
 *   missing, or when the two resolve to the same physical directory.
 *   Why: Avoids scanning the same folder twice and mislabelling default skills as project skills.
 *   Why false for a missing overlay: there is nothing extra to scan, so callers
 *   skip the project source entirely (fail safe, no throw).
 * @example isDistinctOverlay({ skillsDir: '/lib/skills', projectSkillsDir: '/lib/skills' }) => false
 * @example isDistinctOverlay({ skillsDir: '/lib/skills', projectSkillsDir: '/proj/skills' }) => true
 * @example isDistinctOverlay({ skillsDir: '/lib/skills', projectSkillsDir: null }) => false
 * @param {Object} [input] - Labelled directory paths to compare.
 * @param {string} [input.skillsDir] - Global skills library directory path.
 * @param {string|null} [input.projectSkillsDir] - Project overlay skills directory path.
 * @returns {boolean} True only when the overlay exists and resolves elsewhere than the global library.
 ***/
export function isDistinctOverlay(input = {}) {
	const { skillsDir, projectSkillsDir } =
		input && typeof input === "object" && !Array.isArray(input) ? input : {};

	if (
		typeof skillsDir !== "string" ||
		!skillsDir.trim() ||
		typeof projectSkillsDir !== "string" ||
		!projectSkillsDir.trim()
	) {
		return false;
	}
	return !sameResolvedDir({
		firstDirectoryPath: skillsDir,
		secondDirectoryPath: projectSkillsDir,
	});
}

/***
 * MARK: mergeSkillSources
 * @description Merges global and project skill descriptors for listing.
 *   Both entries are retained even when the project overlay shadows a default by
 *   name, so the user interface can render both rows (the custom row carries a
 *   "Shadows default" badge and the original stays under KainBain defaults).
 *   Ordering is stable: project entries first (alphabetical), then global entries (alphabetical).
 *   Why: Allows operators to see both the built-in default and the custom override in Settings.
 * @example mergeSkillSources({ globalSkills: globalList, projectSkills: projectList })
 * @param {Object} [input] - Labelled skill arrays to merge.
 * @param {Array<Object>} [input.globalSkills] - Skills from the global library (source: "global").
 * @param {Array<Object>} [input.projectSkills] - Skills from the project overlay (source: "project").
 * @returns {Array<Object>} Combined skills array with project skills first, then global skills.
 ***/
export function mergeSkillSources(input = {}) {
	const { globalSkills, projectSkills } =
		input && typeof input === "object" && !Array.isArray(input) ? input : {};

	const safeProjectSkills = Array.isArray(projectSkills) ? projectSkills : [];
	const safeGlobalSkills = Array.isArray(globalSkills) ? globalSkills : [];

	const sortedProjectSkills = [...safeProjectSkills].sort(
		(firstItem, secondItem) =>
			String(firstItem?.name ?? "").localeCompare(
				String(secondItem?.name ?? ""),
			),
	);
	const sortedGlobalSkills = [...safeGlobalSkills].sort(
		(firstItem, secondItem) =>
			String(firstItem?.name ?? "").localeCompare(
				String(secondItem?.name ?? ""),
			),
	);
	return [...sortedProjectSkills, ...sortedGlobalSkills];
}

/***
 * MARK: listSkills
 * @description Lists the available stage skills from the global library plus an
 *   optional project overlay. Both rows are retained when the overlay shadows
 *   a default by name (injection still prefers the overlay via `loadSkill`).
 *   When the overlay resolves to the same directory as the library, it is
 *   skipped so shipped skills keep their `global` provenance. No caching here —
 *   callers that need TTL caching should use SkillsRegistry.
 * @example listSkills({ skillsDir: '/lib/skills', projectSkillsDir: null })
 * @param {Object} [opts]
 * @param {string} [opts.skillsDir] - Global skills library dir (defaults to config.skillsDir).
 * @param {string|null} [opts.projectSkillsDir=null] - Optional `<projectRoot>/skills` overlay.
 * @returns {Array<Object>} Merged, shadowed descriptors.
 ***/
export function listSkills({
	skillsDir = appConfig.skillsDir,
	projectSkillsDir = null,
} = {}) {
	const globalSkills = scanSkillDir(skillsDir, "global");
	// When the overlay resolves to the same physical directory as the global
	// library (e.g. KainBain managing its own repo), skip it entirely so the
	// shipped skills keep their `global` provenance.
	const hasDistinctOverlay = isDistinctOverlay({ skillsDir, projectSkillsDir });
	const projectSkills = hasDistinctOverlay
		? scanSkillDir(projectSkillsDir, "project")
		: [];
	return mergeSkillSources({ globalSkills, projectSkills });
}

/***
 * MARK: loadSkill
 * @description Loads a single skill's full content (markdown body + parsed config)
 *   by name, preferring the project overlay. Returns `null` when the skill does
 *   not exist anywhere; returns an `invalid` descriptor when it exists but is
 *   unreadable/oversized. Never throws.
 * @example loadSkill({ name: 'creating-new-tickets', skillsDir, projectSkillsDir })
 * @param {Object} opts
 * @param {string} opts.name - Skill slug.
 * @param {string} [opts.skillsDir] - Global skills library dir.
 * @param {string|null} [opts.projectSkillsDir=null] - Optional project overlay.
 * @returns {Object|null} `{ name, source, path, description, markdown, config, keywords, invalid?, error? }`
 ***/
export function loadSkill({
	name,
	skillsDir = appConfig.skillsDir,
	projectSkillsDir = null,
} = {}) {
	if (typeof name !== "string" || !name.trim()) return null;
	const safeName = name.trim();

	const loadFrom = (dir, source) => {
		const skillFile = skillPathForName(dir, safeName);
		if (!skillFile) return undefined;
		/* eslint-disable security/detect-non-literal-fs-filename -- path validated above */
		if (!fs.existsSync(skillFile)) return undefined;
		try {
			const markdown = fs.readFileSync(skillFile, "utf8");
			/* eslint-enable security/detect-non-literal-fs-filename */
			const descriptor = buildDescriptor({
				name: safeName,
				skillsDir: dir,
				source,
				markdown,
			});
			descriptor.markdown = markdown;
			return descriptor;
		} catch (err) {
			return {
				name: safeName,
				source,
				path: skillFile,
				description: "",
				hasConfig: false,
				config: {},
				keywords: {},
				markdown: null,
				markdownChars: 0,
				invalid: true,
				error: `SKILL.md unreadable: ${err.message}`,
			};
		}
	};

	const hasDistinctOverlay = isDistinctOverlay({ skillsDir, projectSkillsDir });
	if (hasDistinctOverlay) {
		const overlay = loadFrom(projectSkillsDir, "project");
		if (overlay) return overlay;
	}
	return loadFrom(skillsDir, "global") || null;
}

/***
 * MARK: SkillsRegistry
 * @description TTL-cached registry for stage skills over listSkills and loadSkill.
 *   One instance per API process (api/index.js) so route handlers and the prompt
 *   engine share a single cache.
 *   Per-project overlay dirs are resolved relative to the project cwd on every call,
 *   and every scan is re-validated against directory mtimes + the TTL, so dropped-in
 *   skill folders appear without a restart.
 ***/
export class SkillsRegistry {
	/***
	 * MARK: constructor
	 * @param {Object} [opts]
	 * @param {string} [opts.skillsDir] - Global skills library dir (defaults to config.skillsDir).
	 * @param {number} [opts.cacheTtlMs] - Directory scan cache TTL (defaults to config.skillsCacheTtlMs).
	 ***/
	constructor({ skillsDir, cacheTtlMs } = {}) {
		this.skillsDir = skillsDir || appConfig.skillsDir;
		this.cacheTtlMs =
			typeof cacheTtlMs === "number" ? cacheTtlMs : appConfig.skillsCacheTtlMs;
		this._cache = new Map(); // "<source>::<dir>" -> { at, skills }
	}

	_projectSkillsDir(projectCwd) {
		if (!projectCwd || typeof projectCwd !== "string") return null;
		return path.join(path.resolve(projectCwd), "skills");
	}

	_scanCached(dir, source) {
		if (!dir) return [];
		// Why the source is part of the key: descriptors carry their
		// provenance label (`source`), so a scan cached as "project" must
		// never be served to a "global" caller (or vice versa), even if two
		// configured paths ever resolve to the same directory string.
		const cacheKey = `${source}::${dir}`;
		const now = Date.now();
		const cached = this._cache.get(cacheKey);
		if (cached && now - cached.at < this.cacheTtlMs) {
			return cached.skills;
		}
		const skills = scanSkillDir(dir, source);
		this._cache.set(cacheKey, { at: now, skills });
		return skills;
	}

	/***
	 * MARK: invalidate
	 * @description Drops all cached directory scans (used by tests and admin flows).
	 ***/
	invalidate() {
		this._cache.clear();
	}

	/***
	 * MARK: listSkills
	 * @description Lists the merged global + project skills for (optionally) a project cwd.
	 * @param {Object} [opts]
	 * @param {string|null} [opts.projectCwd=null]
	 * @returns {Array<Object>}
	 ***/
	listSkills({ projectCwd = null } = {}) {
		const globalSkills = this._scanCached(this.skillsDir, "global");
		const projectSkillsDir = this._projectSkillsDir(projectCwd);
		// Skip the overlay entirely when it resolves to the same physical
		// directory as the global library (self-managed KainBain).
		const hasDistinctOverlay = isDistinctOverlay({
			skillsDir: this.skillsDir,
			projectSkillsDir,
		});
		const projectSkills = hasDistinctOverlay
			? this._scanCached(projectSkillsDir, "project")
			: [];
		return mergeSkillSources({ globalSkills, projectSkills });
	}

	/***
	 * MARK: getSkill
	 * @description Loads one skill by name (project overlay wins). Returns null when unknown.
	 * @param {string} name
	 * @param {Object} [opts]
	 * @param {string|null} [opts.projectCwd=null]
	 * @returns {Object|null}
	 ***/
	getSkill(name, { projectCwd = null } = {}) {
		const projectSkillsDir = this._projectSkillsDir(projectCwd);
		const hasDistinctOverlay = isDistinctOverlay({
			skillsDir: this.skillsDir,
			projectSkillsDir,
		});
		return loadSkill({
			name,
			skillsDir: this.skillsDir,
			projectSkillsDir: hasDistinctOverlay ? projectSkillsDir : null,
		});
	}
}

/** Default process-wide registry (routes + prompt engine share this cache). */
export const skillsRegistry = new SkillsRegistry();

export default skillsRegistry;
