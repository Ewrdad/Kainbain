/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ProjectStore,
	APP_STATUS_VALUES,
	normalizeAppStatus,
} from "./projectStore.js";

/***
 * MARK: appStatus store tests
 * @description Verifies the "Go to App" link record: tolerant normalization,
 *   strict partial updates with explicit clearing, and round-trip persistence
 *   through .kainbain/project.json (including restart-safe rescan).
 ***/
describe("normalizeAppStatus", () => {
	it("normalizes a full record and resolves the LAN URL", () => {
		expect(
			normalizeAppStatus({
				url: "http://localhost:5173",
				networkHost: "home.home",
				status: "starting",
				healthEndpoint: "/health",
			}),
		).toMatchObject({
			url: "http://localhost:5173",
			networkHost: "home.home",
			resolvedUrl: "http://home.home:5173/",
			status: "starting",
			healthEndpoint: "/health",
		});
	});

	it("defaults a missing or unknown status to running", () => {
		expect(normalizeAppStatus({ url: "http://localhost:3000" }).status).toBe(
			"running",
		);
		expect(
			normalizeAppStatus({ url: "http://localhost:3000", status: "exploding" })
				.status,
		).toBe("running");
		expect(APP_STATUS_VALUES).toContain("running");
	});

	it("prefixes a bare health endpoint with a slash", () => {
		expect(
			normalizeAppStatus({
				url: "http://localhost:3000",
				healthEndpoint: "health",
			}).healthEndpoint,
		).toBe("/health");
	});

	it("degrades garbage to no link instead of throwing", () => {
		expect(normalizeAppStatus(undefined)).toBeUndefined();
		expect(normalizeAppStatus(null)).toBeUndefined();
		expect(normalizeAppStatus("http://localhost:3000")).toBeUndefined();
		expect(normalizeAppStatus({})).toBeUndefined();
		expect(normalizeAppStatus({ url: "javascript:alert(1)" })).toBeUndefined();
		expect(normalizeAppStatus({ url: "/relative" })).toBeUndefined();
	});

	it("drops a malformed override but keeps the link", () => {
		const normalized = normalizeAppStatus({
			url: "http://localhost:3000",
			networkHost: "not a host",
		});
		expect(normalized.url).toBe("http://localhost:3000");
		expect(normalized.networkHost).toBeUndefined();
	});

	it("preserves health probe bookkeeping when present", () => {
		const normalized = normalizeAppStatus({
			url: "http://localhost:3000",
			lastUpdated: "2026-10-04T16:00:00.000Z",
			lastHealthCheck: "2026-10-04T16:05:00.000Z",
			isHealthy: false,
		});
		expect(normalized.lastUpdated).toBe("2026-10-04T16:00:00.000Z");
		expect(normalized.lastHealthCheck).toBe("2026-10-04T16:05:00.000Z");
		expect(normalized.isHealthy).toBe(false);
	});
});

describe("ProjectStore appStatus persistence", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-appstatus-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-appstatus-notes-"),
		);
		store = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: false,
		});
	});

	afterEach(() => {
		try {
			fs.rmSync(tempProjectsDir, { recursive: true, force: true });
			fs.rmSync(tempNotesDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("creates a project without a link by default", () => {
		const project = store.createProject({ name: "No Link" });
		expect(project.appStatus).toBeUndefined();
		const saved = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			),
		);
		expect("appStatus" in saved).toBe(false);
	});

	it("accepts an initial link on create and persists it", () => {
		const project = store.createProject({
			name: "Linked",
			appStatus: {
				url: "http://localhost:5173",
				networkHost: "home.home",
				status: "starting",
			},
		});
		expect(project.appStatus).toMatchObject({
			url: "http://localhost:5173",
			resolvedUrl: "http://home.home:5173/",
			status: "starting",
		});
		const saved = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			),
		);
		expect(saved.appStatus.url).toBe("http://localhost:5173");
	});

	it("merges partial updates and stamps lastUpdated", () => {
		const project = store.createProject({ name: "Partial" });
		const first = store.updateAppStatus(project.id, {
			url: "http://localhost:3000",
		});
		expect(first.appStatus.status).toBe("running");
		expect(first.appStatus.lastUpdated).toBeTruthy();
		const second = store.updateAppStatus(project.id, {
			status: "degraded",
			healthEndpoint: "/healthz",
		});
		expect(second.appStatus).toMatchObject({
			url: "http://localhost:3000",
			status: "degraded",
			healthEndpoint: "/healthz",
		});
	});

	it("returns null for an unknown project", () => {
		expect(store.updateAppStatus("nope", { url: "http://localhost:1" })).toBeNull();
	});

	it("refuses malformed writes with a 400", () => {
		const project = store.createProject({ name: "Strict" });
		expect(() =>
			store.updateAppStatus(project.id, { url: "javascript:alert(1)" }),
		).toThrowError(expect.objectContaining({ statusCode: 400 }));
		expect(() =>
			store.updateAppStatus(project.id, {
				url: "http://localhost:3000",
				status: "exploding",
			}),
		).toThrowError(expect.objectContaining({ statusCode: 400 }));
		expect(() =>
			store.updateAppStatus(project.id, {
				url: "http://localhost:3000",
				networkHost: "not a host",
			}),
		).toThrowError(expect.objectContaining({ statusCode: 400 }));
		// Failed writes leave no half-written link behind.
		expect(store.getProject(project.id).appStatus).toBeUndefined();
	});

	it("clears the link on an explicit null url", () => {
		const project = store.createProject({
			name: "Clear Me",
			appStatus: { url: "http://localhost:3000" },
		});
		const cleared = store.updateAppStatus(project.id, { url: null });
		expect(cleared.appStatus).toBeUndefined();
		const saved = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			),
		);
		expect("appStatus" in saved).toBe(false);
	});

	it("clears just the override on a blank networkHost", () => {
		const project = store.createProject({
			name: "Keep Link",
			appStatus: { url: "http://localhost:3000", networkHost: "home.home" },
		});
		const updated = store.updateAppStatus(project.id, { networkHost: "" });
		expect(updated.appStatus.url).toBe("http://localhost:3000");
		expect(updated.appStatus.networkHost).toBeUndefined();
		expect(updated.appStatus.resolvedUrl).toBe("http://localhost:3000/");
	});

	it("normalizes a full-record replacement through updateProject", () => {
		const project = store.createProject({ name: "Replace" });
		const updated = store.updateProject(project.id, {
			appStatus: { url: "http://localhost:8080", status: "bogus" },
		});
		expect(updated.appStatus).toMatchObject({
			url: "http://localhost:8080",
			status: "running",
		});
	});

	it("restores the link on rescan and degrades a hand-corrupted file", () => {
		const project = store.createProject({
			name: "Rescan",
			appStatus: { url: "http://localhost:4000", status: "starting" },
		});
		const rescanned = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: true,
		});
		expect(rescanned.getProject(project.id).appStatus).toMatchObject({
			url: "http://localhost:4000",
			status: "starting",
		});
		// Hand-corrupt the file: the project still loads, minus the link.
		const configFile = path.join(project.cwd, ".kainbain", "project.json");
		const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
		saved.appStatus = { url: "javascript:alert(1)" };
		fs.writeFileSync(configFile, JSON.stringify(saved));
		const tolerant = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: true,
		});
		expect(tolerant.getProject(project.id).appStatus).toBeUndefined();
		expect(tolerant.getProject(project.id).name).toBe("Rescan");
	});
});
