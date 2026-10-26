#!/usr/bin/env node
/***
 * MARK: generate-env-example.mjs
 * @description Renders the root `.env.example` from the config schema
 *   (`api/config/schema.js`), grouped by concern. The schema is the single
 *   source of truth — never hand-edit the generated file. A committed test
 *   (`api/config/config.test.js`) fails when the file drifts from this
 *   generator's output.
 *
 * Usage:
 *   node scripts/generate-env-example.mjs        # rewrite .env.example
 *
 * @example node scripts/generate-env-example.mjs
 ***/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_GROUPS, CONFIG_SCHEMA } from "../api/config/schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_EXAMPLE_PATH = path.join(HERE, "..", ".env.example");

/***
 * MARK: formatDefaultValue
 * @description Formats a literal schema default for an env line: booleans as
 *   true/false words, numbers plain, strings raw.
 * @example formatDefaultValue(true) => 'true'
 ***/
function formatDefaultValue(value) {
	if (typeof value === "boolean") return value ? "true" : "false";
	return String(value);
}

/***
 * MARK: describeType
 * @description Short type/constraint label for the per-variable comment.
 * @example describeType({ type: "int", min: 1, max: 65535 }) => 'int 1-65535'
 ***/
function describeType(entry) {
	switch (entry.type) {
		case "int":
		case "float": {
			if (entry.min !== undefined && entry.max !== undefined) {
				return `${entry.type} ${entry.min}-${entry.max}`;
			}
			if (entry.min !== undefined) return `${entry.type} >= ${entry.min}`;
			if (entry.max !== undefined) return `${entry.type} <= ${entry.max}`;
			return entry.type;
		}
		case "enum":
			return `one of ${entry.values.join(" | ")}`;
		case "bool":
			return "1/true/yes/on or 0/false/no/off";
		default:
			return entry.type;
	}
}

/***
 * MARK: renderEntry
 * @description Renders one schema entry as comment lines plus its env line.
 *   Secrets, null defaults, empty defaults, and computed defaults render
 *   commented-out; literal defaults render as active `VAR=value` lines.
 * @example renderEntry({ env: "PORT", type: "int", default: 3100, ... }) => '# ...\nPORT=3100\n'
 ***/
function renderEntry(entry) {
	const lines = [];
	lines.push(`# ${entry.doc}`);
	const fallback = entry.default;
	const isRef = fallback !== null && typeof fallback === "object" && fallback.ref;
	if (isRef) {
		const target = CONFIG_SCHEMA.find((candidate) => candidate.key === fallback.ref);
		lines.push(`# Default: value of ${target ? target.env : fallback.ref} (unset to follow it).`);
	} else if (typeof fallback === "function") {
		lines.push(`# Default: ${entry.defaultDoc || "(computed)"}.`);
	} else if (entry.type !== "string" || fallback === null) {
		lines.push(`# Type: ${describeType(entry)}.`);
	}
	if (entry.secret) {
		lines.push(`# Secret: never commit a real value; redacted in GET /status/config.`);
		lines.push(`# ${entry.env}=`);
		return `${lines.join("\n")}\n`;
	}
	if (fallback === null || fallback === "" || (Array.isArray(fallback) && fallback.length === 0)) {
		lines.push(`# ${entry.env}=`);
		return `${lines.join("\n")}\n`;
	}
	if (typeof fallback === "function" || isRef) {
		lines.push(`# ${entry.env}=`);
		return `${lines.join("\n")}\n`;
	}
	lines.push(`${entry.env}=${formatDefaultValue(fallback)}`);
	return `${lines.join("\n")}\n`;
}

/***
 * MARK: renderEnvExample
 * @description Renders the full `.env.example` text from the schema.
 * @example renderEnvExample().includes("PORT=3100") => true
 * @returns {string} The file text (trailing newline included).
 ***/
export function renderEnvExample() {
	const lines = [
		"# KainBain environment template.",
		"# GENERATED — do not hand-edit. Regenerate with: node scripts/generate-env-example.mjs",
		"# Copy to .env (or export from your shell / systemd unit) and adjust.",
		"# Note: the API does not auto-load a .env file; in dev run",
		"# `node --env-file=.env api/index.js`, in production provide variables",
		"# via the shell or systemd. Unset values fall back to the defaults below.",
		"",
	];
	for (const group of CONFIG_GROUPS) {
		lines.push(`# --- ${group.title} ---`);
		for (const entry of CONFIG_SCHEMA.filter((candidate) => candidate.group === group.id)) {
			lines.push(renderEntry(entry).trimEnd());
		}
		lines.push("");
	}
	const aliased = CONFIG_SCHEMA.filter((entry) => (entry.aliases || []).length > 0);
	if (aliased.length > 0) {
		lines.push("# --- Deprecated aliases (do not use in new setups) ---");
		lines.push("# These still work but warn at boot; prefer the canonical names above.");
		for (const entry of aliased) {
			for (const alias of entry.aliases) {
				lines.push(`# ${alias} is deprecated, use ${entry.env}.`);
				lines.push(`# ${alias}=`);
			}
		}
		lines.push("");
	}
	return `${lines.join("\n")}`.replace(/\n{3,}/g, "\n\n");
}

/***
 * MARK: main
 * @description Writes the rendered template to the repo-root `.env.example`.
 * @example await main() // rewrites ../.env.example
 ***/
async function main() {
	const text = renderEnvExample();
	fs.writeFileSync(ENV_EXAMPLE_PATH, text);
	console.log(`Wrote ${ENV_EXAMPLE_PATH} (${CONFIG_SCHEMA.length} variables).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
