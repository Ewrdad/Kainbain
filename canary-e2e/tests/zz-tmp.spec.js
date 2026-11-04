import { test, expect } from "@playwright/test";
import { API_URL } from "./urls";
import {
  activeProjectId,
  createTaskViaApi,
  resetProject,
  waitForAppReadyOnProject,
} from "./helpers";

// TEMPORARY diagnostic (deleted immediately after use): replicates the
// task-inspector body flow with console/network instrumentation.
test("zz-tmp instrumented inspector flow", async ({ page, request }) => {
  const logs = [];
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("[vite]") && !t.includes("React DevTools")) logs.push(`[console:${m.type()}] ${t.slice(0, 250)}`);
  });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String((e && e.stack) || e).slice(0, 900)}`));
  page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`));
  page.on("crash", () => logs.push("[PAGE CRASHED]"));
  page.on("response", (r) => {
    if (r.status() >= 400) logs.push(`[http${r.status()}] ${r.url().slice(0, 160)}`);
  });

  try {
  await waitForAppReadyOnProject(page);
  logs.push("ready1 ok");
  await resetProject(page.request, await activeProjectId(page.request));
  await page.reload();
  await waitForAppReadyOnProject(page);
  logs.push("ready2 ok");

  const projectId = await activeProjectId(request);
  const goal = `ZZ tmp ${Date.now()}`;
  await createTaskViaApi(request, projectId, goal);
  logs.push("task created");
  await page.reload();
  logs.push("reload issued");
  const state = await page.evaluate(() => ({
    rootChildren: document.querySelector("#root")?.childElementCount ?? -1,
    htmlLen: document.documentElement.outerHTML.length,
    bodyText: (document.body?.innerText || "").slice(0, 200),
    pending: performance.getEntriesByType("resource").filter((r) => r.responseEnd === 0).map((r) => r.name.slice(0, 120)),
    resources: performance.getEntriesByType("resource").length,
  })).catch((err) => ({ evalErr: String(err).slice(0, 200) }));
  logs.push(`STATE-after-reload: ${JSON.stringify(state).slice(0, 2000)}`);
  await waitForAppReadyOnProject(page);
  logs.push("ready3 ok");
  } finally {
    console.log(logs.join("\n"));
  }
});
