import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots prepareProjects against
// whichever roots the config snapshot holds (sample seeding is off by default).

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});
import { describe, it, expect, vi, afterEach } from "vitest";
import fastify from "fastify";
import app from "../index.js";
import { CONFIG_SCHEMA } from "../config/schema.js";
import {
	config as liveConfig,
	configSources as liveSources,
	getConfigSpec,
	validateConfig,
} from "../config/index.js";

/**
 * MARK: Config-spec endpoint tests
 * @description Verifies the configuration introspection endpoint on both its
 *   paths (`/status/config` and the `/api/system/config-spec` alias): entry
 *   shape, source attribution, and secret redaction.
 */

afterEach(() => vi.unstubAllEnvs());

describe("GET /status/config (+ /api/system/config-spec alias)", () => {
	it("serves one entry per schema variable with its value, default, and source", async () => {
		await app.ready();
		const res = await app.inject({ method: "GET", url: "/status/config" });
		expect(res.statusCode).toBe(200);
		const payload = JSON.parse(res.payload);
		expect(payload.entries).toHaveLength(CONFIG_SCHEMA.length);
		expect(payload.warnings).toEqual(expect.any(Array));
		const port = payload.entries.find((entry) => entry.env === "PORT");
		// The endpoint reflects the LIVE config, so the value/source assertions
		// compare against the live import — pinning 3100 here would fail in any
		// ambient environment that sets PORT. The static shape (key, default,
		// type, group) is ambient-independent and asserted literally.
		expect(port).toEqual(
			expect.objectContaining({
				key: "port",
				env: "PORT",
				default: 3100,
				type: "int",
				group: "server",
				secret: false,
			}),
		);
		expect(port.value).toBe(liveConfig.port);
		expect(port.source).toBe(liveSources.port.source);
		expect(typeof port.doc).toBe("string");
	});

	it("pins the default attribution for a clean environment (isolated)", () => {
		const spec = getConfigSpec(validateConfig({}));
		const port = spec.entries.find((entry) => entry.env === "PORT");
		expect(port).toMatchObject({ value: 3100, default: 3100, source: "default" });
	});

	it("serves the storage knobs the Settings › Storage tab renders (UI contract)", () => {
		// The frontend tab renders rows by config `key` and pads/derives around
		// what this spec serves — this pins the six knobs the tab was built for
		// (projects folder, centralised notes space, the three harness binaries,
		// and the dist dir install derivation), so a schema refactor cannot drop
		// one of the four requested locations undetected. Groups follow the
		// schema truth: path knobs are `storage`, harness binaries `harnesses`.
		const required = [
			{ key: "projectsRoot", env: "PROJECTS_ROOT", group: "storage" },
			{ key: "notesSpaceRoot", env: "NOTES_SPACE_ROOT", group: "storage" },
			{ key: "agyBin", env: "KAINBAIN_AGY_BIN", group: "harnesses" },
			{ key: "museBin", env: "KAINBAIN_MUSE_BIN", group: "harnesses" },
			{ key: "opencodeBin", env: "KAINBAIN_OPENCODE_BIN", group: "harnesses" },
			{ key: "distDir", env: "KAINBAIN_DIST", group: "storage" },
		];
		const spec = getConfigSpec(validateConfig({}));
		for (const requiredKnob of required) {
			const entry = spec.entries.find((specEntry) => specEntry.key === requiredKnob.key);
			expect(
				entry,
				`${requiredKnob.env} (key ${requiredKnob.key}) is rendered by the Storage tab — it must stay in CONFIG_SCHEMA`,
			).toBeTruthy();
			expect(entry.env).toBe(requiredKnob.env);
			expect(entry.group).toBe(requiredKnob.group);
			expect(entry.doc, `${requiredKnob.env} doc must stay non-empty for the Storage tab hint`).toBeTruthy();
			expect(entry.value, `${requiredKnob.env} must resolve to a usable value`).toBeTruthy();
			expect(entry.secret).toBe(false);
		}
	});

	it("serves the identical spec at /api/system/config-spec", async () => {
		await app.ready();
		const first = await app.inject({ method: "GET", url: "/status/config" });
		const second = await app.inject({ method: "GET", url: "/api/system/config-spec" });
		expect(second.statusCode).toBe(200);
		expect(JSON.parse(second.payload)).toEqual(JSON.parse(first.payload));
	});

	it("serves the System Settings model-refresh toggle (UI contract)", () => {
		// The System Settings harness Refresh reads this entry to decide whether
		// it also re-runs the shared model catalogue; pin key, env, default, and
		// group so a schema refactor cannot silently drop the config gate.
		const spec = getConfigSpec(validateConfig({}));
		const entry = spec.entries.find(
			(candidate) => candidate.key === "refreshModelsOnHarnessRefresh",
		);
		expect(entry).toBeTruthy();
		expect(entry).toMatchObject({
			env: "KAINBAIN_REFRESH_MODELS_ON_HARNESS_REFRESH",
			value: true,
			default: true,
			type: "bool",
			group: "health",
			source: "default",
			secret: false,
		});
		expect(entry.doc).toBeTruthy();
	});

	it("honors KAINBAIN_REFRESH_MODELS_ON_HARNESS_REFRESH=0", () => {
		const spec = getConfigSpec(
			validateConfig({ KAINBAIN_REFRESH_MODELS_ON_HARNESS_REFRESH: "0" }),
		);
		const entry = spec.entries.find(
			(candidate) => candidate.key === "refreshModelsOnHarnessRefresh",
		);
		expect(entry).toMatchObject({ value: false, source: "env" });
	});

	it("redacts secret values set via env (never the value)", async () => {
		vi.stubEnv("OPENCODE_SERVER_PASSWORD", "supersekrit-password");
		try {
			vi.resetModules();
			const { default: freshRoutes } = await import("./status.js");
			const probe = fastify();
			await probe.register(freshRoutes, { deps: {} });
			const res = await probe.inject({ method: "GET", url: "/status/config" });
			expect(res.statusCode).toBe(200);
			const payload = JSON.parse(res.payload);
			const secret = payload.entries.find(
				(entry) => entry.env === "OPENCODE_SERVER_PASSWORD",
			);
			expect(secret.value).toBe("[redacted]");
			expect(secret.secret).toBe(true);
			expect(secret.source).toBe("env");
			expect(res.payload).not.toContain("supersekrit-password");
			await probe.close();
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("reports secret entries as null when unset (no value to leak)", () => {
		const loaded = validateConfig({});
		const spec = getConfigSpec(loaded);
		const secret = spec.entries.find((entry) => entry.env === "OPENCODE_SERVER_PASSWORD");
		expect(secret.value).toBeNull();
		expect(secret.secret).toBe(true);
		expect(secret.source).toBe("default");
	});

	it("attributes env and alias sources through the spec builder", () => {
		const loaded = validateConfig({ PORT: "3101", AGENT_TIMEOUT_MS: "5000" });
		const spec = getConfigSpec(loaded);
		const port = spec.entries.find((entry) => entry.env === "PORT");
		const agent = spec.entries.find((entry) => entry.env === "KAINBAIN_AGENT_TIMEOUT_MS");
		expect(port).toMatchObject({ value: 3101, source: "env" });
		expect(agent).toMatchObject({ value: 5000, source: "alias" });
		expect(spec.warnings.join("\n")).toContain("CONFIG DEPRECATION AGENT_TIMEOUT_MS");
	});
});
