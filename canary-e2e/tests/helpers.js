import { expect } from "@playwright/test";
import { APP_URL, API_URL } from "./urls";

/***
 * MARK: shared canary helpers
 * @description Single home for the fixtures every canary spec needs: app
 *   readiness, project selection, scratch-backend seeding (reset, task
 *   creation), inspector open/close, font settling for geometry assertions,
 *   and small geometry/text utilities. Extracted (task bf5695e4) from the
 *   per-file copies that used to drift apart — new specs must import from
 *   here instead of redefining these.
 * @example import { waitForAppReadyOnProject, createTaskViaApi } from "./helpers";
 ***/

export const API_BASE = API_URL;

export const MOBILE_VIEWPORT = { width: 375, height: 667 };
export const SHORT_MOBILE_VIEWPORT = { width: 375, height: 568 };
export const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

/***
 * MARK: waitForAppReady
 * @description Loads the app and waits until the project selector (backed by
 *   the API) is visible, which means projects have loaded and an active
 *   project has been selected. Does NOT pin the active project — use
 *   `waitForAppReadyOnProject` when the spec's API assertions target one
 *   specific project.
 * @example await waitForAppReady(page)
 * @param {import("@playwright/test").Page} page
 ***/
export async function waitForAppReady(page) {
	await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
	await expect(page).toHaveTitle(/Kainbain/);
	await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
		timeout: 15000,
	});
}

/***
 * MARK: selectProject
 * @description Pins the UI's active project to `name` via the project
 *   selector menu. No-op when that project is already active. Anchored to
 *   the selector's "Project:" prefix so the lookup never collides with the
 *   workflow switcher once named workflows load.
 * @example await selectProject(page, "Project A")
 * @param {import("@playwright/test").Page} page
 * @param {string} name - Project name, e.g. "Project A".
 ***/
export async function selectProject(page, name) {
	const active = page.getByRole("button", { name: new RegExp(name, "i") });
	if (await active.isVisible().catch(() => false)) {
		return;
	}
	await page.getByRole("button", { name: /^Project:/ }).click();
	// The selector is a dialog+listbox (role="option" rows) since the
	// ProjectMenu rewrite; fall back to role="menuitem" for older builds.
	const item = page.getByRole("option", { name }).or(page.getByRole("menuitem", { name }));
	if (await item.isVisible().catch(() => false)) {
		await item.click();
		await expect(page.getByRole("button", { name: new RegExp(name, "i") })).toBeVisible();
	}
}

/***
 * MARK: waitForAppReadyOnProject
 * @description `waitForAppReady` plus pinning the UI's active project to
 *   `name` (default "Project A") — the same project the spec's API
 *   assertions target. A fresh browser context otherwise defaults to the
 *   backend's FIRST project, which on a reused scratch stack is not
 *   necessarily Project A, and UI-created tasks would then land in a
 *   different project than every API poll reads.
 * @example await waitForAppReadyOnProject(page)
 * @param {import("@playwright/test").Page} page
 * @param {string} [name="Project A"]
 ***/
export async function waitForAppReadyOnProject(page, name = "Project A") {
	await waitForAppReady(page);
	await selectProject(page, name);
}

/***
 * MARK: activeProjectId
 * @description Resolves the backend id of the project named `name`
 *   (default "Project A"), falling back to the first project. Accepts the
 *   standalone `request` fixture or `page.request` — never the page itself.
 * @example const id = await activeProjectId(request)
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} [name="Project A"]
 * @returns {Promise<string>} The project id.
 ***/
export async function activeProjectId(request, name = "Project A") {
	const res = await request.get(`${API_BASE}/projects`);
	const projects = await res.json();
	return projects.find((p) => p.name === name)?.id || projects[0]?.id;
}

/***
 * MARK: projectStages
 * @description Reads the active workflow's stage list for a project.
 * @example const stages = await projectStages(request, projectId)
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} projectId
 * @returns {Promise<Array>} The workflow stages.
 ***/
