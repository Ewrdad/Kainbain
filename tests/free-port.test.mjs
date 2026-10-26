import { describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

const { isPortOccupied, findOccupantPids, freePort } = await import("../scripts/free-port.mjs");

/***
 * MARK: free-port tests
 * @description Hermetic tests for the cross-platform port probing and freeing
 *   helper (scripts/free-port.mjs), the Linux-only port-kill replacement. Occupancy
 *   probes use real ephemeral ports; occupant lookup and killing use injected
 *   mocks — no real process is ever killed by this suite.
 * @example run `node --test tests/free-port.test.mjs`
 ***/

// Binds an ephemeral port and reports its number, leaving the server open.
function bindEphemeral() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			resolve({ server, port: server.address().port });
		});
	});
}

function closeServer(server) {
	return new Promise((resolve) => server.close(() => resolve()));
}

describe("isPortOccupied", () => {
	it("reports false for a free ephemeral port", async () => {
		const { server, port } = await bindEphemeral();
		await closeServer(server);
		assert.equal(await isPortOccupied(port), false);
	});

	it("reports true for a bound port", async () => {
		const { server, port } = await bindEphemeral();
		try {
			assert.equal(await isPortOccupied(port), true);
		} finally {
			await closeServer(server);
		}
	});

	it("reports false again after the holder closes", async () => {
		const { server, port } = await bindEphemeral();
		assert.equal(await isPortOccupied(port), true);
		await closeServer(server);
		assert.equal(await isPortOccupied(port), false);
	});

	it("rejects an out-of-range port number", async () => {
		await assert.rejects(() => isPortOccupied(99999), /port/i);
		await assert.rejects(() => isPortOccupied(0), /port/i);
	});
});

describe("findOccupantPids", () => {
	it("parses lsof -ti output on linux", async () => {
		const calls = [];
		const execFileMock = async (file, args) => {
			calls.push([file, args]);
			return { stdout: "1234\n5678\n", stderr: "" };
		};
		const pids = await findOccupantPids(3100, { platform: "linux", execFileFn: execFileMock });
		assert.deepEqual(pids, [1234, 5678]);
		assert.deepEqual(calls[0], ["lsof", ["-ti", "tcp:3100"]]);
	});

	it("parses lsof -ti output on darwin", async () => {
		const execFileMock = async () => ({ stdout: "42\n", stderr: "" });
		const pids = await findOccupantPids(5173, { platform: "darwin", execFileFn: execFileMock });
		assert.deepEqual(pids, [42]);
	});

	it("returns an empty list when lsof finds no occupant (exit 1)", async () => {
		const noMatch = new Error("lsof found nothing");
		noMatch.code = 1;
		const execFileMock = async () => {
			throw noMatch;
		};
		const pids = await findOccupantPids(3100, { platform: "linux", execFileFn: execFileMock });
		assert.deepEqual(pids, []);
	});

	it("falls back to ss when lsof is missing on linux", async () => {
		const missing = new Error("lsof not found");
		missing.code = "ENOENT";
		const execFileMock = async (file) => {
			if (file === "lsof") throw missing;
			assert.equal(file, "ss");
			return {
				stdout:
					"State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\n" +
					'LISTEN 0      511    0.0.0.0:3100       0.0.0.0:*     users:(("node",pid=777,fd=21))\n',
				stderr: "",
			};
		};
		const pids = await findOccupantPids(3100, { platform: "linux", execFileFn: execFileMock });
		assert.deepEqual(pids, [777]);
	});

	it("ss fallback only returns pids listening on the requested port", async () => {
		const missing = new Error("lsof not found");
		missing.code = "ENOENT";
		const execFileMock = async (file) => {
			if (file === "lsof") throw missing;
			return {
				stdout:
					"State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\n" +
					'LISTEN 0      511    0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=111,fd=3))\n' +
					'LISTEN 0      511    0.0.0.0:3100       0.0.0.0:*     users:(("node",pid=777,fd=21))\n' +
					'LISTEN 0      511    0.0.0.0:31000      0.0.0.0:*     users:(("other",pid=222,fd=9))\n',
				stderr: "",
			};
		};
		const pids = await findOccupantPids(3100, { platform: "linux", execFileFn: execFileMock });
		// Only the :3100 listener counts — not :22, not the :31000 prefix trap.
		assert.deepEqual(pids, [777]);
	});

	it("reports a clear error when neither lsof nor ss exists", async () => {
		const missing = new Error("not found");
		missing.code = "ENOENT";
		const execFileMock = async () => {
			throw missing;
		};
		await assert.rejects(() => findOccupantPids(3100, { platform: "linux", execFileFn: execFileMock }), /lsof.*ss|kill the process/i);
	});

	it("parses netstat -ano output on win32", async () => {
		const calls = [];
		const execFileMock = async (file, args) => {
			calls.push([file, args]);
			return {
				stdout:
					"Active Connections\r\n" +
					"  Proto  Local Address          Foreign Address        State           PID\r\n" +
					"  TCP    0.0.0.0:3100           0.0.0.0:0              LISTENING       4321\r\n" +
					"  TCP    0.0.0.0:31000          0.0.0.0:0              LISTENING       9999\r\n" +
					"  TCP    127.0.0.1:3100         127.0.0.1:50000        ESTABLISHED     1111\r\n",
				stderr: "",
			};
		};
		const pids = await findOccupantPids(3100, { platform: "win32", execFileFn: execFileMock });
		// Only the LISTENING socket on exactly :3100 counts — not :31000,
		// not the established connection.
		assert.deepEqual(pids, [4321]);
		assert.equal(calls[0][0], "netstat");
	});

	it("returns an empty list when netstat shows no listener", async () => {
		const execFileMock = async () => ({ stdout: "Active Connections\r\n", stderr: "" });
		const pids = await findOccupantPids(3100, { platform: "win32", execFileFn: execFileMock });
		assert.deepEqual(pids, []);
	});
});

