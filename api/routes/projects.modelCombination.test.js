import { describe, it, expect, afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: throwaway roots BEFORE the app is loaded, so no fixture touches
// the live projects root or notes space (mirrors projects.alias.test.js).
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-comboapi-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-comboapi-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;
// The fleet-aware save gates read live Runner registrations, so these tests
// seed a deterministic fleet runner (mirrors runnerRoutes.test.js). The id
// is test-scoped and revoked in afterAll; ambient fleet runners can only
// add availability, never remove what the seed serves.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-fleet-token";

const { default: app } = await import("../index.js");

const FLEET_FACTS = {
	harnesses: [{ id: "muse", version: "test" }],
	models: ["muse::meta::test-fleet-model"],
	tiers: ["T0"],
	diskHeadroomMb: 1024,
	versions: { protocol: "v1", runner: "test" },
};

beforeAll(async () => {
	// Clear a stale seed from an interrupted run; 404 when absent is fine.
	await app.inject({ method: "POST", url: "/runners/test-fleet-muse/revoke" });
	const reg = await app.inject({
		method: "POST",
		url: "/runners/register",
		payload: { runnerId: "test-fleet-muse", joinToken: "test-fleet-token", facts: FLEET_FACTS },
	});
	// 202 fresh, 200 when re-registering the revoked stale seed.
	expect([200, 202]).toContain(reg.statusCode);
	const approval = await app.inject({ method: "POST", url: "/runners/test-fleet-muse/approve" });
	expect(approval.statusCode).toBe(200);
});

afterAll(async () => {
	try {
		await app.inject({ method: "POST", url: "/runners/test-fleet-muse/revoke" });
	} catch {
		// ignore cleanup errors
	}
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/***
 * MARK: Project harness+model combination API tests
 * @description Pins the save-time validation tiers (the Repro C root-cause
 *   fix): structurally impossible combinations (unknown harness ids,
 *   malformed refs) are refused with a 400, while catalog-miss combinations
 *   (valid shape, absent from the target harness's catalog right now) save
 *   with a visible `warnings[]`. The mock harness's catalog is the hermetic
 *   probe (registered in every env, no CLI, no network).
 ***/
describe("Project harness+model combination API", () => {
	async function createProject(name = "Combo API App") {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name, gitUrl: "https://git.example.com/team/fixture.git" },
		});
		expect(res.statusCode).toBe(201);
		return JSON.parse(res.payload);
	}

	it("refuses an alias target on an unknown harness with a 400", async () => {
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [
					{ name: "w", harness: "no-such-harness-xyz", model: "m" },
				],
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toContain("no-such-harness-xyz");
	});

	it("refuses an alias target with a malformed model ref with a 400", async () => {
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [{ name: "w", harness: "mock", model: "a::b::c::d::e" }],
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toContain("malformed");
	});

	it("saves a catalog-miss alias target with a visible warnings[] (soft)", async () => {
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [{ name: "w", harness: "mock", model: "mock::nope" }],
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.modelAliases[0].model).toBe("mock::nope");
		expect(body.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining("mock::nope")]),
		);
	});

	it("saves a catalog-hit alias target with no warnings", async () => {
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [{ name: "w", harness: "mock", model: "mock::echo-v1" }],
			},
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).warnings).toBeUndefined();
	});

	it("refuses a malformed project defaultModel with a 400", async () => {
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { defaultModel: "a::b::c::d::e" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toContain("malformed");
	});

	it("saves a catalog-miss defaultModel with a visible warnings[] (soft)", async () => {
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { harness: "mock", defaultModel: "mock::nope" },
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining("mock::nope")]),
		);
	});

	it("warns softly (never 400) for a catalog-miss default on a fleet-served harness", async () => {
		// The old expectation warned "manages its own model" for any default
		// on a backend-`none` harness. The fleet serves `muse` here (seeded
		// runner), so the harness behaves as `list`: an unserved id warns as
		// a catalog miss instead. The `custom` backend-`none` harness (never
		// fleet-served) still warns the manages-own-model note.
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				harness: "muse",
				defaultModel: "antigravity::google::gemini-x",
			},
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining("antigravity::google::gemini-x"),
			]),
		);
	});

	it("saves a fleet-served default on a fleet-served harness without warnings", async () => {
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				harness: "muse",
				defaultModel: "muse::meta::test-fleet-model",
			},
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).warnings ?? []).toEqual([]);
	});

	it("warns softly (never 400) when the harness manages its own model but a default is stored", async () => {
		const created = await createProject();
		const res = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				harness: "custom",
				defaultModel: "custom::stored-model",
			},
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining("manages its own model"),
			]),
		);
	});
});
