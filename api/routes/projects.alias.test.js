import { describe, it, expect, afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: throwaway roots BEFORE the app is loaded, so no fixture touches
// the live projects root or notes space (mirrors projects.test.js).
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-aliasapi-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-aliasapi-notes-"),
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
 * MARK: Project model-alias API tests
 * @description Pins the HTTP surface of the alias system: PATCH persists
 *   alias bindings, invalid rows and duplicate names are refused with a 400
 *   naming the row, and a rename through PATCH migrates referencing stages
 *   in the same save.
 ***/
describe("Project model-alias API", () => {
	async function createProject(name = "Alias API App") {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name, gitUrl: "https://git.example.com/team/fixture.git" },
		});
		expect(res.statusCode).toBe(201);
		return JSON.parse(res.payload);
	}

	it("persists modelAliases through PATCH and echoes them on GET", async () => {
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
			},
		});
		expect(patchRes.statusCode).toBe(200);
		expect(JSON.parse(patchRes.payload).modelAliases).toEqual([
			{
				name: "small",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		]);
		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${created.id}`,
		});
		expect(JSON.parse(getRes.payload).modelAliases).toEqual([
			{
				name: "small",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		]);
	});

	it("persists weighted splits and refuses non-100 totals", async () => {
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [
					{
						name: "review",
						targets: [
							{ harness: "muse", model: "", percent: 90 },
							{ harness: "antigravity", model: "gem", percent: 10 },
						],
					},
				],
			},
		});
		expect(patchRes.statusCode).toBe(200);
		expect(JSON.parse(patchRes.payload).modelAliases).toEqual([
			{
				name: "review",
				harness: "muse",
				model: "",
				targets: [
					{ harness: "muse", model: "", percent: 90 },
					{ harness: "antigravity", model: "gem", percent: 10 },
				],
			},
		]);
		for (const bad of [
			{
				name: "review",
				targets: [
					{ harness: "muse", model: "", percent: 60 },
					{ harness: "antigravity", model: "gem", percent: 30 },
				],
			},
			{
				name: "review",
				targets: [{ harness: "muse", model: "", percent: 0 }],
			},
			{
				name: "review",
				targets: [{ harness: "alias", model: "other", percent: 100 }],
			},
		]) {
			const badRes = await app.inject({
				method: "PATCH",
				url: `/projects/${created.id}`,
				payload: { modelAliases: [bad] },
			});
			expect(badRes.statusCode).toBe(400);
			expect(JSON.parse(badRes.payload).error).toContain("modelAliases[0]");
		}
	});

	it("refuses invalid alias rows with a 400 naming the row", async () => {
		const created = await createProject();
		for (const bad of [
			{ name: "Small", harness: "pi", model: "m" },
			{ name: "s", harness: "alias", model: "other" },
			{ name: "s", harness: "pi" },
		]) {
			const patchRes = await app.inject({
				method: "PATCH",
				url: `/projects/${created.id}`,
				payload: { modelAliases: [bad] },
			});
			expect(patchRes.statusCode).toBe(400);
			expect(JSON.parse(patchRes.payload).error).toContain("modelAliases[0]");
		}
		// Non-object rows are refused even earlier by the body schema (still 400).
		const schemaRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { modelAliases: ["nope"] },
		});
		expect(schemaRes.statusCode).toBe(400);
	});

	it("refuses duplicate alias names", async () => {
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [
					{ name: "small", harness: "pi", model: "m1" },
					{ name: "small", harness: "pi", model: "m2" },
				],
			},
		});
		expect(patchRes.statusCode).toBe(400);
		expect(JSON.parse(patchRes.payload).error).toContain("duplicate");
	});

	it("migrates stage references when an alias is renamed through PATCH", async () => {
		const created = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Alias Rename API App",
				gitUrl: "https://git.example.com/team/fixture.git",
				harness: "alias",
				defaultModel: "small",
				modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
			},
		});
		expect(created.statusCode).toBe(201);
		const project = JSON.parse(created.payload);

		const stagesRes = await app.inject({
			method: "PUT",
			url: `/projects/${project.id}/workflow`,
			payload: {
				stages: [{ id: "1", name: "A", type: "agent", harness: "alias", model: "small" }],
			},
		});
		expect(stagesRes.statusCode).toBe(200);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: {
				modelAliases: [{ name: "medium", harness: "pi", model: "google::m" }],
			},
		});
		expect(patchRes.statusCode).toBe(200);
		const updated = JSON.parse(patchRes.payload);
		expect(updated.defaultModel).toBe("medium");

		const wfRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/workflow`,
		});
		const stages = JSON.parse(wfRes.payload).stages;
		expect(stages.find((s) => s.id === "1").model).toBe("medium");
	});

	it("PATCH of unrelated settings preserves aliases (stale-page regression)", async () => {
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
			},
		});
		expect(patchRes.statusCode).toBe(200);
		const expected = JSON.parse(patchRes.payload).modelAliases;

		// A stale settings page saves unrelated fields WITHOUT the
		// modelAliases key: the stored list must survive on detail, list,
		// and re-read views alike.
		const staleRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { name: "Renamed Elsewhere", gitUrl: "https://git.example.com/team/fixture.git" },
		});
		expect(staleRes.statusCode).toBe(200);
		expect(JSON.parse(staleRes.payload).modelAliases).toEqual(expected);
		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${created.id}`,
		});
		expect(JSON.parse(getRes.payload).modelAliases).toEqual(expected);
		const listRes = await app.inject({ method: "GET", url: "/projects" });
		const listed = JSON.parse(listRes.payload).find(
			(p) => p.id === created.id,
		);
		expect(listed.modelAliases).toEqual(expected);
	});

	it("stale expectedUpdatedAt surfaces 409 and preserves aliases", async () => {
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
			},
		});
		expect(patchRes.statusCode).toBe(200);
		const expected = JSON.parse(patchRes.payload).modelAliases;
		const freshUpdatedAt = JSON.parse(patchRes.payload).updatedAt;

		// A rival browser saved first: this page's older token must conflict
		// instead of silently clobbering.
		const conflictRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				name: "Stale Write",
				expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
			},
		});
		expect(conflictRes.statusCode).toBe(409);
		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${created.id}`,
		});
		const after = JSON.parse(getRes.payload);
		expect(after.name).not.toBe("Stale Write");
		expect(after.modelAliases).toEqual(expected);

		// The matching token still saves — and the token itself is never
		// persisted on the project.
		const okRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: { name: "Fresh Write", expectedUpdatedAt: freshUpdatedAt, gitUrl: "https://git.example.com/team/fixture.git" },
		});
		expect(okRes.statusCode).toBe(200);
		const okBody = JSON.parse(okRes.payload);
		expect(okBody.name).toBe("Fresh Write");
		expect(okBody.modelAliases).toEqual(expected);
		expect("expectedUpdatedAt" in okBody).toBe(false);
	});

	it("H3: a model on a fleet-served harness saves with a catalog-miss warning when unserved", async () => {
		// The old contract refused any model on a backend-`none` harness.
		// The fleet serves `muse` here (seeded runner), so the harness
		// behaves as `list`: an unserved id warns softly (never 400) and a
		// served id is clean. The `custom` H3 below still pins the hard
		// `none`-gate where no fleet serves the harness.
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [
					{
						name: "worker",
						targets: [
							{ harness: "muse", model: "antigravity::google::gemini-x", percent: 100 },
						],
					},
				],
			},
		});
		expect(patchRes.statusCode).toBe(200);
		const body = JSON.parse(patchRes.payload);
		expect(body.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining("antigravity::google::gemini-x")]),
		);
		const getRes = await app.inject({
			method: "GET",
			url: `/projects/${created.id}`,
		});
		expect(JSON.parse(getRes.payload).modelAliases ?? []).toHaveLength(1);
	});

	it("H3: a fleet-served model on a fleet-served harness saves without warnings", async () => {
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [
					{
						name: "worker",
						targets: [
							{ harness: "muse", model: "muse::meta::test-fleet-model", percent: 100 },
						],
					},
				],
			},
		});
		expect(patchRes.statusCode).toBe(200);
		expect(JSON.parse(patchRes.payload).warnings ?? []).toEqual([]);
	});

	it("H3: refuses the legacy single-target shape pairing custom with a model", async () => {
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [{ name: "cli", harness: "custom", model: "pi::m" }],
			},
		});
		expect(patchRes.statusCode).toBe(400);
		expect(JSON.parse(patchRes.payload).error).toContain("cli");
	});

	it("accepts blank models on none harnesses (the valid muse/custom shape)", async () => {
		const created = await createProject();
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/projects/${created.id}`,
			payload: {
				modelAliases: [
					{
						name: "worker",
						targets: [
							{ harness: "muse", model: "", percent: 80 },
							{ harness: "antigravity", model: "antigravity::google::gemini-x", percent: 20 },
						],
					},
				],
			},
		});
		expect(patchRes.statusCode).toBe(200);
		expect(JSON.parse(patchRes.payload).modelAliases).toHaveLength(1);
	});
});
