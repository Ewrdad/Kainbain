import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertHarnessSessionShape,
	assertHarnessShape,
	harnessLabel,
} from "./harnessContract.js";
import { createReferenceMockSession } from "./sessionContract.test.js";
import { createPiHarness } from "./harnesses/pi/piHarness.js";
import { createMockHarness } from "./harnesses/mock/mockHarness.js";
import { createCustomHarness } from "./harnesses/custom/customHarness.js";
import { createMuseHarness } from "./harnesses/muse/museHarness.js";

/**
 * MARK: harnessContract unit tests
 * @description Verifies the shape gates for the harness contracts:
 *   `assertHarnessSessionShape` accepts contract-conforming sessions and
 *   rejects objects with a precise list of missing required members, and
 *   `assertHarnessShape` / `harnessLabel` govern harness identity metadata
 *   (name/label) so engine log prose is harness-aware, never vendor
 *   hard-coded. Optional members are never required.
 */

describe("assertHarnessSessionShape", () => {
	it("accepts the full reference mock session", () => {
		expect(assertHarnessSessionShape(createReferenceMockSession())).toBe(true);
	});

	it("accepts a minimal session using the classic messages array (no getMessages)", () => {
		expect(
			assertHarnessSessionShape({
				prompt: async () => "ok",
				subscribe: () => () => {},
				messages: [],
				getLastAssistantText: () => "",
				isStreaming: false,
				abort: async () => {},
				dispose: () => {},
			}),
		).toBe(true);
	});

	it("rejects non-objects", () => {
		expect(() => assertHarnessSessionShape(null)).toThrow("must be an object");
		expect(() => assertHarnessSessionShape("session")).toThrow("must be an object");
	});

	it("lists every missing required member in one error", () => {
		let message = "";
		try {
			assertHarnessSessionShape({});
		} catch (e) {
			message = e.message;
		}
		expect(message).toContain("prompt(text)");
		expect(message).toContain("subscribe(handler)");
		expect(message).toContain("getLastAssistantText()");
		expect(message).toContain("abort()");
		expect(message).toContain("dispose()");
		expect(message).toContain("getMessages() or messages[]");
		expect(message).toContain("isStreaming");
	});

	it("ignores optional members being absent", () => {
		const minimal = {
			prompt: async () => "ok",
			subscribe: () => () => {},
			messages: [],
			getLastAssistantText: () => "",
			isStreaming: false,
			abort: async () => {},
			dispose: () => {},
		};
		// steer/compact/getActiveModel/sessionManager etc. are all absent — fine.
		expect(assertHarnessSessionShape(minimal)).toBe(true);
	});
});

describe("harnessLabel", () => {
	it("falls back to 'agent' when no harness is present", () => {
		expect(harnessLabel(undefined)).toBe("agent");
		expect(harnessLabel(null)).toBe("agent");
		expect(harnessLabel({})).toBe("agent");
	});

	it("uses the harness machine name when present (stable log id)", () => {
		// The machine name wins so log prose stays a stable, lowercase, greppable id.
		expect(harnessLabel({ name: "pi", label: "Pi" })).toBe("pi");
	});

	it("falls back to the display label when no name is present", () => {
		expect(harnessLabel({ label: "Pi" })).toBe("Pi");
	});

	it("never returns an empty label", () => {
		expect(harnessLabel({ name: "", label: "" })).toBe("agent");
	});
});

