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
