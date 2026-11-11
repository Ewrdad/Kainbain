/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../../taskStore.js";
import { clearAlertSinks } from "../../observability/alerts.js";

/***
 * MARK: executeStage auto-approve re-park tests
 * @description Pins the run-loop park contract at human checkpoints against a
 *   real TaskStore in throwaway temp directories: a re-park with no live
 *   stamp starts a fresh wait from the parking moment (never the stale
 *   stage-entry time, so an abort/resume cycle always gets the full hold),
 *   while a re-park with a live wait leaves the stamped deadline and the
 *   reminder marker untouched (a manual re-execute is not a new visit).
 ***/

const HOLD_MS = 86400000; // 1 day

const STAGES = [
	{ id: "h1", name: "Gate", type: "human", autoApproveAfterMs: HOLD_MS },
];

const tempDirs = [];

afterEach(() => {
	clearAlertSinks();
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore teardown errors
		}
	}
});

function makeStore() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-autoapprove-park-"));
	tempDirs.push(dir);
	const project = { id: "p1", name: "P1", cwd: dir, useBranches: false };
	const projectStore = { getProject: () => project };
	const store = new TaskStore({ eventBridge: {}, projectStore });
	return { store, dir, project };
}

describe("executeStage human re-park stamping", () => {
	it("starts a fresh wait from the parking moment, not the stale entry time", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "stale entry re-park",
			stageId: "h1",
			projectCwd: dir,
		});
		expect(task.status).toBe("in_stage");
		// Simulate an abort/resume cycle: the wait was cleared but the
		// stage-entry clock still points at the original arrival, 12h ago.
		task.enteredStageAt = new Date(Date.now() - 12 * 3600000).toISOString();
		task.autoApproveAt = null;
		task.autoApproveRemindedAt = null;

		const before = Date.now();
		const result = await store.executeStage("p1", task.id, {
			stages: STAGES,
			projectCwd: dir,
		});
		expect(result.status).toBe("waiting_human");

		const parked = store.getTask("p1", task.id);
		expect(typeof parked.autoApproveAt).toBe("string");
		const deadlineMs = Date.parse(parked.autoApproveAt);
		// Full hold from now (generous 60s test tolerance)…
		expect(deadlineMs - before).toBeGreaterThan(HOLD_MS - 60000);
		expect(deadlineMs - before).toBeLessThan(HOLD_MS + 60000);
		// …which is strictly later than entry + hold (the old stale base
		// would land ~12h earlier, already half-spent on arrival).
		expect(deadlineMs - Date.parse(parked.enteredStageAt)).toBeGreaterThan(
			HOLD_MS + 11 * 3600000,
		);
	});

	it("leaves a live wait untouched on re-execute (no extension, no reminder reset)", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "live wait re-park",
			stageId: "h1",
			projectCwd: dir,
		});
		const first = await store.executeStage("p1", task.id, {
			stages: STAGES,
			projectCwd: dir,
		});
		expect(first.status).toBe("waiting_human");
		const parked = store.getTask("p1", task.id);
		const stamp = parked.autoApproveAt;
		expect(typeof stamp).toBe("string");
		// The reminder already fired for this visit (snapshot: the execute
		// below mutates this same object in place).
		parked.autoApproveRemindedAt = new Date().toISOString();
		const remindedAt = parked.autoApproveRemindedAt;

		const second = await store.executeStage("p1", task.id, {
			stages: STAGES,
			projectCwd: dir,
		});
		expect(second.status).toBe("waiting_human");
		const reparked = store.getTask("p1", task.id);
		expect(reparked.autoApproveAt).toBe(stamp);
		expect(reparked.autoApproveRemindedAt).toBe(remindedAt);
	});

	it("clears a stale stamp when the stage carries no hold", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "hold removed re-park",
			stageId: "h1",
			projectCwd: dir,
		});
		// A stamp left over from before the hold was removed.
		task.autoApproveAt = new Date(Date.now() + HOLD_MS).toISOString();
		task.autoApproveRemindedAt = new Date().toISOString();

		const result = await store.executeStage("p1", task.id, {
			stages: [{ id: "h1", name: "Gate", type: "human" }],
			projectCwd: dir,
		});
		expect(result.status).toBe("waiting_human");
		const parked = store.getTask("p1", task.id);
		expect(parked.autoApproveAt).toBeNull();
		expect(parked.autoApproveRemindedAt).toBeNull();
	});
});
