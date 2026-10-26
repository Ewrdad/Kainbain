// Canary coverage for the question-me survey feature. Runs against the
// isolated scratch stack and covers the real engine gate (mock harness
// execute -> park), the real survey UI (select, conditional reveal, notes,
// save, submit, skip, empty round), SURVEY.md append-only persistence on disk,
// stage advancement, and desktop + mobile screenshots.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_URL as API_BASE, APP_URL } from "./urls.js";
import {
  waitForAppReady,
  selectProject,
  collectPageErrors,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
} from "./helpers.js";

const SHOTS = "/tmp/kb-survey-verify";
const STAMP = Date.now();
const PROJECT_NAME = `Survey Verify ${STAMP}`;

const SURVEY_ROUND_1 = {
  round: 1,
  generatedAt: "2026-10-18T12:00:00.000Z",
  stage: "ask",
  questions: [
    {
      id: "q1",
      type: "single",
      text: "Primary concern?",
      options: ["Auth", "Data"],
      required: true,
      showIf: null,
    },
    {
      id: "q2",
      type: "multiple",
      text: "Frameworks?",
      options: ["GDPR", "HIPAA"],
      required: false,
      showIf: { questionId: "q1", value: "Data" },
    },
    {
      id: "q3",
      type: "single",
      text: "Data residency?",
      options: ["EU", "US"],
      required: true,
      showIf: null,
    },
  ],
  answers: {},
};

function surveyDoc(rounds) {
  const parts = ["# Survey", ""];
  for (const r of rounds) {
    parts.push(`## Round ${r.round}`, "", "```survey-json", JSON.stringify(r, null, 2), "```", "");
  }
  return `${parts.join("\n").trim()}\n`;
}