export async function projectStages(request, projectId) {
	const res = await request.get(`${API_BASE}/projects/${projectId}/workflow`);
	const body = await res.json();
	return body.stages;
}

/***
 * MARK: resetProject
 * @description Resets the project's session + tasks via /test/reset so the
 *   test starts deterministic. Scratch-stack only — the endpoint exists on
 *   the provisioned backend the suite owns.
 * @example await resetProject(request, projectId)
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} projectId
 ***/
export async function resetProject(request, projectId) {
	await request.post(`${API_BASE}/test/reset`, { data: { projectId } });
}

/***
 * MARK: stopEngine
 * @description Stops the engine for a project (`POST /compute/stop`): kills
 *   its in-flight runs (parked as interrupted) and returns the GLOBAL engine
 *   to idle when that project owned it. Call this before any explicit
 *   `/execute` — the engine runs one task at a time and rejects a second
 *   execution with 409, and earlier specs' UI-created tasks auto-dispatch
 *   real agent runs (in-column create auto-executes agent stages, F1) that
 *   keep the engine busy for tens of seconds with retries. The polluter is
 *   always Project A (every UI-creating spec pins it), so engine-needing
 *   specs quiesce IT even when their own fixtures live elsewhere:
 *   `await stopEngine(request, await activeProjectId(request))`.
 *   Idempotent and safe standalone (stopping an idle engine is a no-op).
 * @example await stopEngine(request, await activeProjectId(request))
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} projectId
 ***/
export async function stopEngine(request, projectId) {
	await request.post(`${API_BASE}/compute/stop`, { data: { projectId } });
}

/***
 * MARK: listTasks
 * @description Lists a project's tasks via the API.
 * @example const tasks = await listTasks(request, projectId)
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} projectId
 * @returns {Promise<Array>} The task list.
 ***/
export async function listTasks(request, projectId) {
	const res = await request.get(`${API_BASE}/tasks?projectId=${projectId}`);
	return res.json();
}

/***
 * MARK: findTaskByGoal
 * @description Finds one task by its exact goal text (goals are unique per
 *   test run because specs stamp them with Date.now()).
 * @example const task = await findTaskByGoal(request, projectId, goal)
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} projectId
 * @param {string} goal
 * @returns {Promise<Object|undefined>} The matching task, if present.
 ***/
export async function findTaskByGoal(request, projectId, goal) {
	const tasks = await listTasks(request, projectId);
	return tasks.find((t) => t.goal === goal);
}

/***
 * MARK: createTaskViaApi
 * @description Creates a task through the API and returns the created task.
 *   `extra` carries per-test options (stageId, workflowId, execute).
 * @example const task = await createTaskViaApi(request, projectId, goal)
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} projectId
 * @param {string} goal - Used as both title and goal.
 * @param {Object} [extra={}] - Additional POST /tasks fields.
 * @returns {Promise<Object>} The created task.
 ***/
export async function createTaskViaApi(request, projectId, goal, extra = {}) {
	const res = await request.post(`${API_BASE}/tasks`, {
		data: { projectId, title: goal, goal, ...extra },
	});
	expect(res.ok()).toBeTruthy();
	return res.json();
}

/***
 * MARK: waitForTaskVisible
 * @description Waits until the kanban board renders a card for `goal`.
 * @example await waitForTaskVisible(page, goal)
 * @param {import("@playwright/test").Page} page
 * @param {string} goal
 ***/
export async function waitForTaskVisible(page, goal) {
	await expect(page.getByText(goal).first()).toBeVisible({ timeout: 10000 });
}

/***
 * MARK: openTaskInspector
 * @description Opens the slide-over Task Inspector for the card showing
 *   `goal` by clicking the goal text (the card's action row stops click
 *   propagation, so a click there would not open it) and returns the
 *   inspector locator.
 * @example const inspector = await openTaskInspector(page, goal)
 * @param {import("@playwright/test").Page} page
 * @param {string} goal
 * @returns {Promise<import("@playwright/test").Locator>} The inspector.
 ***/
