import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MARK: Harness boundary regression gate
 * @description Turns the harness architecture rule into a test: the pi SDK is
 *   imported ONLY inside the pi harness folder, and raw pi event names appear
 *   ONLY in the pi harness translation and the eventBridge legacy alias table.
 *   Everything else in the engine speaks the normalized agent-event vocabulary
 *   (api/agent/sessionEvents.js). If this test fails, the harness boundary has
 *   leaked and the next harness will inherit pi-specific assumptions.
 */

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PI_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "pi");
const AGY_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "antigravity");
const OPENCODE_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "opencode");
const MUSE_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "muse");
const CODEX_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "codex");
const VIBE_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "vibe");
const OPENCODE_SDK_MODULE = "@opencode-ai/sdk";

/** Distinctive vibe streaming wire markers that must never leak past the
 *  harness boundary. (`message`, `effect`, and `reasoning` are too generic
 *  to scan for — these envelope field names appear nowhere else in the
 *  engine and uniquely identify vibe wire handling.) */
const RAW_VIBE_WIRE_MARKERS = [
	"generationStatus",
	"userDisplayContent",
	"relatedEntryId",
	"inputEntryId",
];

/** Raw muse exec-stream payload_type names that must never leak past the harness boundary. */
const RAW_MUSE_PAYLOAD_TYPES = [
	"run.output.delta",
	"run.terminal.completed",
	"run.terminal.failed",
	"run.lifecycle.started",
	"tool.result",
	"task.lifecycle.output",
	"task.lifecycle.tool_output_ref",
];

/** Raw pi event names that must never leak past the harness boundary.
 *  (`error` is excluded — too generic to scan for.) */
const RAW_PI_EVENT_NAMES = [
	"message_update",
	"message_start",
	"tool_execution_start",
	"tool_execution_update",
	"tool_execution_end",
	"agent_start",
	"turn_start",
	"agent_end",
	"agent_settled",
	"turn_end",
	"agent_error",
];

// The SDK specifier is assembled from parts so the acceptance grep over the
// SDK module specifier keeps matching ONLY the pi harness folder — this test
// enforces that rule without itself referencing (or importing) the SDK.
/** Raw OpenCode event names that must never leak past the harness boundary.
 *  (`error` is excluded — too generic to scan for.) */
const RAW_OPENCODE_EVENT_NAMES = [
	"session.idle",
	"session.error",
	"session.status",
	"session.created",
	"session.updated",
	"session.deleted",
	"session.compacted",
	"message.updated",
	"message.removed",
	"message.part.updated",
	"message.part.removed",
];

const PI_SDK_SCOPE = "@earendil-works/";
const PI_SDK_PACKAGE = "pi-coding-agent";
const PI_SDK_MODULE = `${PI_SDK_SCOPE}${PI_SDK_PACKAGE}`;

/***
 * MARK: listEngineFiles
 * @description Walks the api directory returning every non-test .js file
 *   (engine code only — tests may deliberately speak either vocabulary).
 ***/
function listEngineFiles(dir) {
	const found = [];
	/* eslint-disable security/detect-non-literal-fs-filename -- walking the api tree this module lives in */
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			found.push(...listEngineFiles(full));
		} else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) {
			found.push(full);
		}
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
	return found;
}

/***
 * MARK: stripComments
 * @description Removes block and line comments so documentation tables that
 *   MENTION raw names (e.g. the vocabulary table in sessionEvents.js) do not
 *   trip the boundary scan — only executable code counts.
 ***/
