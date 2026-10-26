#!/usr/bin/env node
/***
 * MARK: migrate-model-refs.mjs
 * @description OPTIONAL one-shot batch migration for stored model references:
 *   rewrites legacy provider-scoped references (`provider::id`) in project
 *   stores to the canonical harness-scoped form (`harness::provider::id`),
 *   using the shared model-key grammar. Bare ids, names, and the "default"
 *   sentinel are left untouched (they stay valid everywhere), and values that
 *   are already harness-scoped pass through unchanged.
 *
 *   DRY-RUN BY DEFAULT: nothing is written unless `--write` is passed. Every
 *   candidate change is printed first. Runtime code does NOT need this script
 *   — all resolvers accept every reference form; this only shortens legacy
 *   strings in displays.
 *
 * Usage:
 *   node scripts/migrate-model-refs.mjs --root /path/to/project            # dry run (default)
 *   node scripts/migrate-model-refs.mjs --root /a --root /b --write        # apply
 *   node scripts/migrate-model-refs.mjs --root /a --harness pi             # harness override
 *
 * What it scans: `<root>/.kainbain/project.json` (plus any nested
 * `.kainbain/project.json` under the root) — the `defaultModel` field and
 * every `model` field on stages (both the legacy top-level `stages` shape and
 * the current `workflows[*].stages` shape). Task markdown files carry no
 * model references, so they are not touched.
 ***/

import path from "node:path";
import fs from "node:fs";
import { parseModelKey, harnessModelKey } from "../shared/modelKeys.js";

const args = process.argv.slice(2);
const getArgs = (name) => {
	const values = [];
	const idx = args.indexOf(name);
	while (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) {
		values.push(args[idx + 1]);
		args.splice(idx, 2);
	}
	return values;
};

const roots = getArgs("--root");
const harness = getArgs("--harness")[0] || "pi";
const write = args.includes("--write");

if (roots.length === 0) {
	console.error(
		"Usage: node scripts/migrate-model-refs.mjs --root <projectDir> [--root <more>] [--harness pi] [--write]",
	);
	console.error(
		"Dry run by default — pass --write to rewrite the files it reports.",
	);
	process.exit(1);
}

if (!/^[a-z0-9][a-z0-9_-]*$/.test(harness)) {
	console.error(
		`Invalid harness id '${harness}': must match [a-z0-9][a-z0-9_-]*`,
	);
	process.exit(1);
}

/***
 * MARK: migrateModelRefs
 * @description Rewrites every legacy `provider::id` model reference in a
 *   parsed project store object to its harness-scoped canonical form.
 * @example migrateModelRefs({ defaultModel: 'p::i', workflows: [...] }) => { changed: true, refs: 2 }
 * @param {Object} data - Parsed project.json content (mutated in place).
 * @param {string} harnessId - Harness id injected into legacy references.
 * @returns {{changed: boolean, refs: number, skipped: number}} Migration summary.
 ***/
function migrateModelRefs(data, harnessId) {
	let refs = 0;
	let skipped = 0;
	const migrate = (value) => {
		if (!value || typeof value !== "string") return value;
		const parsed = parseModelKey(value);
		if (parsed && parsed.form === "provider") {
			refs++;
			return harnessModelKey(harnessId, parsed.provider, parsed.id);
		}
		skipped++;
		return value; // bare / already-canonical / sentinel — untouched
	};

	let changed = false;
	const before = JSON.stringify(data);
	if (data.defaultModel) {
		data.defaultModel = migrate(data.defaultModel);
	}
	for (const workflow of data.workflows || []) {
		for (const stage of workflow.stages || []) {
			if (stage.model) stage.model = migrate(stage.model);
		}
	}
	for (const stage of data.stages || []) {
		if (stage.model) stage.model = migrate(stage.model);
	}
	changed = JSON.stringify(data) !== before;
	return { changed, refs, skipped };
}

function* findProjectStores(roots) {
	for (const root of roots) {
		const direct = path.join(root, ".kainbain", "project.json");
		if (fs.existsSync(direct)) {
			yield direct;
		}
		/* eslint-disable security/detect-non-literal-fs-filename -- operator-provided scan roots */
		for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
			const nested = path.join(root, entry.name, ".kainbain", "project.json");
			if (fs.existsSync(nested)) {
				yield nested;
			}
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	}
}

let scanned = 0;
let migrated = 0;
let errors = 0;

for (const storePath of findProjectStores(roots)) {
	scanned++;
	let data;
	try {
		data = JSON.parse(fs.readFileSync(storePath, "utf8"));
	} catch (err) {
		errors++;
		console.error(`[SKIP] ${storePath}: not valid JSON (${err.message})`);
		continue;
	}
	const { changed, refs, skipped } = migrateModelRefs(data, harness);
	if (!changed) {
		console.log(
			`[OK]   ${storePath}: nothing to migrate (${skipped} refs already fine)`,
		);
		continue;
	}
	migrated++;
	console.log(
		`${write ? "[WROTE]" : "[DRY]"} ${storePath}: ${refs} reference(s) → ${harness}::provider::id`,
	);
	if (write) {
		fs.writeFileSync(storePath, `${JSON.stringify(data, null, 2)}\n`);
	}
}

console.log(
	`project stores: ${scanned} scanned under ${roots.join(", ")}, ${migrated} ${
		write ? "rewritten" : "would be rewritten (dry run)"
	}, ${errors} error(s)`,
);
if (!write && migrated > 0) {
	console.log("Re-run with --write to apply.");
}
