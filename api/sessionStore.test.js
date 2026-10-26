import { describe, it, expect, vi, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { SessionStore } from "./sessionStore.js";
import { createExtensionUIContext } from "./agent/harnesses/pi/piExtensionUI.js";

/**
 * MARK: SessionStore unit tests
 * @description Verifies the disk-backed, per-project session registry:
 *   get-or-create caching, socket heartbeat tracking (subscribe/unsubscribe),
 *   dispose/clear, session directory resolution, and the TTL cleanup sweep.
 *   A mock createSession factory avoids spinning up a real model runtime.
 */

function makeStore(opts = {}) {
	return new SessionStore({
		createSession: async (project) => {
			const session = {
				project,
				messages: [],
				isStreaming: false,
				disposed: false,
				dispose: () => {
					session.disposed = true;
				},
				prompt: async () => ({}),
				steer: async () => ({}),
				followUp: async () => ({}),
				on: () => {},
			};
			return session;
		},
		...opts,
	});
}

const project = { id: "proj-1", cwd: "/tmp/proj", agentDir: "/tmp/agent" };

describe("per-stage session lifecycle (one fresh session per stage)", () => {
	it("beginStageSession replaces the cached session with a brand-new one", async () => {
		const store = makeStore();
		const first = await store.getOrCreate(project);
		const second = await store.beginStageSession(project, {
			taskId: "t1",
			stageId: "s2",
		});
		expect(second).not.toBe(first);
		expect(first.disposed).toBe(true);
		expect(store.get(project.id)).toBe(second);
	});

	it("beginStageSession cleanly aborts and disposes a still-streaming session", async () => {
		const store = makeStore();
		const first = await store.getOrCreate(project);
		first.isStreaming = true;
		first.aborted = false;
		first.abort = async () => {
			first.aborted = true;
		};
		const second = await store.beginStageSession(project, { taskId: "t1", stageId: "s2" });
		expect(first.aborted).toBe(true);
		expect(first.disposed).toBe(true);
		expect(store.get(project.id)).toBe(second);
	});

	it("beginStageSession carries over live UI sockets to the new session", async () => {
		const store = makeStore();
		await store.getOrCreate(project);
		const socket = { id: "ws-1" };
		store.subscribe(project.id, socket);
		await store.beginStageSession(project, { taskId: "t1", stageId: "s2" });
		const status = await store.getSessionStatus(project);
		expect(status.socketsCount).toBe(1);
	});

	it("beginStageSession for task A does not abort active session for task B in the same project", async () => {
		const store = makeStore();
		const sessionA = await store.beginStageSession(project, { taskId: "task-A", stageId: "s1" });
		sessionA.isStreaming = true;
		sessionA.aborted = false;
		sessionA.abort = async () => {
			sessionA.aborted = true;
		};

		const sessionB = await store.beginStageSession(project, { taskId: "task-B", stageId: "s2" });
		expect(sessionB).not.toBe(sessionA);
		expect(sessionA.aborted).toBe(false);
		expect(sessionA.disposed).toBe(false);
		expect(store.get(project.id, "task-A")).toBe(sessionA);
		expect(store.get(project.id, "task-B")).toBe(sessionB);
	});

	it("getOrCreate after dispose starts fresh (no disk resume)", async () => {
		const store = makeStore();
		const first = await store.getOrCreate(project);
		first.messages.push({ role: "user", content: "old research" });
		await store.dispose(project.id);
		const second = await store.getOrCreate(project);
		expect(second).not.toBe(first);
		expect(second.messages).toHaveLength(0);
	});
});

/***
 * MARK: fakeBridge
 * @description Records emitSystemLog calls so tests can assert that extension
 *   UI output is forwarded to the event bridge.
 **/
function fakeBridge() {
	const logs = [];
	return {
		logs,
		emitSystemLog: (sessionId, message, payload = {}) => {
			logs.push({ sessionId, message, payload });
		},
	};
}

describe("SessionStore", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("getOrCreate creates and caches a session per project", async () => {
		const store = makeStore();
		const s1 = await store.getOrCreate(project);
		const s2 = await store.getOrCreate(project);
		expect(s1).toBeTruthy();
		expect(s2).toBe(s1); // cached
		expect(store.size).toBe(1);
	});

	it("get returns undefined for an unknown project and the session after create", async () => {
		const store = makeStore();
		expect(store.get("missing")).toBeUndefined();
		await store.getOrCreate(project);
		expect(store.get("proj-1")).toBeTruthy();
	});

	it("touch and subscribe refresh lastActive to keep the session alive", async () => {
		const store = makeStore();
		await store.getOrCreate(project);
		const entry = store.sessions.get("proj-1");
		entry.lastActive = 0;

		const socket = { id: "s1" };
		store.subscribe("proj-1", socket);
		expect(entry.lastActive).toBeGreaterThan(0);
		expect(entry.sockets.has(socket)).toBe(true);

		entry.lastActive = 0;
		store.unsubscribe("proj-1", socket);
		expect(entry.lastActive).toBeGreaterThan(0);
		expect(entry.sockets.has(socket)).toBe(false);
	});

	it("dispose removes the session and deletes the registry entry", async () => {
		const store = makeStore();
		const session = await store.getOrCreate(project);
		expect(session.disposed).toBe(false);
		await store.dispose("proj-1");
		expect(store.get("proj-1")).toBeUndefined();
		expect(store.size).toBe(0);
	});

	it("clearSession removes the disk-backed history directory", async () => {
		const baseDir = path.join(
			os.tmpdir(),
			`kainbain-sst-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		const store = makeStore({ baseDir });
		const sessionDir = path.join(baseDir, "proj-1");
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- temp dir under os.tmpdir()
		fs.mkdirSync(sessionDir, { recursive: true });
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- temp dir under os.tmpdir()
		fs.writeFileSync(path.join(sessionDir, "session.json"), "{}");

		await store.getOrCreate(project);
		await store.clearSession(project);
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- temp dir under os.tmpdir()
		expect(fs.existsSync(sessionDir)).toBe(false);
		expect(store.get("proj-1")).toBeUndefined();
	});

	it("sessionDirFor uses the override baseDir when provided", () => {
		const store = makeStore({ baseDir: "/tmp/override" });
		expect(store.sessionDirFor(project)).toBe(path.join("/tmp/override", "proj-1"));
	});

	it("sessionDirFor defaults to <cwd>/.kainbain/sessions when no baseDir", () => {
		const store = makeStore({ baseDir: null });
		expect(store.sessionDirFor(project)).toBe(
			path.join(project.cwd, ".kainbain", "sessions"),
		);
	});

	it("getHarness resolves the antigravity harness for a project that selects it", async () => {
		// The engine seam (plan §1): getHarness(project) resolves the project's
		// harness choice through the shared registry. antigravity is a registered
		// built-in, so selecting it must yield the agy-backed harness (no spawn
		// happens until the session's first prompt). Unknown names never throw:
		// they warn and fall back to the default harness (covered in
		// sessionStore.harnessSelection.test.js).
		const store = makeStore({});
		const agyProject = { ...project, harness: "antigravity" };
		const harness = store.getHarness(agyProject);
		expect(harness.id).toBe("antigravity");
		const session = await harness.createSession(agyProject, {
			taskId: "task-agy",
			stageId: "stage-agy",
		});
		expect(session.harnessId).toBe("antigravity");
		await session.dispose();
	});

	it("TTL cleanup disposes idle sessions with no active sockets", async () => {
		vi.useFakeTimers();
		const store = makeStore({ ttlMs: 1000 });
		await store.getOrCreate(project);
		expect(store.get("proj-1")).toBeTruthy();

		store.startCleanup();
		// Advance past the TTL.
		vi.advanceTimersByTime(60 * 1000);
		expect(store.get("proj-1")).toBeUndefined();
		store.stopCleanup();
	});

	it("TTL cleanup keeps a session that has an active socket", async () => {
		vi.useFakeTimers();
		const store = makeStore({ ttlMs: 1000 });
		await store.getOrCreate(project);
		const socket = { id: "sock" };
		store.subscribe("proj-1", socket);

		store.startCleanup();
		vi.advanceTimersByTime(60 * 1000);
		// Session is still alive because it has an active WS connection.
		expect(store.get("proj-1")).toBeTruthy();
		store.stopCleanup();
	});

	it("startCleanup is idempotent and stopCleanup clears the timer", () => {
		const store = makeStore();
		store.startCleanup();
		const timer1 = store.cleanupTimer;
		store.startCleanup();
		expect(store.cleanupTimer).toBe(timer1);
		store.stopCleanup();
		expect(store.cleanupTimer).toBeNull();
	});

	it("getSessionStatus returns memory and disk diagnostic details", async () => {
		const store = makeStore();
		await store.getOrCreate(project);
		const status = await store.getSessionStatus(project);
		expect(status.projectId).toBe(project.id);
		expect(status.active).toBe(true);
		expect(typeof status.diskSessionExists).toBe("boolean");
		expect(typeof status.messageCount).toBe("number");
	});

	it("restoreSession disposes existing session and reloads", async () => {
		const store = makeStore();
		const s1 = await store.getOrCreate(project);
		expect(s1.disposed).toBe(false);
		const s2 = await store.restoreSession(project);
		expect(s1.disposed).toBe(true);
		expect(s2).toBeTruthy();
	});

	describe("readSessionHistoryFromDisk & getSessionHistory", () => {
		it("reads messages and tree from disk without instantiating createSession or ModelRuntime", async () => {
			const baseDir = path.join(
				os.tmpdir(),
				`kainbain-read-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			);
			const createSessionMock = vi.fn();
			const store = new SessionStore({
				baseDir,
				createSession: createSessionMock,
			});
			const runtimeSpy = vi.spyOn(store, "getModelRuntime");

			const sessionDir = path.join(baseDir, "cold-proj");
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			fs.mkdirSync(sessionDir, { recursive: true });

			const sessionFile = path.join(sessionDir, "2026-08-29T12-00-00-000Z_sess-1.jsonl");
			const lines = [
				JSON.stringify({
					type: "session",
					version: 3,
					id: "sess-1",
					timestamp: "2026-08-29T12:00:00.000Z",
					cwd: "/tmp/cold-proj",
				}),
				JSON.stringify({
					type: "message",
					id: "entry-msg-1",
					parentId: null,
					timestamp: "2026-08-29T12:00:01.000Z",
					message: {
						id: "msg-1",
						role: "user",
						content: "Persisted goal text",
						timestamp: 1788022530000,
					},
				}),
				JSON.stringify({
					type: "message",
					id: "entry-msg-2",
					parentId: "entry-msg-1",
					timestamp: "2026-08-29T12:00:02.000Z",
					message: {
						id: "msg-2",
						role: "assistant",
						content: "Persisted assistant reply",
						timestamp: 1788022531000,
					},
				}),
			];
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			fs.writeFileSync(sessionFile, lines.join("\n") + "\n");

			const coldProject = { id: "cold-proj", cwd: "/tmp/cold-proj" };
			const diskHistory = await store.readSessionHistoryFromDisk(coldProject);

			// createSession / getModelRuntime should NEVER be called
			expect(createSessionMock).not.toHaveBeenCalled();
			expect(runtimeSpy).not.toHaveBeenCalled();

			// Memory session should NOT be created
			expect(store.get("cold-proj")).toBeUndefined();
			expect(store.size).toBe(0);

			// History should contain messages and tree from disk
			expect(diskHistory.messages).toHaveLength(2);
			expect(diskHistory.messages[0].role).toBe("user");
			expect(diskHistory.messages[0].content).toBe("Persisted goal text");
			expect(diskHistory.messages[1].role).toBe("assistant");
			expect(diskHistory.messages[1].content).toBe("Persisted assistant reply");
			expect(diskHistory.tree).toHaveLength(2);
			expect(diskHistory.tree[0].id).toBe("entry-msg-1");
			expect(diskHistory.tree[1].id).toBe("entry-msg-2");

			// Cleanup
			fs.rmSync(baseDir, { recursive: true, force: true });
		});

		it("returns empty messages and tree when no session file exists on disk", async () => {
			const baseDir = path.join(
				os.tmpdir(),
				`kainbain-empty-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			);
			const store = new SessionStore({ baseDir });
			const coldProject = { id: "empty-proj", cwd: "/tmp/empty-proj" };

			const diskHistory = await store.readSessionHistoryFromDisk(coldProject);
			expect(diskHistory).toEqual({ messages: [], tree: [] });
			expect(store.get("empty-proj")).toBeUndefined();
		});

		it("getSessionHistory returns live in-memory state when active and disk history when cold", async () => {
			const baseDir = path.join(
				os.tmpdir(),
				`kainbain-live-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			);
			const store = makeStore({ baseDir });
			const proj = { id: "live-proj", cwd: "/tmp/live-proj" };

			// 1. Cold state
			const coldHistory = await store.getSessionHistory(proj);
			expect(coldHistory).toEqual({ messages: [], tree: [], isStreaming: false });
			expect(store.get("live-proj")).toBeUndefined();

			// 2. Active state
			const liveSession = await store.getOrCreate(proj);
			liveSession.messages.push({ role: "user", content: "live active prompt" });
			liveSession.isStreaming = true;

			const liveHistory = await store.getSessionHistory(proj);
			expect(liveHistory.messages).toHaveLength(1);
			expect(liveHistory.messages[0].content).toBe("live active prompt");
			expect(liveHistory.isStreaming).toBe(true);

			// Cleanup
			fs.rmSync(baseDir, { recursive: true, force: true });
		});
	});

	describe("createExtensionUIContext", () => {
		it("forwards notify() calls to the event bridge as a tagged system log", () => {
			const bridge = fakeBridge();
			const ui = createExtensionUIContext(bridge, "proj-1");

			ui.notify("loop-guard: agent terminated due to persistent looping", "error");
			ui.notify("loop-guard: detected tool loop", "warning");
			ui.notify("Status update", "info");

			expect(bridge.logs).toHaveLength(3);
			expect(bridge.logs[0]).toMatchObject({
				sessionId: "proj-1",
				payload: { projectId: "proj-1", level: "error", tag: "[ERROR]" },
			});
			expect(bridge.logs[0].message).toContain("[ERROR] loop-guard: agent terminated");
			expect(bridge.logs[1].payload.tag).toBe("[EXT]");
			expect(bridge.logs[1].payload.level).toBe("warn");
			expect(bridge.logs[2].payload.level).toBe("info");
		});

		it("drops empty notify messages and stays fire-and-forget", () => {
			const bridge = fakeBridge();
			const ui = createExtensionUIContext(bridge, "proj-1");

			ui.notify("");
			ui.notify("   \n\t ");
			ui.notify();
			expect(bridge.logs).toHaveLength(0);
		});

		it("provides no-op methods so extensions that call other UI methods do not throw", async () => {
			const bridge = fakeBridge();
			const ui = createExtensionUIContext(bridge, "proj-1");

			await expect(ui.select("Pick", ["a"])).resolves.toBeUndefined();
			await expect(ui.confirm("Q", "m")).resolves.toBe(false);
			await expect(ui.input("t")).resolves.toBeUndefined();
			expect(ui.getEditorText()).toBe("");
			expect(ui.getToolsExpanded()).toBe(false);
			expect(ui.setStatus("k", "v")).toBeUndefined();
			expect(ui.setWidget("k", undefined)).toBeUndefined();
			expect(ui.onTerminalInput(() => {})()).toBeUndefined();
		});
	});

	describe("Memory and listener cleanup", () => {
		it("invokes unsubscribe handlers and clears socket sets on dispose", async () => {
			const unsubSubscribe = vi.fn();
			const unsubOn = vi.fn();
			const disposeSession = vi.fn();

			const store = new SessionStore({
				createSession: async (proj) => {
					return {
						project: proj,
						messages: [],
						isStreaming: false,
						subscribe: vi.fn(() => unsubSubscribe),
						on: vi.fn(() => unsubOn),
						dispose: disposeSession,
					};
				},
			});

			const session = await store.getOrCreate(project);
			const socket = { id: "sock-1" };
			store.subscribe(project.id, socket);

			const entry = store.sessions.get(project.id);
			expect(entry.sockets.has(socket)).toBe(true);

			await store.dispose(project.id);

			expect(unsubSubscribe).toHaveBeenCalledTimes(1);
			expect(unsubOn).toHaveBeenCalledTimes(1);
			expect(disposeSession).toHaveBeenCalledTimes(1);
			expect(store.get(project.id)).toBeUndefined();
			expect(store.size).toBe(0);
		});

		it("cleans up listeners without accumulation when multiple sessions are created and disposed", async () => {
			let activeListeners = 0;
			const store = new SessionStore({
				createSession: async (proj) => {
					activeListeners += 2;
					return {
						project: proj,
						messages: [],
						isStreaming: false,
						subscribe: vi.fn(() => () => {
							activeListeners -= 1;
						}),
						on: vi.fn(() => () => {
							activeListeners -= 1;
						}),
						dispose: vi.fn(),
					};
				},
			});

			for (let i = 0; i < 5; i++) {
				const proj = { id: `proj-${i}`, cwd: "/tmp/proj" };
				await store.getOrCreate(proj);
				expect(activeListeners).toBe(2);
				await store.dispose(proj.id);
				expect(activeListeners).toBe(0);
			}

			expect(store.size).toBe(0);
		});
	});

	describe("harness access", () => {
		it("getHarness lazily returns a harness with identity metadata (name/label)", () => {
			const store = makeStore();
			const harness = store.getHarness();
			// Identity metadata (see api/agent/harnessContract.js) so engine log
			// prose is harness-aware instead of vendor hard-coded.
			expect(harness.name).toBe("pi");
			expect(harness.label).toBe("Pi");
			// Lazily created once, then cached.
			expect(store.getHarness()).toBe(harness);
		});
	});
});

