import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: throwaway roots BEFORE the app (and its import-time stores)
// loads, so no fixture touches the live projects root or notes space.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-discover-routes-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-discover-routes-notes-"),
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
 * MARK: Discover adoptable checkouts (GET /projects/discover)
 * @description Route gate for first-run discovery: unadopted git checkouts
 *   in the scan roots are listed (never created), and adopting one
 *   removes it from the list.
 ***/
describe("GET /projects/discover", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("lists an unadopted checkout, then drops it after adoption", async () => {
		const dir = path.join(tempProjectsRoot, "stray-repo");
		fs.mkdirSync(path.join(dir, ".git"), { recursive: true });

		const before = await app.inject({ method: "GET", url: "/projects/discover" });
		expect(before.statusCode).toBe(200);
		expect(before.json().adoptable).toContainEqual({ path: dir, name: "stray-repo" });
		expect(before.json().roots).toContain(tempProjectsRoot);

		const adopted = await app.inject({
			method: "POST",
			url: "/projects/register",
			payload: { path: dir },
		});
		expect([200, 201]).toContain(adopted.statusCode);

		const after = await app.inject({ method: "GET", url: "/projects/discover" });
		expect(after.json().adoptable).not.toContainEqual({ path: dir, name: "stray-repo" });
	});
});
