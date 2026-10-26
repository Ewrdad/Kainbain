import { test, expect } from "@playwright/test";
import {
	API_BASE,
	activeProjectId,
	projectStages,
	resetProject,
	waitForAppReadyOnProject,
} from "./helpers";

test.describe("Workflow E2E Tests", () => {
	test.beforeEach(async ({ page }) => {
		await waitForAppReadyOnProject(page);
		await resetProject(page.request, await activeProjectId(page.request));
		await page.reload();
		await waitForAppReadyOnProject(page);
	});

	test("Task Creation: In-line add task -> verify card appears in kanban stage", async ({
		page,
	}) => {
		// Open in-line add task form on first stage
		const addBtn = page.getByRole("button", { name: /Add task to Idea/i });
		await expect(addBtn).toBeVisible({ timeout: 15000 });
		await addBtn.click();

		const input = page.locator('input[placeholder*="task goal" i]');
		await expect(input).toBeVisible();
		const goal = "Write a hello world program in Python";
		await input.fill(goal);
		await page.getByRole("button", { name: "Submit new task" }).click();

		// The task card appears in the Idea column
		await expect(page.getByText(goal).first()).toBeVisible({
			timeout: 15000,
		});
	});

	test("Stage types: human stage shows review checkpoint", async ({ page }) => {
		const projectId = await activeProjectId(page.request);
		const stages = await projectStages(page.request, projectId);
		const humanStage = stages.find((s) => s.type === "human");

		// The human stage is visible
		await expect(page.getByText(humanStage.name, { exact: true })).toBeVisible({
			timeout: 15000,
		});
		// Human badge is present
		await expect(
			page.getByText("Human", { exact: true }).first(),
		).toBeVisible();

		// Create a task and jump to human stage to verify Approve/Reject controls on the card
		const goal = `Human checkpoint test ${Date.now()}`;
		await page.request.post(`${API_BASE}/tasks`, {
			data: { projectId, title: goal, goal, stageId: humanStage.id },
		});
		await page.reload();
		await waitForAppReadyOnProject(page);

		await expect(page.getByRole("button", { name: /Approve/i }).first()).toBeVisible({
			timeout: 10000,
		});
		await expect(page.getByRole("button", { name: /Reject/i }).first()).toBeVisible();
	});

	test("Engine controls: Start engine, skip current stage, and Look Back in Now Playing Bar", async ({
		page,
	}) => {
		// The engine toggle lives in the Now Playing bar
		const engineBtn = page.getByRole("button", { name: /Start Engine|Stop Engine/i });
		await expect(engineBtn).toBeVisible({ timeout: 15000 });

		// 4 Transport controls (Critique #9)
		const lookBackBtn = page.getByRole("button", { name: /Look Back/i });
		await expect(lookBackBtn).toBeVisible();

		const jumpActiveBtn = page.getByRole("button", { name: /Jump to Active/i });
		await expect(jumpActiveBtn).toBeVisible();

		const skipBtn = page.getByRole("button", { name: /Skip Current/i });
		await expect(skipBtn).toBeVisible();

		const lookForwardBtn = page.getByRole("button", { name: /Look Forward/i });
		await expect(lookForwardBtn).toBeVisible();

		// Active task and honest live indicators are visible: elapsed timer +
		// queue-depth chip. The fake percentage progressbar was removed (no
		// percent-complete data exists in the stack) and must stay gone, and so
		// must the stale workflow-pointer stage label ("Stage 1 of 10 — Idea").
		await expect(page.getByText("Active Task", { exact: true })).toBeVisible();
		await expect(page.locator("#elapsed-counter")).toBeVisible();
		await expect(
			page.getByLabel(/Execution queue: \d+ open tasks? across all pipelines/),
		).toBeVisible();
		await expect(page.locator("footer.fixed").getByText(/Stage \d+ of \d+/)).toHaveCount(0);
		await expect(page.getByRole("progressbar", { name: "Pipeline progress" })).toHaveCount(0);
	});

	test("Project isolation: switching project loads its own workflow", async ({
		page,
	}) => {
		// Open project selector and switch to Project B (role="option"
		// since the ProjectMenu rewrite)
		await page.getByRole("button", { name: /Project A/i }).click();
		await page.getByRole("option", { name: "Project B" }).click();
		// The header reflects the active project
		await expect(
			page.getByRole("button", { name: /Project B/i }),
		).toBeVisible();
		// The workflow canvas still renders stages for the new project
		await expect(page.getByText("Idea", { exact: true }).first()).toBeVisible({
			timeout: 15000,
		});
	});

	test("Stage skills: GET /skills serves the library and the stage editor exposes the Skills panel", async ({
		page,
	}) => {
		// API canary: the skills library endpoint answers 200 with descriptors.
		const res = await page.request.get(`${API_BASE}/skills`);
		expect(res.status()).toBe(200);
		const skills = await res.json();
		expect(Array.isArray(skills)).toBe(true);
		expect(skills.length).toBeGreaterThan(0);
		const poc = skills.find((s) => s.name === "creating-new-tickets");
		expect(poc).toBeTruthy();
		expect(poc.source).toBe("global");
		expect(poc.hasConfig).toBe(true);

		// Detail endpoint returns the raw markdown for preview.
		const detail = await page.request.get(`${API_BASE}/skills/creating-new-tickets`);
		expect(detail.status()).toBe(200);
		const skill = await detail.json();
		expect(skill.markdown).toContain("# Creating New Tickets (KainBain)");

		// Workflow editor smoke: the agent stage settings expose the Skills panel
		// affordance (the panel itself is unit-tested in StageSkillsPanel.test.jsx).
		await page.waitForLoadState("networkidle");
		await expect(
			page.getByRole("button", { name: /^Configure stage Idea/ }),
		).toBeVisible({ timeout: 15000 });
	});
});
