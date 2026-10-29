import { test, expect } from "@playwright/test";
import { APP_URL } from "./urls";
import { waitForAppReady, waitForFontsSettled } from "./helpers";

test.describe("KainBain Functional E2E Tests", () => {
	test("homepage loading and orchestrator cockpit", async ({ page }) => {
		await waitForAppReady(page);
		await expect(page.locator("h1")).toContainText("KAINBAIN");
		// Tabs
		await expect(
			page.getByRole("button", { name: /Orchestrator/i }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: /Settings/i })).toBeVisible();
	});

	test("workflow canvas renders stage columns with type badges", async ({
		page,
	}) => {
		await waitForAppReady(page);
		// Default stages are rendered as columns (async fetch)
		await expect(page.getByText("Idea", { exact: true }).first()).toBeVisible({
			timeout: 15000,
		});
		await expect(page.getByText("Review Plan", { exact: true }).first()).toBeVisible();
		// Human and Agent type badges exist
		await expect(
			page.getByText("Human", { exact: true }).first(),
		).toBeVisible();
		await expect(
			page.getByText("Agent", { exact: true }).first(),
		).toBeVisible();
	});

	test("now playing bar with runner fleet boxes", async ({ page }) => {
		await waitForAppReady(page);
		// The Now Playing bar shows an active task label, the live elapsed timer
		// and the live queue-depth chip. (The old fabricated "Progress"
		// percentage bar was removed — no percent-complete data exists in the
		// stack — and so was the stale workflow-pointer stage label
		// ("Stage 1 of 10 — Idea"), which never updated.)
		await expect(page.getByText("Active Task", { exact: true })).toBeVisible();
		await expect(page.locator("#elapsed-counter")).toBeVisible();
		const queueChip = page.getByLabel(
			/Execution queue: \d+ open tasks? across all pipelines/,
		);
		await expect(queueChip).toBeVisible();
		await expect(page.locator("footer.fixed").getByText(/Stage \d+ of \d+/)).toHaveCount(0);
		// No global transport cluster: play/skip live on the runner boxes now,
		// so the old engine toggle and Look Back/Forward/Jump/Skip buttons
		// must all be gone.
		await expect(
			page.getByRole("button", { name: "Start Engine", exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Stop Engine", exact: true }),
		).toHaveCount(0);
		for (const name of ["Look Back", "Look Forward", "Jump to Active", "Skip Current"]) {
			await expect(
				page.getByRole("button", { name, exact: true }),
			).toHaveCount(0);
		}
		// Fleet roster: runner boxes when Runners are configured, else the
		// idle hint — the bar never renders an empty state.
		await expect(
			page.getByTestId("now-playing-runner-boxes").or(page.getByTestId("now-playing-idle-hint")),
		).toBeVisible();
	});

	test("right rail never overlaps the runner boxes at any supported width", async ({
		page,
	}) => {
		/**
		 * MARK: right-rail overlap gate
		 * @description Regression gate for a real layout defect: the redesigned
		 *   right rail (queue chip / elapsed timer / health light) is fixed-width
		 *   nowrap content in a flex box, and between 640 and ~1190px it used to
		 *   overflow LEFTWARD on top of the bar's center controls — at the
		 *   1024px Tablet baseline the Look Forward button was half-buried behind
		 *   the queue chip. The rail now hides its decorative extras (health
		 *   light + dividers) below `xl` and clips overflow, so at every supported
		 *   viewport no runner-box control rect may intersect any right-rail
		 *   child rect. 800px and 1024px are the exact widths from the defect
		 *   report; 640/768 cover the sm/md edges; 1280 proves the full rail
		 *   (health light shown) still fits once `xl` is reached. (The global
		 *   transport cluster is gone — play/skip live on the runner boxes —
		 *   so the gate measures the per-runner box buttons instead.)
		 */
		for (const width of [640, 768, 800, 900, 1024, 1280]) {
			await page.setViewportSize({ width, height: 720 });
			await page.goto(APP_URL);
			await expect(page).toHaveTitle(/Kainbain/);
			await expect(page.getByRole("button", { name: /Project/i }).first()).toBeVisible({
				timeout: 15000,
			});
			// Typography must settle before any geometry measurement (see
			// waitForFontsSettled): the real overlap defect this gate guards is
			// flex overflow, not FOUT.
			await waitForFontsSettled(page);

			const result = await page.evaluate(() => {
				const intersects = (a, b) =>
					a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
				const toRect = (el) => {
					const r = el.getBoundingClientRect();
					return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
				};
				const footer = document.querySelector("footer.fixed");
				if (!footer) return { error: "footer.fixed not found" };
				// The global transport cluster is gone — play/skip live on
				// the runner boxes — so the gate measures the per-runner box
				// buttons (empty when no Runners are configured, which is
				// itself overlap-free).
				const centerButtons = [
					...footer.querySelectorAll(
						'[data-testid="now-playing-runner-boxes"] button',
					),
				].filter((el) => el.getBoundingClientRect().width > 0);
				const rail = footer.querySelector("[data-testid='now-playing-right-rail']");
				if (!rail) return { error: "right rail not found" };
				const railChildren = [...rail.querySelectorAll("*")].filter(
					(el) => el.getBoundingClientRect().width > 0,
				);
				const overlaps = [];
				for (const btn of centerButtons) {
					const btnRect = toRect(btn);
					const btnName = btn.getAttribute("aria-label") || btn.id || "button";
					for (const child of railChildren) {
						if (intersects(btnRect, toRect(child))) {
							overlaps.push(`${btnName} ↔ rail child`);
						}
					}
				}
				return {
					overlaps,
					centerCount: centerButtons.length,
					railCount: railChildren.length,
				};
			});
			expect(result.error, `at ${width}px: ${result.error}`).toBeUndefined();
			expect(
				result.overlaps,
				`at ${width}px the runner-box controls must not be covered by the right rail (measured ${result.centerCount} box buttons vs ${result.railCount} rail children)`,
			).toEqual([]);

			// The shrink path must never hide the honest live data — only the
			// decorative extras (health light below `lg`, dividers) may be dropped.
			await expect(page.locator("#elapsed-counter")).toBeVisible();
			await expect(
				page.getByLabel(/Execution queue: \d+ open tasks? across all pipelines/),
			).toBeVisible();
		}
	});

	test("in-place column task creation", async ({ page }) => {
		await waitForAppReady(page);
		// Click on "+ Add Task" in the first stage column
		const addBtn = page.getByRole("button", { name: /Add task to Idea/i });
		await expect(addBtn).toBeVisible({ timeout: 15000 });
		await addBtn.click();

		const input = page.locator('input[placeholder*="task goal" i]');
		await expect(input).toBeVisible();
		await input.fill("Hello KainBain In-Place Task!");
		await page.getByRole("button", { name: "Submit new task" }).click();

		// Verify task card appears
		await expect(page.getByText("Hello KainBain In-Place Task!").first()).toBeVisible({
			timeout: 10000,
		});
	});

	test("project selector lists projects and switches", async ({ page }) => {
		await waitForAppReady(page);
		// Open the project dropdown
		await page.getByRole("button", { name: /Project/i }).click();
		// All seeded projects are listed as listbox options (role="option"
		// since the ProjectMenu rewrite)
		await expect(
			page.getByRole("option", { name: "Project B" }),
		).toBeVisible();
		await expect(
			page.getByRole("option", { name: "Project C" }),
		).toBeVisible();
		await expect(
			page.getByRole("option", { name: "Project D" }),
		).toBeVisible();
		// Switch to Project B
		await page.getByRole("option", { name: "Project B" }).click();
		await expect(
			page.getByRole("button", { name: /Project B/i }),
		).toBeVisible();
	});

	test("settings tab renders per-project configuration across its tabs", async ({ page }) => {
		await waitForAppReady(page);
		await page.getByRole("button", { name: /Settings/i }).click();
		// Project tab: basics (name, harness/model) + retry/timeouts.
		await expect(page.getByText(/Project Configuration/)).toBeVisible();
		await expect(page.getByLabel("Project Name")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Save Configuration" }),
		).toBeVisible();
		// Files & Links tab: paths, docs folders, git, app link.
		await page.getByRole("tab", { name: /Files & Links/i }).click();
		await expect(
			page.getByText(/Working Directory/i),
		).toBeVisible();
		await expect(
			page.getByText("Notes Space Symlink Directory", {
				exact: true,
			}),
		).toBeVisible();
		await expect(
			page.getByText("Documentation Folder Name", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Link to Centralised Documentation", {
				exact: true,
			}),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Save Configuration" }),
		).toBeVisible();
		// Aliases tab: the model aliases table.
		await page.getByRole("tab", { name: /Aliases/i }).click();
		await expect(page.getByTestId("model-aliases-section")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Save Configuration" }),
		).toBeVisible();
	});
});
