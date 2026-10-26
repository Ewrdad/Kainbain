import { describe, it, expect, vi } from "vitest";
import { createSessionHelpers } from "./sessionResolution.js";

describe("sessionResolution", () => {
  const project = { id: "p1" };
  const projectStore = { getProject: (id) => (id === "p1" ? project : null) };
  const sessionStore = {
    beginStageSession: vi.fn(async (proj, meta) => ({ mode: "stage", meta })),
    getOrCreate: vi.fn(async (proj) => ({ mode: "interactive" })),
    dispose: vi.fn(async () => {}),
  };
  const { getOrCreateSession, disposeSession, isAgentRunning } =
    createSessionHelpers({ projectStore, sessionStore });

  it("begins a stage session when meta carries taskId/stageId", async () => {
    const session = await getOrCreateSession("p1", { taskId: "t1" });
    expect(session.mode).toBe("stage");
  });

  it("reuses an interactive session otherwise", async () => {
    const session = await getOrCreateSession("p1");
    expect(session.mode).toBe("interactive");
  });

  it("returns null for an unknown project", async () => {
    expect(await getOrCreateSession("nope")).toBeNull();
  });

  it("disposes a session", async () => {
    await disposeSession("p1");
    expect(sessionStore.dispose).toHaveBeenCalledWith("p1");
  });

  it("reports whether an agent is running", () => {
    expect(isAgentRunning({ isStreaming: true })).toBe(true);
    expect(isAgentRunning({ isStreaming: false })).toBe(false);
    expect(isAgentRunning(null)).toBe(false);
  });
});
