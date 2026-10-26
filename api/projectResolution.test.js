import { describe, it, expect, vi } from "vitest";
import { createProjectResolvers } from "./projectResolution.js";

describe("projectResolution", () => {
  const store = {
    getProject: (id) => (id === "p1" ? { id } : null),
    getActiveProject: () => ({ id: "active" }),
  };
  const { resolveProjectId, requireProject, resolveAndGuardProject } =
    createProjectResolvers(store);

  it("resolves a known project id", () => {
    expect(resolveProjectId("p1")).toBe("p1");
  });

  it("returns null for an unknown project id", () => {
    expect(resolveProjectId("nope")).toBeNull();
  });

  it("falls back to the active project when no id is provided", () => {
    expect(resolveProjectId()).toBe("active");
  });

  it("requireProject sends 404 when id is null", () => {
    const reply = { status: vi.fn(), send: vi.fn() };
    reply.status.mockReturnValue(reply);
    expect(requireProject(null, reply)).toBe(false);
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  it("resolveAndGuardProject returns id or null after 404", () => {
    const reply = { status: vi.fn(), send: vi.fn() };
    reply.status.mockReturnValue(reply);
    expect(resolveAndGuardProject("p1", reply)).toBe("p1");
    expect(resolveAndGuardProject("nope", reply)).toBeNull();
  });
});
