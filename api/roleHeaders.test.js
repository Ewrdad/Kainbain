import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/***
 * MARK: roleHeaders tests
 * @description Guards the AUDIT 5 (R9) role headers: every touched file states
 *   its role in <=3 top lines so agents stop paying the misleading-name read tax.
 ***/

const TOUCHED = [
	["./routes/tasks.js", "barrel"],
	["./taskStore.js", "barrel"],
	["./flow/index.js", "flow"],
	["./work/index.js", "work"],
	["./watch/index.js", "watch"],
	["./house/index.js", "house"],
	["./activeTaskDisplay.js", "projection"],
	["./taskDurationSummary.js", "evidence"],
	["../frontend/src/services/api.js", "client"],
	["../frontend/src/services/apiBase.js", "base"],
];

function topThree(relativePath) {
	/* eslint-disable security/detect-non-literal-fs-filename -- relativePath comes from the fixed TOUCHED table above, not user input */
	const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
	return text.split("\n").slice(0, 3).join("\n");
}

describe("AUDIT 5 role headers", () => {
	for (const [file, keyword] of TOUCHED) {
		it(`${file} states its role in <=3 top lines`, () => {
			const head = topThree(file);
			expect(head).toMatch(/\/\/ (Role|Domain):/);
			expect(head.toLowerCase()).toContain(keyword);
		});
	}

	it("summary pair disambiguates with cross-references", () => {
		const display = topThree("./activeTaskDisplay.js");
		const durations = topThree("./taskDurationSummary.js");
		expect(display).toContain("taskDurationSummary.js");
		expect(durations).toContain("activeTaskDisplay.js");
		expect(display.toLowerCase()).toContain("live");
		expect(durations.toLowerCase()).toContain("duration");
	});
});
