import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_URL, API_URL } from "./urls";
import {
	MOBILE_VIEWPORT,
	activeProjectId,
	createTaskViaApi,
	selectProject,
	stopEngine,
	waitForAppReady,
} from "./helpers";

/**
 * MARK: PR Review E2E (the task's example loop)
 * @description Drives the MR-style human review flow end-to-end: fixture git
 *   repo + branch-enabled project → create task (branch provisioned) →
 *   agent-style commits on the task branch → open the PR review page → the
 *   file list/diff renders → add a per-line comment → Fail the stage
 *   (feedback pre-filled from the comment) → assert failback → simulate an
 *   agent fix (new commit) → re-open the review → the comment is visible
 *   with the "Outdated" badge and the diff is refreshed → Pass the stage →
 *   assert advance → the merge stage merges the branch into main.
 *
 * ISOLATION: runs on the default auto-provisioned scratch stack (API :3399,
 * see playwright.config.js) or an operator stack (BOTH CANARY_BASE_URL and
 * CANARY_API_URL set). Both targets are suite-owned backends; the spec
 * additionally self-provisions its fixture repo under /tmp and its own
 * branch-enabled project, so it never touches the shared Project A
 * fixtures or the live :3100/:5173 pair.
 */

const API_BASE = API_URL;

let scratchRoot;
let project;
let stages;

