// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
	PROJECT_SETTINGS_TABS,
	PROJECT_SETTINGS_SECTIONS,
	PROJECT_FORM_SECTIONS,
} from "./projectSettingsTabs.js";

/***
 * MARK: projectSettingsTabs unit tests
 * @description Guards the single source of truth for the Project Settings
 *   tab bar: tab ids render in order, exactly the project-related tabs share
 *   the one mounted form, and every form tab carries an h2 heading. The tab
 *   bar (`ProjectSettings.jsx`) and the form (`ProjectSettingsForm.jsx`)
 *   both derive from this module so a new tab cannot drift them apart.
 ***/
describe("projectSettingsTabs", () => {
	it("lists the project tabs in render order", () => {
		expect(PROJECT_SETTINGS_SECTIONS).toEqual([
			"project",
			"aliases",
			"files-repos",
			"addresses",
			"workflows",
			"skills",
		]);
		expect(PROJECT_SETTINGS_SECTIONS).toEqual(
			PROJECT_SETTINGS_TABS.map((tab) => tab.id),
		);
		expect(PROJECT_SETTINGS_SECTIONS).not.toContain("ui");
	});

	it("shares the form across exactly the project-related tabs", () => {
		expect(PROJECT_FORM_SECTIONS).toEqual(["project", "aliases", "files-repos", "addresses"]);
		expect(PROJECT_FORM_SECTIONS).toEqual(
			PROJECT_SETTINGS_TABS.filter((tab) => tab.sharesProjectForm).map(
				(tab) => tab.id,
			),
		);
	});

	it("gives every form tab a heading for its h2 title", () => {
		for (const tab of PROJECT_SETTINGS_TABS.filter(
			(candidate) => candidate.sharesProjectForm,
		)) {
			expect(typeof tab.heading).toBe("string");
		}
	});
});
