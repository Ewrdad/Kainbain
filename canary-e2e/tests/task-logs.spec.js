import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_URL } from "./urls";
import {
	activeProjectId,
	openTaskInspector,
	selectProject,
	stopEngine,
	waitForAppReady,
	waitForTaskVisible,
} from "./helpers";

/**
 * MARK: Agent-log readability (task bf5695e4)
 * @description Guards the log-readability regression (task 45c2750d): the
 *   inspector Logs tab renders structured run output readably across the
 *   unified category lanes, long/odd harness output wraps instead of
 *   breaking the inspector layout, and a fresh task shows the sane
 *   "[INFO] Task initialized" placeholder rather than a blank page. Seeds
 *   deterministic output via a CI stage (no agent run needed) on a
 *   self-provisioned fixture project under /tmp; never touches Project A
 *   or live stacks.
 */

const API_BASE = API_URL;
const LONG_RUN_CHAR = "L";
const LONG_RUN_LEN = 1500;

let scratchRoot;
let project;

async function getTask(request, taskId) {
	const res = await request.get(
		`${API_BASE}/tasks/${taskId}?projectId=${project.id}`,
	);
	expect(res.ok()).toBeTruthy();
	return res.json();
}

async function seedLoggedTask(request, marker) {
	const goal = `Log feed ${marker} ${Date.now()}`;
	const createRes = await request.post(`${API_BASE}/tasks`, {
		data: { projectId: project.id, title: goal, goal, stageId: "1" },
	});
	expect(createRes.ok()).toBeTruthy();
	const task = await createRes.json();
	// Quiesce Project A's engine first: earlier specs' UI-created tasks
	// auto-dispatch real agent runs, and /execute 409s while the global
	// engine is busy with another task.
	await stopEngine(request, await activeProjectId(request));
	const execRes = await request.post(`${API_BASE}/tasks/${task.id}/execute`, {
		data: { projectId: project.id },
	});
	expect(execRes.ok()).toBeTruthy();
	// The CI run appends structured logEntries; wait for the output to land.
	await expect
		.poll(
			async () =>
				(await getTask(request, task.id)).logEntries?.length || 0,
			{ timeout: 90000 },
		)
		.toBeGreaterThan(0);
	return getTask(request, task.id);
}

async function openLogsTab(page, goal) {
	await waitForAppReady(page);
	await selectProject(page, project.name);
	// Executed fixtures complete (single CI stage) and completed cards hide
	// behind the toggle — reveal them before looking for the card.
	const showCompleted = page.getByRole("checkbox", { name: /Show Completed/ });
	if (await showCompleted.isVisible().catch(() => false)) {
		await showCompleted.check();
	}
	await waitForTaskVisible(page, goal);
	const inspector = await openTaskInspector(page, goal);
	await inspector.getByRole("tab", { name: /Logs/ }).click();
	const logRegion = inspector.getByRole("log", { name: "Task live process logs" });
	await expect(logRegion).toBeVisible();
	return { inspector, logRegion };
}

test.describe.serial("Agent-log readability", () => {
	test.setTimeout(120000);
	test.beforeAll(async ({ request }) => {
		scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-log-feed-"));
		const res = await request.post(`${API_BASE}/projects`, {
			data: {
				name: `Log Feed Canary ${Date.now()}`,
				cwd: scratchRoot,
				notesPath: path.join(scratchRoot, "notes"),
				useBranches: false,
				stages: [
					{
						id: "1",
						name: "Logging CI",
						type: "ci",
						command: `node -e "console.log('[AGENT] AGENT first line'); console.log('${LONG_RUN_CHAR}'.repeat(${LONG_RUN_LEN})); console.log('unicode line ✓ emoji works — ok'); console.error('[ERROR] canary stderr line')"`,
					},
				],
			},
		});
		expect(res.ok()).toBeTruthy();
		project = await res.json();
	});

	test("structured run output renders readably across feeds", async ({
		page,
		request,
	}) => {
		// Each inspector shows only its own task's logs, so the fixed
		// command output needs no per-test marker.
		const task = await seedLoggedTask(request, "readable");
		const { inspector, logRegion } = await openLogsTab(page, task.goal);

		await expect(logRegion).toContainText("AGENT first line");
		await expect(logRegion).toContainText("stderr line");
		await expect(logRegion).toContainText("unicode line ✓ emoji works — ok");
		// Filters are hidden by default so logs are visible straight away;
		// the toggle reveals the unified filter surface.
		await expect(
			inspector.getByRole("button", { name: "Show filters" }),
		).toBeVisible();
		await expect(
			inspector.getByRole("group", { name: "Log categories" }),
		).toBeHidden();
		await inspector.getByRole("button", { name: "Show filters" }).click();
		// Category chips + search render (unified filter surface intact).
		const categories = inspector.getByRole("group", { name: "Log categories" });
		await expect(categories).toBeVisible();
		for (const chip of ["Direct output", "Tool calls", "CI logs", "Errors"]) {
			await expect(
				categories.getByRole("button", { name: chip }),
			).toBeVisible();
		}
		await expect(inspector.getByLabel("Search logs")).toBeVisible();
		// Density and timestamps are user choices on the same surface.
		await expect(inspector.getByRole("button", { name: "Compact" })).toBeVisible();
		await expect(inspector.getByRole("button", { name: "Timestamps" })).toBeVisible();
		// The canary stderr line is an intervention and must be highlighted.
		await expect(inspector.getByText("Needs attention", { exact: true })).not.toBeVisible();
	});

	test("long lines wrap without breaking the inspector layout", async ({
		page,
		request,
	}) => {
		const marker = `wrap-${Date.now()}`;
		const task = await seedLoggedTask(request, marker);
		const { inspector, logRegion } = await openLogsTab(page, task.goal);

		// The full unbroken run is present (readable, not clipped away)…
		await expect(logRegion).toContainText(LONG_RUN_CHAR.repeat(LONG_RUN_LEN));
		// …and the log region stays inside the inspector (no overflowpush).
		const logBox = await logRegion.boundingBox();
		const inspectorBox = await inspector.boundingBox();
		expect(logBox).toBeTruthy();
		expect(inspectorBox).toBeTruthy();
		expect(logBox.x).toBeGreaterThanOrEqual(inspectorBox.x - 1);
		expect(logBox.x + logBox.width).toBeLessThanOrEqual(
			inspectorBox.x + inspectorBox.width + 1,
		);
	});

	test("a fresh task shows the initialized placeholder, not a blank page", async ({
		page,
		request,
	}) => {
		const goal = `Fresh logs ${Date.now()}`;
		const createRes = await request.post(`${API_BASE}/tasks`, {
			data: { projectId: project.id, title: goal, goal, stageId: "1" },
		});
		expect(createRes.ok()).toBeTruthy();
		const { logRegion } = await openLogsTab(page, goal);

		await expect(logRegion).toContainText("[INFO] Task initialized in stage");
		await expect(logRegion).toContainText("Logging CI");
	});
});
