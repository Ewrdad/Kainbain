/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TaskStore } from "../taskStore.js";
import { SessionStore } from "../sessionStore.js";
import {
	displayModelForInit,
	peekStageDisplayTarget,
} from "./stageExecution.js";

/***
 * MARK: Stage init-line honesty tests
 * @description Pins the S2 root-cause fix: the `[SYSTEM] Initializing agent
 *   session` line must report the RESOLVED harness + model for alias stages
 *   (one peeked display-target read, no rotation consumed), while rigs with
 *   no session store keep the legacy fallback wording byte-identical.
 ***/

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

const tempDirs = [];
afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore teardown errors
		}
	}
});

function makeAliasStore({ withSessionStore } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-initline-"));
	tempDirs.push(dir);
	fs.mkdirSync(dir, { recursive: true });
	git(dir, "init", "-b", "master");
	git(dir, "config", "user.email", "kainbain-test@example.com");
	git(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "README.md"), "# init\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-m", "init");
	const project = {
		id: "p1",
		name: "P1",
		cwd: dir,
		useBranches: false,
		harness: "pi",
		defaultModel: "llama-cloud-direct::glm-5.3-flash:cloud",
		modelAliases: [
			{ name: "worker", harness: "antigravity", model: "gemini-3.8-flash-low" },
		],
	};
	const systemLogs = [];
	const bridge = {
		emitProcessEvent: () => {},
		emitSystemLog: (_projectId, message, payload) => {
			systemLogs.push({ message, payload });
		},
	};
	const store = new TaskStore({
		eventBridge: bridge,
		projectStore: { getProject: () => project },
	});
	if (withSessionStore) store.sessionStore = new SessionStore();
	return { store, dir, project, systemLogs };
}

const ALIAS_STAGES = [
	{
		id: "a1",
		name: "Work",
		type: "agent",
		prompt: "Do work",
		harness: "alias",
		model: "worker",
	},
];

describe("executeStage init line (alias honesty)", () => {
	it("reports the resolved harness + model for alias stages", async () => {
		const { store, dir, systemLogs } = makeAliasStore({
			withSessionStore: true,
		});
		const task = store.createTask("p1", {
			goal: "alias init line",
			stageId: "a1",
			projectCwd: dir,
		});
		// No agentRunner: the session-init log is emitted before the
		// "No agentRunner available" fallback, keeping the test focused on
		// the log prose without invoking any agent.
		const result = await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
		});
		expect(result.status).toBe("in_stage");
		const initLog = systemLogs.find((l) =>
			l.message.includes("Initializing agent session"),
		);
		expect(initLog).toBeDefined();
		expect(initLog.message).toBe(
			"[SYSTEM] Initializing agent session (harness: antigravity, Model: gemini-3.8-flash-low)...",
		);
	});

	it("keeps the legacy fallback wording when no session store is wired", async () => {
		const { store, dir, systemLogs } = makeAliasStore({
			withSessionStore: false,
		});
		const task = store.createTask("p1", {
			goal: "alias init fallback",
			stageId: "a1",
			projectCwd: dir,
		});
		const result = await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
		});
		expect(result.status).toBe("in_stage");
		const initLog = systemLogs.find((l) =>
			l.message.includes("Initializing agent session"),
		);
		expect(initLog.message).toBe(
			"[SYSTEM] Initializing agent session (harness: agent, Model: worker)...",
		);
	});

	it("reports the stage model for plain stages (no alias involved)", async () => {
		const { store, dir, systemLogs } = makeAliasStore({
			withSessionStore: true,
		});
		const task = store.createTask("p1", {
			goal: "plain init line",
			stageId: "a1",
			projectCwd: dir,
		});
		const result = await store.executeStage("p1", task.id, {
			stages: [
				{
					id: "a1",
					name: "Work",
					type: "agent",
					prompt: "Do work",
					harness: "pi",
					model: "google::plain-model",
				},
			],
			projectCwd: dir,
		});
		expect(result.status).toBe("in_stage");
		const initLog = systemLogs.find((l) =>
			l.message.includes("Initializing agent session"),
		);
		expect(initLog.message).toBe(
			"[SYSTEM] Initializing agent session (harness: pi, Model: google::plain-model)...",
		);
	});
});

describe("displayModelForInit", () => {
	it("shows the pick's model for resolved aliases (never the alias name)", () => {
		expect(
			displayModelForInit(
				{ modelRef: "gemini-3.8-flash-low", aliasName: "worker" },
				{ model: "worker" },
			),
		).toBe("gemini-3.8-flash-low");
	});

	it("reads a blank alias pick (harness-managed) as default", () => {
		expect(
			displayModelForInit(
				{ modelRef: "", aliasName: "cli" },
				{ model: "cli" },
			),
		).toBe("default");
	});

	it("shows the fallback for unresolvable aliases", () => {
		expect(
			displayModelForInit(
				{
					modelRef: undefined,
					projectModelRef: "google::base",
					aliasName: "ghost",
					aliasMissing: "ghost",
				},
				{ model: "ghost" },
			),
		).toBe("google::base");
	});

	it("shows the stage model, then the project default, for non-alias stages", () => {
		expect(
			displayModelForInit(
				{ modelRef: "google::m", projectModelRef: "google::base" },
				{ model: "google::m" },
			),
		).toBe("google::m");
		expect(
			displayModelForInit(
				{ modelRef: "", projectModelRef: "google::base" },
				{ model: "" },
			),
		).toBe("google::base");
	});

	it("keeps the legacy wording when no target was peeked", () => {
		expect(displayModelForInit(null, { model: "worker" })).toBe("worker");
		expect(displayModelForInit(null, {})).toBe("default");
	});
});

describe("peekStageDisplayTarget", () => {
	it("returns null when no session store is wired (legacy fallback)", () => {
		expect(peekStageDisplayTarget({}, {}, {})).toBeNull();
		expect(
			peekStageDisplayTarget({ sessionStore: {} }, {}, {}),
		).toBeNull();
	});

	it("returns null when the read throws (never breaks dispatch)", () => {
		const store = {
			sessionStore: {
				resolveDisplayTarget: () => {
					throw new Error("peek exploded");
				},
			},
		};
		expect(peekStageDisplayTarget(store, {}, {})).toBeNull();
	});
});
