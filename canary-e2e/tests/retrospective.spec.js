import { test, expect } from "@playwright/test";
import { APP_URL } from "./urls";
import { MOBILE_VIEWPORT, collectPageErrors } from "./helpers";

/***
 * MARK: Retrospective Stage-Type Filter Canary
 * @description Smoke guard for the retrospective page's stage-type visibility
 *   filter: the page renders with no uncaught page errors, both plain and via
 *   a `?show=` share link. Toggle behavior, persistence, and URL sync are
 *   covered by unit/component tests; this only proves the route and the query
 *   path load cleanly in a real browser (works on an empty scratch project).
 ***/
test("retrospective page renders without page errors", async ({ page }) => {
	const pageErrors = collectPageErrors(page);

	await page.goto(`${APP_URL}/#/retrospective`);
	await expect(page.getByTestId("retrospective-page")).toBeVisible({ timeout: 15000 });

	expect(pageErrors).toEqual([]);
});

test("retrospective ?show= share link renders without page errors", async ({ page }) => {
	const pageErrors = collectPageErrors(page);

	await page.goto(`${APP_URL}/#/retrospective?show=ci`);
	await expect(page.getByTestId("retrospective-page")).toBeVisible({ timeout: 15000 });

	expect(pageErrors).toEqual([]);
});

/***
 * MARK: Retrospective mobile layout canary
 * @description Proves the phone layout at 375px: the three panes collapse
 *   behind a tab strip (one pane visible at a time), every primary control
 *   keeps a 44px-class touch target, the page root owns vertical scroll so
 *   no stacked pane drops off-screen, and tapping through the tabs raises
 *   no page errors. The desktop counter-proof (1280px: strip hidden, all
 *   panes visible) guards the `lg:` breakpoint from the other side.
 *   Read-only — no tasks are created or mutated.
 ***/
