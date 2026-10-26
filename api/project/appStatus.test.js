import { describe, expect, it } from "vitest";
import { APP_STATUS_VALUES, normalizeAppStatus } from "./appStatus.js";

describe("normalizeAppStatus", () => {
	it("normalizes a safe url", () => {
		expect(normalizeAppStatus({ url: "http://localhost:5173", networkHost: "home.home" })).toMatchObject({
			url: "http://localhost:5173",
			networkHost: "home.home",
			status: "running",
		});
	});

	it("degrades unknown lifecycle states to running", () => {
		expect(normalizeAppStatus({ url: "http://localhost:5173", status: "flying" }).status).toBe(
			"running",
		);
		expect(normalizeAppStatus({ url: "http://localhost:5173", status: "stopped" }).status).toBe(
			"stopped",
		);
	});

	it("rejects unsafe urls", () => {
		expect(normalizeAppStatus({ url: "javascript:alert(1)" })).toBeUndefined();
	});

	it("degrades absent or malformed input to undefined (no link)", () => {
		expect(normalizeAppStatus(undefined)).toBeUndefined();
		expect(normalizeAppStatus(null)).toBeUndefined();
		expect(normalizeAppStatus([])).toBeUndefined();
		expect(normalizeAppStatus("http://localhost:5173")).toBeUndefined();
		expect(normalizeAppStatus({})).toBeUndefined();
	});

	it("slash-prefixes the health endpoint and carries health metadata", () => {
		const out = normalizeAppStatus({
			url: "http://localhost:5173",
			healthEndpoint: "healthz",
			isHealthy: true,
			lastUpdated: "2026-10-22T00:00:00.000Z",
		});
		expect(out).toMatchObject({
			healthEndpoint: "/healthz",
			isHealthy: true,
			lastUpdated: "2026-10-22T00:00:00.000Z",
		});
	});
});

describe("APP_STATUS_VALUES", () => {
	it("contains running", () => {
		expect(APP_STATUS_VALUES).toContain("running");
	});

	it("covers the full lifecycle", () => {
		expect([...APP_STATUS_VALUES].sort()).toEqual(["degraded", "running", "starting", "stopped"]);
	});
});
