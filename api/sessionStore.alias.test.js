import { describe, it, expect, vi } from "vitest";
import { SessionStore } from "./sessionStore.js";
import { selectAliasTarget } from "./aliasSelector.js";
import {
	registerHarness,
	hasHarness,
} from "./agent/harnessRegistry.js";

/***
 * MARK: sessionStore model-alias tests
 * @description Pins the session layer's half of alias dispatch: a project
 *   default on the virtual `alias` harness creates its session on the
 *   alias's concrete harness, unknown/deleted project aliases fall back
 *   through the existing loud unknown-harness path (never a crash), and the
 *   `alias` id stays reserved (registering it throws).
 ***/

let unique = 1000;
const nextId = (prefix) => `${prefix}-${++unique}`;

function registerSpyHarness() {
	const name = nextId("alias-fake-harness");
	const createSession = vi.fn(async (project) => ({ project }));
	registerHarness(
		name,
		() => ({
			createSession,
			modelRuntime: async () => null,
		}),
		{ description: "sessionStore alias test harness" },
	);
	return { name, createSession };
}

describe("sessionStore project-level alias resolution", () => {
	it("creates the session on the alias target harness", async () => {
		const fake = registerSpyHarness();
		const store = new SessionStore({});
		const project = {
			id: nextId("proj"),
			cwd: "/tmp/alias-proj",
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: fake.name, model: "m" }],
		};
		const resolved = store._resolveHarness(project);
		expect(resolved.name).toBe(fake.name);
		expect(hasHarness(fake.name)).toBe(true);
	});

	it("rotates a weighted project-default alias across target harnesses", async () => {
		const first = registerSpyHarness();
		const second = registerSpyHarness();
		const store = new SessionStore({});
		const project = {
			id: nextId("proj"),
			cwd: "/tmp/alias-proj-weighted",
			harness: "alias",
			defaultModel: "mix",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: first.name, model: "m1", percent: 50 },
						{ harness: second.name, model: "m2", percent: 50 },
					],
				},
			],
		};
		const seen = new Set();
		for (let i = 0; i < 10; i++) {
			seen.add(store._resolveHarness(project).name);
		}
		expect([...seen].sort()).toEqual([first.name, second.name].sort());
	});

	it("peeks without consuming the rotation", async () => {
		const first = registerSpyHarness();
		const second = registerSpyHarness();
		const store = new SessionStore({});
		const project = {
			id: nextId("proj"),
			cwd: "/tmp/alias-proj-peek",
			harness: "alias",
			defaultModel: "mix",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: first.name, model: "m1", percent: 50 },
						{ harness: second.name, model: "m2", percent: 50 },
					],
				},
			],
		};
		const peeked = store._resolveHarness(project, undefined, { peek: true }).name;
		for (let i = 0; i < 5; i++) {
			expect(store._resolveHarness(project, undefined, { peek: true }).name).toBe(
				peeked,
			);
		}
		expect(store._resolveHarness(project).name).toBe(peeked);
	});

	it("getHarness forwards peek so display reads never consume the rotation", async () => {
		const first = registerSpyHarness();
		const second = registerSpyHarness();
		const store = new SessionStore({});
		const project = {
			id: nextId("proj"),
			cwd: "/tmp/alias-proj-getharness-peek",
			harness: "alias",
			defaultModel: "mix",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: first.name, model: "m1", percent: 50 },
						{ harness: second.name, model: "m2", percent: 50 },
					],
				},
			],
		};
		const peeked = store.getHarness(project, undefined, { peek: true });
		for (let i = 0; i < 5; i++) {
			expect(store.getHarness(project, undefined, { peek: true })).toBe(peeked);
		}
		// The live rotation still serves the peeked target first (peeks
		// consumed nothing), then alternates on the next live dispatch.
		expect(store._resolveHarness(project).harness).toBe(peeked);
		expect(store._resolveHarness(project).harness).not.toBe(peeked);
	});

	it("falls back loudly when the project alias is unknown", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const store = new SessionStore({});
			const project = {
				id: nextId("proj"),
				cwd: "/tmp/alias-proj-missing",
				harness: "alias",
				defaultModel: "ghost",
				modelAliases: [],
			};
			const resolved = store._resolveHarness(project);
			// Unknown alias degrades to the built-in default — a session is
			// still created, loudly (the warning names the alias; the
			// companion test below pins the wording).
			expect(resolved.name).toBe("pi");
			expect(warnSpy).toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("names the alias when every target sits on an unknown harness", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const store = new SessionStore({});
			const project = {
				id: nextId("proj"),
				cwd: "/tmp/alias-proj-unknowntargets",
				harness: "alias",
				defaultModel: "retired",
				modelAliases: [
					{
						name: "retired",
						targets: [
							{ harness: "no-such-a", model: "m1", percent: 50 },
							{ harness: "no-such-b", model: "m2", percent: 50 },
						],
					},
				],
			};
			const resolved = store._resolveHarness(project);
			expect(resolved.name).toBe("pi");
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(lines.some((line) => line.includes('"retired"'))).toBe(true);
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("names '(blank)' when the project alias name is blank", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const store = new SessionStore({});
			const project = {
				id: nextId("proj"),
				cwd: "/tmp/alias-proj-blank",
				harness: "alias",
				defaultModel: "   ",
				modelAliases: [{ name: "small", harness: "pi", model: "m" }],
			};
			const resolved = store._resolveHarness(project);
			expect(resolved.name).toBe("pi");
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(lines.some((line) => line.includes('"(blank)"'))).toBe(true);
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("names the alias (never the virtual harness) when the project alias is unknown", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const store = new SessionStore({});
			const project = {
				id: nextId("proj"),
				cwd: "/tmp/alias-proj-ghost",
				harness: "alias",
				defaultModel: "ghost",
				modelAliases: [],
			};
			const resolved = store._resolveHarness(project);
			expect(resolved.name).toBe("pi");
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(lines.some((line) => line.includes('"ghost"'))).toBe(true);
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});
});

