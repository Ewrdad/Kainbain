import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_URL, API_URL } from "./urls";
import { selectProject, waitForAppReady } from "./helpers";

/**
 * MARK: App-status / goto-app link (task bf5695e4)
 * @description Guards the goto-app regression (task da0608f9): the files
 *   page and header show the "Go to App" quick-link when the API publishes
 *   an app URL for the active project, the loopback→networkHost override is
 *   honored in the resolved href, the lifecycle status dot renders, and —
 *   when no URL is published — no link renders at all (never a broken one).
 *   Self-provisions fixture projects under /tmp on the suite-owned scratch
 *   backend; never touches Project A or live stacks.
 */

const API_BASE = API_URL;

let scratchRoot;
let projectSeq = 0;

async function createFixtureProject(request, appStatus) {
	projectSeq += 1;
	const cwd = path.join(scratchRoot, `app-link-${projectSeq}`);
	fs.mkdirSync(cwd, { recursive: true });
	const res = await request.post(`${API_BASE}/projects`, {
		data: {
			name: `App Link Canary ${Date.now()}-${projectSeq}`,
			cwd,
			notesPath: path.join(cwd, "notes"),
			useBranches: false,
			stages: [{ id: "1", name: "Development", type: "agent" }],
		},
	});
	expect(res.ok()).toBeTruthy();
	const project = await res.json();
	if (appStatus) {
		const patchRes = await request.patch(
			`${API_BASE}/projects/${project.id}/app-status`,
			{ data: appStatus },
		);
		expect(patchRes.ok()).toBeTruthy();
	}
	return project;
}

async function gotoExplorer(page, project) {
	await waitForAppReady(page);
	await selectProject(page, project.name);
	await page.goto(`${APP_URL}/#/explorer`);
	await expect(page.getByLabel("Project Files")).toBeVisible({ timeout: 15000 });
}

test.describe("App-status / goto-app link", () => {
	test.beforeAll(async () => {
		scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-app-link-"));
	});

	test("files page shows the goto-app link when the API publishes a URL", async ({
		page,
		request,
	}) => {
		const project = await createFixtureProject(request, {
			url: "http://localhost:5173",
			status: "running",
		});
		await gotoExplorer(page, project);

		// Both placements render: the compact header pill and the files
		// quick-action strip. Note the trailing slash: URL serialization.
		const links = page.getByRole("link", { name: /Open app \(running\)/ });
		await expect(links).toHaveCount(2);
		await expect(links.first()).toHaveAttribute("href", "http://localhost:5173/");
		await expect(page.getByText("Go to App")).toBeVisible();
		await expect(page.getByText("Open App")).toBeVisible();
		// Lifecycle status dot + on-demand probe affordance.
		await expect(page.getByTitle("App running").first()).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Check app health now" }).first(),
		).toBeVisible();
	});

	test("loopback URL honors the networkHost override", async ({ page, request }) => {
		const project = await createFixtureProject(request, {
			url: "http://127.0.0.1:3000/app?x=1",
			networkHost: "example.lan",
			status: "starting",
		});
		await gotoExplorer(page, project);

		// Host rewritten to the override; stored port, path, and query kept.
		const links = page.getByRole("link", { name: /Open app \(starting\)/ });
		await expect(links).toHaveCount(2);
		await expect(links.first()).toHaveAttribute(
			"href",
			"http://example.lan:3000/app?x=1",
		);
		await expect(page.getByTitle("App starting").first()).toBeVisible();
	});

	test("no link renders — never a broken one — when no URL is published", async ({
		page,
		request,
	}) => {
		const project = await createFixtureProject(request, null);
		await gotoExplorer(page, project);

		await expect(page.getByRole("link", { name: /Open app/i })).toHaveCount(0);
		await expect(page.getByText("Go to App")).toHaveCount(0);
		await expect(page.getByText("Open App")).toHaveCount(0);
		// The page itself is intact without the link.
		await expect(page.getByLabel("Project Files")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Copy CWD" }),
		).toBeVisible();
	});
});
