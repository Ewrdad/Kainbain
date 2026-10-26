import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "./taskStore.js";
import { createAgentRunner } from "./agentRunner.js";
import { OpencodeSessionWrapper } from "./agent/harnesses/opencode/OpencodeSessionWrapper.js";
import { computeHarnessReliability } from "./watch/harnessReliability.js";

/**
 * MARK: Opencode reliability attribution integration
 * @description End-to-end proof that an opencode run attributes through the
 *   engine's real seams: a REAL OpencodeSessionWrapper (fake transport, no
 *   server) flows through the REAL createAgentRunner and the REAL
 *   TaskStore.executeStage into saveStageReport, and
 *   computeHarnessReliability reports the run under "opencode". Guards the
 *   deep-review finding that opencode runs could never attribute (the
 *   session carried no harnessId, so the Settings row showed "No
 *   reliability data yet" forever).
 */

const stages = [
	{ id: "1", name: "Idea", type: "agent", failback: "start", report: true },
];

/***
 * MARK: makeOpencodeSession
 * @description Builds a real OpencodeSessionWrapper over a fake transport:
 *   prompt resolves, messages returns one assistant turn, the transcript
 *   lands under the throwaway cwd, and the idle-signal wait is instant.
 ***/
function makeOpencodeSession(cwd, { assistantText = "Plan complete.", promptImpl } = {}) {
	const prompt =
		promptImpl || (async () => ({ data: { info: { id: "a1" } } }));
	return new OpencodeSessionWrapper({
		client: {
			session: {
				prompt,
				messages: async () => ({
					data: [
						{
							info: { id: "a1", role: "assistant" },
							parts: [{ type: "text", text: assistantText }],
						},
					],
				}),
			},
		},
		sessionId: "ses-reliability",
		cwd,
		idleSignalTimeoutMs: 5,
	});
}

function makeStore(tempCwd) {
	const projectStore = {
		getProject: () => ({ id: "p1", name: "Opencode", cwd: tempCwd, harness: "opencode", stages }),
		listProjects: () => [{ id: "p1", cwd: tempCwd }],
	};
	return new TaskStore({ projectStore });
}

describe("opencode reliability attribution (agentRunner → executeStage → reliability)", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-opencode-reliability-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("attributes a clean opencode run under 'opencode' end to end", async () => {
		const store = makeStore(tempCwd);
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });
		const session = makeOpencodeSession(tempCwd);
		const agentRunner = createAgentRunner({
			getOrCreateSession: () => session,
		});

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner,
		});

		expect(result.status).toBe("passed");
		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).toMatchObject({
			status: "PASSED",
			harnessId: "opencode",
			failureKind: "none",
		});

		const reliability = computeHarnessReliability(store);
		expect(reliability).toHaveLength(1);
		expect(reliability[0]).toMatchObject({
			harnessId: "opencode",
			runs: 1,
			successes: 1,
			infraFailures: 0,
			excludedRejected: 0,
			successRate: 100,
		});
	});

	it("counts an opencode transport failure as an infrastructure failure", async () => {
		const store = makeStore(tempCwd);
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });
		const session = makeOpencodeSession(tempCwd, {
			promptImpl: async () => {
				throw new Error("socket hang up");
			},
		});
		const agentRunner = createAgentRunner({
			getOrCreateSession: () => session,
		});

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner,
		});

		expect(result.status).toBe("retrying");
		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).toMatchObject({
			status: "FAILED",
			harnessId: "opencode",
			failureKind: "infrastructure",
		});

		const reliability = computeHarnessReliability(store);
		expect(reliability).toHaveLength(1);
		expect(reliability[0]).toMatchObject({
			harnessId: "opencode",
			runs: 1,
			successes: 0,
			infraFailures: 1,
			successRate: 0,
		});
	});
});
