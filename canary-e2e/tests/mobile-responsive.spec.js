import { test, expect } from "@playwright/test";
import { API_URL } from "./urls";
import {
	MOBILE_VIEWPORT,
	activeProjectId,
	createTaskViaApi,
	selectProject,
	taskButtonKey,
	waitForAppReady,
	waitForFontsSettled,
} from "./helpers";

/***
 * MARK: Mobile Responsive E2E Tests
 * @description Verifies the mobile/tablet responsive layout:
 *   - Mobile viewport (< 768px) single-column Kanban view
 *   - Pill-based stage selector tab strip to switch active column
 *   - Minimum 44x44px touch targets
 *   - Full-width slide-over drawer inspector on mobile
 *   - Compact Now Playing bar
 ***/

test.describe("Mobile Responsive Layout", () => {
	// Full page load + project select share one budget in beforeEach; under
	// serial-gate load the scratch stack can need more than the default 60s
	// (observed 2026-10-20: first goto still in flight at the deadline while
	// 124 sibling tests passed). Same 120s bound as the header-controls
	// describe below — this only bounds a genuine hang instead of 60s.
	test.setTimeout(120000);
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await waitForAppReady(page);
		await selectProject(page, "Project A");
	});

	test("renders mobile stage column selector tab strip", async ({ page }) => {
		// Stage selector tab strip should be visible on mobile
		const tabStrip = page.getByRole("tablist", { name: "Mobile stage column selector" });
		await expect(tabStrip).toBeVisible({ timeout: 10000 });

		// Tab pills for stages exist and have minimum 44px touch target
		const firstStageTab = tabStrip.getByRole("tab").first();
		await expect(firstStageTab).toBeVisible();

		const box = await firstStageTab.boundingBox();
		expect(box).not.toBeNull();
		expect(box.height).toBeGreaterThanOrEqual(40);
	});

	test("switching mobile stage tabs displays the corresponding column", async ({ page }) => {
		const tabStrip = page.getByRole("tablist", { name: "Mobile stage column selector" });
		await expect(tabStrip).toBeVisible({ timeout: 10000 });

		// Click on second stage pill (e.g. Plan / Review Plan)
		const tabs = tabStrip.getByRole("tab");
		const secondTab = tabs.nth(1);
		await expect(secondTab).toBeVisible();
		await secondTab.click();

		// Second tab becomes selected
		await expect(secondTab).toHaveAttribute("aria-selected", "true");
	});

	test("slide-over inspector opens in mobile drawer mode with accessible touch controls", async ({ page }) => {
		// Create a task via in-line column add
		const addBtn = page.getByRole("button", { name: /Add task to/i }).first();
		await expect(addBtn).toBeVisible({ timeout: 10000 });
		await addBtn.click();

		const input = page.locator('input[placeholder*="task goal" i]');
		await expect(input).toBeVisible();
		const goal = `Mobile task ${Date.now()}`;
		await input.fill(goal);
		await input.press("Enter");

		// Click on created task card to open slide-over inspector
		const taskCard = page.getByText(goal).first();
		await expect(taskCard).toBeVisible({ timeout: 10000 });
		await taskCard.dispatchEvent("click");

		// Mobile slide-over inspector opens
		const inspector = page.getByRole("complementary", { name: "Task Inspector" });
		await expect(inspector).toBeVisible({ timeout: 10000 });

		// Close inspector button has minimum 44px touch target
		const closeBtn = page.getByRole("button", { name: "Close Task Inspector" });
		await expect(closeBtn).toBeVisible();
		const closeBox = await closeBtn.boundingBox();
		expect(closeBox.height).toBeGreaterThanOrEqual(40);

		await closeBtn.click();
		await expect(inspector).toHaveCount(0);
	});

	test("now playing bar is compact and controls are visible without clipping", async ({ page }) => {
		// Now Playing bar footer
		const nowPlaying = page.locator("footer");
		await expect(nowPlaying).toBeVisible();
		await expect(page.getByRole("button", { name: /Start Engine|Stop Engine/i })).toBeVisible();
	});

	/***
	 * MARK: Mobile declutter tests (task 7a411b12 + c213d3a9)
	 * @description On mobile the Show Completed toggle and the Live Agent
	 *   Activity Console are hidden (CSS `hidden md:flex`); the workflow
	 *   selector and search input stay available. The old ALL / FAILED /
	 *   HUMAN ONLY filter pills were removed entirely (task c213d3a9) — the
	 *   unified search bar is the only filter path on every viewport, and it
	 *   supports `!failed` / `!human` system filters. Task cards render the
	 *   compact density (one clamped goal line, no Run Stage / stage-nav rows)
	 *   so more cards fit on screen.
	 ***/
	test("filter pills are gone; search bar with !filters is available on mobile (task 7a411b12 + c213d3a9)", async ({ page }) => {
		// The old status pill buttons no longer exist on any viewport.
		await expect(page.getByRole("button", { name: "Human only" })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Failed" })).toHaveCount(0);
		// Show Completed toggle hidden on mobile.
		await expect(page.getByText(/Show Completed/)).toBeHidden();

		// R3: the Live Agent Activity Console is hidden (only rendered when there
		// is activity; toBeHidden passes whether absent or display:none).
		await expect(page.getByTestId("activity-console-bar")).toBeHidden();

		// Regression guard: search + workflow selector must stay available on mobile.
		await expect(page.getByPlaceholder(/Search tasks/i)).toBeVisible();
		const projectBtn = page.getByRole("button", { name: /Project/i }).first();
		await expect(projectBtn).toBeVisible();

		// New (task c213d3a9): the unified search bar supports `!` system
		// filters on mobile — typing `!` opens the suggestion dropdown.
		const searchInput = page.getByPlaceholder(/Search tasks/i);
		await searchInput.click();
		await searchInput.fill("!");
		await expect(page.getByRole("option", { name: /!failed/i })).toBeVisible({
			timeout: 5000,
		});
		await expect(page.getByRole("option", { name: /!human/i })).toBeVisible();
		// Clear the draft so it does not leak into the next test.
		await searchInput.fill("");
	});

	test("search bar with !filters and Show Completed are visible on desktop (task 7a411b12 + c213d3a9)", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		// No separate reload: waitForAppReady's goto is already a fresh load,
		// and every extra navigation is stall exposure under serial-gate load.
		// Responsive CSS re-evaluates live on viewport resize regardless.
		await waitForAppReady(page);

		// The old status pill buttons no longer exist.
		await expect(page.getByRole("button", { name: "Human only" })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Failed" })).toHaveCount(0);
		// Show Completed toggle is still visible on desktop.
		await expect(page.getByText(/Show Completed/)).toBeVisible();
		// The unified search bar is visible and supports `!` filters.
		await expect(page.getByPlaceholder(/Search tasks/i)).toBeVisible();
	});

	test("task cards render the compact density on mobile (task 7a411b12)", async ({ page }) => {
		// Passive fixture via API on the first (agent) column: in-column
		// create would auto-execute the agent stage (F1) and run the card off
		// the board before it can be measured, and checkpoint cards render
		// expanded with their Approve/Reject rows. Creation UX itself is
		// covered by the submit-flow and inspector tests.
		const projectId = await activeProjectId(page.request);
		const goal = `Compact task ${Date.now()}`;
		await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
		await page.reload();
		await waitForAppReady(page);
		await selectProject(page, "Project A");

		// The compact card for the created task must be short: roughly ID + one
		// clamped goal line + status row (no Run Stage / stage-nav rows).
		// Scoped to THIS task's card: on a shared stack the DOM also holds cards
		// from hidden columns (behind the mobile tab strip) and earlier tests —
		// a bare .first() matched one of those and failed on "hidden".
		const card = page.getByLabel(/^Task #KB-/).filter({ hasText: goal });
		await expect(card).toBeVisible({ timeout: 10000 });
		const box = await card.boundingBox();
		expect(box).not.toBeNull();
		expect(box.height).toBeLessThan(110); // full cards were ~150-250px
		// The hidden rows are genuinely absent in compact.
		await expect(card.getByRole("button", { name: /Run stage for task/i })).toHaveCount(0);
		await expect(card.getByRole("button", { name: /Move task .* (left|right)/i })).toHaveCount(0);
	});
});