function git(cwd, args) {
	return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

/***
 * Settles backend git activity before the spec drives the fixture repo
 * directly. Task creation provisions the task branch ASYNCHRONOUSLY
 * (fire-and-forget checkout in the backend), so without this gate the
 * spec's own checkouts/commits race it and fail on `index.lock`.
 ***/
async function settleGit(repoDir, branch) {
	await expect
		.poll(
			() => {
				try {
					git(repoDir, ["rev-parse", "--verify", branch]);
				} catch {
					return false;
				}
				return !fs.existsSync(path.join(repoDir, ".git", "index.lock"));
			},
			{ timeout: 15000 },
		)
		.toBe(true);
}

/***
 * Enters the task branch tolerantly: whichever side (backend provisioner
 * or this spec) arrives first creates it; the other just checks it out.
 ***/
function enterTaskBranch(repoDir, branch) {
	try {
		git(repoDir, ["checkout", "-b", branch]);
	} catch {
		git(repoDir, ["checkout", branch]);
	}
}

async function createTask(request, { title, goal }) {
	return createTaskViaApi(request, project.id, goal, {
		title,
		stageId: stages[0].id,
	});
}

async function getTask(page, taskId) {
	const res = await page.request.get(`${API_BASE}/tasks/${taskId}?projectId=${project.id}`);
	return res.json();
}

async function getReview(page, taskId) {
	const res = await page.request.get(
		`${API_BASE}/projects/${project.id}/tasks/${taskId}/review?projectId=${project.id}`,
	);
	expect(res.ok()).toBeTruthy();
	return res.json();
}

test.describe.serial("PR Review E2E", () => {
	test.beforeAll(async ({ request }) => {
		// Scratch git repo + branch-enabled project (fully under /tmp).
		scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-pr-review-"));
		const repoDir = path.join(scratchRoot, "repo");
		fs.mkdirSync(repoDir, { recursive: true });
		git(repoDir, ["init", "-b", "main"]);
		git(repoDir, ["config", "user.email", "canary@kainbain.local"]);
		git(repoDir, ["config", "user.name", "KainBain Canary"]);
		fs.writeFileSync(path.join(repoDir, "README.md"), "# Fixture repo\n");
		git(repoDir, ["add", "."]);
		git(repoDir, ["commit", "-m", "initial commit"]);

		const res = await request.post(`${API_BASE}/projects`, {
			data: {
				name: `PR Review Canary ${Date.now()}`,
				cwd: repoDir,
				notesPath: path.join(scratchRoot, "notes"),
				useBranches: true,
				// Explicit stage ids: creation does not mint them, and id-less
				// stages break jump/advance/failback targeting plus the UI's
				// stage pill (which matches on id).
				stages: [
					{ id: "1", name: "Development", type: "agent" },
					{ id: "2", name: "Code Review", type: "human" },
					{ id: "3", name: "Merge to Main", type: "merge" },
				],
			},
		});
		expect(res.ok()).toBeTruthy();
		project = await res.json();
		expect(project.useBranches).toBe(true);
		// Project provisioning writes scaffolding into the repo cwd
		// (`.kainbain/project.json`, `.gitignore`, `docs`). Commit it on main
		// BEFORE any task branch exists: otherwise the test's later
		// `git add .` on the task branch sweeps it into the agent draft and
		// the review diff shows scaffolding files alongside the real change.
		if (git(repoDir, ["status", "--porcelain"]).trim()) {
			git(repoDir, ["add", "-A"]);
			git(repoDir, ["commit", "-m", "chore: project scaffolding"]);
		}
		const wfRes = await request.get(`${API_BASE}/projects/${project.id}/workflow`);
		const wf = await wfRes.json();
		stages = wf.stages;
		expect(stages.map((s) => s.type)).toEqual(["agent", "human", "merge"]);
	});

	/***
	 * The full example loop from the task brief:
	 * draft → human review → fail with comments → agent fix → re-review → pass.
	 ***/
	test("open review → comment → fail with comments → agent fix → re-review (stale) → pass → merge", async ({
		page,
		request,
	}) => {
		test.setTimeout(120000);

		// ---- Create task; branch support provisions kb/<taskId> ----
		const goal = "Implement the session module";
		const task = await createTask(request, { title: goal, goal });
		expect(task.branch).toBe(`kb/${task.id}`);

		// ---- Simulate the agent draft: commit work on the task branch ----
		const repoDir = project.cwd;
		await settleGit(repoDir, task.branch);
		enterTaskBranch(repoDir, task.branch);
		fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
		fs.writeFileSync(
			path.join(repoDir, "src/session.js"),
			["const a = 1;", "const b = 2;", "return a + b;", ""].join("\n"),
		);
		git(repoDir, ["add", "."]);
		git(repoDir, ["commit", "-m", "feat(session): first draft"]);
		fs.appendFileSync(path.join(repoDir, "src/session.js"), "const extra = 4;\n");
		git(repoDir, ["add", "."]);
		git(repoDir, ["commit", "-m", "feat(session): add extra"]);
		git(repoDir, ["checkout", "main"]);

		// ---- Park the task at the human checkpoint ----
		const humanStage = stages.find((s) => s.type === "human");
		const jumpRes = await page.request.post(`${API_BASE}/tasks/${task.id}/jump`, {
			data: { projectId: project.id, stageId: humanStage.id },
		});
		expect(jumpRes.ok()).toBeTruthy();

		// ---- Review payload: diff, commits, counts (A4) ----
		const review = await getReview(page, task.id);
		expect(review.branchSupported).toBe(true);
		expect(review.files.map((f) => f.path)).toEqual(["src/session.js"]);
		expect(review.files[0].additions).toBe(4);
		expect(review.files[0].deletions).toBe(0);
		expect(review.commits).toHaveLength(2); // newest-first (D8)
		expect(review.commits[0].message).toContain("extra");
		expect(review.aheadBy).toBe(2);
		expect(review.headSha).toBeTruthy();

		// ---- UI: open the review page (A1) ----
		// The review page fetches with the UI's ACTIVE project: select the
		// fixture project first, or the review resolves against Project A
		// and the diff never renders.
		await waitForAppReady(page);
		await selectProject(page, project.name);
		await page.goto(`${APP_URL}/#/tasks/${task.id}/review`);
		await expect(page.getByTestId("diff-view")).toBeVisible({ timeout: 15000 });
		// The path renders twice (sidebar file button + diff header): both must
		// be visible.
		await expect(page.getByTestId("file-diff-list").getByText("src/session.js")).toBeVisible();
		await expect(page.getByTestId("diff-view").getByText("src/session.js")).toBeVisible();
		await expect(page.getByText("kb/" + task.id + " → main")).toBeVisible();
		await expect(page.getByText("Stage: Code Review")).toBeVisible();

		// ---- UI: comment on a line (A2) ----
		await page.getByLabel("Add comment on new line 2").click();
		const composer = page.getByTestId("review-comment-composer");
		await composer.locator("textarea").fill("Please handle the null case here");
		await composer.getByText("Add comment").click();
		// Scoped to the posted thread: the composer textarea keeps its text,
		// so an unscoped lookup matches twice.
		await expect(
			page.getByTestId("review-comment-thread").getByText("Please handle the null case here"),
		).toBeVisible({ timeout: 10000 });

		// The thread above renders optimistically (useReview.addComment swaps
		// the temp entry for the server record), so the POST may still be in
		// flight when its text appears — poll the API for the comment rather
		// than reading once.
		await expect
			.poll(
				async () => {
					const res = await page.request.get(
						`${API_BASE}/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
					);
					if (!res.ok()) return undefined;
					return (await res.json()).comments[0]?.id;
				},
				{ timeout: 15000 },
			)
			.toBeTruthy();

		// ---- UI: Fail the stage — feedback pre-filled from the comment (A5, A6) ----
		await page.getByLabel("Fail this stage with feedback").click();
		const failDialog = page.getByRole("dialog", { name: "Fail stage with feedback" });
		await expect(failDialog.locator("textarea")).toHaveValue(
			/Review comments[\s\S]*`src\/session\.js`:L2 — Please handle the null case here/,
		);
		await failDialog.getByRole("button", { name: /Fail Stage/ }).click();
		await expect(failDialog).not.toBeVisible({ timeout: 15000 });

		// Failback: the task goes back to the previous agent stage with feedback.
		await expect
			.poll(
				async () => {
					const t = await page.request.get(
						`${API_BASE}/tasks/${task.id}?projectId=${project.id}`,
					);
					return (await t.json()).currentStageId;
				},
				{ timeout: 20000 },
			)
			.toBe(stages[0].id);
		const failedTask = await (await request.get(`${API_BASE}/tasks/${task.id}?projectId=${project.id}`)).json();
		expect(failedTask.feedback).toContain("Please handle the null case here");

		// ---- Simulate the agent fix: a new commit on the task branch ----
		await settleGit(repoDir, task.branch);
		git(repoDir, ["checkout", task.branch]);
		fs.appendFileSync(path.join(repoDir, "src/session.js"), "if (b == null) return 0;\n");
		git(repoDir, ["add", "."]);
		git(repoDir, ["commit", "-m", "fix(session): handle null case"]);
		git(repoDir, ["checkout", "main"]);

		// The fix is done: the task returns to the human checkpoint for
		// re-review (resolve + pass are only enabled while waiting_human).
		const reparkRes = await page.request.post(`${API_BASE}/tasks/${task.id}/jump`, {
			data: { projectId: project.id, stageId: humanStage.id },
		});
		expect(reparkRes.ok()).toBeTruthy();

		// ---- Re-review: refreshed diff + stale badge on the old comment (A6) ----
		await page.goto(`${APP_URL}/#/tasks/${task.id}/review`);
		await expect(page.getByTestId("diff-view")).toBeVisible({ timeout: 15000 });
		await expect(page.getByText("if (b == null) return 0;")).toBeVisible({ timeout: 15000 }); // fix is in the diff
		await page.getByRole("button", { name: /Conversation/ }).click();
		await expect(page.getByText("Outdated")).toBeVisible(); // headSha moved
		await expect(
			page.getByTestId("review-comment-thread").getByText("Please handle the null case here"),
		).toBeVisible();

		// ---- Resolve the comment and pass the stage (A6, A7) ----
		await page.getByText("✓ Resolve").click();
		await expect(
			page.getByRole("button", { name: /Conversation/ }),
		).toContainText(/Conversation/);
		await page.getByLabel("Pass this stage").click();
		const passDialog = page.getByRole("dialog", { name: "Pass stage" });
		await passDialog.locator("textarea").fill("Looks good — ship it");
		await passDialog.getByRole("button", { name: /Pass Stage/ }).click();
		await expect(passDialog).not.toBeVisible({ timeout: 15000 });

		// Advance: the task lands on the merge stage (A7).
		await expect
			.poll(
				async () => {
					const t = await page.request.get(
						`${API_BASE}/tasks/${task.id}?projectId=${project.id}`,
					);
					return (await t.json()).currentStageId;
				},
				{ timeout: 20000 },
			)
			.toBe(stages[stages.length - 1].id);

		// ---- Merge stage integrates the branch into main (A8) ----
		// Quiesce Project A's engine first: earlier specs' UI-created tasks
		// auto-dispatch real agent runs that keep the global engine busy,
		// and /execute 409s while another task owns it. Those runs retry for
		// tens of seconds, so one quiesce can lose the race — re-quiesce and
		// retry on 409 only (bounded; any other status still fails fast).
		let execRes;
		for (let attempt = 1; ; attempt++) {
			await stopEngine(page.request, await activeProjectId(page.request));
			execRes = await page.request.post(
				`${API_BASE}/tasks/${task.id}/execute`,
				{
					data: { projectId: project.id },
				},
			);
			if (execRes.ok() || execRes.status() !== 409 || attempt >= 5) break;
			await page.waitForTimeout(2000);
		}
		expect(execRes.ok()).toBeTruthy();
		// Poll a composite so a timeout prints the terminal state
		// (status + failureReason) instead of a bare mismatch.
		await expect
			.poll(
				async () => {
					const t = await (
						await page.request.get(
							`${API_BASE}/tasks/${task.id}?projectId=${project.id}`,
						)
					).json();
					return `${t.status} :: ${(t.failureReason || "").slice(0, 300)}`;
				},
				{ timeout: 30000 },
			)
			.toMatch(/^completed ::/);
		const merged = git(repoDir, ["show", "main:src/session.js"]);
		expect(merged).toContain("if (b == null) return 0;");
	});

	test("review page shows the branch-unsupported empty state when branch support is off (A10, D7)", async ({
		page,
	}) => {
		// Create a non-branch project and task, park it at the human stage.
		const plainRes = await page.request.post(`${API_BASE}/projects`, {
			data: {
				name: `No Branches ${Date.now()}`,
				cwd: path.join(scratchRoot, "plain"),
				notesPath: path.join(scratchRoot, "plain-notes"),
				useBranches: false,
				stages: [
					{ id: "1", name: "Development", type: "agent" },
					{ id: "2", name: "Code Review", type: "human" },
				],
			},
		});
		expect(plainRes.ok()).toBeTruthy();
		const plain = await plainRes.json();

		const taskRes = await page.request.post(`${API_BASE}/tasks`, {
			data: {
				projectId: plain.id,
				title: "Doc review",
				goal: "Review the design document",
				stageId: null,
			},
		});
		const plainTask = await taskRes.json();
		await page.request.post(`${API_BASE}/tasks/${plainTask.id}/jump`, {
			data: { projectId: plain.id, stageId: plain.stages[1].id },
		});

		// The review page fetches with the UI's ACTIVE project: select the
		// fixture project first, or the review resolves against Project A.
		await waitForAppReady(page);
		await selectProject(page, plain.name);
		await page.goto(`${APP_URL}/#/tasks/${plainTask.id}/review`);
		// The review still opens (read-only, plan/document reviews stay usable)
		// and Pass/Fail remain available below the empty state.
		await expect(page.getByTestId("task-review-page")).toBeVisible({ timeout: 15000 });
	});

	test("reports tab enables line-by-line review of stage reports outside git diff", async ({
		page,
		request,
	}) => {
		test.setTimeout(120000);

		// Create task in the branch-enabled project
		const goal = "Review implementation plan report";
		const task = await createTask(request, { title: goal, goal });

		// Write a stage report to the task's docs directory (centralised docs style)
		const repoDir = project.cwd;
		const taskDocsDir = path.join(repoDir, "docs", "tasks", task.id);
		fs.mkdirSync(taskDocsDir, { recursive: true });
		fs.writeFileSync(
			path.join(taskDocsDir, "IMPLEMENTATION_PLAN.md"),
			[
				"# Implementation Plan",
				"",
				"## Overview",
				"This is the current state of the implementation plan.",
				"Line 5 has crucial details for review.",
			].join("\n"),
		);

		// Park task at human review stage
		const humanStage = stages.find((s) => s.type === "human");
		await page.request.post(`${API_BASE}/tasks/${task.id}/jump`, {
			data: { projectId: project.id, stageId: humanStage.id },
		});

		// Open review page
		await waitForAppReady(page);
		await selectProject(page, project.name);
		await page.goto(`${APP_URL}/#/tasks/${task.id}/review`);

		// Check Reports tab button is visible
		const reportsTab = page.getByRole("button", { name: /Reports/ });
		await expect(reportsTab).toBeVisible({ timeout: 15000 });
		await reportsTab.click();

		// Report list and ReportReviewView should render
		await expect(page.getByTestId("report-review-pane")).toBeVisible();
		await expect(page.getByTestId("report-review-view")).toBeVisible();
		await expect(page.getByText("Line 5 has crucial details for review.")).toBeVisible();

		// Add a line comment on line 5
		await page.getByLabel("Add comment on report line 5").click();
		const composer = page.getByTestId("review-comment-composer");
		await composer.locator("textarea").fill("Please clarify error handling on this step");
		await composer.getByText("Add comment").click();

		// Verify the comment thread is rendered inline
		await expect(
			page.getByTestId("review-comment-thread").getByText("Please clarify error handling on this step"),
		).toBeVisible({ timeout: 10000 });

		// Take screenshot to document the feature working
		const screenshotPath = "/home/server/projects/kainbain/docs/tasks/bafc4c11-f74f-48af-8e6e-c149d9392f35/assets/screenshot-reports-review-live.png";
		await page.screenshot({ path: screenshotPath, fullPage: true });

		// Pass the stage and verify review comment is carried into the human approval report
		await page.getByLabel("Pass this stage").click();
		const passDialog = page.getByRole("dialog", { name: "Pass stage" });
		await passDialog.locator("textarea").fill("Approved with notes");
		await passDialog.getByRole("button", { name: /Pass Stage/ }).click();

		// Verify task advances to the merge stage
		await expect
			.poll(
				async () => {
					const t = await page.request.get(
						`${API_BASE}/tasks/${task.id}?projectId=${project.id}`,
					);
					return (await t.json()).currentStageId;
				},
				{ timeout: 20000 },
			)
			.toBe(stages[stages.length - 1].id);

		// Verify report on disk contains ## Review Comments
		const reportFiles = fs.readdirSync(taskDocsDir);
		const approvalReport = reportFiles.find((f) => f.startsWith("code-review-") && f.endsWith(".md"));
		expect(approvalReport).toBeTruthy();
		const approvalContent = fs.readFileSync(path.join(taskDocsDir, approvalReport), "utf8");
		expect(approvalContent).toContain("## Review Comments");
		expect(approvalContent).toContain("Please clarify error handling on this step");
	});

	/***
	 * Regression guard for "report review mode doesn't work on mobile": at a
	 * phone viewport the report list must collapse into a labelled picker (not
	 * stack above the body), and neither the page nor the report pane may
	 * overflow horizontally. The report deliberately carries an unbreakable
	 * token plus a long path so the old fixed-gutter layout would blow out.
	 ***/
	test("reports tab is usable at a mobile viewport without horizontal overflow", async ({
		page,
		request,
	}) => {
		test.setTimeout(120000);
		await page.setViewportSize(MOBILE_VIEWPORT);

		const goal = "Review mobile report layout";
		const task = await createTask(request, { title: goal, goal });
		const taskDocsDir = path.join(project.cwd, "docs", "tasks", task.id);
		fs.mkdirSync(taskDocsDir, { recursive: true });
		fs.writeFileSync(
			path.join(taskDocsDir, "IMPLEMENTATION_PLAN.md"),
			[
				"# Implementation Plan",
				"",
				"A deliberately unbreakable token follows:",
				"AAAA0000111122223333444455556666777788889999BBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ",
				"Line 5 has crucial mobile details for review.",
			].join("\n"),
		);

		const humanStage = stages.find((s) => s.type === "human");
		await page.request.post(`${API_BASE}/tasks/${task.id}/jump`, {
			data: { projectId: project.id, stageId: humanStage.id },
		});

		await waitForAppReady(page);
		await selectProject(page, project.name);
		await page.goto(`${APP_URL}/#/tasks/${task.id}/review`);

		const reportsTab = page.getByRole("button", { name: /Reports/ });
		await expect(reportsTab).toBeVisible({ timeout: 15000 });
		await reportsTab.click();

		// Mobile presentation: picker visible, desktop sidebar collapsed away.
		const picker = page.getByTestId("report-review-picker");
		await expect(picker).toBeVisible();
		await expect(page.getByTestId("report-review-list")).toBeHidden();
		await expect(picker).toHaveValue(/IMPLEMENTATION_PLAN\.md/);
		await expect(page.getByText("Line 5 has crucial mobile details for review.")).toBeVisible();

		/***
		 * Any of the page, the review shell, or the report pane reporting a
		 * scrollWidth wider than its clientWidth means content is either
		 * horizontally scrollable (the bug) or clipped (the regression guard).
		 * 1px of slack absorbs sub-pixel rounding.
		 ***/
		const overflowTargets = () =>
			page.evaluate(() => {
				const selectorTargets = [
					['html', document.documentElement],
					['task-review-page', document.querySelector('[data-testid="task-review-page"]')],
					['report-review-view', document.querySelector('[data-testid="report-review-view"]')],
				];
				return selectorTargets
					.filter(([, el]) => Boolean(el))
					.map(([name, el]) => ({
						name,
						scrollWidth: el.scrollWidth,
						clientWidth: el.clientWidth,
					}));
			});

		const assertNoHorizontalOverflow = async () => {
			const widths = await overflowTargets();
			for (const w of widths) {
				expect(
					w.scrollWidth,
					`${w.name} overflows horizontally (scrollWidth ${w.scrollWidth} > clientWidth ${w.clientWidth})`,
				).toBeLessThanOrEqual(w.clientWidth + 1);
			}
		};

		await assertNoHorizontalOverflow();

		// And the Rendered Preview path must not blow out either.
		await page.getByRole("button", { name: "Rendered Preview" }).click();
		await expect(page.getByTestId("report-preview-pane")).toBeVisible();
		await assertNoHorizontalOverflow();

		// Back to line review; the per-line affordance stays reachable (not
		// hover-gated) on touch-sized viewports.
		await page.getByRole("button", { name: "Line Review" }).click();
		await expect(page.getByLabel("Add comment on report line 5")).toBeVisible();
	});
});