import { describe, it, expect, afterAll } from "vitest";
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

const { default: app } = await import("../index.js");

afterAll(() => {
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
			payload: { name },
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

	it("warns softly (never 400) when the harness manages its own model but a default is stored", async () => {
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
				expect.stringContaining("manages its own model"),
			]),
		);
	});
});
