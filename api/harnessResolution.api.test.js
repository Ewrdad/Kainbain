import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: point the stores at throwaway roots BEFORE the app (and every
// store it constructs at import time) is loaded, so the smoke fixture can
// never touch the live projects root or the live SilverBullet notes space.
// Mirrors the mkdtemp + rmSync convention used by projectStore.test.js.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const { default: app } = await import("./index.js");
const { sessionStore } = await import("./sessionStore.js");
const { eventBridge } = await import("./eventBridge.js");
const { resolveHarnessForProject } = await import(
	"./agent/harnessRegistry.js"
);

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/**
 * MARK: Harness resolution API smoke
 * @description End-to-end proof (through the real app, no long-lived server)
 *   that a project with an UNKNOWN harness id: provisions fine, resolves its
 *   harness through the registry with a visible [SYSTEM] warning on the
 *   project's process-log wire (the activity console), still gets compute
 *   (start/stop session cycle), and the models route stays served by the
 *   configured harness. The default pi harness's createSession is spied so no
 *   real pi session is spun up.
 */

const capturedWireMessages = [];

beforeAll(async () => {
	await app.ready();
	// Attach a fake activity-console socket so the [SYSTEM] warning broadcast
	// can be asserted exactly as the frontend would receive it.
	const fakeSocket = {
		readyState: 1,
		send: (message) => capturedWireMessages.push(message),
	};
	eventBridge.subscribe("smoke-socket-set", fakeSocket);
});

afterAll(() => {
	eventBridge.unsubscribe("smoke-socket-set");
});

describe("per-project harness resolution (API smoke)", () => {
	it("provisions a project with an unknown harness, warns on the process log wire, and still serves compute", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const createSessionSpy = vi.spyOn(
			resolveHarnessForProject({ id: "system-probe" }).harness,
			"createSession",
		);

		// 1. Create a project choosing a harness that does not exist.
		const createRes = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Bogus Harness Smoke", harness: "bogus-smoke-harness" },
		});
		expect(createRes.statusCode).toBe(201);
		const project = JSON.parse(createRes.payload);
		expect(project.harness).toBe("bogus-smoke-harness");

		// 2. The production resolution path (session store → registry) falls
		//    back to the default harness and broadcasts the warning to the
		//    project's process log (the wire message the Logs tab renders).
		const harness = sessionStore.getHarness(project);
		expect(harness).toBeTruthy();

		const warningMessage = capturedWireMessages.find((m) =>
			m.includes("Unknown harness"),
		);
		expect(warningMessage).toBeTruthy();
		const parsed = JSON.parse(warningMessage);
		expect(parsed.payload.chunk).toContain(
			'[SYSTEM] Unknown harness "bogus-smoke-harness"',
		);
		expect(parsed.payload.chunk).toContain('falling back to "pi"');
		expect(parsed.sessionId).toBe(project.id);
		expect(warnSpy).toHaveBeenCalled();

		// 3. Compute still works end-to-end for the bogus-harness project.
		const startRes = await app.inject({
			method: "POST",
			url: "/compute/start",
			payload: { projectId: project.id },
		});
		expect(startRes.statusCode).toBe(200);
		expect(JSON.parse(startRes.payload).running).toBe(true);

		const stopRes = await app.inject({
			method: "POST",
			url: "/compute/stop",
			payload: { projectId: project.id },
		});
		expect(stopRes.statusCode).toBe(200);
		expect(JSON.parse(stopRes.payload).running).toBe(false);

		// 4. The models route stays served through the configured harness —
		//    the fallback resolution never breaks model discovery.
		const modelsRes = await app.inject({
			method: "GET",
			url: "/compute/models",
		});
		expect(modelsRes.statusCode).toBe(200);
		expect(JSON.parse(modelsRes.payload).models.length).toBeGreaterThan(0);
	});
});