describe("assertHarnessShape", () => {
	it("accepts the production pi harness (identity + createSession)", () => {
		expect(assertHarnessShape(createPiHarness())).toBe(true);
	});

	it("accepts a minimal test-seam harness without identity metadata", () => {
		// A harness without name/label is valid — engine logs degrade to "agent".
		expect(
			assertHarnessShape({ createSession: async () => ({}) }),
		).toBe(true);
	});

	it("accepts a harness carrying well-formed identity metadata", () => {
		expect(
			assertHarnessShape({ name: "pi", label: "Pi", createSession: async () => ({}) }),
		).toBe(true);
	});

	it("rejects non-objects", () => {
		expect(() => assertHarnessShape(null)).toThrow("must be an object");
		expect(() => assertHarnessShape("harness")).toThrow("must be an object");
	});

	it("requires createSession", () => {
		let message = "";
		try {
			assertHarnessShape({ name: "pi" });
		} catch (e) {
			message = e.message;
		}
		expect(message).toContain("createSession(project)");
	});

	it("rejects empty or non-string identity when provided", () => {
		expect(() => assertHarnessShape({ name: "", createSession: async () => ({}) })).toThrow(
			"name must be a non-empty string when provided",
		);
		expect(() => assertHarnessShape({ label: 42, createSession: async () => ({}) })).toThrow(
			"label must be a non-empty string when provided",
		);
	});
});
describe("harness optional-member call guard (regression gate)", () => {
	// Engine code must never invoke the optional AgentHarness.probeHealth member
	// unguarded: a future harness without it must simply not be probed. This
	// grep-style gate (same technique as harnessBoundary.test.js) enforces that
	// every engine call site uses optional chaining or a typeof guard.
	const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const PI_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "pi");
	const MUSE_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "muse");
	const VIBE_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "vibe");
	const MOCK_HARNESS_DIR = path.join(API_ROOT, "agent", "harnesses", "mock");

	function listEngineFiles(dir) {
		const found = [];
		/* eslint-disable security/detect-non-literal-fs-filename -- walking the api tree this module lives in */
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				found.push(...listEngineFiles(full));
			} else if (entry.name.endsWith(".js") && !entry.name.endsWith(".test.js")) {
				found.push(full);
			}
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
		return found;
	}

	it("engine code only calls probeHealth through an optional/typeof guard", () => {
		const offenders = [];
		for (const file of listEngineFiles(API_ROOT)) {
			if (file.startsWith(PI_HARNESS_DIR)) continue; // the pi implementation itself
			if (file.startsWith(MUSE_HARNESS_DIR)) continue; // the muse implementation itself
			if (file.startsWith(VIBE_HARNESS_DIR)) continue; // the vibe implementation itself
			if (file.startsWith(MOCK_HARNESS_DIR)) continue; // the mock implementation itself
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- paths come from the walk above */
			const source = fs.readFileSync(file, "utf8");
			// A bare `harness.probeHealth(` call (no `?.`, no typeof check) is a
			// contract violation. The typeof-guard pattern ("probeHealth" in / typeof
			// x.probeHealth === "function") is always written as a string or a full
			// comparison, never as an immediate call, so scanning for
			// `probeHealth(` NOT preceded by `?.` catches the violations.
			const callSites = source.match(/(?<![?\w])probeHealth\s*\(/g) || [];
			const guarded = source.match(/\?\.\s*probeHealth\s*\(/g) || [];
			if (callSites.length > guarded.length) {
				offenders.push(path.relative(API_ROOT, file));
			}
		}
		expect(
			offenders,
			`unguarded probeHealth calls in: ${offenders.join(", ")}`,
		).toEqual([]);
	});
});

describe("createSession target hand-off (contract semantics)", () => {
	const project = { id: "proj-handoff-contract", name: "Handoff", cwd: "/tmp" };

	it("mock harness pins the handed-off model as the session's active model", async () => {
		const harness = createMockHarness({
			models: [
				{ provider: "mock", id: "m1", key: "mock::m1" },
				{ provider: "mock", id: "m2", key: "mock::m2" },
			],
		});
		const pinned = await harness.createSession(project, {
			taskId: "t1",
			stageId: "s1",
			model: "mock::m2",
		});
		expect(await pinned.getActiveModel()).toMatchObject({ id: "m2" });
		const unpinned = await harness.createSession(project, {
			taskId: "t1",
			stageId: "s1",
		});
		expect(await unpinned.getActiveModel()).toBeNull();
	});

	it("custom harness accepts and ignores the handed-off model", async () => {
		const harness = createCustomHarness({ eventBridge: null });
		const session = await harness.createSession(
			{ ...project, harnessCommand: "echo hi" },
			{ taskId: "t1", stageId: "s1", model: "pi::google::m" },
		);
		expect(typeof session.prompt).toBe("function");
		session.dispose?.();
	});

	it("muse harness accepts and ignores the handed-off model", async () => {
		const harness = createMuseHarness({ museBin: "/definitely/not/a/real/muse" });
		const session = await harness.createSession(project, {
			taskId: "t1",
			stageId: "s1",
			model: "pi::google::m",
		});
		expect(typeof session.prompt).toBe("function");
		session.dispose?.();
	});
});
