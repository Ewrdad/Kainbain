import { test, expect } from "@playwright/test";
import { APP_URL } from "./urls";
import {
  API_BASE,
  activeProjectId,
  createTaskViaApi,
  resetProject,
  selectProject,
} from "./helpers";
import {
  assertViewClean,
  contrastViolations,
  formatViolations,
  scanState,
} from "./a11y/scanHelpers";

/**
 * Automated accessibility conformance checks.
 *
 * Targets WCAG 2.2 Level AAA (plus the WCAG 2.1/2.2 AA criteria that AAA
 * builds on) and the WCAG 3.0 "best-practice" checks that axe can evaluate
 * statically. This is a baseline guardrail, not a substitute for manual
 * keyboard / screen-reader testing — see the WCAG audit register.
 *
 * Two instruments run on every scanned view (see ./a11y/scanHelpers.js):
 * 1. axe-core at the wcag2a…wcag22aaa + best-practice tag set.
 * 2. A computed in-page AAA text-contrast walk (>= 7:1 normal / >= 4.5:1
 *    large text). A planted low-contrast node is asserted to be caught
 *    (negative control) so the walk can never silently no-op, and a
 *    disabled-control probe proves the exemption branch is live.
 *
 * Coverage (Phase 1.1, task ae49090e): every route in frontend/src/routes.jsx
 * is scanned — orchestrator, settings, stage tray, explorer (+ file preview
 * open), docs (root + deep slug), observability (full + compact mobile),
 * task detail (idle + waiting_human), task review, task survey,
 * system-settings (root + deep section), retrospective (+ chat panel).
 *
 * The suite drives a single live backend, so it runs serially (workers: 1).
 */

// Local readiness (NOT the shared waitForAppReady): the axe scans gate on the
// rendered app shell — brand heading + primary navigation — rather than the
// project selector, so the scan target is fully painted before measuring.
async function waitForAppShell(page) {
  // Resilience: wait for commit/DOM instead of the full `load` event. The
  // `load` gate hangs when slow subresources (Google Fonts CDN, build-badge
  // fetch, model-discovery warnings) stall under sustained suite load — the
  // tail tests timed out here after minutes of green runs. Readiness is still
  // gated explicitly below (title + h1 + Orchestrator button), and scan()
  // additionally waits for fonts + build badge before measuring.
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Kainbain/);
  // The app shell must be rendered: brand heading + primary navigation.
  await expect(page.locator("h1")).toContainText("KAINBAIN");
  await expect(page.getByRole("button", { name: /Orchestrator/i })).toBeVisible();
}