describe("alias harness id reservation", () => {
	it("refuses to register a real harness as 'alias'", () => {
		expect(() =>
			registerHarness("alias", () => ({}), { description: "collision" }),
		).toThrow(/reserved for per-project model aliases/);
	});
});

describe("resolveDisplayHarness delegation", () => {
	it("matches the raw override path for a plain project and stage", () => {
		const store = new SessionStore({});
		const project = { id: nextId("proj"), cwd: "/tmp/disp", harness: "pi" };
		for (const stage of [
			undefined,
			{},
			{ harness: "" },
			{ harness: "custom" },
		]) {
			const viaDisplay = store.resolveDisplayHarness(project, stage, {
				peek: true,
			});
			const viaRaw = store._resolveHarness(project, stage?.harness, {
				peek: true,
			});
			expect(viaDisplay.name).toBe(viaRaw.name);
			expect(viaDisplay.harness).toBe(viaRaw.harness);
		}
	});

	it("matches the raw override path for a project-level alias", () => {
		const fake = registerSpyHarness();
		const store = new SessionStore({});
		const project = {
			id: nextId("proj"),
			cwd: "/tmp/disp-alias",
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: fake.name, model: "m" }],
		};
		for (const stage of [undefined, {}, { harness: "" }]) {
			const viaDisplay = store.resolveDisplayHarness(project, stage, {
				peek: true,
			});
			const viaRaw = store._resolveHarness(project, stage?.harness, {
				peek: true,
			});
			expect(viaDisplay.name).toBe(fake.name);
			expect(viaDisplay.harness).toBe(viaRaw.harness);
		}
	});

	it("honors the pinned test harness like the raw path", () => {
		const pinned = { createSession: async () => ({}) };
		const store = new SessionStore({ harness: pinned });
		const project = { id: nextId("proj"), harness: "pi" };
		const viaDisplay = store.resolveDisplayHarness(
			project,
			{ harness: "custom" },
			{ peek: true },
		);
		expect(viaDisplay.harness).toBe(pinned);
		expect(viaDisplay.name).toBe(
			store._resolveHarness(project, "custom", { peek: true }).name,
		);
	});
});

