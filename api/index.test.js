import { tempProjectsRoot, tempNotesRoot } from "./isolatedTestRoots.js";
import { afterAll } from "vitest";

// Isolation: temp roots are installed by ./isolatedTestRoots.js, which MUST
// stay the first import — importing the app boots prepareProjects against
// whichever roots the config snapshot holds (sample seeding is off by default).
// (The TLS-trust test below spawns its own child with explicit scratch roots;
// that path is unaffected.)

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});
import {
	describe,
	it,
	expect,
	beforeAll,
	beforeEach,
	afterEach,
} from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./index.js";
import { isAllowedCorsOrigin } from "./cors.js";

/**
 * MARK: index unit tests
 * @description Verifies the server boots and exposes the expected route
 * surface. Route behaviour is covered by the per-domain integration tests.
 */
describe("Server Configuration", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("should be initialized as a fastify instance", () => {
		expect(app.listen).toBeDefined();
		expect(app.get).toBeDefined();
		expect(app.post).toBeDefined();
	});

	it("should expose the core route surface", () => {
		const expected = [
			["GET", "/status"],
			["GET", "/status/config"],
			["GET", "/api/system/config-spec"],
			["GET", "/projects"],
			["GET", "/compute/status"],
			["GET", "/session/history"],
			["GET", "/tasks"],
			["GET", "/workflows"],
			["GET", "/ws"],
			["GET", "/agent"],
			["GET", "/agent/schema"],
			["GET", "/agent/guide"],
		];
		for (const [method, url] of expected) {
			expect(app.hasRoute({ method, url })).toBe(true);
		}
	});

	it("should respond to the health check", async () => {
		const res = await app.inject({ method: "GET", url: "/status" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).status).toBe("ok");
	});
});

describe("isAllowedCorsOrigin", () => {
	const OLD_ALLOWLIST = process.env.CORS_ALLOWED_ORIGINS;

	beforeEach(() => {
		delete process.env.CORS_ALLOWED_ORIGINS;
	});

	afterEach(() => {
		if (OLD_ALLOWLIST === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
		else process.env.CORS_ALLOWED_ORIGINS = OLD_ALLOWLIST;
	});

	it("allows origin-less and loopback origins", () => {
		expect(isAllowedCorsOrigin(undefined)).toBe(true);
		expect(isAllowedCorsOrigin("http://localhost:3100")).toBe(true);
		expect(isAllowedCorsOrigin("http://127.0.0.1:5173")).toBe(true);
		expect(isAllowedCorsOrigin("http://0.0.0.0:3100")).toBe(true);
		expect(isAllowedCorsOrigin("http://[::1]:5173")).toBe(true);
	});

	it("denies .home, LAN, Tailscale CGNAT (100.x), and tailnet origins by default", () => {
		expect(isAllowedCorsOrigin("https://kainbain.home")).toBe(false);
		expect(isAllowedCorsOrigin("http://192.168.1.20:3100")).toBe(false);
		expect(isAllowedCorsOrigin("http://10.0.0.5:3100")).toBe(false);
		expect(isAllowedCorsOrigin("http://100.104.3.73:3100")).toBe(false);
		expect(isAllowedCorsOrigin("http://100.64.0.1")).toBe(false);
		expect(isAllowedCorsOrigin("https://planner.taildab918.ts.net")).toBe(
			false,
		);
		expect(isAllowedCorsOrigin("https://example.com")).toBe(false);
		expect(isAllowedCorsOrigin("http://8.8.8.8:3100")).toBe(false);
	});

	it("allows exact CORS_ALLOWED_ORIGINS matches (trimmed, empties ignored)", () => {
		process.env.CORS_ALLOWED_ORIGINS =
			" https://kainbain.home,http://100.104.3.73:3100,, ";
		expect(isAllowedCorsOrigin("https://kainbain.home")).toBe(true);
		expect(isAllowedCorsOrigin("http://100.104.3.73:3100")).toBe(true);
		// Exact match only: no pattern/wildcard expansion.
		expect(isAllowedCorsOrigin("https://other.home")).toBe(false);
		expect(isAllowedCorsOrigin("http://100.104.3.74:3100")).toBe(false);
		expect(isAllowedCorsOrigin("https://kainbain.home.evil.com")).toBe(false);
	});

	it("preflights every served method (PATCH/PUT/DELETE included)", async () => {
		// The plugin default (GET,HEAD,POST) CORS-blocked browser-issued
		// PATCH/PUT/DELETE on split-origin stacks — e.g. the project
		// settings save PATCH from the scratch e2e frontend.
		await app.ready();
		for (const method of ["PATCH", "PUT", "DELETE"]) {
			const res = await app.inject({
				method: "OPTIONS",
				url: "/projects",
				headers: {
					origin: "http://localhost:5299",
					"access-control-request-method": method,
				},
			});
			expect(res.statusCode).toBe(204);
			const allowed = res.headers["access-control-allow-methods"] || "";
			expect(allowed).toMatch(new RegExp(`\\b${method}\\b`));
		}
	});
});

describe("TLS trust", () => {
	it(
		"never injects an implicit CA path at import time (audit H-1)",
		() => {
			// Isolated child: importing the server module with NODE_EXTRA_CA_CERTS
			// unset must leave it unset even on hosts carrying the homelab CA
			// file. Scratch roots keep the import's project seeding off live state.
			const scratch = fs.mkdtempSync(
				path.join(os.tmpdir(), "kainbain-ca-test-"),
			);
			try {
				const env = {
					...process.env,
					NODE_ENV: "test",
					PROJECTS_ROOT: path.join(scratch, "projects"),
					NOTES_SPACE_ROOT: path.join(scratch, "notes"),
				};
				delete env.NODE_EXTRA_CA_CERTS;
				const script = `await import("./index.js"); console.log("CA:" + (process.env.NODE_EXTRA_CA_CERTS ?? "unset"));`;
				const out = execFileSync(
					process.execPath,
					["--input-type=module", "-e", script],
					{
						encoding: "utf8",
						env,
						cwd: path.dirname(fileURLToPath(import.meta.url)),
						timeout: 120000,
					},
				);
				expect(out).toContain("CA:unset");
			} finally {
				fs.rmSync(scratch, { recursive: true, force: true });
			}
		},
		120000,
	);
});
