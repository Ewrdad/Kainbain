import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_URL, APP_URL } from "./urls";
import {
	activeProjectId,
	closeTaskInspector,
	openTaskInspector,
	selectProject,
	stopEngine,
	waitForAppReady,
	waitForTaskVisible,
} from "./helpers";

/**
 * MARK: Task-view error display (task bf5695e4)
 * @description Guards the error-length regression (task 1c7a7c5d): a long
 * stage failure renders capped in the task view with a Show more/less
 * toggle, never as a wall of text. Seeds a deterministic long failure via
 * a CI stage whose command exits 1 after printing 500 chars to stderr
 * (CI stderr becomes the task failureReason) — no agent run needed.
 * Self-provisions its fixture project under /tmp on the suite-owned
 * scratch backend; never touches Project A or live stacks.
 */

const API_BASE = API_URL;
const LONG_ERROR_CHAR = "E";
const LONG_ERROR_LEN = 500;

let fixtureDir;
let project;
let task;

test.describe.serial("Task-view error display", () => {
	test.setTimeout(120000);
	test.beforeAll(async ({ request }) => {
		fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-error-cap-"));
		const res = await request.post(`${API_BASE}/projects`, {
			data: {
				name: `Error Cap Canary ${Date.now()}`,
				cwd: fixtureDir,
				notesPath: path.join(fixtureDir, "notes"),
				useBranches: false,
				stages: [
					{
						id: "1",
						name: "Failing CI",
						type: "ci",
						command: `node -e "console.error('${LONG_ERROR_CHAR}'.repeat(${LONG_ERROR_LEN})); process.exit(1)"`,
					},
				],
			},
		});
		expect(res.ok()).toBeTruthy();
		project = await res.json();

		// Auto-iteration stays off: otherwise the failure parks as
		// autoRetrying (RETRYING badge, no failure banner) instead of the
		// failed-with-banner state this spec guards.
		const flagRes = await request.patch(`${API_BASE}/projects/${project.id}`, {
			data: { autoIterationEnabled: false },
		});
		expect(flagRes.ok()).toBeTruthy();

		const goal = `Error cap fixture ${Date.now()}`;
		const createRes = await request.post(`${API_BASE}/tasks`, {
			data: { projectId: project.id, title: goal, goal, stageId: "1" },
		});
		expect(createRes.ok()).toBeTruthy();
		task = await createRes.json();

		// Quiesce Project A's engine first: earlier specs' UI-created tasks
		// auto-dispatch real agent runs, and /execute 409s while the global
		// engine is busy with another task.
		await stopEngine(request, await activeProjectId(request));
		const execRes = await request.post(`${API_BASE}/tasks/${task.id}/execute`, {
			data: { projectId: project.id },
		});
		expect(execRes.ok()).toBeTruthy();
		// The failure parks the task as failed with the long stderr as its
		// failureReason — the banner's capped input.
		await expect
			.poll(
				async () =>
					(await request.get(`${API_BASE}/tasks/${task.id}?projectId=${project.id}`))
						.json()
						.then((t) => t.failureReason?.length || 0),
				{ timeout: 90000 },
			)
			.toBeGreaterThan(300);
	});

	test("long failure renders capped with a Show more/less toggle", async ({ page }) => {
		await waitForAppReady(page);
		await selectProject(page, project.name);
		await waitForTaskVisible(page, task.goal);

		const inspector = await openTaskInspector(page, task.goal);
		await expect(inspector.getByText("⚠️ Stage Execution Failed")).toBeVisible();

		const fullRun = LONG_ERROR_CHAR.repeat(LONG_ERROR_LEN);
		const toggle = inspector.getByRole("button", { name: "Show more" });
		await expect(toggle).toBeVisible();
		// Capped: the full 500-char run appears nowhere in the inspector yet.
		await expect(inspector).not.toContainText(fullRun);

		await toggle.click();
		await expect(inspector.getByRole("button", { name: "Show less" })).toBeVisible();
		await expect(inspector).toContainText(fullRun);

		await inspector.getByRole("button", { name: "Show less" }).click();
		await expect(inspector.getByRole("button", { name: "Show more" })).toBeVisible();
	});
});

/**
 * MARK: Task retry state (task 8815d13d)
 * @description Regression net for "every task stuck on RETRYING": drives a
 * real task through scheduled retry → exhausted budget → manual recovery on
 * the suite-owned scratch backend and asserts the badge at each step. The
 * scratch stack runs with the scheduler disabled, so the armed retry is
 * driven explicitly via /execute (the same dispatch the retry timer would
 * have kicked) — what matters is the persisted retryState at each step, not
 * which clock fired it.
 */