test.describe("question-me survey verification", () => {
  let project;
  let projCwd;

  test.beforeAll(async ({ request }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    projCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-survey-proj-"));
    const res = await request.post(`${API_BASE}/projects`, {
      data: {
        name: PROJECT_NAME,
        cwd: projCwd,
        useBranches: false,
        stages: [
          { id: "ask", name: "Ask", type: "agent", prompt: "Ask three questions", skills: [{ name: "question-me" }] },
          { id: "plan", name: "Plan", type: "agent", prompt: "Make a plan" },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    project = await res.json();
    // Activate so the UI's project-scoped API calls target this project.
    await request.post(`${API_BASE}/projects/${project.id}/activate`);
    // Sanity: the skill attachment survived project creation.
    const wf = await (await request.get(`${API_BASE}/projects/${project.id}/workflow`)).json();
    const ask = (wf.stages || []).find((s) => s.id === "ask");
    expect(ask.skills || []).toEqual([{ name: "question-me" }]);
  });

  test.afterAll(async ({ request }) => {
    if (project?.id) {
      await request.delete(`${API_BASE}/projects/${project.id}`).catch(() => {});
    }
    try {
      fs.rmSync(projCwd, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  async function makeTask(request, goal, stageId = "ask") {
    const res = await request.post(`${API_BASE}/tasks`, {
      data: { projectId: project.id, title: goal, goal, stageId },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  function surveyPath(taskId) {
    return path.join(projCwd, "docs", "tasks", taskId, "SURVEY.md");
  }

  async function taskState(request, taskId) {
    const res = await request.get(`${API_BASE}/tasks/${taskId}?projectId=${project.id}`);
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  test("engine parks a question-me stage with no survey file; skip advances", async ({ request, page }) => {
    const pageErrors = collectPageErrors(page);
    const task = await makeTask(request, `survey none ${STAMP}`);
    // Real engine, mock harness: no SURVEY.md exists.
    const exec = await request.post(`${API_BASE}/tasks/${task.id}/execute`, {
      data: { projectId: project.id },
    });
    expect(exec.ok()).toBeTruthy();
    const parked = await taskState(request, task.id);
    expect(parked.status).toBe("waiting_human");
    expect(parked.currentStageId).toBe("ask");

    await waitForAppReady(page);
    await selectProject(page, PROJECT_NAME);
    await page.goto(`${APP_URL}/#/tasks/${task.id}/survey`);
    await expect(page.getByText("did not write any survey questions")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${SHOTS}/survey-none.png` });
    await page.getByRole("button", { name: /continue without questions/i }).click();
    await expect(page.getByText(/moved to its next stage/i)).toBeVisible({ timeout: 15000 });
    const moved = await taskState(request, task.id);
    expect(moved.currentStageId).toBe("plan");
    expect(pageErrors).toEqual([]);
  });

  test("desktop: conditional reveal, notes, save, submit advances; file stays append-only", async ({ request, page }) => {
    const pageErrors = collectPageErrors(page);
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const task = await makeTask(request, `survey full ${STAMP}`);
    // Agent-authored file present BEFORE the run (as if the agent wrote it).
    fs.mkdirSync(path.dirname(surveyPath(task.id)), { recursive: true });
    fs.writeFileSync(surveyPath(task.id), surveyDoc([SURVEY_ROUND_1]), "utf8");

    // Real engine gate reads the file and parks (pending).
    const exec = await request.post(`${API_BASE}/tasks/${task.id}/execute`, {
      data: { projectId: project.id },
    });
    expect(exec.ok()).toBeTruthy();
    const parked = await taskState(request, task.id);
    expect(parked.status).toBe("waiting_human");

    // Banner on the detail page routes to the survey.
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await waitForAppReady(page);
    await selectProject(page, PROJECT_NAME);
    await page.goto(`${APP_URL}/#/tasks/${task.id}`);
    const banner = page.getByRole("region", { name: /survey awaiting/i });
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner.getByRole("link", { name: /open survey/i })).toHaveAttribute(
      "href",
      `#/tasks/${task.id}/survey`,
    );

    await page.goto(`${APP_URL}/#/tasks/${task.id}/survey`);
    await expect(page.getByText("Primary concern?")).toBeVisible({ timeout: 15000 });
    expect(await page.getByText("Frameworks?").count()).toBe(0);
    await page.screenshot({ path: `${SHOTS}/desktop-initial.png` });

    // Conditional reveal timing (client-side reactivity).
    const t0 = Date.now();
    await page.getByLabel("Primary concern?: Data").click();
    await expect(page.getByText("Frameworks?")).toBeVisible({ timeout: 5000 });
    const revealMs = Date.now() - t0;

    await page.getByLabel("Frameworks?: GDPR").check();
    await page.getByLabel("Frameworks?: HIPAA").check();
    await page.getByLabel("Notes for: Primary concern?").fill("PII in uploads");
    await page.screenshot({ path: `${SHOTS}/desktop-conditional.png` });

    // Partial save stays parked.
    const s0 = Date.now();
    await page.getByRole("button", { name: /save answers/i }).click();
    await expect(page.getByText(/answers saved/i)).toBeVisible({ timeout: 15000 });
    const saveMs = Date.now() - s0;
    expect((await taskState(request, task.id)).status).toBe("waiting_human");
    const mid = JSON.parse(
      fs.readFileSync(surveyPath(task.id), "utf8").match(/```survey-json\n([\s\S]*?)```/)[1],
    );
    expect(mid.answers.q1).toEqual({ selected: ["Data"], notes: "PII in uploads" });
    expect(mid.answers.q2.selected.sort()).toEqual(["GDPR", "HIPAA"]);

    // Complete + submit advances to plan.
    await page.getByLabel("Data residency?: EU").click();
    const u0 = Date.now();
    await page.getByRole("button", { name: /submit & continue/i }).click();
    await expect(page.getByText(/moved to its next stage/i)).toBeVisible({ timeout: 15000 });
    const submitMs = Date.now() - u0;
    expect((await taskState(request, task.id)).currentStageId).toBe("plan");
    const round1Completed = JSON.parse(
      fs.readFileSync(surveyPath(task.id), "utf8").match(/```survey-json\n([\s\S]*?)```/)[1],
    );
    // eslint-disable-next-line no-console
    console.log(`survey timings ms: reveal=${revealMs} save=${saveMs} submit=${submitMs}`);
    expect(revealMs).toBeLessThan(2000);

    // Failback simulation: new round appended at the bottom, old answers intact.
    const round2 = {
      round: 2,
      generatedAt: new Date().toISOString(),
      stage: "ask",
      questions: [
        { id: "q4", type: "single", text: "Encryption at rest?", options: ["Yes", "No"], required: true, showIf: null },
      ],
      answers: {},
    };
    fs.writeFileSync(surveyPath(task.id), surveyDoc([round1Completed, round2]), "utf8");
    await request.patch(`${API_BASE}/tasks/${task.id}`, {
      data: { projectId: project.id, stageId: "ask", status: "waiting_human" },
    });
    // Same-URL goto is a no-op: reload so the page refetches the new round.
    await page.reload();
    await expect(page.getByText("Encryption at rest?")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Round 2")).toBeVisible();
    // Round 1 keeps its answers (radio still checked).
    await expect(page.getByLabel("Primary concern?: Data")).toBeChecked();
    await page.screenshot({ path: `${SHOTS}/desktop-round2.png` });
    await page.getByLabel("Encryption at rest?: Yes").click();
    await page.getByRole("button", { name: /submit & continue/i }).click();
    await expect(page.getByText(/moved to its next stage/i)).toBeVisible({ timeout: 15000 });
    expect((await taskState(request, task.id)).currentStageId).toBe("plan");
    const finalDoc = fs.readFileSync(surveyPath(task.id), "utf8");
    expect(finalDoc.match(/```survey-json/g).length).toBe(2);
    expect(finalDoc).toContain("PII in uploads");
    // No horizontal overflow on desktop.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test.describe("touch context", () => {
    test.use({ viewport: MOBILE_VIEWPORT, hasTouch: true, isMobile: true });

    test("mobile: survey renders, answers, and fits 375px", async ({ request, page }) => {
    const pageErrors = collectPageErrors(page);
    const task = await makeTask(request, `survey mobile ${STAMP}`);
    fs.mkdirSync(path.dirname(surveyPath(task.id)), { recursive: true });
    fs.writeFileSync(surveyPath(task.id), surveyDoc([SURVEY_ROUND_1]), "utf8");
    await request.patch(`${API_BASE}/tasks/${task.id}`, {
      data: { projectId: project.id, status: "waiting_human" },
    });

    await waitForAppReady(page);
    await selectProject(page, PROJECT_NAME);
    await page.goto(`${APP_URL}/#/tasks/${task.id}/survey`);
    await expect(page.getByText("Primary concern?")).toBeVisible({ timeout: 15000 });
    // The label row is the touch target (native input stays 16px).
    const labelBox = await page.locator("label", { has: page.getByLabel("Primary concern?: Auth") }).boundingBox();
    expect(labelBox.height).toBeGreaterThanOrEqual(44);
    await page.getByLabel("Primary concern?: Auth").tap();
    await page.getByLabel("Data residency?: US").tap();
    await page.getByLabel("Notes for: Data residency?").fill("mobile note");
    await page.screenshot({ path: `${SHOTS}/mobile-answered.png`, fullPage: true });
    await page.getByRole("button", { name: /submit & continue/i }).click();
    await expect(page.getByText(/moved to its next stage/i)).toBeVisible({ timeout: 15000 });
    expect((await taskState(request, task.id)).currentStageId).toBe("plan");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
    });
  });

  test("empty round advances via continue without parking", async ({ request, page }) => {
    const pageErrors = collectPageErrors(page);
    const task = await makeTask(request, `survey empty ${STAMP}`);
    fs.mkdirSync(path.dirname(surveyPath(task.id)), { recursive: true });
    fs.writeFileSync(
      surveyPath(task.id),
      surveyDoc([{ round: 1, generatedAt: new Date().toISOString(), stage: "ask", questions: [], answers: {} }]),
      "utf8",
    );
    // Real engine: empty round must NOT park.
    const exec = await request.post(`${API_BASE}/tasks/${task.id}/execute`, {
      data: { projectId: project.id },
    });
    expect(exec.ok()).toBeTruthy();
    const moved = await taskState(request, task.id);
    expect(moved.currentStageId).toBe("plan");
    expect(moved.status).not.toBe("waiting_human");

    // The page still offers Continue on an empty survey (skip path UI).
    await waitForAppReady(page);
    await selectProject(page, PROJECT_NAME);
    await page.goto(`${APP_URL}/#/tasks/${task.id}/survey`);
    await expect(page.getByText(/nothing worth asking/i)).toBeVisible({ timeout: 15000 });
    await pageErrors.length;
    expect(pageErrors).toEqual([]);
  });
});
