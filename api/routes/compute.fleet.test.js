import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import. The Runner join token is set before the app (and
// its RunnerRegistry) loads so the register route is enabled in this file.
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token";

const { default: app } = await import("../index.js");

afterAll(() => {
	// isolatedTestRoots temp dirs are per-file; nothing shared to clean.
	void tempProjectsRoot;
	void tempNotesRoot;
});

/***
 * MARK: fleet union catalogue route tests
 * @description Proves the central-list gate end to end over HTTP: after a
 *   single Runner heartbeat, `GET /compute/models` carries the
 *   Runner-advertised id in a union harness section with its key
 *   byte-identical (selectable AND dispatchable), and
 *   `GET /runners/models/catalogue` serves the persisted snapshot
 *   (available entries with harness attribution, malformed ids
 *   quarantined with a reason instead of served).
 ***/
describe("central model catalogue (fleet union over HTTP)", () => {
	beforeAll(async () => {
		await app.ready();
	});

	async function onboard(runnerId, facts) {
		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: { runnerId, joinToken: "test-join-token", facts },
		});
		expect(reg.statusCode).toBe(202);
		const approval = await app.inject({ method: "POST", url: `/runners/${runnerId}/approve` });
		expect(approval.statusCode).toBe(200);
		return JSON.parse(approval.payload).credential;
	}

	async function heartbeat(runnerId, credential, facts) {
		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: { "x-runner-credential": credential },
			payload: { runnerId, facts },
		});
		expect(beat.statusCode).toBe(200);
	}

	it("serves a fleet-only harness id in a union section after one heartbeat", async () => {
		const atMs = Date.now();
		const facts = {
			harnesses: [{ id: "futureharness", version: "9.9.9" }],
			models: ["futureharness::prov::new-model"],
			tiers: ["T0"],
			versions: { protocol: "v1", runner: "test" },
			// The catalogue counts only discovery-confirmed runners: the
			// heartbeat's own scan must list the id on a fresh leg.
			modelProvenance: { "futureharness::prov::new-model": { harness: "futureharness", atMs } },
			discoveryStatus: { futureharness: { ok: true, count: 1, atMs } },
		};
		const credential = await onboard("union-runner-1", facts);
		await heartbeat("union-runner-1", credential, facts);

		const res = await app.inject({ method: "GET", url: "/compute/models?refresh=true" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		const section = body.harnesses.find((h) => h.id === "futureharness");
		expect(section).toBeDefined();
		expect(section.fleetOnly).toBe(true);
		expect(section.models.map((m) => m.key)).toContain("futureharness::prov::new-model");
		const option = section.models.find((m) => m.key === "futureharness::prov::new-model");
		expect(option).toMatchObject({
			id: "new-model",
			provider: "prov",
			harness: "futureharness",
			fleet: true,
			runnerCount: 1,
			available: true,
		});
	});

	it("serves newly heartbeat ids with harness attribution and availability", async () => {
		const atMs = Date.now();
		const confirmed = (models) => ({
			modelProvenance: Object.fromEntries(models.map((m) => [m, { harness: "muse", atMs }])),
			discoveryStatus: { muse: { ok: true, count: models.length, atMs } },
		});
		const base = {
			harnesses: [{ id: "muse", version: "1.4.9" }],
			models: ["muse::meta::muse-spark-1.3"],
			tiers: ["T0", "T1"],
			versions: { protocol: "v1", runner: "test" },
			...confirmed(["muse::meta::muse-spark-1.3"]),
		};
		const credential = await onboard("union-runner-2", base);
		await heartbeat("union-runner-2", credential, {
			...base,
			models: ["muse::meta::muse-spark-1.3", "muse::meta::muse-spark-1.4"],
			...confirmed(["muse::meta::muse-spark-1.3", "muse::meta::muse-spark-1.4"]),
		});

		const res = await app.inject({ method: "GET", url: "/runners/models/catalogue" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		const entry = body.models.find((m) => m.id === "muse::meta::muse-spark-1.4");
		expect(entry).toBeDefined();
		expect(entry).toMatchObject({
			harnesses: ["muse"],
			tiers: ["T0", "T1"],
			runnerCount: 1,
			runnerIds: ["union-runner-2"],
			available: true,
		});
	});

	it("quarantines malformed heartbeat ids with a reason instead of serving them", async () => {
		const facts = {
			harnesses: [{ id: "muse", version: "1.4.9" }],
			models: ["a::b::c::d::e", "muse::meta::muse-spark-1.3"],
			tiers: ["T0"],
			versions: { protocol: "v1", runner: "test" },
		};
		const credential = await onboard("union-runner-3", facts);
		await heartbeat("union-runner-3", credential, facts);

		const res = await app.inject({ method: "GET", url: "/runners/models/catalogue" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.models.map((m) => m.id)).not.toContain("a::b::c::d::e");
		const quarantined = body.quarantined.find((q) => q.id === "a::b::c::d::e");
		expect(quarantined).toBeDefined();
		expect(quarantined.reason).toMatch(/5 segments/);
		expect(quarantined.runnerIds).toContain("union-runner-3");
	});
});
