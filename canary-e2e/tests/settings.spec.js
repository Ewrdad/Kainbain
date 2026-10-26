import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_URL, API_URL } from "./urls";
import { selectProject, waitForAppReady } from "./helpers";

/**
 * MARK: Settings save round-trip (task bf5695e4)
 * @description Guards project-configuration persistence: editing a value and
 *   saving survives a reload (UI + API agree), while invalid input surfaces
 *   an inline validation message and leaves the stored config untouched.
 *   Runs against a self-provisioned fixture project under /tmp on the
 *   suite-owned scratch backend — Project A is never renamed by these tests
 *   (other specs resolve it by name).
 */

const API_BASE = API_URL;

let scratchRoot;
let projectSeq = 0;

async function createFixtureProject(request) {
	projectSeq += 1;
	const cwd = path.join(scratchRoot, `settings-${projectSeq}`);
	fs.mkdirSync(cwd, { recursive: true });
	const res = await request.post(`${API_BASE}/projects`, {
		data: {
			name: `Settings Canary ${Date.now()}-${projectSeq}`,
			cwd,
			notesPath: path.join(cwd, "notes"),
			useBranches: false,
			stages: [{ id: "1", name: "Development", type: "agent" }],
		},
	});
	expect(res.ok()).toBeTruthy();
	return res.json();
}

async function readProject(request, projectId) {
	const res = await request.get(`${API_BASE}/projects`);
	expect(res.ok()).toBeTruthy();
	return (await res.json()).find((p) => p.id === projectId);
}

async function gotoSettings(page, projectName) {
	await waitForAppReady(page);
	await selectProject(page, projectName);
	await page.goto(`${APP_URL}/#/settings`);
	await expect(page.getByText("Project Configuration")).toBeVisible({
		timeout: 15000,
	});
}

test.describe("Settings save round-trip", () => {
	test.beforeAll(async () => {
		scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-settings-"));
	});

	test("edit, save, reload: values persist across UI and API", async ({
		page,
		request,
	}) => {
		const project = await createFixtureProject(request);
		await gotoSettings(page, project.name);

		const field = page.getByLabel("Max auto-iterations");
		await expect(field).toBeVisible();
		await field.fill("7");
		await page.getByRole("button", { name: "Save Configuration" }).click();
		await expect(
			page.getByRole("button", { name: "Saved ✓" }),
		).toBeVisible({ timeout: 15000 });

		// API agrees with the UI.
		expect((await readProject(request, project.id)).maxAutoIterations).toBe(7);

		// Reload: the saved value is still there.
		await gotoSettings(page, project.name);
		await expect(page.getByLabel("Max auto-iterations")).toHaveValue("7");
	});

	test("invalid input blocks the save and keeps the stored config", async ({
		page,
		request,
	}) => {
		const project = await createFixtureProject(request);
		// Seed a known stored value to prove the blocked save changes nothing.
		const seedRes = await request.patch(`${API_BASE}/projects/${project.id}`, {
			data: { maxAutoIterations: 7 },
		});
		expect(seedRes.ok()).toBeTruthy();
		await gotoSettings(page, project.name);
		await expect(page.getByLabel("Max auto-iterations")).toHaveValue("7");

		await page.getByLabel("Project Name").fill("");
		await page.getByRole("button", { name: "Save Configuration" }).click();
		await expect(page.getByText("Project name must not be blank.")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Error — Retry" }),
		).toBeVisible();

		// Stored config untouched by the refused save.
		const stored = await readProject(request, project.id);
		expect(stored.name).toBe(project.name);
		expect(stored.maxAutoIterations).toBe(7);

		// Reload: the form still shows the stored values, not the draft.
		await gotoSettings(page, project.name);
		await expect(page.getByLabel("Project Name")).toHaveValue(project.name);
		await expect(page.getByLabel("Max auto-iterations")).toHaveValue("7");
	});
});