function stripComments(source) {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("harness boundary (regression gate)", () => {
	const engineFiles = listEngineFiles(API_ROOT);

	it("discovers the engine files to scan", () => {
		expect(engineFiles.length).toBeGreaterThan(10);
	});

	it("imports the pi SDK only inside api/agent/harnesses/pi/", () => {
		const offenders = engineFiles.filter((file) => {
			if (file.startsWith(PI_HARNESS_DIR)) return false;
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			const source = fs.readFileSync(file, "utf8");
			return source.includes(PI_SDK_MODULE);
		});
		expect(
			offenders.map((f) => path.relative(API_ROOT, f)),
			`pi SDK imported outside the pi harness: ${offenders.join(", ")}`,
		).toEqual([]);
	});

	it("speaks raw pi event names only in the pi harness and the eventBridge alias table", () => {
		const offenders = [];
		for (const file of engineFiles) {
			if (file.startsWith(PI_HARNESS_DIR)) continue; // translation lives here
			const relative = path.relative(API_ROOT, file);
			const isEventBridgeAliasTable = relative === "eventBridge.js";
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			const source = stripComments(fs.readFileSync(file, "utf8"));
			for (const rawName of RAW_PI_EVENT_NAMES) {
				if (source.includes(`"${rawName}"`)) {
					if (isEventBridgeAliasTable) continue; // legacy aliases live here
					offenders.push(`${relative}: ${rawName}`);
				}
			}
		}
		expect(
			offenders,
			"raw pi event names leaked past the harness boundary",
		).toEqual([]);
	});

	it("imports no pi SDK inside the antigravity harness folder", () => {
		const offenders = listFilesIn(AGY_HARNESS_DIR).filter((file) =>
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			fs.readFileSync(file, "utf8").includes(PI_SDK_MODULE),
		);
		expect(
			offenders.map((f) => path.relative(API_ROOT, f)),
			"pi SDK imported inside the antigravity harness",
		).toEqual([]);
	});

	it("speaks raw agy event names only inside the antigravity harness", () => {
		// `step_update` is unique to agy's stream — scan it directly. `init` and
		// `result` are generic English words (e.g. `git init` in projectStore),
		// so they are only flagged in EVENT-DISCRIMINATOR shaped usage:
		// `event === "init"`, `event: "result"`, `case "init"`.
		const offenderNames = [];
		for (const file of engineFiles) {
			if (file.startsWith(AGY_HARNESS_DIR)) continue; // the agy translation lives here
			const relative = path.relative(API_ROOT, file);
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			const source = stripComments(fs.readFileSync(file, "utf8"));
			if (source.includes(`"step_update"`) || source.includes(`'step_update'`)) {
				offenderNames.push(`${relative}: step_update`);
			}
			for (const genericName of ["init", "result"]) {
				// eslint-disable-next-line security/detect-non-literal-regexp -- genericName is a compile-time loop constant, not user input
				const discriminated = new RegExp(
					`event\\s*(?:===?|:)\\s*["']${genericName}["']|case\\s+["']${genericName}["']`,
				);
				if (discriminated.test(source)) {
					offenderNames.push(`${relative}: ${genericName} (discriminated)`);
				}
			}
		}
		expect(
			offenderNames,
			"raw agy event names leaked past the antigravity harness boundary",
		).toEqual([]);
	});
	it("imports the opencode SDK only inside api/agent/harnesses/opencode/", () => {
		const offenders = engineFiles.filter((file) => {
			if (file.startsWith(OPENCODE_HARNESS_DIR)) return false;
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			const source = fs.readFileSync(file, "utf8");
			return source.includes(OPENCODE_SDK_MODULE);
		});
		expect(
			offenders.map((f) => path.relative(API_ROOT, f)),
			`opencode SDK imported outside the opencode harness: ${offenders.join(", ")}`,
		).toEqual([]);
	});

	it("imports no pi SDK inside the opencode harness folder", () => {
		const offenders = listFilesIn(OPENCODE_HARNESS_DIR).filter((file) =>
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			fs.readFileSync(file, "utf8").includes(PI_SDK_MODULE),
		);
		expect(
			offenders.map((f) => path.relative(API_ROOT, f)),
			"pi SDK imported inside the opencode harness",
		).toEqual([]);
	});

	it("speaks raw opencode event names only inside the opencode harness", () => {
		const offenders = [];
		for (const file of engineFiles) {
			if (file.startsWith(OPENCODE_HARNESS_DIR)) continue; // the opencode translation lives here
			const relative = path.relative(API_ROOT, file);
			if (relative === "eventBridge.js") continue; // legacy aliases live here
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			const source = stripComments(fs.readFileSync(file, "utf8"));
			for (const rawName of RAW_OPENCODE_EVENT_NAMES) {
				if (source.includes(`"${rawName}"`)) {
					offenders.push(`${relative}: ${rawName}`);
				}
			}
		}
		expect(offenders, "raw opencode event names leaked past the harness boundary").toEqual([]);
	});

	it("imports no pi SDK inside the muse harness folder", () => {
		const offenders = listFilesIn(MUSE_HARNESS_DIR).filter((file) =>
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			fs.readFileSync(file, "utf8").includes(PI_SDK_MODULE),
		);
		expect(
			offenders.map((f) => path.relative(API_ROOT, f)),
			"pi SDK imported inside the muse harness",
		).toEqual([]);
	});

	it("imports no pi SDK inside the codex harness folder", () => {
		const offenders = listFilesIn(CODEX_HARNESS_DIR).filter((file) =>
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			fs.readFileSync(file, "utf8").includes(PI_SDK_MODULE),
		);
		expect(
			offenders.map((f) => path.relative(API_ROOT, f)),
			"pi SDK imported inside the codex harness",
		).toEqual([]);
	});

	it("imports no pi SDK inside the vibe harness folder", () => {
		const offenders = listFilesIn(VIBE_HARNESS_DIR).filter((file) =>
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			fs.readFileSync(file, "utf8").includes(PI_SDK_MODULE),
		);
		expect(
			offenders.map((f) => path.relative(API_ROOT, f)),
			"pi SDK imported inside the vibe harness",
		).toEqual([]);
	});

	it("speaks raw vibe wire markers only inside the vibe harness", () => {
		const offenders = [];
		for (const file of engineFiles) {
			if (file.startsWith(VIBE_HARNESS_DIR)) continue; // the vibe translation lives here
			const relative = path.relative(API_ROOT, file);
			if (relative === "eventBridge.js") continue; // legacy aliases live here
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			const source = stripComments(fs.readFileSync(file, "utf8"));
			for (const rawName of RAW_VIBE_WIRE_MARKERS) {
				if (source.includes(`"${rawName}"`)) {
					offenders.push(`${relative}: ${rawName}`);
				}
			}
		}
		expect(offenders, "raw vibe wire markers leaked past the harness boundary").toEqual([]);
	});

	it("speaks raw muse payload types only inside the muse harness", () => {
		const offenders = [];
		for (const file of engineFiles) {
			if (file.startsWith(MUSE_HARNESS_DIR)) continue; // the muse translation lives here
			const relative = path.relative(API_ROOT, file);
			if (relative === "eventBridge.js") continue; // legacy aliases live here
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above
			const source = stripComments(fs.readFileSync(file, "utf8"));
			for (const rawName of RAW_MUSE_PAYLOAD_TYPES) {
				if (source.includes(`"${rawName}"`)) {
					offenders.push(`${relative}: ${rawName}`);
				}
			}
		}
		expect(offenders, "raw muse payload types leaked past the harness boundary").toEqual([]);
	});
});

/***
 * MARK: listFilesIn
 * @description Walks a directory returning every non-test .js file (code only).
 ***/
function listFilesIn(dir) {
	// eslint-disable-next-line security/detect-non-literal-fs-filename -- walking the api tree this module lives in
	if (!fs.existsSync(dir)) return [];
	const found = [];
	/* eslint-disable security/detect-non-literal-fs-filename -- walking the api tree this module lives in */
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			found.push(...listFilesIn(full));
		} else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) {
			found.push(full);
		}
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
	return found;
}