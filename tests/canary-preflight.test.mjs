import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
	SCRATCH_API_PORT,
	SCRATCH_VITE_PORT,
	SCRATCH_PORTS,
	usesOperatorStack,
	isScratchOccupant,
	probeProcess,
	freeScratchPorts,
} = await import("../scripts/canary-preflight.mjs");

/***
 * MARK: canary-preflight tests
 * @description Hermetic tests for the canary scratch-port preflight
 *   (scripts/canary-preflight.mjs). No real process is ever inspected or
 *   killed: /proc reads, `ps` calls and freePort are all injected. The suite
 *   pins the safety contract — only verified scratch processes are terminated,
 *   everything else is left running and reported.
 * @example run `node --test tests/canary-preflight.test.mjs`
 ***/

// Builds a freePort double that honours the verifyFn contract exactly like the
// real one: it only "frees" when every occupant verifies, never kills.
function fakeFreePort({ alreadyFree = false, occupant = 1234, record } = {}) {
	return async (port, { verifyFn } = {}) => {
		if (alreadyFree) {
			return { ok: true, port, freed: false, alreadyFree: true, pids: [] };
		}
		const verified = typeof verifyFn === "function" ? await verifyFn(occupant, port) : true;
		if (record) record.push({ port, occupant, verified });
		if (!verified) {
			return {
				ok: false,
				port,
				freed: false,
				alreadyFree: false,
				pids: [occupant],
				unverifiedPids: [occupant],
				error: `Port ${port} is held by pid(s) ${occupant}, which did not match the expected process signature; refusing to terminate them.`,
			};
		}
		return { ok: true, port, freed: true, alreadyFree: false, pids: [occupant] };
	};
}

function silentLog() {
	return { log() {}, error() {} };
}

describe("usesOperatorStack", () => {
	it("is false when neither operator URL is set (scratch stack is ours)", () => {
		assert.equal(usesOperatorStack({}), false);
	});

	it("is true when either operator URL is set", () => {
		assert.equal(usesOperatorStack({ CANARY_BASE_URL: "http://localhost:5299" }), true);
		assert.equal(usesOperatorStack({ CANARY_API_URL: "http://localhost:3399" }), true);
		assert.equal(
			usesOperatorStack({ CANARY_BASE_URL: "http://x", CANARY_API_URL: "http://y" }),
			true,
		);
	});
});

describe("isScratchOccupant", () => {
	it("accepts a scratch API by cwd or command shape", () => {
		assert.equal(isScratchOccupant({ port: SCRATCH_API_PORT, cwd: "/repo/canary-e2e" }), true);
		assert.equal(
			isScratchOccupant({ port: SCRATCH_API_PORT, cmdline: "node ../api/index.js" }),
			true,
		);
	});

	it("accepts a scratch vite by its dedicated port flag", () => {
		assert.equal(
			isScratchOccupant({
				port: SCRATCH_VITE_PORT,
				cmdline: "node /repo/frontend/node_modules/.bin/vite --port 5299 --strictPort",
			}),
			true,
		);
	});

	it("rejects an unrelated occupant on the API port", () => {
		assert.equal(
			isScratchOccupant({
				port: SCRATCH_API_PORT,
				cmdline: "/usr/lib/postgresql/16/bin/postgres -D /var/lib/pg",
				cwd: "/var/lib/postgresql",
			}),
			false,
		);
	});

	it("rejects an unrelated occupant on the vite port", () => {
		assert.equal(
			isScratchOccupant({ port: SCRATCH_VITE_PORT, cmdline: "node server.js --port 5299" }),
			false,
		);
	});

	it("rejects a real dev vite on the live dev port", () => {
		assert.equal(
			isScratchOccupant({ port: SCRATCH_VITE_PORT, cmdline: "node vite --port 5173" }),
			false,
		);
	});

	it("rejects an arbitrary occupant on an unknown port", () => {
		assert.equal(isScratchOccupant({ port: 8080, cmdline: "node ../api/index.js" }), false);
	});

	it("is not fooled by the empty/legacy probe shape", () => {
		assert.equal(isScratchOccupant({ port: SCRATCH_API_PORT, cmdline: "", cwd: "" }), false);
	});
});

