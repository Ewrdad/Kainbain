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

describe("projectResolution required helpers (WP1 tenant fence)", () => {
  const store = {
    getProject: (id) => (id === "p1" ? { id } : null),
    getActiveProject: () => ({ id: "active" }),
  };
  const { resolveRequiredProjectId, resolveAndGuardRequiredProject } =
    createProjectResolvers(store);

  const mockReply = () => {
    const reply = { status: vi.fn(), send: vi.fn() };
    reply.status.mockReturnValue(reply);
    return reply;
  };

  it("resolves a known project id", () => {
    expect(resolveRequiredProjectId("p1")).toBe("p1");
  });

  it("trims surrounding whitespace before resolving", () => {
    expect(resolveRequiredProjectId("  p1  ")).toBe("p1");
  });

  it("returns null for an unknown project id (never the active project)", () => {
    expect(resolveRequiredProjectId("nope")).toBeNull();
  });

  it.each([undefined, null, "", "   ", 42, {}, []])(
    "returns null for missing/blank/non-string projectId (%p)",
    (requestedId) => {
      expect(resolveRequiredProjectId(requestedId)).toBeNull();
    },
  );

  it("never consults the active project, even when one exists", () => {
    const throwing = createProjectResolvers({
      getProject: (id) => (id === "p1" ? { id } : null),
      getActiveProject: () => {
        throw new Error("active project must not be consulted");
      },
    });
    expect(throwing.resolveRequiredProjectId("p1")).toBe("p1");
    expect(throwing.resolveRequiredProjectId(undefined)).toBeNull();
    expect(throwing.resolveRequiredProjectId("   ")).toBeNull();
    expect(throwing.resolveRequiredProjectId("nope")).toBeNull();
  });

  it("resolveAndGuardRequiredProject returns the id for a known project", () => {
    const reply = mockReply();
    expect(resolveAndGuardRequiredProject("p1", reply)).toBe("p1");
    expect(reply.status).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "   "])(
    "resolveAndGuardRequiredProject answers 400 MISSING_PROJECT_ID for %p",
    (requestedId) => {
      const reply = mockReply();
      expect(resolveAndGuardRequiredProject(requestedId, reply)).toBeNull();
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: "MISSING_PROJECT_ID" }),
      );
    },
  );

  it("resolveAndGuardRequiredProject keeps the existing 404 for unknown-but-present ids", () => {
    const reply = mockReply();
    expect(resolveAndGuardRequiredProject("nope", reply)).toBeNull();
    expect(reply.status).toHaveBeenCalledWith(404);
  });
});

describe("projectResolution presence guard (scope-keyed integration routes)", () => {
  const store = {
    getProject: (id) => (id === "p1" ? { id } : null),
    getActiveProject: () => ({ id: "active" }),
  };
  const { resolveAndGuardPresentProject } = createProjectResolvers(store);

  const mockReply = () => {
    const reply = { status: vi.fn(), send: vi.fn() };
    reply.status.mockReturnValue(reply);
    return reply;
  };

  it("passes known ids through trimmed", () => {
    const reply = mockReply();
    expect(resolveAndGuardPresentProject("  p1  ", reply)).toBe("p1");
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("passes unknown-but-present scope strings through (queue owns them)", () => {
    const reply = mockReply();
    expect(resolveAndGuardPresentProject("ghost-scope", reply)).toBe("ghost-scope");
    expect(reply.status).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "   "])(
    "answers 400 MISSING_PROJECT_ID for %p",
    (requestedId) => {
      const reply = mockReply();
      expect(resolveAndGuardPresentProject(requestedId, reply)).toBeNull();
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: "MISSING_PROJECT_ID" }),
      );
    },
  );
});
