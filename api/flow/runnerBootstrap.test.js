import { describe, it, expect } from "vitest";
import { resolveRunnerBootstrap } from "./runnerBootstrap.js";

const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const fresh = new Date(NOW - 5000).toISOString();
const stale = new Date(NOW - 600000).toISOString();

describe("resolveRunnerBootstrap", () => {
	it("reports an empty fleet with an install-runner next action", () => {
		const out = resolveRunnerBootstrap([], { now: NOW });
		expect(out.total).toBe(0);
		expect(out.hasApprovedRunner).toBe(false);
		expect(out.hasPendingRunner).toBe(false);
		expect(out.hasFreshRunner).toBe(false);
		expect(out.nextAction).toBe("install-runner");
		expect(out.nextActionDetail).toMatch(/install/i);
	});

	it("waits honestly for the install-expected runner before it checks in", () => {
		const out = resolveRunnerBootstrap([], {
			now: NOW,
			expectedRunnerId: "local-pi",
		});
		expect(out.nextAction).toBe("wait-for-runner");
		expect(out.expectedRunnerId).toBe("local-pi");
		expect(out.expectedRunnerSeen).toBe(false);
		expect(out.nextActionDetail).toContain("local-pi");
	});

	it("asks for approval when a runner is pending", () => {
		const out = resolveRunnerBootstrap(
			[{ runnerId: "local-pi", status: "pending", lastSeenAt: null }],
			{ now: NOW },
		);
		expect(out.pending).toBe(1);
		expect(out.hasPendingRunner).toBe(true);
		expect(out.hasApprovedRunner).toBe(false);
		expect(out.nextAction).toBe("approve-runner");
	});

	it("reports healthy when an active runner was seen recently", () => {
		const out = resolveRunnerBootstrap(
			[{ runnerId: "local-pi", status: "active", lastSeenAt: fresh }],
			{ now: NOW, staleAfterMs: 60000 },
		);
		expect(out.active).toBe(1);
		expect(out.hasApprovedRunner).toBe(true);
		expect(out.hasFreshRunner).toBe(true);
		expect(out.nextAction).toBe("none");
	});

	it("asks for a restart when the approved runner went silent", () => {
		const out = resolveRunnerBootstrap(
			[{ runnerId: "local-pi", status: "active", lastSeenAt: stale }],
			{ now: NOW, staleAfterMs: 60000 },
		);
		expect(out.hasApprovedRunner).toBe(true);
		expect(out.hasFreshRunner).toBe(false);
		expect(out.nextAction).toBe("start-runner");
	});

	it("ignores malformed records instead of crashing", () => {
		const out = resolveRunnerBootstrap([null, "x", { status: "pending" }], {
			now: NOW,
		});
		expect(out.total).toBe(1);
		expect(out.nextAction).toBe("approve-runner");
	});

	it("treats denied/revoked-only fleets as needing a fresh runner", () => {
		const out = resolveRunnerBootstrap(
			[
				{ runnerId: "a", status: "denied", lastSeenAt: null },
				{ runnerId: "b", status: "revoked", lastSeenAt: stale },
			],
			{ now: NOW },
		);
		expect(out.nextAction).toBe("install-runner");
	});
});
