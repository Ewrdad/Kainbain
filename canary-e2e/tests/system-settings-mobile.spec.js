import { test, expect } from "@playwright/test";
import {
	MOBILE_VIEWPORT,
	SHORT_MOBILE_VIEWPORT,
	waitForAppReady,
} from "./helpers";
import { APP_URL } from "./urls";
// Single source of truth for the expected tabs: the PRODUCT module itself.
// Importing it (plain ESM, no JSX) means a new tab, a renamed label, or a
// changed footer-Reset rule can never drift the expectations again — the
// spec cannot disagree with the UI it is asserting. The per-tab loop below
// automatically covers a new tab, and the footer Reset assertion is
// conditional on showFooterReset (Notifications/UI hide the footer Reset
// because they persist through their own controls).
import {
	SETTINGS_TABS,
	SETTINGS_TAB_LABELS,
	isFooterResetVisible,
} from "../../frontend/src/components/settings/settingsTabs.js";

/***
 * MARK: System Settings screen regression tests (tasks 5ad55777, cd669cc3)
 * @description System Settings is a dedicated full screen at
 *   `#/system-settings` (opened in a new window by default from the System
 *   Menu, with a same-tab fallback on narrow viewports or a blocked popout) —
 *   no longer a modal dialog. On mobile viewports the section tab bar
 *   (Harness / Models / Engine / Storage / Notifications / Prompt Layout / UI)
 *   must render at full height and stay tappable — never clipped where the
 *   details panel begins. Root cause was flex-shrink: header/tablist/footer
 *   carried no shrink-0 while the content pane (flex-1 over a zero basis)
 *   absorbed none of the shrink deficit, so a short phone screen crushed the
 *   tablist and its buttons clipped at the content edge. The popout-first
 *   navigation itself is covered by the "System Menu" suite at the bottom of
 *   this file. Follows the mobile-responsive.spec.js pattern (isolated scratch
 *   stack via urls.js — never the live deployment).
 ***/

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
// Sub-pixel / border rounding tolerance for box comparisons.
const EPS = 1.5;

async function openSystemSettings(page) {
	// Direct deep link: deterministic, and the route is the documented
	// user-facing entry point (the popout/default-fallback behavior is asserted
	// separately at the bottom of this file).
	await waitForAppReady(page);
	await page.goto(`${APP_URL}/#/system-settings`);
	const screen = page.getByTestId("system-settings-page");
	await expect(screen).toBeVisible({ timeout: 10000 });
	// Settle: let the Harness tab's async registry load land, so boxes are
	// measured in the resting state.
	await page.waitForTimeout(800);
	return screen;
}

/***
 * MARK: expectSettingsChromeUnclipped
 * @description Layout invariant for the System Settings screen: the tablist
 *   is at least as tall as every tab it holds, each tab sits fully inside
 *   the tablist box, and the details scroll region starts below the tablist
 *   (no intersection). Header and footer controls stay visible throughout.
 * @example await expectSettingsChromeUnclipped(page, screen, 'harness')
 ***/
async function expectSettingsChromeUnclipped(page, screen, activeSectionId = "harness") {
	const tablist = screen.getByRole("tablist", {
		name: "System settings sections",
	});
	await expect(tablist).toBeVisible();
	const tabs = tablist.getByRole("tab");
	expect(await tabs.count()).toBe(SETTINGS_TAB_LABELS.length);

	const listBox = await tablist.boundingBox();
	expect(listBox).not.toBeNull();
	for (const name of SETTINGS_TAB_LABELS) {
		const box = await tabs.getByText(name).boundingBox();
		expect(box).not.toBeNull();
		expect(
			listBox.height,
			`tablist height ${listBox.height} covers ${name} tab height ${box.height}`,
		).toBeGreaterThanOrEqual(box.height - EPS);
		expect(
			box.y,
			`${name} tab top ${box.y} inside tablist top ${listBox.y}`,
		).toBeGreaterThanOrEqual(listBox.y - EPS);
		expect(
			box.y + box.height,
			`${name} tab bottom ${box.y + box.height} inside tablist bottom ${listBox.y + listBox.height}`,
		).toBeLessThanOrEqual(listBox.y + listBox.height + EPS);
	}

	// Details scroll region must not intersect the tab bar. Measured on the
	// tabpanel's parent (the flex-1 pane), not the panel content itself —
	// the content legitimately scrolls up inside the pane.
	const panel = screen.getByRole("tabpanel").first();
	await expect(panel).toBeVisible();
	const scrollBox = await panel.locator("..").boundingBox();
	expect(scrollBox).not.toBeNull();
	expect(
		scrollBox.y,
		`details top ${scrollBox.y} starts below tablist bottom ${listBox.y + listBox.height}`,
	).toBeGreaterThanOrEqual(listBox.y + listBox.height - EPS);

	// Chrome stays put: the page owns an h1 title and the footer actions.
	await expect(
		screen.getByRole("heading", { level: 1, name: "System Settings" }),
	).toBeVisible();
	await expect(
		screen.getByRole("button", { name: "Done", exact: true }),
	).toBeVisible();
	// Exact match: the Harness tab content also has a "Reset harness
	// preferences" button — only the footer "Reset" proves the footer shows.
	// Tabs whose product metadata hides the footer Reset deliberately, so
	// assert its absence there instead of failing.
	if (!isFooterResetVisible(activeSectionId)) {
		await expect(
			screen.getByRole("button", { name: "Reset", exact: true }),
		).toHaveCount(0);
	} else {
		await expect(
			screen.getByRole("button", { name: "Reset", exact: true }),
		).toBeVisible();
	}
}

