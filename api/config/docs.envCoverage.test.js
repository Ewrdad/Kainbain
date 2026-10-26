import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CONFIG_SCHEMA } from "./schema.js";

const PORTS_ENV_PATH = path.join(
	import.meta.dirname,
	"..",
	"..",
	"site-docs",
	"ports-env.md",
);

/***
 * MARK: docs.envCoverage.test.js
 * @description Verifies consistency between api/config/schema.js and
 *   site-docs/ports-env.md:
 *   1. No variable mentioned in ports-env.md has been removed from the schema
 *      (unless explicitly allowlisted as runtime/frontend).
 *   2. Key operational knobs (ports, storage locations, harness controls,
 *      timeouts, network boundaries) are covered in the doc.
 ***/

// Non-schema environment variables known and expected in ports-env.md:
// - Frontend build-time variables (Vite inlines these into the client bundle)
// - Node runtime variables (NODE_EXTRA_CA_CERTS is handled by Node bootstrap)
// - Direct process.env git identity/template variables
// - System environment references (PATH)
const NON_SCHEMA_ALLOWLIST = new Set([
	"VITE_API_BASE",
	"VITE_WS_URL",
	"VITE_NOTES_VIEWER_URL",
	"NODE_EXTRA_CA_CERTS",
	"KAINBAIN_GIT_REMOTE_TEMPLATE",
	"KAINBAIN_GIT_AUTHOR_NAME",
	"KAINBAIN_GIT_AUTHOR_EMAIL",
	"PATH",
]);

// Essential operational variables that MUST be documented in ports-env.md
const REQUIRED_OPERATIONAL_VARS = [
	"PORT",
	"CORS_ALLOWED_ORIGINS",
	"PROJECTS_ROOT",
	"NOTES_SPACE_ROOT",
	"KAINBAIN_DIST",
	"KAINBAIN_SITE_DOCS",
	"KAINBAIN_AGENT_TIMEOUT_MS",
	"KAINBAIN_CI_TIMEOUT_MS",
	"KAINBAIN_MAX_AUTO_ITERATIONS",
	"KAINBAIN_DEFAULT_HARNESS",
	"KAINBAIN_AGY_BIN",
	"KAINBAIN_MUSE_BIN",
	"KAINBAIN_MUSE_MSP",
	"KAINBAIN_MUSE_YOLO",
	"KAINBAIN_VIBE_BIN",
	"KAINBAIN_VIBE_CLI",
	"KAINBAIN_VIBE_ACP",
	"KAINBAIN_VIBE_AUTO_APPROVE",
	"KAINBAIN_OPENCODE_BIN",
];

describe("Environment documentation coverage", () => {
	it("mentions only active schema variables or allowlisted runtime vars in ports-env.md", () => {
		const md = fs.readFileSync(PORTS_ENV_PATH, "utf8");
		const matches = [...md.matchAll(/`([A-Z0-9_]{3,})`/g)].map((m) => m[1]);
		const mentioned = [...new Set(matches)];

		const schemaVars = new Set(
			CONFIG_SCHEMA.flatMap((e) => [e.env, ...(e.aliases || [])]),
		);

		const unknown = mentioned.filter(
			(name) => !schemaVars.has(name) && !NON_SCHEMA_ALLOWLIST.has(name),
		);

		expect(unknown).toEqual([]);
	});

	it("documents the essential operational knobs in ports-env.md", () => {
		const md = fs.readFileSync(PORTS_ENV_PATH, "utf8");
		const missing = REQUIRED_OPERATIONAL_VARS.filter(
			(name) => !md.includes(`\`${name}\``),
		);

		expect(missing).toEqual([]);
	});
});
