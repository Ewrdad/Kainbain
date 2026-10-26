import { describe, it, expect, vi } from "vitest";

/***
 * MARK: tasks route alias wiring tests
 * @description Pins the task-route composition root's alias contract: the
 *   agent runner built when no runner is injected must resolve per-stage
 *   alias references through the project's `modelAliases` (a working
 *   `getProject`), so a stage on the virtual `alias` harness dispatches on
 *   the alias's concrete target instead of warning about an "unknown" alias
 *   that exists. The sub-route registrars are stubbed — only the runner the
 *   composition root hands them is under test.
 ***/

vi.mock("../work/taskWorkRoutes.js", () => ({
	registerTaskWorkRoutes: vi.fn(async () => {}),
}));
vi.mock("../flow/taskFlowRoutes.js", () => ({
	registerTaskFlowRoutes: vi.fn(async () => {}),
}));
vi.mock("../watch/taskWatchRoutes.js", () => ({
	registerTaskWatchRoutes: vi.fn(async () => {}),
}));

import tasksRoutes from "./tasks.js";
import { registerTaskWorkRoutes } from "../work/taskWorkRoutes.js";
import { registerHarness } from "../agent/harnessRegistry.js";

let unique = 5000;
const nextId = (prefix) => `${prefix}-${++unique}`;

describe("tasksRoutes fallback agent runner", () => {
	it("resolves a stage alias ref through the project aliases", async () => {
		const targetName = nextId("wiring-harness");
		registerHarness(targetName, () => ({}), {
			description: "tasks-route alias wiring probe",
		});
		const project = {
			id: nextId("proj"),
			harness: "pi",
			modelAliases: [{ name: "small", harness: targetName, model: "m1" }],
		};
		const seenMeta = [];
		const deps = {
			getOrCreateSession: vi.fn(async (_projectId, meta) => {
				seenMeta.push(meta);
				return { harnessId: targetName, prompt: async () => "done" };
			}),
			projectStore: { getProject: vi.fn(() => project) },
		};
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await tasksRoutes({}, { deps });
			const runner =
				registerTaskWorkRoutes.mock.calls.at(-1)[1].agentRunner;
			expect(typeof runner).toBe("function");

			await runner("do the thing", {
				projectId: project.id,
				taskId: nextId("task"),
				stage: { id: "s1", harness: "alias", model: "small" },
				onChunk: () => {},
			});

			// The session starts on the alias's concrete target harness …
			expect(seenMeta[0]?.harness).toBe(targetName);
			// … with no bogus unknown-alias warning for an alias that exists.
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(
				lines.some((line) => line.includes("Unknown model alias")),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});
});