/***
 * MARK: Mobile tap-popups deconfliction tests (task e2cf55ac)
 * @description Real touch sequences (hasTouch + page.tap): tapping a button or
 *   dropdown (Workflow Pipeline Switcher, task search input, checkpoint
 *   Approve) must actuate that control and NEVER summon an InfoTooltip popover
 *   or the full-screen task inspector over it. Tapping a non-button card region
 *   still opens the inspector. Desktop click/hover behaviour is regression
 *   guarded at 1280x720.
 ***/
test.describe("Mobile tap popups deconfliction (task e2cf55ac)", () => {
	test.use({ viewport: MOBILE_VIEWPORT, hasTouch: true });

	// Navigate before every tap test: without this the page stays on
	// about:blank and every locator times out. Touch emulation (hasTouch) also
	// flips matchMedia to (hover: none) and (pointer: coarse) — exactly what
	// production prefersTouchInput() reads — so these tests exercise the real
	// touch code path. The active project is pinned to "Project A" so
	// UI-created tasks land in the same project every API poll targets.
	test.beforeEach(async ({ page }) => {
		await waitForAppReady(page);
		await selectProject(page, "Project A");
	});

	test("tapping the pipeline switcher opens only the menu, never a tooltip popover", async ({ page }) => {
		const switcher = page.getByRole("button", { name: "Select pipeline workflow" });
		await expect(switcher).toBeVisible({ timeout: 10000 });

		await switcher.tap();

		// The dropdown menu opens and its items are tappable.
		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();
		// No InfoTooltip popover is summoned over the menu.
		await expect(page.getByText("Workflow Pipeline Switcher")).toHaveCount(0);
		await menu.getByRole("menuitem").first().tap();
		await expect(page.getByRole("menu")).toHaveCount(0);
	});

	test("tapping the task search field focuses it without popping a tooltip", async ({ page }) => {
		const search = page.getByPlaceholder(/Search tasks/i);
		await expect(search).toBeVisible({ timeout: 10000 });

		await search.tap();

		await expect(search).toBeFocused();
		await expect(page.getByText("Task Search & Filter")).toHaveCount(0);
		await search.fill("nothing-matches-this");
		await expect(page.getByText("Task Search & Filter")).toHaveCount(0);
	});

	test("tapping a card body opens the inspector and it can be closed", async ({ page }) => {
		const goal = `Tap guard task ${Date.now()}`;
		// Passive fixture via API: this test measures tap behavior, not task
		// creation, and in-column create would auto-execute the agent stage
		// (F1) and run the card off the board before it can be tapped.
		const projectId = await activeProjectId(page.request);
		await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
		await page.reload();
		await waitForAppReady(page);
		await selectProject(page, "Project A");

		const cardTitle = page.getByText(goal).first();
		await expect(cardTitle).toBeVisible({ timeout: 10000 });
		// Non-button card region: tap opens the slide-over inspector.
		// The goal row keeps animating on this board (live status tickers), so a
		// real tap never reaches Playwright's stability window; dispatch the
		// bubbling click directly on the non-interactive row instead — the same
		// event path TaskCard's root guard inspects (e.target = the goal div).
		await cardTitle.dispatchEvent("click");
		const inspector = page.getByRole("complementary", { name: "Task Inspector" });
		await expect(inspector).toBeVisible({ timeout: 10000 });

		await page.getByRole("button", { name: "Close Task Inspector" }).tap();
		await expect(inspector).toHaveCount(0);
	});

	test("tapping Approve on a checkpoint card advances the task without opening the inspector", async ({ page }) => {
		const projectId = await activeProjectId(page.request);
		const goal = `Checkpoint tap task ${Date.now()}`;
		// Passive fixture via API (see the card-body test above): no inspector
		// opens and nothing auto-executes, so the task starts at stage 1.
		await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });

		// Drive the task to the human checkpoint stage (4. Review Plan) via API.
		let taskId = null;
		await expect
			.poll(
				async () => {
					const res = await page.request.get(`${API_URL}/tasks?projectId=${projectId}`);
					const tasks = await res.json();
					const task = tasks.find((t) => t.goal === goal);
					if (task) taskId = task.id;
					return task?.currentStageId;
				},
				{ timeout: 10000 },
			)
			.toBe("1");

		for (let i = 0; i < 3; i += 1) {
			await page.request.post(`${API_URL}/tasks/${taskId}/advance`, {
				data: { projectId },
			});
		}
		await expect
			.poll(async () => {
				const res = await page.request.get(`${API_URL}/tasks?projectId=${projectId}`);
				const tasks = await res.json();
				return tasks.find((t) => t.id === taskId)?.currentStageId;
			}, { timeout: 10000 })
			.toBe("4");

		// Switch to the checkpoint stage column and tap Approve on THIS task's
		// card (the column may hold other checkpoint tasks; the key is derived
		// from the id, so the locator stays strict).
		const tabStrip = page.getByRole("tablist", { name: "Mobile stage column selector" });
		await tabStrip.getByRole("tab", { name: /Review Plan/i }).tap();

		const approveBtn = page.getByRole("button", { name: `Approve task ${taskButtonKey(taskId)}` });
		await expect(approveBtn).toBeVisible({ timeout: 10000 });
		await approveBtn.tap();

		// Approval actuates (task advances to stage 5); the inspector never opens.
		await expect(page.getByRole("complementary", { name: "Task Inspector" })).toHaveCount(0);
		await expect
			.poll(async () => {
				const res = await page.request.get(`${API_URL}/tasks?projectId=${projectId}`);
				const tasks = await res.json();
				return tasks.find((t) => t.id === taskId)?.currentStageId;
			}, { timeout: 15000 })
			.toBe("5");
	});
});

