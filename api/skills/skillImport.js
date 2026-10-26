/***
 * MARK: skillImport
 * @description Pure, side-effect-free validation for skill imports: turns an
 *   uploaded `.md` file (or a pre-parsed zip entry list) into install-ready
 *   skill candidates WITHOUT touching the filesystem. The route layer
 *   (`api/routes/skills.js`) calls these normalizers first, runs `planInstall`
 *   against the live registry names, and only then writes anything — so every
 *   validation failure leaves the project overlay untouched.
 *
 *   Normalization (never silent — every fallback lands in `warnings[]`):
 *   - slug: explicit `name` override > frontmatter `name` > sanitized filename
 *   - description: frontmatter > first `#` heading > `Custom skill '<slug>'`
 *   The returned `markdown` always carries normalized frontmatter (`name` +
 *   `description`), so an installed import validates cleanly under
 *   `buildDescriptor`.
 * @example const { name, markdown, warnings, error } = normalizeMarkdownImport(buffer, 'guide.md')
 ***/

import {
	SKILL_NAME_PATTERN,
	MAX_SKILL_MARKDOWN_CHARS,
	MAX_SKILL_CONFIG_CHARS,
	parseSkillFrontmatter,
	parseSkillConfig,
} from "./skillsRegistry.js";

/***
 * MARK: sanitizeSlugStem
 * @description Collapses an arbitrary filename stem into a skill-slug shape:
 *   lowercase, runs of non-alphanumerics become one `-`, leading/trailing
 *   dashes trimmed. Returns '' when nothing slug-like remains.
 * @example sanitizeSlugStem('My Cool Guide!') => 'my-cool-guide'
 * @param {string} stem
 * @returns {string}
 ***/