test.describe("retrospective mobile layout", () => {

	async function gotoRetrospective(page, viewport) {
		const pageErrors = collectPageErrors(page);
		await page.setViewportSize(viewport);
		await page.goto(`${APP_URL}/#/retrospective`);
		await expect(page.getByTestId("retrospective-page")).toBeVisible({ timeout: 15000 });
		return pageErrors;
	}

	test("phone shows one pane at a time behind the tab strip", async ({ page }) => {
		const pageErrors = await gotoRetrospective(page, MOBILE_VIEWPORT);

		const tablist = page.getByRole("tablist", { name: "Mobile retrospective pane selector" });
		await expect(tablist).toBeVisible();
		await expect(tablist.getByRole("tab")).toHaveCount(3);

		const histories = page.getByTestId("retrospective-histories");
		const actions = page.getByTestId("retrospective-quick-actions");
		const chat = page.getByTestId("retrospective-chat");

		// Histories first; the other panes stay mounted but hidden.
		await expect(histories).toBeVisible();
		await expect(actions).toBeHidden();
		await expect(chat).toBeHidden();

		await tablist.getByRole("tab", { name: "Actions" }).click();
		await expect(actions).toBeVisible();
		await expect(histories).toBeHidden();
		await expect(chat).toBeHidden();

		await tablist.getByRole("tab", { name: "Chat" }).click();
		await expect(chat).toBeVisible();
		await expect(histories).toBeHidden();
		await expect(actions).toBeHidden();

		await tablist.getByRole("tab", { name: "Histories" }).click();
		await expect(histories).toBeVisible();

		expect(pageErrors).toEqual([]);
	});

	test("phone controls keep touch-sized targets", async ({ page }) => {
		const pageErrors = await gotoRetrospective(page, MOBILE_VIEWPORT);
		const tablist = page.getByRole("tablist", { name: "Mobile retrospective pane selector" });
		await expect(tablist).toBeVisible();

		// Tabs carry min-h-[44px] (see retrospectiveMobileTabClass), so the
		// plan's >=44px touch-target criterion is asserted exactly here.
		for (const tab of await tablist.getByRole("tab").all()) {
			const box = await tab.boundingBox();
			expect(box).not.toBeNull();
			expect(box.height).toBeGreaterThanOrEqual(44);
		}

		await tablist.getByRole("tab", { name: "Actions" }).click();
		const actionBtn = page.getByTestId("retrospective-action-find-trends");
		await expect(actionBtn).toBeVisible();
		const actionBox = await actionBtn.boundingBox();
		expect(actionBox.height).toBeGreaterThanOrEqual(40);

		await tablist.getByRole("tab", { name: "Chat" }).click();
		for (const control of [
			page.getByRole("button", { name: /Use selection/ }),
			page.getByTestId("retrospective-chat-send"),
			page.getByTestId("retrospective-chat-clear"),
		]) {
			await expect(control).toBeVisible();
			const box = await control.boundingBox();
			expect(box).not.toBeNull();
			expect(box.height).toBeGreaterThanOrEqual(40);
		}

		expect(pageErrors).toEqual([]);
	});

	test("phone page owns the vertical scroll region", async ({ page }) => {
		const pageErrors = await gotoRetrospective(page, MOBILE_VIEWPORT);
		const scroller = page.getByTestId("retrospective-page");
		await expect(scroller).toBeVisible();

		// The app shell (`main#main-content`) is a fixed-viewport
		// `overflow-hidden` flex column, so this page root must own vertical
		// scroll — otherwise stacked mobile panes below the fold are clipped
		// with no way to reach them. Computed style (not class names) is the
		// real-browser proof jsdom cannot give: before the fix this was
		// `visible`.
		const overflowY = await scroller.evaluate((el) => getComputedStyle(el).overflowY);
		expect(overflowY).toBe("auto");

		// The region actually scrolls: after jumping to the bottom, the tail
		// of the page sits inside the container's viewport.
		const reach = await scroller.evaluate((el) => {
			el.scrollTo(0, el.scrollHeight);
			return {
				scrollTop: el.scrollTop,
				scrollHeight: el.scrollHeight,
				clientHeight: el.clientHeight,
			};
		});
		expect(reach.scrollTop + reach.clientHeight).toBeGreaterThanOrEqual(
			reach.scrollHeight - 1,
		);
		if (reach.scrollHeight > reach.clientHeight + 1) {
			expect(reach.scrollTop).toBeGreaterThan(0);
		}

		expect(pageErrors).toEqual([]);
	});

	test("phone page never scrolls sideways", async ({ page }) => {
		const pageErrors = await gotoRetrospective(page, MOBILE_VIEWPORT);
		const tablist = page.getByRole("tablist", { name: "Mobile retrospective pane selector" });
		await expect(tablist).toBeVisible();

		// Every pane must fit the 375px viewport without horizontal overflow.
		for (const tabName of ["Histories", "Actions", "Chat"]) {
			await tablist.getByRole("tab", { name: tabName }).click();
			const overflow = await page.getByTestId("retrospective-page").evaluate((el) => ({
				scrollWidth: el.scrollWidth,
				clientWidth: el.clientWidth,
			}));
			expect(
				overflow.scrollWidth,
				`${tabName} pane overflows the viewport (scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth})`,
			).toBeLessThanOrEqual(overflow.clientWidth + 1);
		}

		expect(pageErrors).toEqual([]);
	});

	test("desktop hides the strip and shows all three panes", async ({ page }) => {
		const pageErrors = await gotoRetrospective(page, { width: 1280, height: 720 });

		await expect(
			page.getByRole("tablist", { name: "Mobile retrospective pane selector" }),
		).toBeHidden();
		await expect(page.getByTestId("retrospective-histories")).toBeVisible();
		await expect(page.getByTestId("retrospective-quick-actions")).toBeVisible();
		await expect(page.getByTestId("retrospective-chat")).toBeVisible();

		expect(pageErrors).toEqual([]);
	});
});
