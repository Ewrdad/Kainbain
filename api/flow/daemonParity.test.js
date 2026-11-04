import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. The Runner daemon talks to the app through a fetch
// shim over app.inject — same routes, same stores, no ports.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "parity-join-token";
process.env.KAINBAIN_CLAIM_TTL_MS = "60000";

const { default: app } = await import("../index.js");
const { runSingleAssignment } = await import("../../runner/daemon.js");
const { createRunnerClient } = await import("../../runner/client.js");
const { createMockHarness } = await import("../agent/harnesses/mock/mockHarness.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

function git(dir, args) {
	execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function originWithCommit() {
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kb-parity-"));
	const origin = path.join(scratch, "origin.git");
	fs.mkdirSync(origin);
	git(origin, ["init", "-q", "--bare"]);
	const seed = path.join(scratch, "seed");
	fs.mkdirSync(seed);
	git(seed, ["init", "-q"]);
	git(seed, ["config", "user.email", "t@t.t"]);
	git(seed, ["config", "user.name", "t"]);
	fs.writeFileSync(path.join(seed, "app.txt"), "v1");
	git(seed, ["add", "."]);
	git(seed, ["commit", "-qm", "init"]);
	git(seed, ["remote", "add", "origin", origin]);
	git(seed, ["push", "-q", "origin", "HEAD:main"]);
	execFileSync("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"], {
		stdio: "ignore",
	});
	return { scratch, origin };
}

function injectFetch(app) {
	return async (url, opts = {}) => {
		const u = new URL(url);
		const res = await app.inject({
			method: opts.method || "GET",
			url: `${u.pathname}${u.search}`,
			headers: opts.headers,
			payload: opts.body,
		});
		return {
			ok: res.statusCode < 300,
			status: res.statusCode,
			json: async () => JSON.parse(res.payload || "null"),
		};
	};
}

/***
 * MARK: Runner Daemon Parity
 * @description End-to-end proof that an out-of-process Runner drives a task
 *   over the wire protocol only: register → approve → heartbeat → claim →
 *   clone → run (mock harness) → sequenced logs → commit/push → complete
 *   with SHA. No engine, session, or store access from the Runner side —
 *   the fetch shim is the only channel.
 * @example run `npm run test --prefix api -- daemonParity`
 ***/
describe("Runner Daemon Parity", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("completes a task over the wire with a mock harness", async () => {
		const { scratch, origin } = originWithCommit();
		const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-parity-work-"));
		try {
			const projRes = await app.inject({
				method: "POST",
				url: "/projects",
				payload: { name: "Parity Fixture", gitUrl: origin },
			});
			expect(projRes.statusCode).toBe(201);
			const project = JSON.parse(projRes.payload);
			const taskRes = await app.inject({
				method: "POST",
				url: "/tasks",
				payload: { projectId: project.id, goal: "Parity stage goal" },
			});
			expect(taskRes.statusCode).toBe(200);
			const task = JSON.parse(taskRes.payload);

			const fetchImpl = injectFetch(app);
			const joiner = createRunnerClient({ backendUrl: "http://parity", fetchImpl });
			const reg = await joiner.register({
				runnerId: "parity-runner",
				joinToken: "parity-join-token",
				facts: { versions: { protocol: "v1", runner: "test" }, tiers: ["T0", "T1"] },
			});
			expect(reg.status).toBe("pending");
			const approval = JSON.parse(
				(
					await app.inject({ method: "POST", url: "/runners/parity-runner/approve" })
				).payload,
			);
			expect(approval.status).toBe("active");

			const client = createRunnerClient({ backendUrl: "http://parity", fetchImpl });
			// The mock harness echoes the prompt as its reply, and every
			// curated agent prompt carries `# Stage Failure Guidance`
			// showing the verdict block UNFENCED (the contract requires
			// plain text) — so the raw echo parses as FAIL with reason and
			// fix, and the shared verdict decision (embedded and Runner
			// paths alike) correctly fails it. A passing wire run needs an
			// agent-like reply instead: drive the full mock protocol
			// (streaming events, history, commit/push) but report PASS.
			const loadPassingMockHarness = async () => {
				const harness = createMockHarness({ models: [] });
				const createSession = harness.createSession.bind(harness);
				return {
					...harness,
					createSession: async (project, meta) => {
						const session = await createSession(project, meta);
						const reply =
							"Parity stage work complete.\nKAINBAIN_VERDICT: PASS";
						return {
							...session,
							prompt: async (text, opts) => {
								await session.prompt(text, opts);
								return reply;
							},
							getLastAssistantText: () => reply,
						};
					},
				};
			};
			const summary = await runSingleAssignment({
				config: {
					backendUrl: "http://parity",
					joinToken: "parity-join-token",
					credential: approval.credential,
					runnerId: "parity-runner",
					harnessId: "mock",
					model: "",
					tiers: ["T0", "T1"],
					workRoot,
					projectId: project.id,
					taskId: task.id,
					heartbeatMs: 60000,
					approvalPollMs: 10,
					approvalTimeoutMs: 1000,
					errors: [],
				},
				client,
				loadHarness: loadPassingMockHarness,
				logger: { log: () => {}, warn: () => {} },
			});
			expect(summary.accepted).toBe(true);
			expect(summary.shaState).toBe("unverified-remote");

			const final = JSON.parse(
				(
					await app.inject({
						method: "GET",
						url: `/tasks/${task.id}?projectId=${project.id}`,
					})
				).payload,
			);
			const actions = final.history.map((h) => h.action).join("\n");
			expect(actions).toMatch(/stage \S+: started/);
			expect(actions).toMatch(/stage \S+: finished/);
			expect(actions).toMatch(/completed execution/);
			expect(actions).toMatch(/parity-runner/);
			// Engine-owned finish over the wire: the stage advanced without
			// any embedded run, and the canonical agent-stage entry landed.
			expect(final.currentStageId).not.toBe(task.currentStageId);
			expect(actions).toMatch(/Agent stage completed/);

			// Push path: the task branch landed on the origin.
			const pushed = execFileSync("git", [
				"--git-dir",
				origin,
				"rev-parse",
				"--verify",
				`kb/${task.id}`,
			])
				.toString()
				.trim();
			expect(pushed).toMatch(/^[0-9a-f]{40}$/);
		} finally {
			fs.rmSync(scratch, { recursive: true, force: true });
			fs.rmSync(workRoot, { recursive: true, force: true });
		}
	});

	it("fails back over the wire when the agent verdicts FAIL with reason and fix", async () => {
		// E2E for the runner verdict gap (task d84ab136): a wf-test-style
		// "please fail this task" agent run whose final output carries a
		// well-formed FAIL block must end failed (failureKind "rejected",
		// failback routing) instead of advancing to the next stage.
		const { scratch, origin } = originWithCommit();
		const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-parity-work-"));
		try {
			const project = JSON.parse(
				(
					await app.inject({
						method: "POST",
						url: "/projects",
						payload: { name: "Parity FAIL Fixture", gitUrl: origin },
					})
				).payload,
			);
			const task = JSON.parse(
				(
					await app.inject({
						method: "POST",
						url: "/tasks",
						payload: { projectId: project.id, goal: "Please fail this task" },
					})
				).payload,
			);

			const completions = [];
			const recordingFetch = async (url, opts = {}) => {
				const u = new URL(url);
				if (opts.method === "POST" && u.pathname.endsWith("/complete-execution")) {
					completions.push(JSON.parse(opts.body));
				}
				return injectFetch(app)(url, opts);
			};
			const joiner = createRunnerClient({ backendUrl: "http://parity", fetchImpl: recordingFetch });
			await joiner.register({
				runnerId: "parity-runner-failblock",
				joinToken: "parity-join-token",
				facts: { versions: { protocol: "v1", runner: "test" }, tiers: ["T0", "T1"] },
			});
			const approval = JSON.parse(
				(
					await app.inject({ method: "POST", url: "/runners/parity-runner-failblock/approve" })
				).payload,
			);
			expect(approval.status).toBe("active");

			const client = createRunnerClient({ backendUrl: "http://parity", fetchImpl: recordingFetch });
			const failReply =
				"Parity review found a blocker.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red\nKAINBAIN_FIX: pause the stage in spec setup";
			await runSingleAssignment({
				config: {
					backendUrl: "http://parity",
					joinToken: "parity-join-token",
					credential: approval.credential,
					runnerId: "parity-runner-failblock",
					harnessId: "mock",
					model: "",
					tiers: ["T0", "T1"],
					workRoot,
					projectId: project.id,
					taskId: task.id,
					heartbeatMs: 60000,
					approvalPollMs: 10,
					approvalTimeoutMs: 1000,
					errors: [],
				},
				client,
				loadHarness: async () => {
					const harness = createMockHarness({ models: [] });
					const createSession = harness.createSession.bind(harness);
					return {
						...harness,
						createSession: async (p, meta) => {
							const session = await createSession(p, meta);
							return {
								...session,
								prompt: async (text, opts) => {
									await session.prompt(text, opts);
									return failReply;
								},
								getLastAssistantText: () => failReply,
							};
						},
					};
				},
				logger: { log: () => {}, warn: () => {} },
			});

			// The daemon itself detected the FAIL block (not just the
			// backend double-check): the completion on the wire is failed.
			expect(completions).toHaveLength(1);
			expect(completions[0]).toMatchObject({
				outcome: "failed",
				failureKind: "rejected",
			});
			expect(completions[0].failureReason).toContain("canary test red");
			expect(completions[0].failureReason).toContain("Fix guidance:");

			// And the task failed back instead of advancing.
			const final = JSON.parse(
				(
					await app.inject({
						method: "GET",
						url: `/tasks/${task.id}?projectId=${project.id}`,
					})
				).payload,
			);
			expect(final.currentStageId).toBe(task.currentStageId);
			const actions = final.history.map((h) => h.action).join("\n");
			expect(actions).not.toMatch(/Agent stage completed/);
			expect(actions).toMatch(/Stage failed/);
		} finally {
			fs.rmSync(scratch, { recursive: true, force: true });
			fs.rmSync(workRoot, { recursive: true, force: true });
		}
	});

	it("fails back over the wire on a fail_stage tool call alone (no verdict block)", async () => {
		// E2E for the tool-signal half of task d84ab136: the fail_stage
		// tool returns a normal success result (nothing throws), so only
		// the daemon's session-event watcher can catch it.
		const { scratch, origin } = originWithCommit();
		const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-parity-work-"));
		try {
			const project = JSON.parse(
				(
					await app.inject({
						method: "POST",
						url: "/projects",
						payload: { name: "Parity Tool Fixture", gitUrl: origin },
					})
				).payload,
			);
			const task = JSON.parse(
				(
					await app.inject({
						method: "POST",
						url: "/tasks",
						payload: { projectId: project.id, goal: "Please fail this task" },
					})
				).payload,
			);

			const completions = [];
			const recordingFetch = async (url, opts = {}) => {
				const u = new URL(url);
				if (opts.method === "POST" && u.pathname.endsWith("/complete-execution")) {
					completions.push(JSON.parse(opts.body));
				}
				return injectFetch(app)(url, opts);
			};
			const joiner = createRunnerClient({ backendUrl: "http://parity", fetchImpl: recordingFetch });
			await joiner.register({
				runnerId: "parity-runner-failtool",
				joinToken: "parity-join-token",
				facts: { versions: { protocol: "v1", runner: "test" }, tiers: ["T0", "T1"] },
			});
			const approval = JSON.parse(
				(
					await app.inject({ method: "POST", url: "/runners/parity-runner-failtool/approve" })
				).payload,
			);
			expect(approval.status).toBe("active");

			const client = createRunnerClient({ backendUrl: "http://parity", fetchImpl: recordingFetch });
			await runSingleAssignment({
				config: {
					backendUrl: "http://parity",
					joinToken: "parity-join-token",
					credential: approval.credential,
					runnerId: "parity-runner-failtool",
					harnessId: "mock",
					model: "",
					tiers: ["T0", "T1"],
					workRoot,
					projectId: project.id,
					taskId: task.id,
					heartbeatMs: 60000,
					approvalPollMs: 10,
					approvalTimeoutMs: 1000,
					errors: [],
				},
				client,
				loadHarness: async () => {
					const harness = createMockHarness({ models: [] });
					const createSession = harness.createSession.bind(harness);
					return {
						...harness,
						createSession: async (p, meta) => {
							const session = await createSession(p, meta);
							let daemonHandler = null;
							const reply = "stage work attempted, no verdict rendered";
							return {
								...session,
								subscribe: (handler) => {
									daemonHandler = handler;
									return session.subscribe(handler);
								},
								prompt: async (text, opts) => {
									await session.prompt(text, opts);
									daemonHandler?.({
										type: "tool_started",
										toolName: "fail_stage",
										toolCallId: "parity-tool-1",
										args: { reason: "parity fail_stage probe" },
									});
									return reply;
								},
								getLastAssistantText: () => reply,
							};
						},
					};
				},
				logger: { log: () => {}, warn: () => {} },
			});

			expect(completions).toHaveLength(1);
			expect(completions[0]).toMatchObject({
				outcome: "failed",
				failureKind: "rejected",
			});
			expect(completions[0].failureReason).toContain("parity fail_stage probe");
			expect(completions[0].output).not.toContain("KAINBAIN_VERDICT");

			const final = JSON.parse(
				(
					await app.inject({
						method: "GET",
						url: `/tasks/${task.id}?projectId=${project.id}`,
					})
				).payload,
			);
			expect(final.currentStageId).toBe(task.currentStageId);
			const actions = final.history.map((h) => h.action).join("\n");
			expect(actions).not.toMatch(/Agent stage completed/);
			expect(actions).toMatch(/Stage failed/);
		} finally {
			fs.rmSync(scratch, { recursive: true, force: true });
			fs.rmSync(workRoot, { recursive: true, force: true });
		}
	});
});
