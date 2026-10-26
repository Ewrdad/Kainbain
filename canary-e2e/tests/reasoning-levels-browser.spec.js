import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_URL, API_URL } from "./urls";
import { selectProject, waitForAppReady } from "./helpers";

const SHOTS = "/tmp/kb-reasoning-shots";
fs.mkdirSync(SHOTS, { recursive: true });

let scratchRoot;
let projectSeq = 0;

async function createFixtureProject(request) {
  projectSeq += 1;
  const cwd = path.join(scratchRoot, `reasoning-${projectSeq}`);
  fs.mkdirSync(cwd, { recursive: true });
  const res = await request.post(`${API_URL}/projects`, {
    data: {
      name: `Reasoning Verify ${Date.now()}-${projectSeq}`,
      cwd,
      notesPath: path.join(cwd, "notes"),
      useBranches: false,
      stages: [{ id: "1", name: "Development", type: "agent" }],
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function readProject(request, projectId) {
  const res = await request.get(`${API_URL}/projects`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).find((p) => p.id === projectId);
}

async function gotoSettings(page, projectName) {
  await waitForAppReady(page);
  await selectProject(page, projectName);
  await page.goto(`${APP_URL}/#/settings`);
  await expect(page.getByText("Project Configuration")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("model-selector").first()).toBeVisible({ timeout: 20000 });
}

async function frameStats(page, ms = 1200) {
  return page.evaluate((budget) => {
    return new Promise((resolve) => {
      const deltas = [];
      let last = 0;
      const t0 = performance.now();
      function tick(t) {
        if (last) deltas.push(t - last);
        last = t;
        if (t - t0 < budget) requestAnimationFrame(tick);
        else {
          deltas.sort((a, b) => a - b);
          const p95 = deltas[Math.floor(deltas.length * 0.95)] || 0;
          resolve({ frames: deltas.length, p95: Math.round(p95 * 10) / 10 });
        }
      }
      requestAnimationFrame(tick);
    });
  }, ms);
}

test.describe("Reasoning levels browser verification (scratch stack)", () => {
  test.beforeAll(() => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-reasoning-"));
  });

  test("picker + aliases: levels, persistence, invalid handling, null harnesses", async ({
    page,
    request,
  }) => {
    const project = await createFixtureProject(request);

    // Catalogue advertisement on the scratch backend.
    const catRes = await request.get(`${API_URL}/compute/models`);
    expect(catRes.ok()).toBeTruthy();
    const cat = await catRes.json();
    const levelsOf = (id) => (cat.harnesses || []).find((h) => h.id === id)?.reasoningLevels ?? null;
    console.log(`CATALOGUE pi=${JSON.stringify(levelsOf("pi"))} agy=${JSON.stringify(levelsOf("antigravity"))} mock=${JSON.stringify(levelsOf("mock"))} muse=${JSON.stringify(levelsOf("muse"))}`);
    const modelsOf = (id) => ((cat.harnesses || []).find((h) => h.id === id)?.models || []).length;
    const piModels = modelsOf("pi");
    const agyModels = modelsOf("antigravity");
    const mockModels = modelsOf("mock");
    console.log(`CATALOGUE COUNTS pi=${piModels} agy=${agyModels} mock=${mockModels}`);
    // Scratch boots with the mock default harness, so pi may be absent here;
    // pi's 7-level advertisement is pinned by unit tests + the live probe.
    if ((cat.harnesses || []).some((h) => h.id === "pi")) {
      expect(levelsOf("pi")).toEqual(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
    }
    expect(levelsOf("antigravity")).toEqual(["low", "medium", "high"]);
    expect(levelsOf("mock")).toEqual(["low", "medium", "high"]);
    expect(levelsOf("muse")).toBeNull();
    expect(mockModels).toBeGreaterThan(0);

    await gotoSettings(page, project.name);
    const picker = page.getByTestId("model-selector").first();
    const harnessBox = picker.getByRole("combobox", { name: "AI Harness" });
    const reasoningBox = () => picker.getByRole("combobox", { name: "Reasoning" });

    // --- 1. mock harness: Reasoning visible with Default/low/medium/high.
    await harnessBox.click();
    await page.getByRole("option", { name: "Mock" }).first().click();
    // Pick the mock model first: a level with no base model is a no-op by design.
    await picker.getByRole("combobox", { name: "Default AI Model" }).click();
    await page.getByRole("listbox").getByRole("option").first().click();
    await expect(reasoningBox()).toBeVisible({ timeout: 10000 });
    await expect(picker.getByText("Reasoning", { exact: true }).first()).toBeVisible();
    await reasoningBox().click();
    for (const label of ["Default (no level)", "low", "medium", "high"]) {
      await expect(page.getByRole("option", { name: label, exact: true }).first()).toBeVisible();
    }
    await page.screenshot({ path: `${SHOTS}/01-picker-mock-reasoning-open.png` });
    const fps = await frameStats(page);
    console.log(`RESPONSIVENESS dropdown-open frames=${fps.frames} p95=${fps.p95}ms`);
    expect(fps.p95).toBeLessThan(100);
    await page.getByRole("option", { name: "high", exact: true }).first().click();
    await expect(reasoningBox()).toContainText("high");
    await page.screenshot({ path: `${SHOTS}/02-picker-mock-high-selected.png` });

    // Save with ::high suffix, reload, confirm persistence (UI + API).
    await page.getByRole("button", { name: "Save Configuration" }).click();
    await expect(page.getByRole("button", { name: "Saved ✓" })).toBeVisible({ timeout: 20000 });
    const saved = await readProject(request, project.id);
    console.log(`SAVED defaultModel=${saved.defaultModel} harness=${saved.harness}`);
    expect(saved.defaultModel || "").toMatch(/::high$/);
    await gotoSettings(page, project.name);
    await expect(picker.getByRole("combobox", { name: "Reasoning" })).toContainText("high");
    await page.screenshot({ path: `${SHOTS}/03-picker-reloaded-high.png` });

    // --- 2. antigravity harness: low/medium/high when the catalogue is non-empty.
    await picker.getByRole("combobox", { name: "AI Harness" }).click();
    await page.getByRole("option", { name: "Antigravity" }).first().click();
    if (agyModels > 0) {
      await picker.getByRole("combobox", { name: "Default AI Model" }).click();
      await page.getByRole("listbox").getByRole("option").first().click();
      await expect(picker.getByRole("combobox", { name: "Reasoning" })).toBeVisible({ timeout: 10000 });
      await picker.getByRole("combobox", { name: "Reasoning" }).click();
      for (const label of ["low", "medium", "high"]) {
        await expect(page.getByRole("option", { name: label, exact: true }).first()).toBeVisible();
      }
      await page.screenshot({ path: `${SHOTS}/04-picker-antigravity-levels-open.png` });
      await page.getByRole("option", { name: "medium", exact: true }).first().click();
      await expect(picker.getByRole("combobox", { name: "Reasoning" })).toContainText("medium");
    } else {
      console.log("ANTIGRAVITY CATALOGUE EMPTY in scratch — agy levels covered by unit tests");
    }

    // --- 3. null harnesses stay level-free (muse, vibe, opencode, codex, custom).
    // Clear any level first: switching with a ::level set blocks by design.
    if (await picker.getByRole("combobox", { name: "Reasoning" }).count()) {
      await picker.getByRole("combobox", { name: "Reasoning" }).click();
      await page.getByRole("option", { name: "Default (no level)", exact: true }).first().click();
    }
    for (const harnessName of ["Muse Code", "Mistral Vibe", "OpenCode server", "Codex", "Custom command"]) {
      await picker.getByRole("combobox", { name: "AI Harness" }).click();
      await page.getByRole("option", { name: harnessName }).first().click();
      await expect(picker.getByRole("combobox", { name: "Reasoning" })).toHaveCount(0);
    }
    await page.screenshot({ path: `${SHOTS}/05-picker-muse-no-reasoning.png` });
    console.log("NULL HARNESSES: Reasoning hidden for muse/vibe/opencode/codex/custom");

    // --- 4. Model Aliases: target row dropdown, save with suffix, reload.
    await picker.getByRole("combobox", { name: "AI Harness" }).click();
    await page.getByRole("option", { name: "Mock" }).first().click();
    const section = page.getByTestId("model-aliases-section");
    await section.getByRole("button", { name: "+ Add alias" }).click();
    await section.locator("#model-alias-name-0").fill("browser-small");
    await section.getByRole("combobox", { name: "Alias 1 harness" }).click();
    await page.getByRole("option", { name: "Mock" }).first().click();
    await section.getByRole("combobox", { name: "Alias 1 model" }).click();
    await page.getByRole("listbox").getByRole("option").first().click();
    const aliasReasoning = section.getByRole("combobox", { name: "Reasoning" });
    await expect(aliasReasoning).toBeVisible({ timeout: 10000 });
    await aliasReasoning.click();
    await expect(page.getByRole("option", { name: "medium", exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/06-alias-reasoning-open.png` });
    await page.getByRole("option", { name: "medium", exact: true }).first().click();
    await page.getByRole("button", { name: "Save Configuration" }).click();
    await expect(page.getByRole("button", { name: "Saved ✓" })).toBeVisible({ timeout: 20000 });
    const savedAliases = (await readProject(request, project.id)).modelAliases || [];
    console.log(`SAVED aliases=${JSON.stringify(savedAliases)}`);
    expect(JSON.stringify(savedAliases)).toContain("::medium");
    await gotoSettings(page, project.name);
    await page.getByTestId("model-alias-toggle-0").click();
    await expect(
      page.getByTestId("model-aliases-section").getByRole("combobox", { name: "Reasoning" }),
    ).toContainText("medium");
    await page.screenshot({ path: `${SHOTS}/07-alias-reloaded-medium.png` });

    // --- 5. Blocked harness switch with level set + one-click Clear.
    const section2 = page.getByTestId("model-aliases-section");
    await section2.getByRole("combobox", { name: "Alias 1 harness" }).click();
    await page.getByRole("option", { name: "Muse Code" }).first().click();
    await expect(section2.getByTestId("reasoning-clear-notice")).toContainText(
      "Clear the reasoning level first",
    );
    await page.screenshot({ path: `${SHOTS}/08-alias-blocked-switch.png` });
    await section2.getByTestId("reasoning-clear-notice").getByRole("button", { name: "Clear" }).click();
    await expect(section2.getByTestId("reasoning-clear-notice")).toHaveCount(0);
    await expect(section2.getByRole("combobox", { name: "Reasoning" })).toHaveCount(0);

    // --- 6. Backend refuses an invalid level on save (defense in depth).
    const badRes = await request.patch(`${API_URL}/projects/${project.id}`, {
      data: {
        modelAliases: [{ name: "bad", targets: [{ harness: "mock", model: "mock::provider::id::nope", percent: 100 }] }],
      },
    });
    console.log(`INVALID SAVE status=${badRes.status()} body=${(await badRes.text()).slice(0, 200)}`);
    expect(badRes.status()).toBeGreaterThanOrEqual(400);
  });
});
