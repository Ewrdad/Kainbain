import { describe, it, expect, vi, afterEach } from "vitest";
import { config } from "../config.js";
import {
	DEFAULT_HARNESS,
	registerHarness,
	listHarnesses,
	hasHarness,
	getHarnessByName,
	normalizeHarnessRef,
	resolveHarnessName,
	resolveHarnessForProject,
	createHarnessRegistry,
	resolveHarnessReasoningLevels,
	harnessReasoningLevels,
} from "./harnessRegistry.js";

/**
 * MARK: harnessRegistry unit tests
 * @description Verifies both registry layers: the CONSTRUCTION + SELECTION
 *   registry (built-in pi registration, per-project resolution order
 *   (project > config > default), unknown-name fallback (never throws),
 *   memoization (one factory call per harness name), and
 *   duplicate-registration rejection) and the id-keyed HTTP VIEW registry
 *   behind the /harnesses endpoints (registration, replace-on-re-register,
 *   ordered listing, and null (not throw) for unknown ids).
 */

/** Unique harness names per test so module-level registry state never collides. */
let uniqueName = 0;
const nextName = (prefix) => `${prefix}-${++uniqueName}`;

function fakeBridge() {
	return { emitSystemLog: vi.fn() };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("harness view registry (createHarnessRegistry)", () => {
	function fakeHarness(id) {
		return { id, listModels: async () => [] };
	}

	it("registers and returns an entry by id", () => {
		const registry = createHarnessRegistry();
		const harness = fakeHarness("pi");
		registry.register({
			id: "pi",
			name: "pi coding agent",
			description: "pi-backed AgentHarness",
			capabilities: { createSession: true, listModels: true },
			harness,
		});

		const entry = registry.get("pi");
		expect(entry).toEqual(
			expect.objectContaining({
				id: "pi",
				name: "pi coding agent",
				harness,
			}),
		);
		expect(entry.capabilities.listModels).toBe(true);
	});

	it("returns null for unknown ids instead of throwing", () => {
		const registry = createHarnessRegistry();
		expect(registry.get("nope")).toBeNull();
	});

	it("lists every registered entry in registration order", () => {
		const registry = createHarnessRegistry();
		registry.register({ id: "pi", name: "pi", capabilities: {}, harness: fakeHarness("pi") });
		registry.register({ id: "other", name: "other", capabilities: {}, harness: fakeHarness("other") });

		expect(registry.list().map((e) => e.id)).toEqual(["pi", "other"]);
	});

	it("re-registering an id replaces its entry (first-wins per id)", () => {
		const registry = createHarnessRegistry();
		const replacement = fakeHarness("pi");
		registry.register({ id: "pi", name: "first", capabilities: {}, harness: fakeHarness("pi") });
		registry.register({ id: "pi", name: "second", capabilities: {}, harness: replacement });

		expect(registry.get("pi").name).toBe("second");
		expect(registry.get("pi").harness).toBe(replacement);
		expect(registry.list()).toHaveLength(1);
	});

	it("views are isolated per call so tests never share registration state", () => {
		const a = createHarnessRegistry();
		const b = createHarnessRegistry();
		a.register({ id: "pi", name: "pi", capabilities: {}, harness: fakeHarness("pi") });
		expect(b.get("pi")).toBeNull();
	});
});

describe("harness registry — built-in registration", () => {
	it("registers the built-in pi harness", () => {
		expect(hasHarness("pi")).toBe(true);
		expect(DEFAULT_HARNESS).toBe("pi");
	});

	it("listHarnesses includes pi with a name and description", () => {
		const entries = listHarnesses();
		expect(entries.some((h) => h.name === "pi" && h.description)).toBe(true);
	});

	it("registers the built-in opencode harness", () => {
		expect(hasHarness("opencode")).toBe(true);
		const entries = listHarnesses();
		expect(entries.some((h) => h.name === "opencode" && h.description)).toBe(true);
	});

	it("builds a memoized opencode harness through the registry", () => {
		const first = getHarnessByName("opencode", { eventBridge: fakeBridge() });
		expect(first.id).toBe("opencode");
		expect(getHarnessByName("opencode")).toBe(first);
	});

	it("resolves project.harness = 'opencode' without falling back", () => {
		expect(resolveHarnessName({ harness: "opencode" })).toBe("opencode");
	});

	it("registers the built-in muse harness", () => {
		expect(hasHarness("muse")).toBe(true);
		const entries = listHarnesses();
		expect(entries.some((h) => h.name === "muse" && h.description)).toBe(true);
	});

	it("builds a memoized muse harness through the registry", () => {
		const first = getHarnessByName("muse", { eventBridge: fakeBridge() });
		expect(first.id).toBe("muse");
		expect(getHarnessByName("muse")).toBe(first);
	});

	it("resolves project.harness = 'muse' without falling back", () => {
		expect(resolveHarnessName({ harness: "muse" })).toBe("muse");
	});

	it("hasHarness rejects missing or non-string names", () => {
		expect(hasHarness(undefined)).toBe(false);
		expect(hasHarness("")).toBe(false);
		expect(hasHarness(123)).toBe(false);
		expect(hasHarness(nextName("never-registered"))).toBe(false);
	});

	it("getHarnessByName throws for unregistered names", () => {
		expect(() => getHarnessByName(nextName("nope"))).toThrow(/not registered/);
	});

	it("rejects duplicate registration and invalid registrations", () => {
		const name = nextName("dupe");
		registerHarness(name, () => ({}));
		expect(() => registerHarness(name, () => ({}))).toThrow(/already registered/);
		expect(() => registerHarness("", () => ({}))).toThrow(/non-empty string/);
		expect(() => registerHarness(nextName("bad"), "not-a-function")).toThrow(
			/factory function/,
		);
	});
});

describe("harness support tiers (registration + listHarnesses projection)", () => {
	it("pins the built-in tier of every registered harness", () => {
		const tiers = Object.fromEntries(
			listHarnesses().map((entry) => [entry.name, entry.supportTier]),
		);
		expect(tiers).toMatchObject({
			// In-process pi SDK (the reference AgentHarness) = direct integration.
			pi: "1",
			// OpenCode SDK + server + SSE + steer/abort = two-way programmatic.
			opencode: "2",
			// Two-way ACP programmatic session (steer/abort/permission gates),
			// with per-turn exec fallback when no ACP endpoint is configured.
			antigravity: "2",
			// Two-way MSP programmatic session over `muse serve` (steer/abort,
			// per-request permission interception, live model catalogue), with
			// per-turn exec fallback (KAINBAIN_MUSE_MSP=off).
			muse: "2",
			// Two-way ACP programmatic session over the standalone vibe-acp
			// agent (steer/abort/permission gates, live model catalogue), with
			// per-turn exec fallback (KAINBAIN_VIBE_ACP=off).
			vibe: "2",
			custom: "3",
			// In-process synthetic harness (mechanically Tier 1) — test-only.
			mock: "1",
		});
	});

	it("projects the human tier label + summary for every built-in", () => {
		const byName = Object.fromEntries(listHarnesses().map((entry) => [entry.name, entry]));
		expect(byName.pi).toMatchObject({
			supportTierLabel: "Tier 1",
			supportTierSummary: "Direct integration in KainBain",
		});
		expect(byName.opencode).toMatchObject({
			supportTierLabel: "Tier 2",
			supportTierSummary: "ACP / programmatic invocation",
		});
		expect(byName.antigravity).toMatchObject({
			supportTier: "2",
			supportTierLabel: "Tier 2",
			supportTierSummary: "ACP / programmatic invocation",
		});
	});

	it("marks only the mock harness as test-only", () => {
		const testOnly = listHarnesses().filter((entry) => entry.testOnly).map((e) => e.name);
		expect(testOnly).toEqual(["mock"]);
	});

	it("surfaces an explicitly registered tier in listHarnesses", () => {
		const name = nextName("tiered");
		registerHarness(name, () => ({}), {
			description: "explicitly tiered",
			supportTier: "2",
		});
		const entry = listHarnesses().find((h) => h.name === name);
		expect(entry).toMatchObject({
			supportTier: "2",
			supportTierLabel: "Tier 2",
			supportTierSummary: "ACP / programmatic invocation",
			testOnly: false,
		});
	});

	it("rounds an undeclared tier down to the conservative Tier 4 default", () => {
		const name = nextName("undeclared");
		registerHarness(name, () => ({}));
		const entry = listHarnesses().find((h) => h.name === name);
		expect(entry.supportTier).toBe("4");
		expect(entry.supportTierLabel).toBe("Tier 4");
	});

	it("rejects an unknown declared tier at registration", () => {
		expect(() =>
			registerHarness(nextName("bad-tier"), () => ({}), { supportTier: "0" }),
		).toThrow(/Unknown harness support tier/);
	});
});

describe("harness resolution order (project > config > default)", () => {
	it("prefers the project's own harness choice", () => {
		expect(resolveHarnessName({ harness: "pi" })).toBe("pi");
	});

	it("trims the project's choice so padded values still resolve", () => {
		expect(resolveHarnessName({ harness: "  pi  " })).toBe("pi");
	});

	it("falls back to the configured default when the project does not choose", () => {
		const original = config.defaultHarness;
		try {
			config.defaultHarness = "configured-harness";
			expect(resolveHarnessName({})).toBe("configured-harness");
			expect(resolveHarnessName(undefined)).toBe("configured-harness");
		} finally {
			config.defaultHarness = original;
		}
	});

	it("falls back to the built-in default when neither project nor config choose", () => {
		const original = config.defaultHarness;
		try {
			config.defaultHarness = "";
			expect(resolveHarnessName({})).toBe("pi");
			expect(resolveHarnessName(undefined)).toBe("pi");
		} finally {
			config.defaultHarness = original;
		}
	});

	it("treats whitespace-only project choices as unset", () => {
		const original = config.defaultHarness;
		try {
			config.defaultHarness = "configured-harness";
			expect(resolveHarnessName({ harness: "   " })).toBe("configured-harness");
		} finally {
			config.defaultHarness = original;
		}
	});

	it("treats non-string project choices as unset", () => {
		expect(resolveHarnessName({ harness: 42 })).not.toBe(42);
	});
});

describe("harness resolution order with per-stage override (stage > project > config > default)", () => {
	it("prefers an explicit stage override over the project choice", () => {
		expect(resolveHarnessName({ harness: "pi" }, { harnessName: "custom" })).toBe("custom");
	});

	it("trims the override and treats blank/non-string overrides as inherit", () => {
		expect(resolveHarnessName({ harness: "pi" }, { harnessName: "  custom  " })).toBe("custom");
		expect(resolveHarnessName({ harness: "pi" }, { harnessName: "  " })).toBe("pi");
		expect(resolveHarnessName({ harness: "pi" }, { harnessName: "" })).toBe("pi");
		expect(resolveHarnessName({ harness: "pi" }, {})).toBe("pi");
	});

	it("normalizes harness references (trim or inherit)", () => {
		expect(normalizeHarnessRef("  custom  ")).toBe("custom");
		expect(normalizeHarnessRef("")).toBe("");
		expect(normalizeHarnessRef(null)).toBe("");
		expect(normalizeHarnessRef(42)).toBe("");
	});

	it("resolves a known stage override to that harness (project choice ignored)", () => {
		const project = { id: "proj-override", harness: "pi" };
		const resolved = resolveHarnessForProject(project, {
			harnessName: "custom",
		});
		expect(resolved.name).toBe("custom");
		expect(resolved.harness?.id || resolved.harness?.name).toBe("custom");
	});

	it("an unknown stage override degrades to the project resolution", () => {
		const project = { id: "proj-override-fallback", harness: "custom" };
		const bogus = `bogus-stage-${Date.now()}`;

		const resolved = resolveHarnessForProject(project, {
			harnessName: bogus,
		});

		// Not the built-in default: the project's own (valid) choice wins.
		expect(resolved.name).toBe("custom");
		expect(resolved.harness?.id || resolved.harness?.name).toBe("custom");
	});
});

describe("harnessRegistry — unknown names fall back (never throw)", () => {
	it("falls back to the default harness consistently per project + name", () => {
		const project = { id: "proj-unknown", name: "Unknown Harness Project", harness: "bogus" };

		const first = resolveHarnessForProject(project);
		const second = resolveHarnessForProject(project);

		expect(first.name).toBe("pi");
		expect(first.harness).toBeTruthy();
		expect(second.name).toBe("pi");
		expect(second.harness).toBe(first.harness);
	});

	it("falls back to the default harness for different (project, name) pairs", () => {
		const first = resolveHarnessForProject({ id: "p-a", harness: "bogus-a" });
		const second = resolveHarnessForProject({ id: "p-b", harness: "bogus-b" });
		expect(first.name).toBe("pi");
		expect(second.name).toBe("pi");
		expect(first.harness).toBeTruthy();
		expect(second.harness).toBeTruthy();
	});

	it("falls back when the CONFIGURED default is unknown, not just project choices", () => {
		const original = config.defaultHarness;
		try {
			config.defaultHarness = "bogus-config-default";
			const resolved = resolveHarnessForProject({ id: "proj-config-fallback" });
			expect(resolved.name).toBe("pi");
			expect(resolved.harness).toBeTruthy();
		} finally {
			config.defaultHarness = original;
		}
	});

	it("resolves registered project choices", () => {
		const resolved = resolveHarnessForProject({ id: "proj-ok", harness: "pi" });
		expect(resolved.name).toBe("pi");
	});

	it("resolves a project-agnostic default harness (no project context)", () => {
		const resolved = resolveHarnessForProject();
		expect(resolved.name).toBe("pi");
		expect(resolved.harness).toBeTruthy();
	});
});

describe("harnessRegistry — memoization", () => {
	it("builds one instance per harness name (factory called once)", () => {
		const name = nextName("memo");
		const instance = { marker: name };
		const factory = vi.fn(() => instance);
		registerHarness(name, factory, { description: "memo test harness" });

		const first = getHarnessByName(name);
		const second = getHarnessByName(name);

		expect(first).toBe(instance);
		expect(second).toBe(first);
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it("memoizes registered harnesses resolved per project", () => {
		const name = nextName("memo-project");
		const factory = vi.fn(() => ({ marker: name }));
		registerHarness(name, factory);
		const a = resolveHarnessForProject({ id: "p-memo-1", harness: name }).harness;
		const b = resolveHarnessForProject({ id: "proj-2", harness: name }).harness;
		expect(a).toBe(b);
		expect(factory).toHaveBeenCalledTimes(1);
	});
});

describe("harnessRegistry — resolveHarnessReasoningLevels and harnessReasoningLevels", () => {
	it("resolves advertised reasoning levels by harness name", () => {
		expect(resolveHarnessReasoningLevels("pi")).toEqual([
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]);
		expect(resolveHarnessReasoningLevels("antigravity")).toEqual([
			"low",
			"medium",
			"high",
		]);
		expect(resolveHarnessReasoningLevels("custom")).toBeNull();
		expect(resolveHarnessReasoningLevels("opencode")).toBeNull();
		expect(resolveHarnessReasoningLevels("unknown-harness")).toBeNull();
		expect(resolveHarnessReasoningLevels("none")).toBeNull();
		expect(resolveHarnessReasoningLevels("list")).toBeNull();
	});

	it("resolves through labelled options objects", () => {
		expect(resolveHarnessReasoningLevels({ harnessName: "pi" })).toEqual([
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]);
		expect(resolveHarnessReasoningLevels({ harness: "antigravity" })).toEqual([
			"low",
			"medium",
			"high",
		]);
		expect(resolveHarnessReasoningLevels({ harnessId: "pi" })).toBeTruthy();
		expect(resolveHarnessReasoningLevels({ name: "pi" })).toBeTruthy();
		expect(
			resolveHarnessReasoningLevels({ reasoningLevels: ["test1", "test2"] }),
		).toEqual(["test1", "test2"]);
		expect(resolveHarnessReasoningLevels({})).toBeNull();
		expect(resolveHarnessReasoningLevels(null)).toBeNull();
		expect(resolveHarnessReasoningLevels(undefined)).toBeNull();
	});

	it("returns a defensive copy to prevent mutation of internal harness levels", () => {
		const first = resolveHarnessReasoningLevels("pi");
		first.push("mutated");
		const second = resolveHarnessReasoningLevels("pi");
		expect(second).not.toContain("mutated");
	});

	it("provides harnessReasoningLevels as a canonical alias", () => {
		expect(harnessReasoningLevels("pi")).toEqual(
			resolveHarnessReasoningLevels("pi"),
		);
		expect(harnessReasoningLevels("unknown")).toBeNull();
	});
});