/***
 * MARK: Header controls on mobile (task 66ad153f)
 * @description The global top bar used to paint tabs and the app link
 *   underneath the monitor/menu buttons on phone widths. Every header
 *   control must meet the 44px touch floor and stay fully inside the
 *   viewport at MOBILE_VIEWPORT.
 ***/
test.describe("Header controls on mobile (task 66ad153f)", () => {
	// Full page load + project select + third-party icon-font settle share one
	// budget in beforeEach; under serial-gate load the scratch stack can need
	// more than the default 60s (observed 2026-10-16: hook still settling
	// fonts at the deadline). Assertions unchanged — this only bounds a
	// genuine hang at 120s instead of 60s.
	test.setTimeout(120000);
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await waitForAppReady(page);
		await selectProject(page, "Project A");
		await waitForFontsSettled(page);
	});

	test("every header control meets the touch floor and stays on-screen", async ({
		page,
	}) => {
		const header = page.locator("header").first();
		await expect(header).toBeVisible();
		const controls = header.locator("button, a");
		expect(await controls.count()).toBeGreaterThan(0);
		const viewport = page.viewportSize();
		for (let i = 0; i < (await controls.count()); i += 1) {
			const box = await controls.nth(i).boundingBox();
			if (!box || box.width === 0 || box.height === 0) continue; // hidden by CSS
			expect(box.height).toBeGreaterThanOrEqual(44);
			expect(box.width).toBeGreaterThanOrEqual(44);
			expect(box.x).toBeGreaterThanOrEqual(-1);
			expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
		}
	});
});

