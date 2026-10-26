import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_URL, API_URL } from "./urls";
import { waitForAppReady, waitForFontsSettled, boxesOverlap, selectProject } from "./helpers";

/***
 * MARK: Header responsive layout guard (task 66ad153f)
 * @description The global header must never let two interactive controls
 *   overlap, and must never paint a control outside its own content box, at
 *   any width. Fixture projects carry a 30-char name, a git remote, and a
 *   published app link so the widest realistic combination is exercised
 *   (GoToAppLink + probe + 4 tabs + monitor + menu). Self-provisions fixture
 *   projects on the suite-owned scratch backend; never touches Project A or
 *   live stacks.
 * @example npx playwright test canary-e2e/tests/header-responsive.spec.js
 ***/

const API_BASE = API_URL;

// Full sweep: phone widths (the overlap band), the 430px screenshot width,
// the sm-step band (640-1060, historically 1061px wide), and desktop.
const WIDTHS = [320, 360, 375, 390, 414, 430, 480, 640, 768, 859, 1024, 1280];

let scratchRoot;
let wideProjectName = "Project A";

async function createWideFixtureProject(request) {
	const cwd = path.join(scratchRoot, "header-wide");
	fs.mkdirSync(cwd, { recursive: true });
	const res = await request.post(`${API_BASE}/projects`, {
		data: {
			// 30 characters: the worst realistic project pill.
			name: "kainbain-mobile-header-stress-1",
			cwd,
			notesPath: path.join(cwd, "notes"),
			useBranches: false,
			stages: [{ id: "1", name: "Development", type: "agent" }],
			hasUpstreamRepo: true,
			repoUrl: "https://git.example.com/team/header-stress",
		},
	});
	expect(res.ok()).toBeTruthy();
	const project = await res.json();
	const patchRes = await request.patch(`${API_BASE}/projects/${project.id}/app-status`, {
		data: { url: "http://localhost:4321", status: "running", isHealthy: true },
	});
	expect(patchRes.ok()).toBeTruthy();
	return project;
}

async function headerControls(page) {
	return page.evaluate(() => {
		const header = document.querySelector("header");
		if (!header) return { headerBox: null, controls: [], headerOverflow: 0 };
		const headerBox = header.getBoundingClientRect().toJSON();
		const controls = [];
		for (const el of header.querySelectorAll("button, a")) {
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) continue; // hidden by CSS
			// A control inside a genuinely scrollable strip is reachable by
			// scrolling (the safe degradation), not clipped — but the strip
			// itself must scroll rather than spill.
			let node = el.parentElement;
			let inScrollableStrip = false;
			while (node && node !== header) {
				const style = getComputedStyle(node);
				if (
					(style.overflowX === "auto" || style.overflowX === "scroll") &&
					node.scrollWidth > node.clientWidth + 1
				) {
					inScrollableStrip = true;
					break;
				}
				node = node.parentElement;
			}
			controls.push({
				name: (
					el.getAttribute("aria-label") ||
					(el.textContent || "")
				)
					.trim()
					.slice(0, 28),
				box: rect.toJSON(),
				inScrollableStrip,
			});
		}
		return {
			headerBox,
			controls,
			headerOverflow: header.scrollWidth - header.clientWidth,
		};
	});
}

test.describe("Header responsive layout guard (task 66ad153f)", () => {
	test.beforeAll(async ({ request }) => {
		scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-header-guard-"));
		const project = await createWideFixtureProject(request);
		wideProjectName = project.name;
	});

	for (const width of WIDTHS) {
		test(`header controls neither overlap nor clip at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await waitForAppReady(page);
			await selectProject(page, wideProjectName);
			await page.goto(`${APP_URL}/#/orchestrator`);
			await waitForAppReady(page);
			await waitForFontsSettled(page); // Material Symbols swaps change widths mid-flight

			const { headerBox, controls, headerOverflow } = await headerControls(page);
			expect(headerBox, "global header renders").not.toBeNull();
			expect(controls.length, "header exposes interactive controls").toBeGreaterThan(0);

			// 1. No two visible controls may intersect (the reported defect:
			// taps land on the wrong control).
			for (let i = 0; i < controls.length; i += 1) {
				for (let j = i + 1; j < controls.length; j += 1) {
					expect(
						boxesOverlap(controls[i].box, controls[j].box),
						`"${controls[i].name}" overlaps "${controls[j].name}" at ${width}px`,
					).toBe(false);
				}
			}

			// 2. No control may paint outside the header's own box, unless it
			// lives in a strip that scrolls (reachable, not buried).
			for (const c of controls) {
				if (c.inScrollableStrip) continue;
				expect(
					c.box.x,
					`"${c.name}" starts left of the header at ${width}px`,
				).toBeGreaterThanOrEqual(headerBox.x - 1);
				expect(
					c.box.x + c.box.width,
					`"${c.name}" extends past the header at ${width}px`,
				).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
			}

			// 3. The header itself must not overflow horizontally.
			expect(
				headerOverflow,
				`header scrolls horizontally by ${headerOverflow}px at ${width}px`,
			).toBeLessThanOrEqual(1);
		});
	}
});