describe("probeProcess", () => {
	it("reads cmdline and cwd from /proc on linux", async () => {
		const info = await probeProcess(4321, {
			platform: "linux",
			readFileFn: () => Buffer.from("node\u0000../api/index.js\u0000"),
			readlinkFn: () => "/repo/canary-e2e",
		});
		assert.deepEqual(info, { cmdline: "node ../api/index.js", cwd: "/repo/canary-e2e" });
	});

	it("still classifies when the cwd link is unreadable", async () => {
		const info = await probeProcess(4321, {
			platform: "linux",
			readFileFn: () => Buffer.from("node\u0000../api/index.js\u0000"),
			readlinkFn: () => {
				throw new Error("EPERM");
			},
		});
		assert.equal(info.cmdline, "node ../api/index.js");
		assert.equal(info.cwd, "");
		assert.equal(isScratchOccupant({ port: SCRATCH_API_PORT, ...info }), true);
	});

	it("returns null when the process is gone", async () => {
		const info = await probeProcess(4321, {
			platform: "linux",
			readFileFn: () => {
				throw new Error("ENOENT");
			},
		});
		assert.equal(info, null);
	});

	it("falls back to ps on non-linux platforms", async () => {
		const calls = [];
		const info = await probeProcess(4321, {
			platform: "darwin",
			execFileFn: async (file, args) => {
				calls.push([file, args]);
				return { stdout: "node ../api/index.js\n", stderr: "" };
			},
		});
		assert.deepEqual(info, { cmdline: "node ../api/index.js", cwd: "" });
		assert.deepEqual(calls[0], ["ps", ["-o", "command=", "-p", "4321"]]);
	});

	it("returns null on non-linux when the process is gone", async () => {
		const info = await probeProcess(4321, {
			platform: "darwin",
			execFileFn: async () => {
				throw new Error("no such process");
			},
		});
		assert.equal(info, null);
	});
});

describe("freeScratchPorts", () => {
	it("is a no-op when the operator drives their own stack", async () => {
		let calls = 0;
		const result = await freeScratchPorts({
			env: { CANARY_BASE_URL: "http://localhost:5299" },
			freePortFn: async () => {
				calls += 1;
				return { ok: true };
			},
			log: silentLog(),
		});
		assert.equal(result.skipped, true);
		assert.equal(result.ok, true);
		assert.equal(calls, 0);
	});

	it("frees both scratch ports when their occupants verify", async () => {
		const seen = [];
		const result = await freeScratchPorts({
			env: {},
			freePortFn: fakeFreePort({ record: seen }),
			probeFn: async () => ({ cmdline: "node ../api/index.js", cwd: "/repo/canary-e2e" }),
			log: silentLog(),
		});
		assert.equal(result.ok, true);
		assert.equal(result.skipped, false);
		assert.deepEqual(
			result.results.map((r) => r.port),
			SCRATCH_PORTS,
		);
		assert.ok(result.results.every((r) => r.freed));
		assert.ok(seen.every((entry) => entry.verified));
	});

	it("reports success without touching an already-free port", async () => {
		const result = await freeScratchPorts({
			env: {},
			freePortFn: fakeFreePort({ alreadyFree: true }),
			probeFn: async () => null,
			log: silentLog(),
		});
		assert.equal(result.ok, true);
		assert.ok(result.results.every((r) => r.alreadyFree));
	});

	it("fails closed when an occupant does not verify as scratch", async () => {
		const result = await freeScratchPorts({
			env: {},
			freePortFn: fakeFreePort(),
			probeFn: async () => ({ cmdline: "postgres -D /var/lib/pg", cwd: "/var/lib/postgresql" }),
			log: silentLog(),
		});
		assert.equal(result.ok, false);
		assert.equal(result.results.length, 2);
		assert.ok(result.results.every((r) => r.unverifiedPids.length === 1));
	});

	it("treats an uninspectable occupant as unverified", async () => {
		const result = await freeScratchPorts({
			env: {},
			freePortFn: fakeFreePort(),
			probeFn: async () => null,
			log: silentLog(),
		});
		assert.equal(result.ok, false);
	});
});
