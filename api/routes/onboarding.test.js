import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: throwaway roots BEFORE the app (and its import-time stores)
// loads, so no fixture touches the live projects root or notes space.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-onboarding-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-onboarding-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/***
 * MARK: Onboarding summary (GET /onboarding)
 * @description Route gate for the first-run summary: an empty install
 *   reports every checklist step open plus its adoptable checkouts;
 *   adopting a project flips the project step without touching the rest.
 ***/
describe("GET /onboarding", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("reports an empty install with open steps and adoptable checkouts", async () => {
		const dir = path.join(tempProjectsRoot, "stray-repo");
		fs.mkdirSync(path.join(dir, ".git"), { recursive: true });

		const res = await app.inject({ method: "GET", url: "/onboarding" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.complete).toBe(false);
		expect(body.projectCount).toBe(0);
		expect(body.taskCount).toBe(0);
		expect(body.hasRun).toBe(false);
		expect(body.steps.map((s) => s.id)).toEqual(["runner", "project", "run"]);
		expect(body.steps.every((s) => s.done === false)).toBe(true);
		expect(body.adoptable).toContainEqual({ path: dir, name: "stray-repo" });
		expect(typeof body.runner.nextAction).toBe("string");
	});

	it("flips the project step once a project is adopted", async () => {
		const dir = path.join(tempProjectsRoot, "stray-repo");
		const adopted = await app.inject({
			method: "POST",
			url: "/projects/register",
			payload: { path: dir },
		});
		expect([200, 201]).toContain(adopted.statusCode);

		const res = await app.inject({ method: "GET", url: "/onboarding" });
		const body = res.json();
		expect(body.projectCount).toBe(1);
		expect(body.steps.find((s) => s.id === "project").done).toBe(true);
		expect(body.steps.find((s) => s.id === "run").done).toBe(false);
		expect(body.complete).toBe(false);
		expect(body.adoptable).not.toContainEqual({ path: dir, name: "stray-repo" });
	});
});
