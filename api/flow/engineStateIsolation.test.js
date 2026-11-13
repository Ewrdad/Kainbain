import { describe, test, expect, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: engine-state isolation guard test
 * @description Structural guard for the 2026-11 test-pollution incident
 *   (task b3401f19, cause N5): API suites registered runner
 *   `test-fleet-muse` against the LIVE `~/.kainbain/engine/runners.json`
 *   and `fleet-catalog.json` because the global setup backstop
 *   (`testSetup.isolation.js`) pointed only projects/notes/circuit at temp
 *   paths. Every suite run re-polluted production with dummy/test models
 *   (survey q14: those must never appear in production).
 *
 *   Two layers: (a) deterministic — the resolved durable-state paths must
 *   sit under `os.tmpdir()`; (b) live-FS — importing the app, registering
 *   a runner, and reading the catalogue must leave every byte under
 *   `~/.kainbain/engine/` untouched (listing + mtime + sha256, plus a
 *   unique sentinel runner id that must not appear in any live file, so
 *   an ambient engine write cannot be mistaken for ours and vice versa).
 *
 *   This file deliberately uses the STANDARD setup only (no per-file env
 *   overrides): it proves the backstop every other suite relies on.
 ***/

const LIVE_ENGINE_DIR = path.join(os.homedir(), ".kainbain", "engine");

function snapshotLiveEngineDir() {
	const snapshot = { files: {}, listing: [] };
	let entries = [];
	try {
		entries = fs.readdirSync(LIVE_ENGINE_DIR).sort();
	} catch {
		return snapshot;
	}
	snapshot.listing = entries;
	for (const name of entries) {
		const file = path.join(LIVE_ENGINE_DIR, name);
		try {
			const stat = fs.statSync(file);
			if (!stat.isFile()) continue;
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- test snapshot of the known engine state dir */
			const raw = fs.readFileSync(file);
			snapshot.files[name] = {
				mtimeMs: stat.mtimeMs,
				sha256: crypto.createHash("sha256").update(raw).digest("hex"),
				content: raw.toString("utf8"),
			};
		} catch {
			// A file that vanishes mid-snapshot is itself a change signal;
			// record nothing and let the after-comparison catch it.
		}
	}
	return snapshot;
}

// Throwaway projects/notes roots BEFORE the app is loaded, mirroring the
// polluter suites (`routes/projects.alias.test.js`) — this also satisfies
// the `testResidue.guard.test.js` meta-guard, which requires every
// app-importing suite to isolate its roots first. Deliberately NOT via
// `isolatedTestRoots.js`: that helper pins the KAINBAIN_* engine-state
// vars per file, which would mask the global setup backstop this test
// exists to prove. Engine-state isolation here comes from the STANDARD
// setup only — that is the point.
const tempGuardProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-guard-projects-"),
);
const tempGuardNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-guard-notes-"),
);
process.env.PROJECTS_ROOT = tempGuardProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempGuardNotesRoot;
// The join token must land before the config loader's import-time env
// snapshot (first `../index.js` evaluation), mirroring the polluter
// suites (`routes/projects.alias.test.js`).
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-isolation-token";

// Snapshot BEFORE the app boots: module-level dynamic imports below run
// in order, so this captures the pristine live state.
const liveBefore = snapshotLiveEngineDir();

const { default: app } = await import("../index.js");
const { resolveRunnerStatePath } = await import("./runnerRegistry.js");
const { resolveClaimStatePath } = await import("./claimStore.js");
const { resolveSteerStatePath } = await import("./steerStore.js");
const { resolveFleetSnapshotPath } = await import("./dispatch/fleetModelSnapshot.js");

// Unique per run: distinguishes our writes from ambient engine activity.
const SENTINEL_RUNNER_ID = `test-isolation-${process.pid}-${Date.now().toString(36)}`;

const SENTINEL_FACTS = {
	harnesses: [{ id: "muse", version: "test" }],
	models: ["muse::meta::test-fleet-model"],
	tiers: ["T0"],
	diskHeadroomMb: 1024,
	versions: { protocol: "v1", runner: "test" },
};

afterAll(() => {
	try {
		fs.rmSync(tempGuardProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempGuardNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

describe("engine-state isolation guard", () => {
	test("(a) every durable engine-state path resolves under the OS temp dir", () => {
		for (const key of [
			"KAINBAIN_RUNNER_STATE_FILE",
			"KAINBAIN_CLAIM_STATE_FILE",
			"KAINBAIN_STEER_STATE_FILE",
			"KAINBAIN_FLEET_CATALOG_FILE",
		]) {
			expect(
				process.env[key],
				`${key} must be pinned to a temp file by the setup backstop`,
			).toBeTruthy();
		}
		const resolved = {
			runners: resolveRunnerStatePath(),
			claims: resolveClaimStatePath(),
			steers: resolveSteerStatePath(),
			fleetCatalog: resolveFleetSnapshotPath(undefined),
		};
		for (const [name, file] of Object.entries(resolved)) {
			expect(typeof file, `${name} path must resolve to a string`).toBe("string");
			const relative = path.relative(os.tmpdir(), file);
			expect(
				relative && !relative.startsWith("..") && !path.isAbsolute(relative),
				`${name} path must sit under os.tmpdir(), got ${file}`,
			).toBe(true);
		}
	});

	test("(b) app boot + runner registration + catalogue read leave live engine state untouched", async () => {
		// Clear a stale sentinel from an interrupted run; 404 is fine.
		await app.inject({ method: "POST", url: `/runners/${SENTINEL_RUNNER_ID}/revoke` });
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: {
				runnerId: SENTINEL_RUNNER_ID,
				joinToken: "test-isolation-token",
				facts: SENTINEL_FACTS,
			},
		});
		expect([200, 202]).toContain(reg.statusCode);
		const approval = await app.inject({
			method: "POST",
			url: `/runners/${SENTINEL_RUNNER_ID}/approve`,
		});
		expect(approval.statusCode).toBe(200);
		// Every catalogue read refreshes the persisted fleet snapshot from
		// the live registrations — the write path that polluted
		// `fleet-catalog.json` in the incident.
		const catalogue = await app.inject({ method: "GET", url: "/runners/models/catalogue" });
		expect(catalogue.statusCode).toBe(200);

		try {
			const liveAfter = snapshotLiveEngineDir();
			expect(liveAfter.listing).toEqual(liveBefore.listing);
			for (const name of liveBefore.listing) {
				expect(
					liveAfter.files[name]?.mtimeMs,
					`live ${name} mtime must not change`,
				).toBe(liveBefore.files[name]?.mtimeMs);
				expect(
					liveAfter.files[name]?.sha256,
					`live ${name} content must not change`,
				).toBe(liveBefore.files[name]?.sha256);
				expect(
					liveAfter.files[name]?.content ?? "",
					`live ${name} must not contain the sentinel runner id`,
				).not.toContain(SENTINEL_RUNNER_ID);
			}
		} finally {
			// Best-effort cleanup; on green this touches temp files only.
			try {
				await app.inject({ method: "POST", url: `/runners/${SENTINEL_RUNNER_ID}/revoke` });
			} catch {
				// ignore cleanup errors
			}
		}
	});
});