/***
 * MARK: Desktop regression (touch-free context)
 * @description Runs WITHOUT hasTouch so matchMedia reports (hover: hover) and
 *   (pointer: fine) — the real desktop profile. Proves the tap guard changed
 *   nothing for mouse users: the switcher menu still opens on click, and the
 *   InfoTooltip still opens on hover after the hover delay.
 ***/
test.describe("Desktop regression for tap guard (task e2cf55ac)", () => {
	test("switcher opens its menu on click and tooltip only on hover", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await waitForAppReady(page);
		const switcher = page.getByRole("button", { name: "Select pipeline workflow" });
		await expect(switcher).toBeVisible({ timeout: 10000 });

		// Click opens the menu; no tooltip popover on plain click.
		await switcher.click();
		const menu = page.getByRole("menu");
		await expect(menu).toBeVisible();

		// Desktop mouse semantics: the pointer is resting on the trigger after
		// the click, so after the 1000ms hover delay the tooltip appears — that
		// is correct desktop behaviour and must not block the open menu.
		await expect(page.getByText("Workflow Pipeline Switcher")).toBeVisible({
			timeout: 3000,
		});
		await expect(menu).toBeVisible();

		// The dropdown is a toggle: clicking the trigger again closes it.
		await switcher.click();
		await expect(menu).toHaveCount(0);
	});
});