describe("freePort", () => {
	it("is a no-op reporting alreadyFree when the port is free", async () => {
		let execCalls = 0;
		const execFileMock = async () => {
			execCalls += 1;
			return { stdout: "", stderr: "" };
		};
		const result = await freePort(3100, {
			platform: "linux",
			execFileFn: execFileMock,
			isOccupiedFn: async () => false,
		});
		assert.equal(result.ok, true);
		assert.equal(result.alreadyFree, true);
		assert.equal(result.port, 3100);
		assert.equal(execCalls, 0);
	});

	it("terminates the occupant and reports freed when the port releases", async () => {
		const killed = [];
		// Occupied on the first two probes, free after the SIGTERM.
		let probes = 0;
		const result = await freePort(3100, {
			platform: "linux",
			execFileFn: async () => ({ stdout: "1234\n", stderr: "" }),
			isOccupiedFn: async () => {
				probes += 1;
				return probes <= 2;
			},
			killFn: (pid, signal) => {
				killed.push([pid, signal]);
			},
			sleepFn: async () => {},
		});
		assert.equal(result.ok, true);
		assert.equal(result.freed, true);
		assert.deepEqual(result.pids, [1234]);
		assert.deepEqual(killed, [[1234, "SIGTERM"]]);
	});

	it("escalates to SIGKILL when the occupant ignores SIGTERM", async () => {
		const killed = [];
		let probes = 0;
		const result = await freePort(3100, {
			platform: "linux",
			termWaitMs: 50,
			killWaitMs: 50,
			pollIntervalMs: 5,
			execFileFn: async () => ({ stdout: "1234\n", stderr: "" }),
			// Occupied until the SIGKILL lands (third probe onwards is free).
			isOccupiedFn: async () => {
				probes += 1;
				return killed.filter(([, signal]) => signal === "SIGKILL").length === 0;
			},
			killFn: (pid, signal) => {
				killed.push([pid, signal]);
			},
			sleepFn: async () => {},
		});
		assert.equal(result.ok, true);
		assert.deepEqual(
			killed.map(([, signal]) => signal),
			["SIGTERM", "SIGKILL"],
		);
	});

	it("never kills its own process", async () => {
		const killed = [];
		const result = await freePort(3100, {
			platform: "linux",
			execFileFn: async () => ({ stdout: `${process.pid}\n`, stderr: "" }),
			isOccupiedFn: async () => true,
			killFn: (pid, signal) => {
				killed.push([pid, signal]);
			},
			sleepFn: async () => {},
			termWaitMs: 10,
			killWaitMs: 10,
			pollIntervalMs: 1,
		});
		assert.equal(result.ok, false);
		assert.deepEqual(killed, []);
		assert.match(result.error, /own process|current process/i);
	});

	it("fails with an actionable error when the port never releases", async () => {
		const result = await freePort(3100, {
			platform: "linux",
			execFileFn: async () => ({ stdout: "1234\n", stderr: "" }),
			isOccupiedFn: async () => true,
			killFn: () => {},
			sleepFn: async () => {},
			termWaitMs: 10,
			killWaitMs: 10,
			pollIntervalMs: 1,
		});
		assert.equal(result.ok, false);
		assert.match(result.error, /3100/);
		assert.match(result.error, /1234/);
	});

	it("fails with an actionable error when no occupant pid is found", async () => {
		const result = await freePort(3100, {
			platform: "linux",
			execFileFn: async () => ({ stdout: "", stderr: "" }),
			isOccupiedFn: async () => true,
			killFn: () => {},
			sleepFn: async () => {},
		});
		assert.equal(result.ok, false);
		assert.match(result.error, /3100/);
	});

	it("terminates a verified occupant when verifyFn approves it", async () => {
		const killed = [];
		const seen = [];
		let probes = 0;
		const result = await freePort(3100, {
			platform: "linux",
			execFileFn: async () => ({ stdout: "1234\n", stderr: "" }),
			isOccupiedFn: async () => {
				probes += 1;
				return probes <= 2;
			},
			verifyFn: async (pid, port) => {
				seen.push([pid, port]);
				return true;
			},
			killFn: (pid, signal) => {
				killed.push([pid, signal]);
			},
			sleepFn: async () => {},
		});
		assert.equal(result.ok, true);
		assert.deepEqual(result.pids, [1234]);
		assert.deepEqual(seen, [[1234, 3100]]);
		assert.deepEqual(killed, [[1234, "SIGTERM"]]);
	});

	it("refuses to kill any occupant when verifyFn rejects it", async () => {
		const killed = [];
		const result = await freePort(3100, {
			platform: "linux",
			execFileFn: async () => ({ stdout: "1234\n5678\n", stderr: "" }),
			isOccupiedFn: async () => true,
			// A two-occupant port: one verified, one not. The whole operation
			// must abort so the caller is never left with a half-freed port.
			verifyFn: async (pid) => pid === 1234,
			killFn: (pid, signal) => {
				killed.push([pid, signal]);
			},
			sleepFn: async () => {},
		});
		assert.equal(result.ok, false);
		assert.deepEqual(killed, []);
		assert.deepEqual(result.unverifiedPids, [5678]);
		assert.match(result.error, /refusing to terminate/i);
		assert.match(result.error, /5678/);
	});

	it("treats a throwing verifyFn as unverified instead of killing", async () => {
		const killed = [];
		const result = await freePort(3100, {
			platform: "linux",
			execFileFn: async () => ({ stdout: "1234\n", stderr: "" }),
			isOccupiedFn: async () => true,
			verifyFn: async () => {
				throw new Error("probe raced process exit");
			},
			killFn: (pid, signal) => {
				killed.push([pid, signal]);
			},
			sleepFn: async () => {},
		});
		assert.equal(result.ok, false);
		assert.deepEqual(killed, []);
		assert.deepEqual(result.unverifiedPids, [1234]);
	});
});