export async function openTaskInspector(page, goal) {
	await page.getByText(goal).first().click();
	const inspector = page.getByRole("complementary", { name: "Task Inspector" });
	await expect(inspector).toBeVisible({ timeout: 10000 });
	return inspector;
}

/***
 * MARK: closeTaskInspector
 * @description Closes the slide-over Task Inspector via its Close button.
 * @example await closeTaskInspector(page)
 * @param {import("@playwright/test").Page} page
 ***/
export async function closeTaskInspector(page) {
	await page.getByRole("button", { name: "Close Task Inspector" }).click();
	await expect(page.getByRole("complementary", { name: "Task Inspector" })).toHaveCount(0);
}

/***
 * MARK: waitForFontsSettled
 * @description Waits until typography settles before any geometry
 *   measurement: the Material Symbols icon font (loaded from the Google
 *   Fonts CDN) renders ligature text at fallback-font metrics while
 *   loading, which temporarily widens icon buttons and produces false
 *   overlap readings. Waits until no font loads are pending AND the icon
 *   family itself is loaded — fonts.status returns to "loaded" even when a
 *   load fails, so the family check is required. On timeout the helper warns
 *   and measures anyway: fallback metrics render wider, so overlap gates can
 *   only get stricter, never silently pass — while CDN slowness alone can no
 *   longer red the gate.
 * @example await waitForFontsSettled(page)
 * @param {import("@playwright/test").Page} page
 ***/
export async function waitForFontsSettled(page) {
	// NOTE: `waitForFunction` takes `(fn, arg, options)` — the options bag
	// must be third. Passing it second silently becomes `arg` and disables
	// the cap, so a slow font CDN burns the whole 60 s test timeout.
	try {
		await page.waitForFunction(
			() =>
				document.fonts.status === "loaded" &&
				document.fonts.check('24px "Material Symbols Outlined"'),
			undefined,
			{ timeout: 15000 },
		);
	} catch (err) {
		// Fail open with a loud warning: the geometry assertions below still
		// run, and broken typography renders fallback (wider) metrics, which
		// can only make overlap gates stricter — never silently pass. A hard
		// throw here would turn CDN slowness into a guaranteed gate failure.
		// eslint-disable-next-line no-console
		console.warn(
			`waitForFontsSettled: icon font not settled within 15 s, measuring anyway (${err?.message || err})`,
		);
	}
}

/***
 * MARK: boxesOverlap
 * @description Point-in-rect overlap check on Playwright viewport bounding
 *   boxes (either box missing counts as no overlap).
 * @example boxesOverlap(deleteBox, consoleBox) => false
 * @param {Object|null} a - First bounding box.
 * @param {Object|null} b - Second bounding box.
 * @returns {boolean} True when the boxes intersect.
 ***/
export function boxesOverlap(a, b) {
	if (!a || !b) return false;
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

/***
 * MARK: taskButtonKey
 * @description Mirrors frontend/src/components/tasks/taskFormatters.js
 *   formatTaskKey: the card's per-task buttons are labelled with
 *   "… #KB-XXXX" where XXXX is the first 4 alphanumerics of the task id,
 *   uppercase.
 * @example taskButtonKey("abc-123-def") => "#KB-ABC1"
 * @param {string} taskId
 * @returns {string} The short task key.
 ***/
export function taskButtonKey(taskId) {
	const clean = String(taskId).replace(/[^a-zA-Z0-9]/g, "");
	return `#KB-${clean.slice(0, 4).toUpperCase()}`;
}

/***
 * MARK: collectPageErrors
 * @description Attaches a pageerror collector; the returned array holds
 *   every uncaught page error as a string for a final toEqual([]).
 * @example const pageErrors = collectPageErrors(page)
 * @param {import("@playwright/test").Page} page
 * @returns {Array<string>} The collected errors.
 ***/
export function collectPageErrors(page) {
	const pageErrors = [];
	page.on("pageerror", (err) => pageErrors.push(String(err)));
	return pageErrors;
}