test.describe.serial("Task retry state never sticks on RETRYING", () => {
	test.setTimeout(180000);

	let retryDir;
	let retryProject;
	let retryTask;
	const goal = `Retry state fixture ${Date.now()}`;

	const fetchTask = async (request) => {
		const res = await request.get(
			`${API_BASE}/tasks/${retryTask.id}?projectId=${retryProject.id}`,
		);
		expect(res.ok()).toBeTruthy();
		return res.json();
	};

	test.beforeAll(async ({ request }) => {
		retryDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-retry-state-"));
		// The command fails until the spec drops the marker file, so the
		// same task can fail (scheduled retry, then exhausted) and later
		// succeed (retry clears) without touching project stages.
		const marker = path.join(retryDir, "fixed").replace(/'/g, `'"'"'`);
		const res = await request.post(`${API_BASE}/projects`, {
			data: {
				name: `Retry State Canary ${Date.now()}`,
				cwd: retryDir,
				notesPath: path.join(retryDir, "notes"),
				useBranches: false,
				autoIterationEnabled: true,
				maxAutoIterations: 1,
				stages: [
					{
						id: "1",
						name: "Flaky CI",
						type: "ci",
						command: `node -e "try{require('fs').accessSync('${marker}')}catch(e){console.error('deliberate canary failure');process.exit(1)}"`,
					},
				],
			},
		});
		expect(res.ok()).toBeTruthy();
		retryProject = await res.json();

		const createRes = await request.post(`${API_BASE}/tasks`, {
			data: { projectId: retryProject.id, title: goal, goal, stageId: "1" },
		});
		expect(createRes.ok()).toBeTruthy();
		retryTask = await createRes.json();

		// Quiesce Project A first (see the error-cap spec above), then drive
		// the first attempt: it fails and arms an auto retry (budget 1/1).
		await stopEngine(request, await activeProjectId(request));
		await stopEngine(request, retryProject.id);
		const execRes = await request.post(
			`${API_BASE}/tasks/${retryTask.id}/execute`,
			{ data: { projectId: retryProject.id } },
		);
		expect(execRes.ok()).toBeTruthy();
		await expect
			.poll(async () => (await fetchTask(request)).retryState, {
				timeout: 90000,
			})
			.toBe("scheduled");
	});

	test("scheduled retry shows RETRYING (scheduled) with attempt counts", async ({
		request,
		page,
	}) => {
		const task = await fetchTask(request);
		expect(task.autoRetrying).toBe(true);
		expect(task.nextRetryAt).toBeTruthy();
		expect(Date.parse(task.nextRetryAt)).not.toBeNaN();

		await waitForAppReady(page);
		await selectProject(page, retryProject.name);
		await waitForTaskVisible(page, goal);
		const inspector = await openTaskInspector(page, goal);
		await expect(
			inspector.getByText(/RETRYING \(scheduled\)/).first(),
		).toBeVisible();
		await expect(inspector.getByText(/1\/1/).first()).toBeVisible();
		await closeTaskInspector(page);
	});

	test("exhausted budget parks as FAILED, never a stuck RETRYING", async ({
		request,
		page,
	}) => {
		// Drive the armed retry explicitly (the scratch stack has no
		// scheduler timer): it fails again, the budget is spent, and the
		// task must park as failed with the retry flag cleared.
		await stopEngine(request, retryProject.id);
		const execRes = await request.post(
			`${API_BASE}/tasks/${retryTask.id}/execute`,
			{ data: { projectId: retryProject.id } },
		);
		expect(execRes.ok()).toBeTruthy();
		await expect
			.poll(async () => (await fetchTask(request)).status, {
				timeout: 90000,
			})
			.toBe("failed");
		const parked = await fetchTask(request);
		expect(parked.retryState).toBe("exhausted");
		expect(parked.autoRetrying).toBe(false);

		await waitForAppReady(page);
		await selectProject(page, retryProject.name);
		await waitForTaskVisible(page, goal);
		await expect(page.getByText("FAILED").first()).toBeVisible();
		const inspector = await openTaskInspector(page, goal);
		await expect(inspector.getByText("⚠️ Stage Execution Failed")).toBeVisible();
		await expect(inspector.getByText(/RETRYING/)).toHaveCount(0);
		await closeTaskInspector(page);
	});

	test("manual retry after exhaustion keeps history and clears on success", async ({
		request,
		page,
	}) => {
		fs.writeFileSync(path.join(retryDir, "fixed"), "ok\n");
		await stopEngine(request, retryProject.id);
		const retryRes = await request.post(
			`${API_BASE}/tasks/${retryTask.id}/retry`,
			{ data: { projectId: retryProject.id } },
		);
		expect(retryRes.ok()).toBeTruthy();
		await expect
			.poll(async () => (await fetchTask(request)).status, {
				timeout: 90000,
			})
			.toMatch(/completed|passed|done/);
		const cleared = await fetchTask(request);
		expect(cleared.failureReason ?? null).toBeNull();
		// History is kept: the earlier failure is still traceable.
		expect(JSON.stringify(cleared.history ?? [])).toContain(
			"deliberate canary failure",
		);

		// A completed task leaves the kanban board, so assert on its
		// detail page instead of the card: it loads, and the failure
		// banner and any retry badge are gone. The detail route resolves
		// the task within the active project, so select it first.
		await waitForAppReady(page);
		await selectProject(page, retryProject.name);
		await page.goto(`${APP_URL}/#/tasks/${retryTask.id}`, {
			waitUntil: "domcontentloaded",
		});
		await expect(page.getByRole("heading", { name: goal })).toBeVisible({
			timeout: 15000,
		});
		await expect(
			page.getByText("⚠️ Stage Execution Failed"),
		).toHaveCount(0);
		await expect(page.getByText(/RETRYING/)).toHaveCount(0);
	});
});