describe("resolveDisplayHarness stage alias refs", () => {
	it("resolves a stage alias ref to the concrete target harness without warning", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const fake = registerSpyHarness();
			const store = new SessionStore({});
			const project = {
				id: nextId("proj"),
				cwd: "/tmp/disp-stage",
				harness: "pi",
				modelAliases: [{ name: "small", harness: fake.name, model: "m" }],
			};
			const resolved = store.resolveDisplayHarness(
				project,
				{ id: "s1", harness: "alias", model: "small" },
				{ peek: true },
			);
			expect(resolved.name).toBe(fake.name);
			expect(warnSpy).not.toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("falls back loudly naming the alias when the stage alias is unknown", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const store = new SessionStore({});
			const project = {
				id: nextId("proj"),
				cwd: "/tmp/disp-ghost",
				harness: "pi",
				modelAliases: [],
			};
			const resolved = store.resolveDisplayHarness(
				project,
				{ id: "s1", harness: "alias", model: "ghost" },
				{ peek: true },
			);
			expect(resolved.name).toBe("pi");
			expect(warnSpy).toHaveBeenCalled();
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(lines.some((line) => line.includes('"ghost"'))).toBe(true);
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("names the project harness actually shown when the stage alias is unknown", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const store = new SessionStore({});
			const project = {
				id: nextId("proj"),
				cwd: "/tmp/disp-custom",
				harness: "custom",
				modelAliases: [],
			};
			const resolved = store.resolveDisplayHarness(
				project,
				{ id: "s1", harness: "alias", model: "ghost" },
				{ peek: true },
			);
			expect(resolved.name).toBe("custom");
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(
				lines.some((line) =>
					line.includes('Unknown model alias "ghost"'),
				),
			).toBe(true);
			expect(
				lines.some((line) => line.includes('falling back to "custom"')),
			).toBe(true);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("falls back loudly naming '(blank)' when the stage alias name is blank", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const store = new SessionStore({});
			const project = {
				id: nextId("proj"),
				cwd: "/tmp/disp-blank",
				harness: "pi",
				modelAliases: [{ name: "small", harness: "pi", model: "m" }],
			};
			const resolved = store.resolveDisplayHarness(
				project,
				{ id: "s1", harness: "alias", model: "  " },
				{ peek: true },
			);
			expect(resolved.name).toBe("pi");
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(lines.some((line) => line.includes('"(blank)"'))).toBe(true);
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("never consumes a weighted rotation step across repeated display reads", () => {
		const first = registerSpyHarness();
		const second = registerSpyHarness();
		const store = new SessionStore({});
		const project = {
			id: nextId("proj"),
			cwd: "/tmp/disp-peek",
			harness: "pi",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: first.name, model: "m1", percent: 50 },
						{ harness: second.name, model: "m2", percent: 50 },
					],
				},
			],
		};
		const stage = { id: "s1", harness: "alias", model: "mix" };
		const seen = new Set();
		for (let i = 0; i < 6; i++) {
			seen.add(
				store.resolveDisplayHarness(project, stage, { peek: true }).name,
			);
		}
		// Every peek reports the same upcoming target (no rotation consumed).
		expect(seen.size).toBe(1);
		// The live rotation still serves the peeked target first, then moves on.
		const [peekedName] = [...seen];
		const liveFirst = selectAliasTarget(project, "mix", {
			isHarnessKnown: () => true,
		});
		expect(liveFirst.harness).toBe(peekedName);
		const liveSecond = selectAliasTarget(project, "mix", {
			isHarnessKnown: () => true,
		});
		expect(liveSecond.harness).not.toBe(peekedName);
	});
});