test.describe("System Settings screen tab bar (task 5ad55777)", () => {
	test("tab bar renders at full height on mobile across all tabs", async ({
		page,
	}) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		const screen = await openSystemSettings(page);
		for (const tab of SETTINGS_TABS) {
			await screen.getByRole("tab", { name: tab.label }).click();
			await page.waitForTimeout(300);
			// Tabs are URL-driven: each click pushes a deep-linkable route.
			await expect(page).toHaveURL(
				new RegExp(`#/system-settings/${tab.id}$`),
			);
			await expectSettingsChromeUnclipped(page, screen, tab.id);
		}
	});

	test("tab bar renders at full height on a short mobile viewport", async ({
		page,
	}) => {
		await page.setViewportSize(SHORT_MOBILE_VIEWPORT);
		const screen = await openSystemSettings(page);
		// Harness is the tallest tab — the worst squeeze case.
		await expect(screen.getByRole("tab", { name: "Harness" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expectSettingsChromeUnclipped(page, screen);
	});

	test("scrolling the details never covers the tab bar", async ({ page }) => {
		await page.setViewportSize(SHORT_MOBILE_VIEWPORT);
		const screen = await openSystemSettings(page);
		const panel = screen.getByRole("tabpanel").first();
		await panel.hover();
		await page.mouse.wheel(0, 3000);
		await page.waitForTimeout(300);
		await expectSettingsChromeUnclipped(page, screen);
		// And back to the top — the bar never moved.
		await page.mouse.wheel(0, -3000);
		await page.waitForTimeout(300);
		await expectSettingsChromeUnclipped(page, screen);
	});

	test("tab bar renders at full height on desktop", async ({ page }) => {
		await page.setViewportSize(DESKTOP_VIEWPORT);
		const screen = await openSystemSettings(page);
		await expectSettingsChromeUnclipped(page, screen);
	});

	test("rotating the viewport never covers the tab bar", async ({ page }) => {
		// Plan Step 4 manual checklist ("rotate portrait/landscape"),
		// automated: the screen is already open, so rotation only reflows
		// the flex column — the bars must hold at every orientation.
		await page.setViewportSize(MOBILE_VIEWPORT);
		const screen = await openSystemSettings(page);
		await expectSettingsChromeUnclipped(page, screen);
		// Landscape: 375px height is the shortest squeeze case of all.
		await page.setViewportSize({ width: 667, height: 375 });
		await page.waitForTimeout(300);
		await expectSettingsChromeUnclipped(page, screen);
		// And back to portrait — the bar never moved.
		await page.setViewportSize(MOBILE_VIEWPORT);
		await page.waitForTimeout(300);
		await expectSettingsChromeUnclipped(page, screen);
	});

	test("a deep-linked tab survives a refresh and an unknown section falls back", async ({
		page,
	}) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await waitForAppReady(page);
		await page.goto(`${APP_URL}/#/system-settings/storage`);
		const screen = page.getByTestId("system-settings-page");
		await expect(screen).toBeVisible({ timeout: 10000 });
		await expect(screen.getByRole("tab", { name: "Storage" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await page.reload();
		await expect(screen).toBeVisible({ timeout: 10000 });
		await expect(screen.getByRole("tab", { name: "Storage" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		// Unknown id: fail safe to the first tab, no blank screen.
		await page.goto(`${APP_URL}/#/system-settings/not-a-section`);
		await expect(screen).toBeVisible({ timeout: 10000 });
		await expect(screen.getByRole("tab", { name: "Harness" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});
});

test.describe("System Settings entry opens a screen, not a dialog (task cd669cc3)", () => {
	test("no modal dialog shell remains on the settings route", async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		const screen = await openSystemSettings(page);
		await expect(screen).toBeVisible();
		await expect(page.getByRole("dialog")).toHaveCount(0);
	});

	test("desktop System Menu opens System Settings in a new window", async ({
		page,
	}) => {
		await page.setViewportSize(DESKTOP_VIEWPORT);
		await waitForAppReady(page);
		await page.getByRole("button", { name: "System Menu" }).click();

		const popupPromise = page.waitForEvent("popup", { timeout: 10000 });
		await page.getByRole("menuitem", { name: /System Settings/i }).click();
		const popup = await popupPromise;
		await popup.waitForLoadState("domcontentloaded");

		await expect(popup.getByTestId("system-settings-page")).toBeVisible({
			timeout: 15000,
		});
		expect(popup.url()).toContain("#/system-settings");
		await expect(
			popup.getByRole("heading", { level: 1, name: "System Settings" }),
		).toBeVisible();
		// The original board tab stays where it was — the popout never
		// navigates the shared history.
		await expect(page.getByTestId("system-settings-page")).toHaveCount(0);
		await popup.close();
	});

	test("mobile System Menu falls back to same-tab navigation (no popout trap)", async ({
		page,
	}) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await waitForAppReady(page);

		let popupOpened = false;
		page.on("popup", () => {
			popupOpened = true;
		});

		await page.getByRole("button", { name: "System Menu" }).click();
		await page.getByRole("menuitem", { name: /System Settings/i }).click();

		await expect(page.getByTestId("system-settings-page")).toBeVisible({
			timeout: 10000,
		});
		await expect(page).toHaveURL(/#\/system-settings$/);
		expect(popupOpened).toBe(false);
	});
});
