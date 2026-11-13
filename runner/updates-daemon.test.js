import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { installRootFor, maybeSelfUpdate, RUNNER_VERSION } from "./daemon.js";

const baseConfig = (overrides = {}) => ({
	backendUrl: "http://localhost:3100",
	runnerId: "r1",
	harnessId: "mock",
	harnessIds: ["mock"],
	model: "",
	models: [],
	tiers: ["T0"],
	workRoot: "runner-work",
	installRoot: "",
	dispatch: true,
	projectIds: [],
	dispatchPollMs: 5,
	dispatchIdleLimit: 3,
	heartbeatMs: 15000,
	approvalPollMs: 5000,
	approvalTimeoutMs: 300000,
	autoUpdate: true,
	updateUrl: "http://mirror.local/r",
	updateCheckIntervalMs: 3600000,
	errors: [],
	...overrides,
});

const quiet = { log: () => {}, warn: () => {} };

describe("installRootFor", () => {
	it("prefers the explicit install root", () => {
		assert.equal(installRootFor({ installRoot: "/opt/r" }), "/opt/r");
	});

	it("defaults to a runner-install sibling of the work root", () => {
		const got = installRootFor({ workRoot: "runner-work" });
		assert.match(got, /runner-install$/);
	});
});

describe("maybeSelfUpdate", () => {
	it("skips when auto-update is off", async () => {
		const got = await maybeSelfUpdate({
			config: baseConfig({ autoUpdate: false }),
			logger: quiet,
			updateState: {},
		});
		assert.equal(got.checked, false);
	});

	it("throttles repeat checks inside the interval", async () => {
		let calls = 0;
		const got = await maybeSelfUpdate({
			config: baseConfig({ updateCheckIntervalMs: 3600000 }),
			logger: quiet,
			now: 1000,
			updateState: { lastUpdateCheckAt: 500 },
			updateDeps: {
				checkForUpdate: async () => { calls += 1; return { ok: true, update: null }; },
			},
		});
		assert.equal(got.checked, false);
		assert.equal(calls, 0);
	});

	it("reports up-to-date without touching the install", async () => {
		const state = { lastUpdateCheckAt: 0 };
		const got = await maybeSelfUpdate({
			config: baseConfig(),
			logger: quiet,
			now: 10_000_000,
			updateState: state,
			updateDeps: {
				checkForUpdate: async () => ({ ok: true, update: null, reason: "Already on the latest version." }),
				applyUpdate: async () => { throw new Error("must not apply"); },
			},
		});
		assert.equal(got.checked, true);
		assert.equal(got.update, null);
		assert.ok(state.lastUpdateCheckAt > 0);
	});

	it("records failed checks on the loop state for heartbeat facts", async () => {
		const state = {};
		const got = await maybeSelfUpdate({
			config: baseConfig(),
			logger: quiet,
			now: 10_000_000,
			updateState: state,
			updateDeps: {
				checkForUpdate: async () => ({ ok: false, reason: "boom" }),
			},
		});
		assert.equal(got.ok, false);
		assert.equal(state.updateStatus?.state, "failed");
	});

	it("contains an apply failure: no throw, old version keeps running, fleet is told", async () => {
		const state = {};
		const update = { version: "9.9.9", manifest: { version: "9.9.9" }, asset: { filename: "a.tar.gz" } };
		const got = await maybeSelfUpdate({
			config: baseConfig(),
			logger: quiet,
			now: 10_000_000,
			updateState: state,
			updateDeps: {
				checkForUpdate: async () => ({ ok: true, update }),
				applyUpdate: async () => { throw Object.assign(new Error("disk full"), { code: "DOWNLOAD_FAILED" }); },
			},
		});
		assert.equal(got.checked, true);
		assert.equal(got.ok, false);
		assert.match(got.reason, /disk full/);
		assert.equal(state.updateStatus?.state, "failed");
	});

	it("force bypasses the interval gate (the 409 path updates immediately)", async () => {
		let calls = 0;
		const got = await maybeSelfUpdate({
			config: baseConfig({ updateCheckIntervalMs: 3600000 }),
			logger: quiet,
			now: 1000,
			force: true,
			updateState: { lastUpdateCheckAt: 500 },
			updateDeps: {
				checkForUpdate: async () => { calls += 1; return { ok: true, update: null }; },
			},
		});
		assert.equal(got.checked, true);
		assert.equal(calls, 1);
	});

	it("applies a verified update and marks it staged", async () => {
		const state = {};
		const update = { version: "9.9.9", manifest: { version: "9.9.9" }, asset: { filename: "a.tar.gz" } };
		const got = await maybeSelfUpdate({
			config: baseConfig(),
			logger: quiet,
			now: 10_000_000,
			updateState: state,
			updateDeps: {
				checkForUpdate: async () => ({ ok: true, update }),
				applyUpdate: async () => ({ ok: true, version: "9.9.9" }),
			},
		});
		assert.equal(got.ok, true);
		assert.equal(got.applied?.version, "9.9.9");
		assert.equal(state.updateStatus?.state, "staged");
	});

	it("never claims to be newer than itself (sanity on RUNNER_VERSION)", () => {
		assert.match(String(RUNNER_VERSION), /^\d+\.\d+\.\d+/);
	});

	it("passes the heartbeat-learned backend version into the check (compat gating)", async () => {
		let received = null;
		const state = { updateDirective: { backendApiVersion: "1.0.0", desiredRunnerVersion: "0.2.0", minimumRunnerVersion: "0.1.0" } };
		await maybeSelfUpdate({
			config: baseConfig(),
			logger: quiet,
			now: 10_000_000,
			updateState: state,
			updateDeps: {
				checkForUpdate: async (args) => { received = args; return { ok: true, update: null }; },
			},
		});
		assert.equal(received?.backendApiVersion, "1.0.0");
	});

	it("passes null when no heartbeat arrived yet (ungated, today's behaviour)", async () => {
		let received = null;
		await maybeSelfUpdate({
			config: baseConfig(),
			logger: quiet,
			now: 10_000_000,
			updateState: {},
			updateDeps: {
				checkForUpdate: async (args) => { received = args; return { ok: true, update: null }; },
			},
		});
		assert.equal(received?.backendApiVersion, null);
	});
});
