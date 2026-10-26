// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
	SETTINGS_TABS,
	SETTINGS_TAB_LABELS,
	isFooterResetVisible,
} from "./settingsTabs.js";

/***
 * MARK: settingsTabs unit tests
 * @description Guards the single source of truth for the System Settings
 *   tabs: labels render in order, the footer-Reset flags match the screen's
 *   contract (Notifications/UI hide it), and unknown ids fail open so a
 *   future tab never silently loses its reset.
 ***/
describe("settingsTabs", () => {
	it("exposes one entry per tab in render order", () => {
		expect(SETTINGS_TAB_LABELS).toEqual([
			"Harness",
			"Models",
			"Engine",
			"Storage",
			"Notifications",
			"Prompt Layout",
			"UI",
		]);
		expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual([
			"harness",
			"models",
			"engine",
			"storage",
			"notifications",
			"prompt-layout",
			"ui",
		]);
	});

	it("hides the footer Reset exactly on the self-persisting tabs", () => {
		for (const tab of SETTINGS_TABS) {
			if (
				tab.id === "notifications" ||
				tab.id === "prompt-layout" ||
				tab.id === "ui"
			) {
				expect(tab.showFooterReset).toBe(false);
				expect(isFooterResetVisible(tab.id)).toBe(false);
			} else {
				expect(tab.showFooterReset).toBe(true);
				expect(isFooterResetVisible(tab.id)).toBe(true);
			}
		}
	});

	it("fails open for unknown or missing section ids", () => {
		expect(isFooterResetVisible("future-tab")).toBe(true);
		expect(isFooterResetVisible("")).toBe(true);
		expect(isFooterResetVisible(null)).toBe(true);
		expect(isFooterResetVisible(undefined)).toBe(true);
	});
});
