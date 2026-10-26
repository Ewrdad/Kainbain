/* eslint-disable security/detect-non-literal-fs-filename */
import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { isEntryNotFoundError } from "../routes/sessions.js";
import { sessionStore } from "../sessionStore.js";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — the config loader snapshots process.env at first
// evaluation, so no fixture in this file can ever touch the live projects
// root or the live SilverBullet notes space.

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

const isTestEnv = process.env.NODE_ENV === "test";

/**
 * MARK: Session History + Enhanced Human Review API
 * @description Verifies the event-sync history endpoint and the reject-with-
 * feedback flow (enhanced human review).
 *
 *   Sessions here run on the mock harness (TEST ENV CONTRACT,
 *   api/sessionStore.js), which mirrors pi's tree semantics exactly
 *   (appendMessage/getLeafId, leaf-moving navigate/branch, `Entry <id> not
 *   found` for unknown ids), so the navigate/fork assertions below are
 *   mode-agnostic: they hold against the mock and against real pi sessions.
 */
describe("Session History & Enhanced Human Review", () => {
	let testProject;

	beforeAll(async () => {
		await app.ready();
		// Dedicated fixture project under the throwaway roots (see top of
		// file): session entries and task writes stay inside temp dirs.
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Session History Test Project" },
		});
		expect(res.statusCode).toBe(201);
		testProject = JSON.parse(res.payload);
	});

	async function activeProject() {
		return testProject;
	}

	/***
	 * MARK: seedEntries
	 * @description Starts compute for the project and appends message entries
	 *   through the live session, returning the REAL entry ids in append order.
	 *   Works identically against the test mock and real pi sessions
	 *   (mode-agnostic seeding), so navigate/fork tests never rely on fabricated
	 *   ids and can deterministically target non-leaf entries: appends chain
	 *   from the previous leaf (entry i+1's parentId is entry i's id), so ids[0]
	 *   is never the current leaf when more than one entry is seeded.
	 * @param {string} projectId
	 * @param {...string} roles - Message roles to append, in order.
	 * @returns {Promise<string[]>} The appended entry ids, in order.
	 ***/
	async function seedEntries(projectId, roles = ["user"]) {
		await app.inject({
			method: "POST",
			url: "/compute/start",
			payload: { projectId },
		});
		const sessionManager = sessionStore.get(projectId).sessionManager;
		expect(sessionManager).toBeTruthy();
		const ids = roles.map(
			(role, i) =>
				sessionManager.appendMessage({
					role,
					content: `seed ${role} entry ${i + 1}`,
				}),
		);
		// The last append owns the leaf (mock and pi parity).
		expect(sessionManager.getLeafId()).toBe(ids[ids.length - 1]);
		return ids;
	}

	it("GET /session/history returns messages and tree for a project", async () => {
		const project = await activeProject();
		// Create a task so a session is spun up and a prompt is recorded.
		await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "History test" },
		});

		const res = await app.inject({
			method: "GET",
			url: `/session/history?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.projectId).toBe(project.id);
		expect(Array.isArray(body.messages)).toBe(true);
		expect(Array.isArray(body.tree)).toBe(true);
		expect(typeof body.isStreaming).toBe("boolean");
	});

	it("POST /tasks/:id/reject incorporates feedback and fails the task back", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Reject me" },
		});
		const task = JSON.parse(createRes.payload);

		// Move the task into a human stage (index 3 = "Review Plan").
		const humanStage = project.stages[3];
		await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/jump`,
			payload: { projectId: project.id, stageId: humanStage.id },
		});

		const rejectRes = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/reject`,
			payload: { projectId: project.id, feedback: "Please add tests." },
		});
		expect(rejectRes.statusCode).toBe(200);
		const rejected = JSON.parse(rejectRes.payload);
		// Feedback is appended to the goal.
		expect(rejected.goal).toContain("Please add tests.");
		// Task failed back to the previous stage (index 2 = "Plan").
		expect(rejected.currentStageId).toBe(project.stages[2].id);
		expect(rejected.curatedPrompt).toContain("Please add tests.");
	});

	it("POST /tasks/:id/reject requires feedback", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "No feedback" },
		});
		const task = JSON.parse(createRes.payload);
		const res = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/reject`,
			payload: { projectId: project.id, feedback: "   " },
		});
		expect(res.statusCode).toBe(400);
	});

	it("POST /tasks/:id/reject exposes the reason on every read surface", async () => {
		const project = await activeProject();
		const createRes = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId: project.id, goal: "Reason visibility check" },
		});
		const task = JSON.parse(createRes.payload);
		try {
			// Park the task at a human checkpoint, like a real review.
			const humanStage = project.stages.find((s) => s.type === "human");
			await app.inject({
				method: "POST",
				url: `/tasks/${task.id}/jump`,
				payload: { projectId: project.id, stageId: humanStage.id },
			});

			const feedback = "Visibility check: handle the empty-input edge case";
			const rejectRes = await app.inject({
				method: "POST",
				url: `/tasks/${task.id}/reject`,
				payload: { projectId: project.id, feedback },
			});
			expect(rejectRes.statusCode).toBe(200);

			const fetched = JSON.parse(
				(
					await app.inject({
						method: "GET",
						url: `/tasks/${task.id}?projectId=${project.id}`,
					})
				).payload,
			);
			expect(fetched.feedback).toBe(feedback);
			expect(fetched.goal).toContain("## Human Correction / Feedback");
			expect(fetched.goal).toContain(feedback);
			expect(
				fetched.history.some(
					(h) => h.action === `Rejected by human review: ${feedback}`,
				),
			).toBe(true);
			// The timeline row carries the structured reason so the history
			// timeline renders it (agent-failure shape).
			const failedRow = fetched.timeline.find((e) => e.status === "Failed");
			expect(failedRow).toMatchObject({
				reason: feedback,
				stageId: humanStage.id,
				stageName: humanStage.name,
			});

			const reports = JSON.parse(
				(
					await app.inject({
						method: "GET",
						url: `/tasks/${task.id}/reports?projectId=${project.id}`,
					})
				).payload,
			);
			const failedReport = reports.find((r) => r.status === "FAILED");
			expect(failedReport?.content).toContain("# Human rejection");
			expect(failedReport?.content).toContain(feedback);
		} finally {
			await app.inject({
				method: "DELETE",
				url: `/tasks/${task.id}?projectId=${project.id}`,
			});
		}
	});

	it.each(["running_deploy", "advancing"])(
		"POST /tasks/:id/reject returns 409 while %s",
		async (status) => {
			const project = await activeProject();
			const createRes = await app.inject({
				method: "POST",
				url: "/tasks",
				payload: { projectId: project.id, goal: `Reject guard ${status}` },
			});
			const task = JSON.parse(createRes.payload);
			try {
				await app.inject({
					method: "PATCH",
					url: `/tasks/${task.id}`,
					payload: { projectId: project.id, status },
				});
				const res = await app.inject({
					method: "POST",
					url: `/tasks/${task.id}/reject`,
					payload: { projectId: project.id, feedback: "race check" },
				});
				expect(res.statusCode).toBe(409);
			} finally {
				await app.inject({
					method: "DELETE",
					url: `/tasks/${task.id}?projectId=${project.id}`,
				});
			}
		},
	);

	it("POST /tasks/preview returns a curated prompt without executing", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/tasks/preview",
			payload: { projectId: project.id, goal: "Preview me" },
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.curatedPrompt).toContain("Preview me");
		expect(body.stageId).toBe(project.stages[0].id);
	});

	it("POST /tasks ignores a client prompt and returns the curated prompt", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: {
				projectId: project.id,
				goal: "Override me",
				// The per-task prompt override feature was removed: this stale
				// field must be ignored and the curated prompt returned instead.
				prompt: "Custom edited prompt",
			},
		});
		expect(res.statusCode).toBe(200);
		const task = JSON.parse(res.payload);
		expect(task.curatedPrompt).not.toBe("Custom edited prompt");
		expect(task.curatedPrompt).toContain("# Stage");
	});

	it("sessionStore disposes a session and clears it", async () => {
		const project = await activeProject();
		await app.inject({
			method: "POST",
			url: "/compute/start",
			payload: { projectId: project.id },
		});
		expect(sessionStore.get(project.id)).toBeTruthy();
		await sessionStore.dispose(project.id);
		expect(sessionStore.get(project.id)).toBeUndefined();
	});

	it("GET /session/tree returns the session entry tree", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "GET",
			url: `/session/tree?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(200);
		const tree = JSON.parse(res.payload);
		expect(Array.isArray(tree)).toBe(true);
	});

	it("POST /session/navigate moves the session leaf (pi tree semantics)", async () => {
		const project = await activeProject();
		const [firstId, secondId, replyId] = await seedEntries(project.id, [
			"user",
			"user",
			"assistant",
		]);
		const sessionManager = sessionStore.get(project.id).sessionManager;
		// The last append put the leaf at the assistant reply.
		expect(sessionManager.getLeafId()).toBe(replyId);
		const countMessageEntries = () =>
			sessionManager.getEntries().filter((e) => e.type === "message").length;
		const messageCountBefore = countMessageEntries();
		const parentOf = (entryId) =>
			sessionManager.getEntries().find((e) => e.id === entryId)?.parentId;

		// pi semantics (agent-session.js navigateTree): navigating to a USER
		// message re-branches from that message's PARENT (the "re-edit this
		// message" flow — a null parentId means root), NOT to the message
		// itself. Navigate to the second seeded user message and expect the
		// leaf to land on the first seeded entry (its parent). pi extensions
		// installed in the environment may additionally append a
		// non-conversational marker entry (custom_message) as a child of that
		// position when the session_tree event fires, so the leaf may sit on
		// the parent itself or on such a marker child of it.
		const res = await app.inject({
			method: "POST",
			url: "/session/navigate",
			payload: { projectId: project.id, targetId: secondId },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual(
			expect.objectContaining({ status: "navigated", targetId: secondId }),
		);
		const secondSeeded = sessionManager
			.getEntries()
			.find((e) => e.id === secondId);
		expect(secondSeeded.parentId).toBe(firstId);
		const branchPoint = secondSeeded.parentId ?? null;
		const leafAfterUserNav = sessionManager.getLeafId();
		expect(leafAfterUserNav).not.toBe(replyId);
		expect(
			leafAfterUserNav === branchPoint ||
				parentOf(leafAfterUserNav) === branchPoint,
		).toBe(true);
		// Navigation must not append conversational (message) entries.
		expect(countMessageEntries()).toBe(messageCountBefore);

		// pi semantics: a NON-user entry (assistant message) becomes the leaf
		// itself (or an environment marker child of it, as above).
		const res2 = await app.inject({
			method: "POST",
			url: "/session/navigate",
			payload: { projectId: project.id, targetId: replyId },
		});
		expect(res2.statusCode).toBe(200);
		expect(JSON.parse(res2.payload)).toEqual(
			expect.objectContaining({ status: "navigated", targetId: replyId }),
		);
		const leafAfterAssistantNav = sessionManager.getLeafId();
		expect(
			leafAfterAssistantNav === replyId ||
				parentOf(leafAfterAssistantNav) === replyId,
		).toBe(true);
		expect(countMessageEntries()).toBe(messageCountBefore);
	});

	it("POST /session/navigate requires a targetId", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/session/navigate",
			payload: { projectId: project.id },
		});
		expect(res.statusCode).toBe(400);
	});

	it("POST /session/navigate with an unknown entry id returns 404 entry_not_found", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/session/navigate",
			payload: { projectId: project.id, targetId: "no-such-entry" },
		});
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.payload)).toEqual({
			error: "Entry no-such-entry not found",
			code: "entry_not_found",
			entryId: "no-such-entry",
		});
	});

	it("POST /session/fork requires an entryId", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/session/fork",
			payload: { projectId: project.id },
		});
		expect(res.statusCode).toBe(400);
	});

	it("POST /session/fork with an unknown entry id returns 404 entry_not_found", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/session/fork",
			payload: { projectId: project.id, entryId: "no-such-entry" },
		});
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.payload)).toEqual({
			error: "Entry no-such-entry not found",
			code: "entry_not_found",
			entryId: "no-such-entry",
		});
	});

	/***
	 * MARK: capability degradation (501)
	 * @description Proves the 501 unsupported_by_harness degradation through the
	 *   full HTTP stack by stripping an optional capability from the live
	 *   session. Stripping requires the mock seam (TEST ENV CONTRACT), so these
	 *   tests are gated to NODE_ENV=test; bare runs skip them.
	 ***/
	describe.skipIf(!isTestEnv)(
		"capability degradation (501 unsupported_by_harness)",
		() => {
			const stripped = [];

			/**
			 * Removes a capability from the live session for one test.
			 */
			function stripCapability(obj, key) {
				/* eslint-disable security/detect-object-injection -- capability keys are engine-controlled literals from the call sites below, never user input */
				stripped.push({ obj, key, value: obj[key] });
				delete obj[key];
				/* eslint-enable security/detect-object-injection */
			}

			afterEach(() => {
				while (stripped.length > 0) {
					const { obj, key, value } = stripped.pop();
					/* eslint-disable-next-line security/detect-object-injection -- capability keys are engine-controlled literals (see stripCapability) */
					obj[key] = value;
					// Assert restoration so a leak cannot affect other tests.
					/* eslint-disable-next-line security/detect-object-injection -- capability keys are engine-controlled literals (see stripCapability) */
					expect(typeof obj[key]).toBe("function");
				}
			});

			it("POST /session/navigate returns 501 unsupported_by_harness when navigateTree is missing", async () => {
				const project = await activeProject();
				await app.inject({
					method: "POST",
					url: "/compute/start",
					payload: { projectId: project.id },
				});
				const session = sessionStore.get(project.id);
				stripCapability(session, "navigateTree");

				const res = await app.inject({
					method: "POST",
					url: "/session/navigate",
					payload: { projectId: project.id, targetId: "some-entry" },
				});
				expect(res.statusCode).toBe(501);
				expect(JSON.parse(res.payload)).toEqual({
					error: "Tree navigation is not supported by the active harness",
					code: "unsupported_by_harness",
					capability: "navigateTree",
				});
			});

			it("POST /session/fork returns 501 unsupported_by_harness when sessionManager.branch is missing", async () => {
				const project = await activeProject();
				await app.inject({
					method: "POST",
					url: "/compute/start",
					payload: { projectId: project.id },
				});
				const session = sessionStore.get(project.id);
				stripCapability(session.sessionManager, "branch");

				const res = await app.inject({
					method: "POST",
					url: "/session/fork",
					payload: { projectId: project.id, entryId: "some-entry" },
				});
				expect(res.statusCode).toBe(501);
				expect(JSON.parse(res.payload)).toEqual({
					error: "Session forking is not supported by the active harness",
					code: "unsupported_by_harness",
					capability: "sessionManager.branch",
				});
			});
		},
	);

	/***
	 * MARK: mock pi-tree parity (strict)
	 * @description Pins the mock's EXACT core tree semantics (the strict forms
	 *   the mode-agnostic route tests above can only assert tolerantly, because
	 *   a real environment may install pi extensions that append UI marker
	 *   entries on the session_tree event). Gated to the mock seam: real
	 *   sessions get the same semantics from pi itself (verified against the
	 *   SDK in bare evidence runs with an isolated agent dir).
	 ***/
	describe.skipIf(!isTestEnv)("test mock mirrors pi core tree semantics", () => {
		it("navigateTree mirrors pi: user message → parent, other → itself, no-op at leaf", async () => {
			const project = await activeProject();
			const [firstId, secondId, replyId] = await seedEntries(project.id, [
				"user",
				"user",
				"assistant",
			]);
			const sessionManager = sessionStore.get(project.id).sessionManager;
			expect(sessionManager.getLeafId()).toBe(replyId);
			const entriesBeforeNav = sessionManager.getEntries().length;

			// User-message target: leaf = the entry's parent (null = root).
			await app.inject({
				method: "POST",
				url: "/session/navigate",
				payload: { projectId: project.id, targetId: secondId },
			});
			expect(sessionManager.getLeafId()).toBe(firstId);
			// No entry appended.
			expect(sessionManager.getEntries().length).toBe(entriesBeforeNav);

			// Non-user target: leaf = the entry itself.
			await app.inject({
				method: "POST",
				url: "/session/navigate",
				payload: { projectId: project.id, targetId: replyId },
			});
			expect(sessionManager.getLeafId()).toBe(replyId);

			// Navigating to the CURRENT leaf is a no-op.
			await app.inject({
				method: "POST",
				url: "/session/navigate",
				payload: { projectId: project.id, targetId: replyId },
			});
			expect(sessionManager.getLeafId()).toBe(replyId);
			expect(sessionManager.getEntries().length).toBe(entriesBeforeNav);

			// Unknown id: pi's `Entry <id> not found` (404 mapping upstream).
			await expect(
				sessionStore.get(project.id).navigateTree("no-such-entry"),
			).rejects.toThrow(/Entry no-such-entry not found/);
		});

		it("branch mirrors pi: moves the leaf without appending", async () => {
			const project = await activeProject();
			const [firstId, secondId] = await seedEntries(project.id, ["user", "user"]);
			const sessionManager = sessionStore.get(project.id).sessionManager;
			expect(sessionManager.getLeafId()).toBe(secondId);
			const entriesBefore = sessionManager.getEntries().length;
			sessionManager.branch(firstId);
			expect(sessionManager.getLeafId()).toBe(firstId);
			expect(sessionManager.getEntries().length).toBe(entriesBefore);
			// Unknown id: pi's `Entry <id> not found` (404 mapping upstream).
			expect(() => sessionManager.branch("no-such-entry")).toThrow(
				/Entry no-such-entry not found/,
			);
		});
	});

	it("POST /session/fork branches the session at a seeded entry", async () => {
		const project = await activeProject();
		const [firstId, secondId] = await seedEntries(project.id, ["user", "user"]);
		const sessionManager = sessionStore.get(project.id).sessionManager;
		// The leaf sits at the newest entry; forking moves it back to the
		// earlier seeded entry so the next prompt starts a new parallel branch.
		expect(sessionManager.getLeafId()).toBe(secondId);
		const entriesBefore = sessionManager.getEntries().length;
		const res = await app.inject({
			method: "POST",
			url: "/session/fork",
			payload: { projectId: project.id, entryId: firstId },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual(
			expect.objectContaining({ status: "forked", entryId: firstId }),
		);

		// pi semantics: forking moves the leaf to the target entry so the next
		// prompt starts a new parallel branch (existing entries are preserved).
		expect(sessionManager.getLeafId()).toBe(firstId);
		expect(sessionManager.getEntries().length).toBe(entriesBefore);
	});

	it("GET /session/status returns session diagnostics and disk status", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "GET",
			url: `/session/status?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(200);
		const status = JSON.parse(res.payload);
		expect(status.projectId).toBe(project.id);
		expect(typeof status.active).toBe("boolean");
		expect(typeof status.diskSessionExists).toBe("boolean");
		expect(typeof status.messageCount).toBe("number");
	});

	it("POST /session/restore reloads session state from disk", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/session/restore",
			payload: { projectId: project.id },
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.status).toBe("restored");
		expect(body.projectId).toBe(project.id);
		expect(Array.isArray(body.messages)).toBe(true);
	});

	it("GET /session/history for a cold project reads from disk without instantiating memory session", async () => {
		// Dedicated hermetic project: a fresh cwd (under the OS tmpdir) means
		// the pinned fixture below is the ONLY session file for this project,
		// so the reader's newest-session pick cannot be beaten by sessions
		// other tests created for the shared active project — in both the mock
		// (NODE_ENV=test) and real-pi (bare) modes.
		const unique = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
		const projectCwd = path.join(os.tmpdir(), `kb-cold-history-${unique}`);
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: `Cold History Reader ${unique}`,
				cwd: projectCwd,
				// Keep the notes space inside the throwaway project dir so the
				// live SilverBullet notes root is never touched by this test.
				notesPath: path.join(projectCwd, "notes"),
			},
		});
		expect(createRes.statusCode).toBe(201);
		const project = JSON.parse(createRes.payload);
		// Ensure the project is disposed and cold
		await sessionStore.dispose(project.id);
		expect(sessionStore.get(project.id)).toBeUndefined();

		const sessionDir = sessionStore.sessionDirFor(project);
		// Hermeticity: stale session files from earlier runs (or from a suite run
		// without NODE_ENV=test, which spins up real pi sessions) must never win
		// the newest-session pick — SessionManager.list orders by in-file activity
		// timestamps, not fs mtime, so a stale file with newer timestamps beats
		// this test's pinned fixture. Clear the directory first; guarded to the
		// test environment so a stray non-test run can never delete real data.
		if (process.env.NODE_ENV === "test") {
			fs.rmSync(sessionDir, { recursive: true, force: true });
		}
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		fs.mkdirSync(sessionDir, { recursive: true });
		const sessionFile = path.join(
			sessionDir,
			`2026-08-29T12-00-00-000Z_${project.id}-sess.jsonl`,
		);
		const lines = [
			JSON.stringify({
				type: "session",
				version: 3,
				id: "cold-sess-1",
				timestamp: "2026-08-29T12:00:00.000Z",
				cwd: project.cwd || "/tmp",
			}),
			JSON.stringify({
				type: "message",
				id: "entry-1",
				parentId: null,
				timestamp: "2026-08-29T12:00:01.000Z",
				message: {
					id: "msg-cold-1",
					role: "user",
					content: "Cold prompt from disk",
					timestamp: 1788022530000,
				},
			}),
			JSON.stringify({
				type: "message",
				id: "entry-2",
				parentId: "entry-1",
				timestamp: "2026-08-29T12:00:02.000Z",
				message: {
					id: "msg-cold-2",
					role: "assistant",
					content: [{ type: "text", text: "Cold reply from disk" }],
					timestamp: 1788022531000,
				},
			}),
		];
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		fs.writeFileSync(sessionFile, lines.join("\n") + "\n");

		const res = await app.inject({
			method: "GET",
			url: `/session/history?projectId=${project.id}`,
		});

		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.projectId).toBe(project.id);
		expect(body.messages).toHaveLength(2);
		expect(body.messages[0].content).toBe("Cold prompt from disk");
		expect(body.messages[0].entryId).toBe("entry-1");
		expect(body.messages[1].content).toBe("Cold reply from disk");
		expect(body.messages[1].entryId).toBe("entry-2");
		expect(body.tree).toHaveLength(2);
		expect(body.isStreaming).toBe(false);

		// Verifies the session was NOT instantiated in memory
		expect(sessionStore.get(project.id)).toBeUndefined();

		// Clean up the throwaway project directory (it lives under the OS
		// tmpdir by construction — the `kb-cold-history-` prefix guards it).
		if (projectCwd.startsWith(os.tmpdir())) {
			fs.rmSync(projectCwd, { recursive: true, force: true });
		}
	});

	it("GET /session/tree for a cold project returns disk tree without instantiating memory session", async () => {
		const project = await activeProject();
		await sessionStore.dispose(project.id);
		expect(sessionStore.get(project.id)).toBeUndefined();

		const res = await app.inject({
			method: "GET",
			url: `/session/tree?projectId=${project.id}`,
		});

		expect(res.statusCode).toBe(200);
		const tree = JSON.parse(res.payload);
		expect(Array.isArray(tree)).toBe(true);
		expect(sessionStore.get(project.id)).toBeUndefined();
	});
});

/***
 * MARK: isEntryNotFoundError Unit Tests
 * @description Verifies the harness-message matcher used for the 404
 *   entry_not_found mapping (see routes/sessions.js).
 ***/
describe("isEntryNotFoundError", () => {
	it("matches pi-style entry-not-found errors", () => {
		expect(isEntryNotFoundError(new Error("Entry e-123 not found"))).toBe(true);
		expect(isEntryNotFoundError(new Error("entry whatever not found"))).toBe(true);
	});

	it("rejects other errors and non-errors", () => {
		expect(isEntryNotFoundError(new Error("Nothing to compact"))).toBe(false);
		expect(isEntryNotFoundError(new Error("Session too small to compact"))).toBe(false);
		expect(isEntryNotFoundError("Entry e-1 not found")).toBe(false);
		expect(isEntryNotFoundError(null)).toBe(false);
	});
});
