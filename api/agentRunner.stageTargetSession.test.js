import { describe, it, expect, vi } from "vitest";
import { createAgentRunner } from "./agentRunner.js";

/***
 * MARK: agentRunner stage-target session tests
 * @description Pins the dispatch→session target hand-off (the S1 root-cause
 *   fix): a stage resolving through an alias must hand the CONCRETE model
 *   ref to session creation (not just the harness half), so the harness
 *   never re-resolves the project default against the wrong catalog.
 *   Sessions created already pinned must not pay a redundant switch, and
 *   alias-miss fallbacks keep the project-default path (no pinned model).
 ***/

const PROJECT = {
	id: "proj-handoff",
	harness: "pi",
	defaultModel: "llama-cloud-direct::glm-5.3-flash:cloud",
	modelAliases: [
		{ name: "worker", harness: "antigravity", model: "gemini-3.8-flash-low" },
	],
};
const STAGE = { id: "s1", harness: "alias", model: "worker" };

const GEMINI = {
	provider: "antigravity",
	id: "gemini-3.8-flash-low",
	name: "gemini-3.8-flash-low",
	key: "antigravity::antigravity::gemini-3.8-flash-low",
};

function antigravityLikeSession({ pinned } = {}) {
	return {
		harnessId: "antigravity",
		prompt: vi.fn().mockResolvedValue("done"),
		messages: [{ role: "assistant", content: "done" }],
		getActiveModel: vi
			.fn()
			.mockResolvedValue(pinned ? { ...GEMINI } : { id: "agy-default" }),
		listModels: vi.fn().mockResolvedValue([{ ...GEMINI }]),
		resolveModelRef: vi.fn(async (ref) =>
			String(ref || "").includes("gemini-3.8-flash-low") ? { ...GEMINI } : null,
		),
		switchModel: vi.fn().mockResolvedValue({ ...GEMINI }),
	};
}

describe("createAgentRunner (stage-target session hand-off)", () => {
	it("hands the dispatch-resolved model ref to session creation (harness + model together)", async () => {
		const session = antigravityLikeSession({ pinned: false });
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({
			getOrCreateSession,
			getProject: () => ({ ...PROJECT }),
		});
		await runner("do", { projectId: PROJECT.id, stage: STAGE, taskId: "t1" });
		expect(getOrCreateSession).toHaveBeenCalledWith(PROJECT.id, {
			taskId: "t1",
			stageId: "s1",
			harness: "antigravity",
			model: "gemini-3.8-flash-low",
		});
	});

	it("skips the post-creation switch when the session was created already pinned", async () => {
		const session = antigravityLikeSession({ pinned: true });
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(session),
			getProject: () => ({ ...PROJECT }),
		});
		await runner("do", { projectId: PROJECT.id, stage: STAGE, taskId: "t1" });
		expect(session.switchModel).not.toHaveBeenCalled();
	});

	it("still switches when the created session runs a different model", async () => {
		const session = antigravityLikeSession({ pinned: false });
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(session),
			getProject: () => ({ ...PROJECT }),
		});
		await runner("do", { projectId: PROJECT.id, stage: STAGE, taskId: "t1" });
		expect(session.switchModel).toHaveBeenCalledWith(
			expect.objectContaining({ id: "gemini-3.8-flash-low" }),
		);
	});

	it("passes no pinned model on alias-miss fallbacks (project-default path unchanged)", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const session = antigravityLikeSession({ pinned: false });
			const getOrCreateSession = vi.fn().mockResolvedValue(session);
			const runner = createAgentRunner({
				getOrCreateSession,
				getProject: () => ({ ...PROJECT }),
			});
			await runner("do", {
				projectId: PROJECT.id,
				stage: { id: "s1", harness: "alias", model: "ghost-handoff-xyz" },
				taskId: "t1",
			});
			expect(getOrCreateSession).toHaveBeenCalledWith(PROJECT.id, {
				taskId: "t1",
				stageId: "s1",
			});
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("passes the sentinel 'default' through without pinning a model", async () => {
		const session = antigravityLikeSession({ pinned: false });
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({
			getOrCreateSession,
			getProject: () => ({ ...PROJECT }),
		});
		await runner("do", {
			projectId: PROJECT.id,
			stage: { id: "s1", harness: "antigravity", model: "default" },
			taskId: "t1",
		});
		expect(getOrCreateSession).toHaveBeenCalledWith(PROJECT.id, {
			taskId: "t1",
			stageId: "s1",
			harness: "antigravity",
		});
		expect(session.switchModel).not.toHaveBeenCalled();
	});
});
