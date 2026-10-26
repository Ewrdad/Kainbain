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
				loadHarness: async () => createMockHarness({ models: [] }),
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
});