/***
 * MARK: Mobile search bar with tags (task da91c31e)
 * @description When tags are present at 375px viewport (MOBILE_VIEWPORT),
 *   the search block must stay fully width-bounded within the viewport.
 *   Even with 6 tags populated, the chip strip scrolls horizontally,
 *   the search bar never overflows the line/viewport, and the text input
 *   and clear button remain inside the viewport and fully interactable.
 ***/
test.describe("Mobile search bar with tags (task da91c31e)", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await waitForAppReady(page);
		await selectProject(page, "Project A");
	});

	test("search bar with 6 tags remains width-bounded with input and clear within viewport", async ({
		page,
	}) => {
		const searchInput = page.getByRole("combobox", { name: "Search tasks" });
		await expect(searchInput).toBeVisible({ timeout: 10000 });

		// Type 6 tags into search box
		await searchInput.fill("#Dev #PO #Design #QA #Ops #Security ");

		// Wait for chips to appear
		const chipsStrip = page.getByTestId("unified-search-chips");
		await expect(chipsStrip).toBeVisible({ timeout: 10000 });
		const removeBtns = page.getByRole("button", { name: /^Remove tag / });
		await expect(removeBtns).toHaveCount(6);

		// Clear button should be visible
		const clearBtn = page.getByRole("button", { name: "Clear search" });
		await expect(clearBtn).toBeVisible();

		// Bounding box checks at 375px viewport
		const viewport = page.viewportSize();
		const searchBar = page.getByTestId("unified-search-bar");
		const barBox = await searchBar.boundingBox();
		expect(barBox).not.toBeNull();
		// Search bar should be bounded within viewport width
		expect(barBox.x).toBeGreaterThanOrEqual(0);
		expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);

		// Input must remain inside viewport and be focusable
		const inputBox = await searchInput.boundingBox();
		expect(inputBox).not.toBeNull();
		expect(inputBox.x).toBeGreaterThanOrEqual(0);
		expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(viewport.width + 1);

		// Clear button must remain inside viewport
		const clearBox = await clearBtn.boundingBox();
		expect(clearBox).not.toBeNull();
		expect(clearBox.x).toBeGreaterThanOrEqual(0);
		expect(clearBox.x + clearBox.width).toBeLessThanOrEqual(viewport.width + 1);

		// Page body must have no horizontal scroll overflow
		const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
	});
});

