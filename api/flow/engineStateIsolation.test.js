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
 *   Two layers: (a) deterministic — every resolved durable-state path
 *   (fleet stores, circuit, auth dir) must sit under `os.tmpdir()`;
 *   (b) live-FS — importing the app, registering a runner, and reading
 *   the catalogue must leave every byte under `~/.kainbain/engine/`
 *   untouched (recursive listing + mtime + sha256, plus a unique
 *   sentinel runner id that must not appear in any live file, so an
 *   ambient engine write cannot be mistaken for ours and vice versa).
 *
 *   This file deliberately uses the STANDARD setup only (no per-file
 *   `KAINBAIN_*` overrides): it proves the backstop every other suite
 *   relies on.
 ***/

const LIVE_ENGINE_DIR = path.join(os.homedir(), ".kainbain", "engine");
// Far above the real engine-dir size (a handful of JSON files): the cap
// only ever fires on a runaway dir or symlink loop, failing loudly
// instead of hanging the suite.
const MAX_SNAPSHOT_ENTRIES = 500;

function snapshotLiveEngineDir() {
	const snapshot = { files: {}, listing: [] };
	const walk = (dir, prefix) => {
		let entries = [];
		try {
			entries = fs.readdirSync(dir).sort();
		} catch {
			return;
		}
		for (const name of entries) {
			if (snapshot.listing.length >= MAX_SNAPSHOT_ENTRIES) {
				throw new Error(
					`engine-state guard: live ${LIVE_ENGINE_DIR} holds more than ` +
						`${MAX_SNAPSHOT_ENTRIES} entries — refusing to snapshot (runaway dir or symlink loop?).`,
				);
			}
			const relativeName = prefix ? `${prefix}/${name}` : name;
			const file = path.join(dir, name);
			let stat = null;
			try {
				// lstat, not stat: a symlink is recorded as a link and never
				// followed, so a loop cannot hang the walk.
				/* eslint-disable-next-line security/detect-non-literal-fs-filename -- test snapshot of the known engine state dir */
				stat = fs.lstatSync(file);
			} catch {
				// A file that vanishes mid-snapshot is itself a change
				// signal; record nothing and let the after-comparison
				// catch it.
				continue;
			}
			snapshot.listing.push(relativeName);
			if (stat.isSymbolicLink()) {
				let target = "";
				try {
					target = fs.readlinkSync(file);
				} catch {
					target = "";
				}
				snapshot.files[relativeName] = {
					mtimeMs: stat.mtimeMs,
					sha256: crypto.createHash("sha256").update(`link:${target}`).digest("hex"),
					content: `link:${target}`,
				};
				continue;
			}
			if (stat.isDirectory()) {
				snapshot.files[relativeName] = {
					mtimeMs: stat.mtimeMs,
					sha256: "dir",
					content: "dir",
				};
				walk(file, relativeName);
				continue;
			}
			if (!stat.isFile()) continue;
			try {
				/* eslint-disable-next-line security/detect-non-literal-fs-filename -- test snapshot of the known engine state dir */
				const raw = fs.readFileSync(file);
				snapshot.files[relativeName] = {
					mtimeMs: stat.mtimeMs,
					sha256: crypto.createHash("sha256").update(raw).digest("hex"),
					content: raw.toString("utf8"),
				};
			} catch {
				// Vanished mid-snapshot — the after-comparison catches it.
			}
		}
	};
	walk(LIVE_ENGINE_DIR, "");
	snapshot.listing.sort();
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

const { default: app, authService } = await import("../index.js");
const { resolveRunnerStatePath } = await import("./runnerRegistry.js");
const { resolveClaimStatePath } = await import("./claimStore.js");
const { resolveSteerStatePath } = await import("./steerStore.js");
const { resolveFleetSnapshotPath } = await import("./dispatch/fleetModelSnapshot.js");
const { resolveCircuitStatePath } = await import("./circuitBreaker.js");

// Unique per run: distinguishes our writes from ambient engine activity.
const SENTINEL_RUNNER_ID = `test-isolation-${process.pid}-${Date.now().toString(36)}`;

const SENTINEL_FACTS = {
	harnesses: [{ id: "muse", version: "test" }],
	models: ["muse::meta::test-fleet-model"],
	tiers: ["T0"],
	diskHeadroomMb: 1024,
	versions: { protocol: "v1", runner: "test" },
};

function expectUnderTempDir(name, file) {
	expect(typeof file, `${name} path must resolve to a string`).toBe("string");
	const relative = path.relative(os.tmpdir(), file);
	expect(
		relative && !relative.startsWith("..") && !path.isAbsolute(relative),
		`${name} path must sit under os.tmpdir(), got ${file}`,
	).toBe(true);
}

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
			"KAINBAIN_CIRCUIT_STATE_FILE",
			"KAINBAIN_AUTH_STATE_PATH",
		]) {
			expect(
				process.env[key],
				`${key} must be pinned by the setup backstop`,
			).toBeTruthy();
		}
		expectUnderTempDir("runners", resolveRunnerStatePath());
		expectUnderTempDir("claims", resolveClaimStatePath());
		expectUnderTempDir("steers", resolveSteerStatePath());
		expectUnderTempDir("fleetCatalog", resolveFleetSnapshotPath(undefined));
		expectUnderTempDir("circuit", resolveCircuitStatePath());
		// The app boots one shared auth service at import time: its state
		// dir is the value every settings-page save and sign-in writes
		// through, so it must be temp too — not just the env var.
		expectUnderTempDir("authService.stateDir", authService.stateDir);
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
		// A settings-page save through the app's booted auth service
		// exercises the auth state dir — the write path that would
		// pollute `engine/auth/access.json` without the
		// `KAINBAIN_AUTH_STATE_PATH` pin. Saving the already-default
		// value keeps the suite hermetic while still performing a
		// real write through the real service.
		authService.authConfig.save({ authEnabled: false });

		try {
			const liveAfter = snapshotLiveEngineDir();
			const changed = [];
			for (const name of new Set([...liveBefore.listing, ...liveAfter.listing])) {
				const before = liveBefore.files[name];
				const after = liveAfter.files[name];
				if (!before) changed.push(`${name} (created during the test)`);
				else if (!after) changed.push(`${name} (deleted during the test)`);
				else if (before.sha256 !== after.sha256 || before.mtimeMs !== after.mtimeMs) {
					const ours = (after.content ?? "").includes(SENTINEL_RUNNER_ID);
					changed.push(
						`${name} (content/mtime changed; ` +
							(ours
								? "contains OUR sentinel id — this suite polluted live state"
								: "no sentinel id — suspect an ambient engine write during the run, re-run with the engine stopped"),
					);
				} else if ((after.content ?? "").includes(SENTINEL_RUNNER_ID)) {
					changed.push(`${name} (contains our sentinel id)`);
				}
			}
			expect(
				changed,
				`live ${LIVE_ENGINE_DIR} must stay untouched:\n${changed.join("\n")}`,
			).toEqual([]);
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
