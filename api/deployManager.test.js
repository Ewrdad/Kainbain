import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Mock child_process.spawn so tests never trigger a real deploy.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

// Import after mocking.
const { DeployManager } = await import("./deployManager.js");
const { registerAlertSink, clearAlertSinks } = await import(
	"./observability/alerts.js"
);

/***
 * MARK: DeployManager Unit Tests
 * @description Verifies the self-deployment manager: it spawns the deploy script
 *   detached, refuses concurrent deploys, and reads disk-backed state/history.
 *   The real deploy script is never executed (spawn is mocked).
 ***/
describe("DeployManager", () => {
	let manager;
	let tmpDir;
	let prodTmpDir;
	let repoTmpDir;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-mgr-"));
		prodTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-prod-"));
		// A fake repo root carrying an executable deploy.sh so the support
		// probe passes. Platform and bash are stubbed so the suite stays
		// hermetic on any host OS (macOS/Windows contributors run it too).
		repoTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-repo-"));
		fs.writeFileSync(path.join(repoTmpDir, "deploy.sh"), "#!/bin/bash\n");
		fs.chmodSync(path.join(repoTmpDir, "deploy.sh"), 0o755);
		manager = new DeployManager({
			repoRoot: repoTmpDir,
			deployDir: tmpDir,
			prodDir: prodTmpDir,
			platform: "linux",
			bashCheck: () => true,
		});
		spawnMock.mockReset();
	});

	/***
	 * MARK: getStatus with no state
	 * @description Returns a well-formed status object even before any deploy.
	 ***/
	it("returns a well-formed status with no prior state", () => {
		const status = manager.getStatus();
		expect(status.running).toBe(false);
		expect(status.lastResult).toBeNull();
		expect(status.history).toEqual([]);
		expect(status.build).toBeNull();
		expect(status.deployDir).toBe(tmpDir);
	});

	/***
	 * MARK: readBuild reads live build.json
	 * @description Reads the build number stamped into the deployed build.json.
	 **/
	it("reads the live build number from build.json", () => {
		fs.writeFileSync(
			path.join(prodTmpDir, "build.json"),
			JSON.stringify({ buildNumber: 7, deployedAt: "2026-01-01", commit: "abc1234" }),
		);
		expect(manager.readBuild().buildNumber).toBe(7);
		expect(manager.getStatus().build.buildNumber).toBe(7);
	});

	/***
	 * MARK: readBuild with no build.json
	 * App: Returns null before any deployment has happened.
	 **/
	it("returns null build when build.json is missing", () => {
		expect(manager.readBuild()).toBeNull();
		expect(manager.getStatus().build).toBeNull();
	});

	/***
	 * MARK: readChangelog reads baked changelog.json
	 * @description Reads the baked changelog artifact from the prod dir.
	 **/
	it("reads the baked changelog from changelog.json", () => {
		const artifact = {
			generatedAt: "2026-09-30T08:00:00Z",
			branch: "master",
			commit: "abc1234",
			totalCount: 537,
			truncated: true,
			limit: 200,
			entries: [{ sha: "abc", shortSha: "abc", subject: "Fix", body: "", bodyTruncated: false, author: "A", authorEmail: "a@e.c", date: "2026-09-30" }],
		};
		fs.writeFileSync(path.join(prodTmpDir, "changelog.json"), JSON.stringify(artifact));
		expect(manager.readChangelog()).toEqual(artifact);
	});

	/***
	 * MARK: readChangelog with no changelog.json
	 * @description Returns null before any changelog has been baked.
	 **/
	it("returns null changelog when changelog.json is missing", () => {
		expect(manager.readChangelog()).toBeNull();
	});

	/***
	 * MARK: readChangelog with corrupt changelog.json
	 * @description Returns null for unparseable or non-object artifacts.
	 **/
	it.each(["not json{{{", "42", '"str"', "[1,2]", "null"])(
		"returns null for malformed artifact %s",
		(raw) => {
			fs.writeFileSync(path.join(prodTmpDir, "changelog.json"), raw);
			expect(manager.readChangelog()).toBeNull();
		},
	);

	/***
	 * MARK: readChangelog passes through the generation-failed marker
	 * @description A marker object with an `error` field is returned as-is so
	 *   the route can report `generation-failed` distinctly from `not-baked`.
	 **/
	it("passes through the generation-failed marker object", () => {
		const marker = { generatedAt: "2026-09-30T08:00:00Z", entries: [], error: "git log failed" };
		fs.writeFileSync(path.join(prodTmpDir, "changelog.json"), JSON.stringify(marker));
		expect(manager.readChangelog()).toEqual(marker);
	});

	/***
	 * MARK: triggerDeploy spawns detached
	 * @description Spawns ./deploy.sh --prod detached with stdio to a log file.
	 ***/
	it("spawns the deploy script detached with --prod", async () => {
		const fakeChild = {
			pid: 1234,
			unref: vi.fn(),
			on: vi.fn(),
		};
		spawnMock.mockReturnValue(fakeChild);

		const result = await manager.triggerDeploy({ fast: false });

		expect(spawnMock).toHaveBeenCalledTimes(1);
		const [script, args, opts] = spawnMock.mock.calls[0];
		expect(script).toBe("./deploy.sh");
		expect(args).toEqual(["--prod"]);
		expect(opts.cwd).toBe(repoTmpDir);
		expect(opts.detached).toBe(true);
		expect(fakeChild.unref).toHaveBeenCalled();
		expect(result.ok).toBe(true);
		expect(result.pid).toBe(1234);
		expect(manager.running).toBe(true);
	});

	/***
	 * MARK: triggerDeploy fast
	 * @description Appends --fast when fast mode is requested.
	 ***/
	it("appends --fast for a fast deploy", async () => {
		const fakeChild = { pid: 1, unref: vi.fn(), on: vi.fn() };
		spawnMock.mockReturnValue(fakeChild);
		await manager.triggerDeploy({ fast: true });
		expect(spawnMock.mock.calls[0][1]).toEqual(["--prod", "--fast"]);
	});

	/***
	 * MARK: refuses concurrent deploy
	 * @description Returns ok:false when a deploy is already running.
	 ***/
	it("refuses a second deploy while one is running", async () => {
		const fakeChild = { pid: 1, unref: vi.fn(), on: vi.fn() };
		spawnMock.mockReturnValue(fakeChild);
		await manager.triggerDeploy({ fast: false });

		const second = await manager.triggerDeploy({ fast: false });
		expect(second.ok).toBe(false);
		expect(second.error).toContain("already in progress");
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	/***
	 * MARK: clears running on exit
	 * @description When the child exits, the running flag clears.
	 ***/
	it("clears the running flag when the child exits", async () => {
		let exitHandler;
		const fakeChild = {
			pid: 1,
			unref: vi.fn(),
			on: vi.fn((event, cb) => {
				if (event === "exit") exitHandler = cb;
			}),
		};
		spawnMock.mockReturnValue(fakeChild);
		await manager.triggerDeploy({ fast: false });
		expect(manager.running).toBe(true);

		exitHandler(0);
		expect(manager.running).toBe(false);
		expect(manager.currentPid).toBeNull();
	});

	/***
	 * MARK: reads disk-backed state and history
	 * @description Reads last-result.json and history.jsonl written by the script.
	 ***/
	it("reads disk-backed state and history", () => {
		fs.writeFileSync(
			path.join(tmpDir, "last-result.json"),
			JSON.stringify({ status: "success", message: "ok" }),
		);
		fs.writeFileSync(
			path.join(tmpDir, "history.jsonl"),
			'{"status":"success","message":"one"}\n{"status":"failed","message":"two"}\n',
		);

		const status = manager.getStatus();
		expect(status.lastResult.status).toBe("success");
		expect(status.history).toHaveLength(2);
		expect(status.history[1].status).toBe("failed");
	});

	/***
	 * MARK: readLog returns tail
	 * @description Returns the most recent lines of the deploy log.
	 ***/
	it("reads the deploy log tail", () => {
		fs.writeFileSync(path.join(tmpDir, "deploy.log"), "line1\nline2\nline3\n");
		expect(manager.readLog(2)).toBe("line2\nline3");
	});

	/***
	 * MARK: isDeploySupported on a supported host
	 * @description Reports supported on Linux with an executable deploy.sh
	 *   and bash available.
	 ***/
	it("reports supported on a Linux host with deploy.sh and bash", () => {
		expect(manager.isDeploySupported()).toEqual({ supported: true });
	});

	/***
	 * MARK: triggerDeploy degrades on a non-Linux host
	 * @description Returns ok:false with unsupported:true and never spawns
	 *   the deploy script; status reads keep working.
	 ***/
	it("degrades gracefully on a non-Linux platform", async () => {
		const mac = new DeployManager({
			repoRoot: repoTmpDir,
			deployDir: tmpDir,
			prodDir: prodTmpDir,
			platform: "darwin",
			bashCheck: () => true,
		});
		const result = await mac.triggerDeploy({ fast: false });
		expect(result.ok).toBe(false);
		expect(result.unsupported).toBe(true);
		expect(result.error).toContain("Linux");
		expect(result.status).toBeDefined();
		expect(spawnMock).not.toHaveBeenCalled();
		expect(mac.running).toBe(false);
	});

	/***
	 * MARK: triggerRollback degrades on a non-Linux host
	 * @description Same graceful degradation for the rollback path.
	 ***/
	it("degrades rollback gracefully on a non-Linux platform", async () => {
		const win = new DeployManager({
			repoRoot: repoTmpDir,
			deployDir: tmpDir,
			prodDir: prodTmpDir,
			platform: "win32",
			bashCheck: () => false,
		});
		const result = await win.triggerRollback();
		expect(result.ok).toBe(false);
		expect(result.unsupported).toBe(true);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	/***
	 * MARK: missing deploy.sh degrades
	 * @description A repo root without an executable deploy.sh degrades
	 *   instead of spawning a script that is not there.
	 ***/
	it("degrades when deploy.sh is missing or not executable", async () => {
		const emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-empty-"));
		const bare = new DeployManager({
			repoRoot: emptyRepo,
			deployDir: tmpDir,
			prodDir: prodTmpDir,
			platform: "linux",
			bashCheck: () => true,
		});
		expect(bare.isDeploySupported().supported).toBe(false);
		const result = await bare.triggerDeploy({ fast: false });
		expect(result.ok).toBe(false);
		expect(result.unsupported).toBe(true);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	/***
	 * MARK: missing bash degrades
	 * @description A Linux host without bash on PATH degrades with an
	 *   explanatory error.
	 ***/
	it("degrades when bash is unavailable", async () => {
		const nobash = new DeployManager({
			repoRoot: repoTmpDir,
			deployDir: tmpDir,
			prodDir: prodTmpDir,
			platform: "linux",
			bashCheck: () => false,
		});
		expect(nobash.isDeploySupported().supported).toBe(false);
		const result = await nobash.triggerDeploy({ fast: true });
		expect(result.ok).toBe(false);
		expect(result.unsupported).toBe(true);
		expect(result.error).toContain("bash");
		expect(spawnMock).not.toHaveBeenCalled();
	});

	/***
	 * MARK: reads keep working when unsupported
	 * @description Status, log, and history reads are unaffected by the
	 *   platform — only triggering degrades.
	 ***/
	it("keeps status/log/history reads working on an unsupported platform", () => {
		const mac = new DeployManager({
			repoRoot: repoTmpDir,
			deployDir: tmpDir,
			prodDir: prodTmpDir,
			platform: "darwin",
			bashCheck: () => true,
		});
		fs.writeFileSync(
			path.join(tmpDir, "last-result.json"),
			JSON.stringify({ status: "success", message: "ok" }),
		);
		fs.writeFileSync(path.join(tmpDir, "deploy.log"), "line1\nline2\n");
		const status = mac.getStatus();
		expect(status.lastResult.status).toBe("success");
		expect(mac.readLog(10)).toBe("line1\nline2");
		expect(mac.readHistory()).toEqual([]);
	});

	/***
	 * MARK: triggerRollback raises the outbound alert
	 * @description A rollback rewinds the live build with no dashboard in the
	 *   loop, so it must reach the alert sink with the rewound build identity —
	 *   and a dead sink must not change the rollback result.
	 ***/
	it("emits a critical deploy.rollback alert with the rewound build", async () => {
		const seen = [];
		const stop = registerAlertSink({
			name: "capture",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		try {
			fs.writeFileSync(
				path.join(prodTmpDir, "build.json"),
				JSON.stringify({ buildNumber: 9, commit: "deadbee" }),
			);
			const fakeChild = { pid: 4321, unref: vi.fn(), on: vi.fn() };
			spawnMock.mockReturnValue(fakeChild);

			const result = await manager.triggerRollback();

			expect(result.ok).toBe(true);
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(seen).toHaveLength(1);
			expect(seen[0]).toMatchObject({
				event: "deploy.rollback",
				severity: "critical",
				links: { pid: 4321, build: 9, sha: "deadbee" },
			});
		} finally {
			stop();
			clearAlertSinks();
		}
	});

	describe("isPidAlive (attempt-checkpoint liveness probe)", () => {
		it("reports the current process as alive", () => {
			expect(manager.isPidAlive(process.pid)).toBe(true);
		});

		it("reports a non-existent pid as dead", () => {
			// Above Linux's pid_max (4194304 by default) and macOS's max, so
			// the pid can never name a live process.
			expect(manager.isPidAlive(2147483647)).toBe(false);
		});

		it("is total on malformed pids", () => {
			for (const bad of [0, -1, "abc", null, undefined, NaN, 1.5]) {
				expect(manager.isPidAlive(bad)).toBe(false);
			}
		});
	});
});