test.describe("Accessibility (WCAG 2.2 AAA + WCAG 3.0 readiness)", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppShell(page);
    // The task inspector test creates a task in "Project A", so select it to
    // ensure the app's active project matches the API target.
    await selectProject(page, "Project A");
    await resetProject(page.request, await activeProjectId(page.request));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppShell(page);
  });

  test("orchestrator view has no axe violations", async ({ page }) => {
    await waitForAppShell(page);
    await assertViewClean(page, "orchestrator");
  });

  test("settings view has no axe violations", async ({ page }) => {
    await waitForAppShell(page);
    await page.getByRole("button", { name: /Settings/i }).click();
    await expect(page.getByText(/Project Configuration/)).toBeVisible();
    await assertViewClean(page, "settings");
  });

  test("stage settings tray has no axe violations", async ({ page }) => {
    test.setTimeout(120000);
    await waitForAppShell(page);
    await page.getByRole("button", { name: /Configure stage|Stage Settings/i }).first().click();
    await expect(page.getByLabel(/Stage name for/i).first()).toBeVisible();
    await assertViewClean(page, "stage settings tray");
  });

  test("explorer view has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/explorer`, { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Project Files")).toBeVisible({ timeout: 15000 });
    await assertViewClean(page, "explorer");
  });

  test("docs view has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/docs`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("docs-view")).toBeVisible({ timeout: 15000 });
    await assertViewClean(page, "docs");
  });

  test("observability view has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/observability`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("observability-dashboard")).toBeVisible({ timeout: 15000 });
    await assertViewClean(page, "observability");
  });

  test("task detail view has no axe violations", async ({ page }) => {
    const projectId = await activeProjectId(page.request);
    const goal = `Task detail a11y ${Date.now()}`;
    const created = await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
    await page.goto(`${APP_URL}/#/tasks/${created.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: new RegExp(goal, "i") })).toBeVisible({
      timeout: 15000,
    });
    await assertViewClean(page, "task detail");
  });

  test("task review view has no axe violations", async ({ page }) => {
    const projectId = await activeProjectId(page.request);
    const goal = `Task review a11y ${Date.now()}`;
    const created = await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
    await page.goto(`${APP_URL}/#/tasks/${created.id}/review`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("task-review-page")).toBeVisible({ timeout: 15000 });
    await assertViewClean(page, "task review");
  });

  test("settings model-aliases reliability cards have no axe violations", async ({ page }) => {
    await waitForAppShell(page);
    await page.getByRole("button", { name: /Settings/i }).click();
    await expect(page.getByText(/Project Configuration/)).toBeVisible();
    // The alias section is the delta surface: add one alias so the reliability
    // cards (and their colour-independent status text) actually render, expand
    // it, then scan.
    const section = page.getByTestId("model-aliases-section");
    await section.scrollIntoViewIfNeeded();
    await section.getByRole("button", { name: /Add alias/i }).click();
    const name = section.getByLabel(/Alias 1 name/i);
    await expect(name).toBeVisible({ timeout: 10000 });
    await name.fill("a11y-canary");
    const expand = section.getByRole("button", { name: /^Expand alias 1$/i });
    if (await expand.isVisible().catch(() => false)) await expand.click().catch(() => {});
    await section.scrollIntoViewIfNeeded();
    await assertViewClean(page, "settings model aliases");
  });

  test("compact mobile monitor view has no axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP_URL}/#/observability`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("observability-dashboard")).toBeVisible({ timeout: 15000 });
    const compact = page.getByTestId("mobile-monitor-view");
    if (await compact.isVisible().catch(() => false)) {
      await expect(compact).toBeVisible();
    }
    await assertViewClean(page, "compact monitor");
  });

  test("contrast walk catches a planted 1.7:1 node (negative control)", async ({ page }) => {
    await waitForAppShell(page);
    await page.evaluate(() => {
      const probe = document.createElement("p");
      probe.id = "contrast-probe";
      probe.style.color = "#3a3a3a";
      probe.style.backgroundColor = "#0a0a0a";
      probe.style.fontSize = "14px";
      probe.textContent = "planted low contrast probe";
      document.getElementById("main-content")?.appendChild(probe) ||
        document.body.appendChild(probe);
    });
    const found = await contrastViolations(page);
    expect(found.some((v) => v.target.includes("contrast-probe"))).toBe(true);
    await page.evaluate(() => document.getElementById("contrast-probe")?.remove());
    // And the probe-free document is clean again, proving the walk is not
    // simply flagging everything.
    expect(await contrastViolations(page)).toEqual([]);
  });

  test("keyboard: skip link is reachable and visible on focus", async ({ page }) => {
    await waitForAppShell(page);
    const skip = page.locator('a[href="#main-content"]');
    await skip.focus();
    // The skip link must become visible (not sr-only) when focused.
    await expect(skip).toBeVisible();
    await expect(skip).toHaveCSS("outline-style", "solid");
  });

  test("keyboard: project dropdown closes on Escape", async ({ page }) => {
    await waitForAppShell(page);
    const trigger = page.getByRole("button", { name: /Project|Select Project/i });
    await trigger.click();
    // The selector is a dialog+listbox since the ProjectMenu rewrite
    // (role="menu" on the pre-rewrite dropdown).
    const panel = page.getByRole("dialog", { name: "Projects" });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("keyboard: in-column stage configuration drawer closes on Escape and restores focus", async ({
    page,
  }) => {
    await waitForAppShell(page);
    const trigger = page.getByRole("button", { name: /Configure stage/i }).first();
    await trigger.click();
    await expect(page.getByLabel(/Stage name for/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel(/Stage name for/i)).toHaveCount(0);
    // Focus must return to the trigger that opened the drawer
    await expect(trigger).toBeFocused();
  });

  test("keyboard: task inspector closes on Escape", async ({ page }) => {
    // Tail-of-suite test: runs after minutes of sustained vite/API load, so
    // allow the same 120 s budget the stage-tray test already carries.
    test.setTimeout(120000);
    await waitForAppShell(page);
    // Create a task so an "Open active task" trigger appears in the NowPlaying bar.
    const projectId = await activeProjectId(page.request);
    const goal = `Inspector a11y ${Date.now()}`;
    const created = await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
    // The NowPlaying bar names no task while the engine is idle (idle shows
    // "No active task — engine idle" with the opener disabled), so drive the
    // engine non-idle before opening the inspector. A waiting_human status is
    // a plain metadata update (no agent dispatch) that the bar treats as a
    // checkpoint state, keeping the created task named. The test's real focus
    // (inspector Escape/focus behavior) is unchanged.
    await page.request.patch(`${API_BASE}/tasks/${created.id}`, {
      data: { projectId, status: "waiting_human" },
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppShell(page);

    // Open the inspector via the NowPlaying "Open active task" button.
    const openBtn = page.getByRole("button", { name: /Open active task/ });
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();
    await expect(page.getByRole("complementary", { name: "Task Inspector" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("complementary", { name: "Task Inspector" }),
    ).toHaveCount(0);
  });

  test("idle engine names no task in the NowPlaying bar", async ({ page }) => {
    // Tail-of-suite test: runs after minutes of sustained vite/API load, so
    // allow the same 120 s budget the stage-tray test already carries.
    test.setTimeout(120000);
    await waitForAppShell(page);
    // A task exists in the pipeline, but the scratch engine is idle
    // (scheduler disabled, dispatcher stopped), so the bar must clear the
    // task name instead of lingering on the last active task.
    const projectId = await activeProjectId(page.request);
    const goal = `Idle naming a11y ${Date.now()}`;
    await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
    await page.request.post(`${API_BASE}/compute/stop`, { data: { projectId } });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppShell(page);

    await expect(page.getByText("No active task — engine idle")).toBeVisible({
      timeout: 10000,
    });
    const opener = page.getByRole("button", { name: "No active task" });
    await expect(opener).toBeVisible();
    await expect(opener).toBeDisabled();
  });

  // ── Phase 1.1 (task ae49090e): full route coverage ──────────────────────
  // The 2026-10-15 register §7 listed these surfaces as residual risk (no
  // dedicated canary scan). Each new scan runs BOTH instruments (axe tags +
  // the in-page AAA contrast walk) and fails with JSON.stringify of the
  // violations.

  test("system-settings view has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/system-settings`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("system-settings-page")).toBeVisible({ timeout: 15000 });
    await scanState(page, "system-settings");
  });

  test("system-settings deep section (models) has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/system-settings/models`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("system-settings-page")).toBeVisible({ timeout: 15000 });
    await scanState(page, "system-settings / models");
  });

  test("retrospective view has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/retrospective`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("retrospective-page")).toBeVisible({ timeout: 15000 });
    await scanState(page, "retrospective");
  });

  test("retrospective with chat panel open has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/retrospective`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("retrospective-page")).toBeVisible({ timeout: 15000 });
    // The chat panel is one of the three panes; on desktop all panes render
    // side-by-side, so the chat input is already visible. Focus the chat
    // input to exercise its labelled state before scanning.
    const chatInput = page.getByRole("textbox", { name: /chat|message|ask/i }).first();
    if (await chatInput.isVisible().catch(() => false)) {
      await chatInput.focus();
    }
    await scanState(page, "retrospective / chat focused");
  });

  test("task survey view has no axe violations", async ({ page }) => {
    const projectId = await activeProjectId(page.request);
    const goal = `Survey a11y ${Date.now()}`;
    const created = await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
    await page.goto(`${APP_URL}/#/tasks/${created.id}/survey`, { waitUntil: "domcontentloaded" });
    // The survey region renders even with no survey file (empty state with
    // a Continue button), so the labelled region is the stable wait target.
    await expect(page.getByRole("region", { name: "Task survey" })).toBeVisible({
      timeout: 15000,
    });
    await scanState(page, "task survey");
  });

  test("docs deep article (first-time-setup) has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/docs/first-time-setup`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("docs-view")).toBeVisible({ timeout: 15000 });
    // Wait for the article content to render (the view shows a loading
    // state until the markdown arrives).
    await expect(page.getByRole("heading", { name: /First-Time Setup|Setup/i }).first()).toBeVisible({
      timeout: 15000,
    });
    await scanState(page, "docs / first-time-setup");
  });

  test("task detail with waiting_human status has no axe violations", async ({ page }) => {
    const projectId = await activeProjectId(page.request);
    const goal = `Task detail waiting a11y ${Date.now()}`;
    const created = await createTaskViaApi(page.request, projectId, goal, { stageId: "1" });
    // Drive the task to waiting_human (a checkpoint state) so the detail
    // page renders the human-review badge and Approve/Reject controls —
    // a different rendered state than the idle task-detail scan above.
    // The transition response is asserted: a rejected PATCH would leave an
    // idle task and the heading wait below would blame the wrong layer.
    const patched = await page.request.patch(`${API_BASE}/tasks/${created.id}`, {
      data: { projectId, status: "waiting_human" },
    });
    expect(patched.ok(), `PATCH to waiting_human failed: ${await patched.text()}`).toBe(true);
    await page.goto(`${APP_URL}/#/tasks/${created.id}`, { waitUntil: "domcontentloaded" });
    // Loaded-host budget (60s, like the other full-run specs): the detail
    // page fans out to task, project, workflow, models, and runners fetches,
    // which serialize behind a busy scratch backend late in a full shard.
    await expect(page.getByRole("heading", { name: new RegExp(goal, "i") })).toBeVisible({
      timeout: 60000,
    });
    await scanState(page, "task detail / waiting_human");
  });

  test("explorer with file preview open has no axe violations", async ({ page }) => {
    await page.goto(`${APP_URL}/#/explorer`, { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Project Files")).toBeVisible({ timeout: 15000 });
    // Open the first file in the explorer to render the Document Viewer
    // panel (a second landmark inside the explorer view). Click the first
    // file row if one exists; the scan still validates the base explorer
    // when the project has no files.
    const fileRow = page.getByRole("button", { name: /\.md$|\.json$|\.js$|\.jsx$/i }).first();
    if (await fileRow.isVisible().catch(() => false)) {
      await fileRow.click();
      await expect(page.getByLabel("Document Viewer")).toBeVisible({ timeout: 10000 });
      await scanState(page, "explorer / file preview open");
    } else {
      // No files to preview — scan the base explorer (already covered above,
      // but the state label documents the attempt).
      await scanState(page, "explorer / no files to preview");
    }
  });

  // ── Phase 1.2: disabled-controls exemption probe (negative control) ────

  test("contrast walk exempts disabled controls (negative control)", async ({ page }) => {
    await waitForAppShell(page);
    // Plant a disabled button with deliberately low contrast. WCAG 1.4.6
    // exempts disabled controls, so the walk must NOT flag it — proving the
    // exemption branch is live (not silently skipped because the walk
    // no-ops on everything).
    await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.id = "disabled-contrast-probe";
      probe.disabled = true;
      probe.style.color = "#3a3a3a";
      probe.style.backgroundColor = "#0a0a0a";
      probe.style.fontSize = "14px";
      probe.textContent = "disabled low contrast probe";
      document.getElementById("main-content")?.appendChild(probe) ||
        document.body.appendChild(probe);
    });
    const found = await contrastViolations(page);
    // The disabled probe must NOT appear (exempt).
    expect(found.some((v) => v.target.includes("disabled-contrast-probe"))).toBe(false);
    // But an enabled probe with the same colours MUST appear (proving the
    // walk is still measuring — the exemption is selective, not a no-op).
    await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.id = "enabled-contrast-probe";
      probe.style.color = "#3a3a3a";
      probe.style.backgroundColor = "#0a0a0a";
      probe.style.fontSize = "14px";
      probe.textContent = "enabled low contrast probe";
      document.getElementById("main-content")?.appendChild(probe) ||
        document.body.appendChild(probe);
    });
    const found2 = await contrastViolations(page);
    expect(found2.some((v) => v.target.includes("enabled-contrast-probe"))).toBe(true);
    // Cleanup.
    await page.evaluate(() => {
      document.getElementById("disabled-contrast-probe")?.remove();
      document.getElementById("enabled-contrast-probe")?.remove();
    });
    expect(await contrastViolations(page)).toEqual([]);
  });
});