export function sanitizeSlugStem(stem) {
	if (typeof stem !== "string") return "";
	return stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/***
 * MARK: stemOf
 * @description The filename stem (basename minus its last extension) used for
 *   slug derivation: `guide.md` -> `guide`, `my-pack.zip` -> `my-pack`.
 * @example stemOf('my-pack.zip') => 'my-pack'
 * @param {string} filename
 * @returns {string}
 ***/
export function stemOf(filename) {
	const base = String(filename || "")
		.split("/")
		.pop()
		.split("\\")
		.pop();
	const dot = base.lastIndexOf(".");
	return dot > 0 ? base.slice(0, dot) : base;
}

/***
 * MARK: deriveSkillName
 * @description Derives the install slug for one import: an explicit `name`
 *   override wins (and must already be a valid slug), else a valid
 *   frontmatter `name`, else the sanitized filename stem.
 * @example deriveSkillName({ frontmatterName: 'guide', filenameStem: 'x' }) => { name: 'guide', error: null }
 * @param {Object} opts
 * @param {string} [opts.explicitName] - Operator-supplied slug override.
 * @param {string} [opts.frontmatterName] - Frontmatter `name` value, if any.
 * @param {string} [opts.filenameStem] - Fallback stem (file/folder name).
 * @returns {{ name: string|null, error: string|null }}
 ***/
export function deriveSkillName({
	explicitName,
	frontmatterName,
	filenameStem,
} = {}) {
	const explicit = typeof explicitName === "string" ? explicitName.trim() : "";
	if (explicit) {
		if (!SKILL_NAME_PATTERN.test(explicit)) {
			return {
				name: null,
				error: `Name '${explicit}' is not a valid skill slug (lowercase letters, digits, dashes)`,
			};
		}
		return { name: explicit, error: null };
	}
	const front = typeof frontmatterName === "string" ? frontmatterName.trim() : "";
	if (front) {
		if (!SKILL_NAME_PATTERN.test(front)) {
			return {
				name: null,
				error: `Frontmatter name '${front}' is not a valid skill slug (lowercase letters, digits, dashes)`,
			};
		}
		return { name: front, error: null };
	}
	const slug = sanitizeSlugStem(filenameStem || "");
	if (!slug || !SKILL_NAME_PATTERN.test(slug)) {
		return {
			name: null,
			error:
				"Could not derive a skill name: add frontmatter 'name' or pass a valid 'name'",
		};
	}
	return { name: slug, error: null };
}

/***
 * MARK: firstHeading
 * @description The first `#` heading's text in a markdown body (the
 *   description fallback when frontmatter has none). Returns '' when the body
 *   has no heading.
 * @example firstHeading('# Guide\nBody') => 'Guide'
 * @param {string} body
 * @returns {string}
 ***/
export function firstHeading(body) {
	if (typeof body !== "string") return "";
	for (const line of body.split("\n")) {
		const match = line.match(/^#{1,6}\s+(.+)$/);
		if (match) return match[1].trim().slice(0, 200);
	}
	return "";
}

/***
 * MARK: yamlScalar
 * @description Renders one frontmatter scalar so the normalized SKILL.md
 *   re-parses under `parseSkillFrontmatter`: bare when the value is plain,
 *   double-quoted (JSON escaping) otherwise. The parser strips one layer of
 *   surrounding quotes, so exotic values survive with their meaning intact.
 * @example yamlScalar('plain words') => 'plain words'
 * @param {string} value
 * @returns {string}
 ***/
export function yamlScalar(value) {
	const text = String(value ?? "");
	if (/^[A-Za-z0-9][A-Za-z0-9 _.,!?()/'-]*$/.test(text)) return text;
	return JSON.stringify(text);
}

/***
 * MARK: withNormalizedFrontmatter
 * @description Rebuilds SKILL.md markdown with normalized frontmatter: `name`
 *   (the install slug) first, `description` second, then every other original
 *   frontmatter key in order, then the untouched body. Guarantees the
 *   installed file passes `buildDescriptor`'s name/description checks.
 * @example withNormalizedFrontmatter({ a: '1' }, 'body', 'guide', 'A guide') => '---\nname: guide\n...'
 * @param {Object} frontmatter - Parsed original frontmatter.
 * @param {string} body - Markdown body after the frontmatter block.
 * @param {string} name - Install slug.
 * @param {string} description - Resolved description.
 * @returns {string}
 ***/
export function withNormalizedFrontmatter(frontmatter, body, name, description) {
	const lines = ["---", `name: ${yamlScalar(name)}`, `description: ${yamlScalar(description)}`];
	for (const [key, value] of Object.entries(frontmatter || {})) {
		if (key === "name" || key === "description") continue;
		if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
		lines.push(`${key}: ${yamlScalar(String(value ?? ""))}`);
	}
	lines.push("---");
	const text = String(body || "");
	return `${lines.join("\n")}\n${text.startsWith("\n") ? text.slice(1) : text}`;
}

/***
 * MARK: normalizeMarkdownImport
 * @description Validates + normalizes one uploaded `.md` file into an
 *   install-ready candidate: cap check, slug derivation, description
 *   fallbacks, and rebuilt frontmatter. Pure: returns
 *   `{ name, markdown, description, warnings, error }` — `error` set means
 *   the import must be rejected and nothing may be written.
 * @example normalizeMarkdownImport('# Guide\n...', 'guide.md') => { name: 'guide', markdown: '---\n...', ... }
 * @param {Buffer|string} input - Raw file bytes or text.
 * @param {string} filename - Original upload filename (slug fallback + messages).
 * @param {Object} [opts]
 * @param {string} [opts.explicitName] - Operator-supplied slug override.
 * @returns {{ name: string|null, markdown: string|null, description: string, warnings: Array<string>, error: string|null }}
 ***/
export function normalizeMarkdownImport(input, filename, { explicitName } = {}) {
	const warnings = [];
	const text = Buffer.isBuffer(input) ? input.toString("utf8") : String(input ?? "");
	if (!text.trim()) {
		return {
			name: null,
			markdown: null,
			description: "",
			warnings,
			error: `'${filename}' is empty`,
		};
	}
	if (text.length > MAX_SKILL_MARKDOWN_CHARS) {
		return {
			name: null,
			markdown: null,
			description: "",
			warnings,
			error: `'${filename}' is ${text.length} chars (max ${MAX_SKILL_MARKDOWN_CHARS})`,
		};
	}

	const { frontmatter, body } = parseSkillFrontmatter(text);
	const { name, error } = deriveSkillName({
		explicitName,
		frontmatterName:
			typeof frontmatter.name === "string" ? frontmatter.name : "",
		filenameStem: stemOf(filename),
	});
	if (error) {
		return { name: null, markdown: null, description: "", warnings, error };
	}

	const explicit = typeof explicitName === "string" ? explicitName.trim() : "";
	const frontName =
		typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
	if (explicit && frontName && explicit !== frontName) {
		warnings.push(`Frontmatter name '${frontName}' overridden by '${explicit}'`);
	} else if (!frontName) {
		warnings.push(`Skill name '${name}' derived from the filename (no frontmatter 'name')`);
	}

	let description =
		typeof frontmatter.description === "string"
			? frontmatter.description.trim()
			: "";
	if (!description) {
		const heading = firstHeading(body);
		if (heading) {
			description = heading;
			warnings.push(`Description taken from the '# ${heading}' heading (no frontmatter 'description')`);
		} else {
			description = `Custom skill '${name}'`;
			warnings.push("No description found — using a generated placeholder");
		}
	}

	if (!body.trim()) {
		warnings.push("Markdown body is empty (frontmatter only)");
	}

	return {
		name,
		markdown: withNormalizedFrontmatter(frontmatter, body, name, description),
		description,
		warnings,
		error: null,
	};
}

/***
 * MARK: zipSlipError
 * @description The rejection reason when a zip entry path escapes the archive
 *   (absolute path, drive letter, or a `..` segment) — or null when safe.
 * @example zipSlipError('../evil.md') => "Zip entry '../evil.md' escapes the archive (rejected)"
 * @param {string} entryPath - Normalized (`/`-separated) entry path.
 * @returns {string|null}
 ***/
export function zipSlipError(entryPath) {
	const entry = String(entryPath || "");
	if (!entry || entry.startsWith("/") || /^[A-Za-z]:/.test(entry)) {
		return `Zip entry '${entry}' escapes the archive (rejected)`;
	}
	if (entry.split("/").includes("..")) {
		return `Zip entry '${entry}' escapes the archive (rejected)`;
	}
	return null;
}

/***
 * MARK: isSilentZipNoise
 * @description Whether a zip entry is packager noise (`__MACOSX/`, `.DS_Store`)
 *   that is ignored WITHOUT a warning. Every other non-skill file is ignored
 *   WITH a warning so nothing else disappears silently.
 * @example isSilentZipNoise('__MACOSX/._SKILL.md') => true
 * @param {string} entryPath
 * @returns {boolean}
 ***/
export function isSilentZipNoise(entryPath) {
	const entry = String(entryPath || "");
	return (
		entry.startsWith("__MACOSX/") ||
		entry.endsWith("/.DS_Store") ||
		entry === ".DS_Store"
	);
}

/***
 * MARK: normalizeZipImport
 * @description Validates + normalizes a pre-parsed zip entry list into
 *   install-ready skill candidates. Single-skill v1 layouts only: (a)
 *   `SKILL.md` at the zip root, or (b) exactly one top-level `<folder>/`
 *   holding `SKILL.md` — each with an optional sibling `KB_config.json`.
 *   Pure: returns `{ skills, errors }` — a non-empty `errors` means the whole
 *   import must be rejected and nothing may be written.
 * @example normalizeZipImport([{ path: 'SKILL.md', bytes }], 'pack.zip') => { skills: [{ name, markdown, ... }], errors: [] }
 * @param {Array<{path: string, bytes: Buffer}>} entries - Pre-parsed file entries.
 * @param {string} filename - Original upload filename (messages + root-layout slug fallback).
 * @param {Object} [opts]
 * @param {string} [opts.explicitName] - Operator-supplied slug override.
 * @returns {{ skills: Array<{name: string, markdown: string, description: string, configRaw: string|null, warnings: Array<string>}>, errors: Array<string> }}
 ***/
export function normalizeZipImport(entries, filename, { explicitName } = {}) {
	const list = Array.isArray(entries) ? entries : [];

	// 1. Zip-slip guard over EVERY raw path before anything else.
	for (const entry of list) {
		const slip = zipSlipError(entry?.path);
		if (slip) return { skills: [], errors: [slip] };
	}

	// 2. Classify: skill files vs config files vs ignored noise.
	const skillFiles = [];
	const configByDir = new Map();
	const ignored = [];
	for (const entry of list) {
		const entryPath = String(entry?.path || "");
		if (isSilentZipNoise(entryPath)) continue;
		const segments = entryPath.split("/").filter(Boolean);
		const base = segments[segments.length - 1] || "";
		const dir = segments.slice(0, -1).join("/");
		if (base === "SKILL.md") {
			skillFiles.push({ dir, bytes: entry.bytes, path: entryPath });
		} else if (base === "KB_config.json") {
			if (!configByDir.has(dir)) configByDir.set(dir, entry);
		} else {
			ignored.push(entryPath);
		}
	}

	// 3. Single-skill layout detection.
	if (skillFiles.length === 0) {
		return {
			skills: [],
			errors: [
				`'${filename}' contains no SKILL.md (expected one at the zip root or inside a single <skill-name>/ folder)`,
			],
		};
	}
	const hasRoot = skillFiles.some((file) => file.dir === "");
	const folderDirs = [...new Set(skillFiles.map((file) => file.dir))].filter(
		(dir) => dir !== "",
	);
	if (hasRoot && folderDirs.length > 0) {
		return {
			skills: [],
			errors: [
				`'${filename}' has SKILL.md both at the root and in folders (ambiguous — keep exactly one)`,
			],
		};
	}
	if (folderDirs.length > 1) {
		return {
			skills: [],
			errors: [
				`'${filename}' holds ${folderDirs.length} skills (${folderDirs.join(", ")}) — v1 imports one skill per zip`,
			],
		};
	}
	const skillDir = hasRoot ? "" : folderDirs[0];
	if (skillDir.split("/").filter(Boolean).length > 1) {
		return {
			skills: [],
			errors: [
				`'${filename}' keeps SKILL.md nested at '${skillDir}/' (v1 accepts the zip root or one top-level folder)`,
			],
		};
	}
	const skillFile = skillFiles.find((file) => file.dir === skillDir);

	// 4. Authoritative skill caps (the zip adapter enforces transport caps;
	// these are the registry's own char caps, enforced standalone).
	const markdownText = Buffer.isBuffer(skillFile.bytes)
		? skillFile.bytes.toString("utf8")
		: String(skillFile.bytes ?? "");
	if (markdownText.length > MAX_SKILL_MARKDOWN_CHARS) {
		return {
			skills: [],
			errors: [
				`'${skillFile.path}' is ${markdownText.length} chars (max ${MAX_SKILL_MARKDOWN_CHARS})`,
			],
		};
	}
	const configEntry = configByDir.get(skillDir) || null;
	let configRaw = null;
	if (configEntry) {
		configRaw = Buffer.isBuffer(configEntry.bytes)
			? configEntry.bytes.toString("utf8")
			: String(configEntry.bytes ?? "");
		if (configRaw.length > MAX_SKILL_CONFIG_CHARS) {
			return {
				skills: [],
				errors: [
					`'${configEntry.path}' is ${configRaw.length} chars (max ${MAX_SKILL_CONFIG_CHARS})`,
				],
			};
		}
	}

	// 5. Markdown normalization (slug/description fallbacks + warnings).
	const virtualName =
		skillDir === "" ? filename : `${skillDir.split("/").pop()}.md`;
	const normalized = normalizeMarkdownImport(markdownText, virtualName, {
		explicitName,
	});
	if (normalized.error) {
		return { skills: [], errors: [normalized.error] };
	}

	const warnings = [...normalized.warnings];
	const strayConfigs = [...configByDir.keys()].filter((dir) => dir !== skillDir);
	for (const dir of strayConfigs) {
		warnings.push(
			`Ignored KB_config.json in '${dir || "zip root"}' (belongs to no imported skill)`,
		);
	}
	for (const ignoredPath of ignored) {
		warnings.push(`Ignored '${ignoredPath}' (only SKILL.md and KB_config.json are imported)`);
	}
	if (configRaw !== null) {
		const { error: configError } = parseSkillConfig(configRaw);
		if (configError) {
			warnings.push(
				`KB_config.json is not valid JSON — the skill will be listed as invalid (${configError})`,
			);
		}
	}

	return {
		skills: [
			{
				name: normalized.name,
				markdown: normalized.markdown,
				description: normalized.description,
				configRaw,
				warnings,
			},
		],
		errors: [],
	};
}

/***
 * MARK: planInstall
 * @description Pure install decision for normalized candidates: fails closed
 *   on any normalization error, maps name clashes to 409 conflicts (unless
 *   `overwrite`), and flags global-name shadowing as a visible warning
 *   (allowed — the overlay model defines the semantics).
 * @example planInstall({ skills: [{ name: 'g' }], errors: [], existingNames: [], globalNames: ['g'] })
 * @param {Object} opts
 * @param {Array<Object>} [opts.skills] - Normalized candidates.
 * @param {Array<string>} [opts.errors] - Normalization errors (fail closed).
 * @param {Array<string>} [opts.existingNames] - Names already in the project overlay.
 * @param {Array<string>} [opts.globalNames] - Names in the global library.
 * @param {boolean} [opts.overwrite=false] - Explicit overwrite consent.
 * @returns {{ ok: boolean, skills: Array<Object>, errors: Array<string>, conflicts: Array<string> }}
 ***/
export function planInstall({
	skills = [],
	errors = [],
	existingNames = [],
	globalNames = [],
	overwrite = false,
} = {}) {
	if (errors.length > 0) {
		return { ok: false, skills: [], errors: [...errors], conflicts: [] };
	}
	const conflicts = [];
	for (const skill of skills) {
		if (existingNames.includes(skill.name) && !overwrite) {
			conflicts.push(skill.name);
		}
	}
	if (conflicts.length > 0) {
		return {
			ok: false,
			skills: [],
			errors: conflicts.map(
				(name) => `Skill '${name}' already exists (pass overwrite=true to replace it)`,
			),
			conflicts,
		};
	}
	return {
		ok: true,
		skills: skills.map((skill) => {
			const shadowedGlobal = globalNames.includes(skill.name);
			return {
				...skill,
				shadowedGlobal,
				warnings: shadowedGlobal
					? [...skill.warnings, `Skill '${skill.name}' shadows a KainBain default skill`]
					: [...skill.warnings],
			};
		}),
		errors: [],
		conflicts: [],
	};
}
