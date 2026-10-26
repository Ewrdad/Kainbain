import { config } from "../config.js";
import { eventBridge as sharedEventBridge } from "../eventBridge.js";
import { ALIAS_HARNESS_ID } from "../../shared/modelAliases.js";
import {
 normalizeHarnessSupportTier,
 harnessSupportTierInfo,
} from "./harnessSupportTiers.js";
import { createPiHarness } from "./harnesses/pi/piHarness.js";
import { createAntigravityHarness } from "./harnesses/antigravity/agyHarness.js";
import { createCodexHarness } from "./harnesses/codex/codexHarness.js";
import { createOpencodeHarness } from "./harnesses/opencode/OpencodeHarness.js";
import { createMuseHarness } from "./harnesses/muse/museHarness.js";
import { createVibeHarness } from "./harnesses/vibe/vibeHarness.js";
import {
	createMockHarness,
	HARNESS_ID as HARNESS_ID_MOCK,
	MOCK_MODELS,
} from "./harnesses/mock/mockHarness.js";
import {
 createCustomHarness,
 HARNESS_ID as HARNESS_ID_CUSTOM,
} from "./harnesses/custom/customHarness.js";

/***
 * MARK: harnessRegistry
 * @description The engine's harness registry: the ONE place that knows which
 *   agent harnesses exist and how to build them. Two cooperating layers live
 *   in this module:
 *
 *   1. CONSTRUCTION + SELECTION (module-level singleton). Every harness
 *      registers a factory here; instances are memoized per harness name
 *      (harnesses own harness-level caches such as pi's ModelRuntime, which
 *      must not be rebuilt or shared across harness types). Per-run
 *      selection (see `resolveHarnessForProject`) resolves in this order:
 *        1. `opts.harnessName` (a stage's explicit `stage.harness` override),
 *        2. `project.harness` (a non-empty string the project chose itself),
 *        3. `config.defaultHarness` (env `KAINBAIN_DEFAULT_HARNESS`),
 *        4. the built-in default `"pi"`.
 *      Unknown harness names never crash: the resolution warns once per
 *      (project, name) pair and falls back to the built-in default so projects
 *      with stale or mistyped `harness` values still load and run sessions.
 *
 *   2. HTTP VIEW (`createHarnessRegistry`). The composition root
 *      (`api/index.js`) materializes the default harness once at startup —
 *      the SessionStore already owns the instance, this only asks for it — and
 *      projects it (id, name, description, capabilities, live instance) into
 *      an id-keyed registry handed to the `/harnesses` routes, so the harness
 *      discovery API is a projection over registered data instead of
 *      hardcoded route content. Future harnesses register a factory with the
 *      construction layer AND register their materialized instance with the
 *      composition root's view; the two layers never disagree because both
 *      speak about the same memoized instances.
 *
 *   This module is the ONLY file outside `harnesses/pi/` that may import from
 *   `harnesses/pi/` (locked by the acceptance grep + api/agent/harnessBoundary.test.js).
 */

/** The built-in fallback harness id, used when nothing (valid) is configured. */
export const DEFAULT_HARNESS = "pi";

/** name -> { factory, description } for every registered harness. */
const harnessFactories = new Map();
/** name -> memoized AgentHarness instance (one per harness type). */
const harnessInstances = new Map();
/** `${projectId}:${unknownName}` keys already warned about, so a hot loop cannot spam logs. */
const warnedUnknownHarnesses = new Set();

/***
 * MARK: registerHarness
 * @description Registers a harness factory under a unique name. Built-ins
 *   register once at module load; duplicate names throw so two modules can
 *   never silently fight over the same harness id.
 * @example registerHarness("pi", createPiHarness, { description: "pi coding-agent harness" })
 * @param {string} name - Harness id stored on projects (`project.harness`).
 * @param {Function} factory - `({ eventBridge }) => AgentHarness`.
 * @param {Object} [opts]
 * @param {string} [opts.description] - Human-readable summary surfaced by listHarnesses().
 * @param {string} [opts.supportTier] - Support tier from docs/EngineDetails/HarnessSupportTeirs.md (`1`..`4` or `"unsupported"`); blank/omitted rounds down to the conservative Tier 4 default. Throws on an unknown explicit value.
 * @param {boolean} [opts.testOnly=false] - Marks a test/demo-only harness (e.g. `mock`) so the UI can never mistake it for real AI support.
 * @returns {void}
 ***/
export function registerHarness(
 name,
 factory,
 { description = "", supportTier, testOnly = false } = {},
) {
 if (!name || typeof name !== "string" || !name.trim()) {
  throw new Error("Harness name must be a non-empty string");
 }
 if (name.trim() === ALIAS_HARNESS_ID) {
  throw new Error(
   `Harness name "${ALIAS_HARNESS_ID}" is reserved for per-project model aliases (the virtual alias selector) and cannot be registered as a real harness`,
  );
 }
 if (typeof factory !== "function") {
  throw new Error(`Harness "${name}" must register a factory function`);
 }
 if (harnessFactories.has(name)) {
  throw new Error(`Harness "${name}" is already registered`);
 }
 harnessFactories.set(name, {
  factory,
  description,
  // Throws here (at registration, not at request time) on a typo'd tier.
  supportTier: normalizeHarnessSupportTier(supportTier),
  testOnly: testOnly === true,
 });
}

/***
 * MARK: listHarnesses
 * @description Lists the registered harnesses (id, description, and the
 *   structured support-tier projection) in name order — the payload a future
 *   harness-picker UI would render. `supportTierLabel`/`supportTierSummary`
 *   carry the human wording so consumers never re-derive it from a per-harness
 *   map.
 * @example listHarnesses() => [{ name: 'pi', description: '…', supportTier: '1', supportTierLabel: 'Tier 1', supportTierSummary: 'Direct integration in KainBain', testOnly: false }]
 * @returns {Array<{name: string, description: string, supportTier: string, supportTierLabel: string, supportTierSummary: string, testOnly: boolean}>}
 ***/
export function listHarnesses() {
 return Array.from(harnessFactories, ([name, entry]) => {
  const tier = harnessSupportTierInfo(entry.supportTier);
  return {
   name,
   description: entry.description,
   supportTier: tier.level,
   supportTierLabel: tier.label,
   supportTierSummary: tier.summary,
   testOnly: entry.testOnly === true,
  };
 }).sort((a, b) => a.name.localeCompare(b.name));
}

/***
 * MARK: hasHarness
 * @description Checks whether a harness id is registered.
 * @example hasHarness("pi") => true
 * @param {string} name
 * @returns {boolean}
 ***/
export function hasHarness(name) {
 if (!name || typeof name !== "string") return false;
 return harnessFactories.has(name);
}

/***
 * MARK: harnessModelSelection
 * @description Resolves a harness instance, a registered harness name, or a
 *   literal selection to its modelSelection mode ("none" when the harness
 *   manages its own model, "list" otherwise). Never throws for unknown names
 *   or objects without the field: falls back to "list" to preserve classic
 *   model discovery and selection.
 * @example harnessModelSelection("muse") => "none"
 * @example harnessModelSelection("pi") => "list"
 * @example harnessModelSelection({ modelSelection: "none" }) => "none"
 * @example harnessModelSelection("none") => "none"
 * @param {Object|string|unknown} harnessOrName
 * @returns {"none"|"list"}
 ***/
export function harnessModelSelection(harnessOrName) {
 if (harnessOrName && typeof harnessOrName === "object") {
  return harnessOrName.modelSelection === "none" ? "none" : "list";
 }
 if (typeof harnessOrName === "string") {
  // A literal selection passes through (monitor payload vocabulary).
  if (harnessOrName === "none") return "none";
  if (hasHarness(harnessOrName)) {
   try {
    const harness = getHarnessByName(harnessOrName);
    return harness?.modelSelection === "none" ? "none" : "list";
   } catch {
    return "list";
   }
  }
 }
 return "list";
}

/**
 * MARK: resolveHarnessReasoningLevels
 * @description Resolves a harness instance, a registered harness name, or a
 *   literal selection to its advertised reasoning levels (array of strings)
 *   or null when the harness has no adjustable reasoning. Supports both
 *   positional arguments and labelled options ({ harnessName: "pi" }).
 *   Never throws for unknown names or objects without the field.
 * @example resolveHarnessReasoningLevels("pi") => ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
 * @example resolveHarnessReasoningLevels({ harnessName: "pi" }) => ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
 * @example resolveHarnessReasoningLevels("opencode") => null
 * @example resolveHarnessReasoningLevels({ reasoningLevels: ["low", "high"] }) => ["low", "high"]
 * @param {Object|string|unknown} harnessOrOpts
 * @returns {string[]|null}
 */
export function resolveHarnessReasoningLevels(harnessOrOpts) {
	if (harnessOrOpts && typeof harnessOrOpts === "object") {
		if (Array.isArray(harnessOrOpts.reasoningLevels)) {
			return [...harnessOrOpts.reasoningLevels];
		}
		const name =
			harnessOrOpts.harnessName ||
			harnessOrOpts.harness ||
			harnessOrOpts.harnessId ||
			harnessOrOpts.name;
		if (typeof name === "string") {
			return resolveHarnessReasoningLevels(name);
		}
		return null;
	}
	if (typeof harnessOrOpts === "string") {
		if (harnessOrOpts === "none" || harnessOrOpts === "list") return null;
		if (hasHarness(harnessOrOpts)) {
			try {
				const harness = getHarnessByName(harnessOrOpts);
				const value = harness?.reasoningLevels;
				return Array.isArray(value) ? [...value] : null;
			} catch {
				return null;
			}
		}
	}
	return null;
}

/***
 * MARK: harnessReasoningLevels
 * @description Canonical alias for `resolveHarnessReasoningLevels`: resolves a
 *   harness instance, registered name, or labelled options object to its
 *   advertised reasoning levels (array of strings) or null when the harness
 *   has no adjustable reasoning. Never throws for unknown names.
 * @example harnessReasoningLevels("pi") => ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
 * @example harnessReasoningLevels("opencode") => null
 * @param {Object|string|unknown} harnessOrOpts
 * @returns {string[]|null}
 ***/
export function harnessReasoningLevels(harnessOrOpts) {
	return resolveHarnessReasoningLevels(harnessOrOpts);
}

/***
 * MARK: getHarnessByName
 * @description Returns the memoized harness instance for a registered name,
 *   building it once on first request. Throws for unregistered names —
 *   callers that take harness ids from user data must go through
 *   `resolveHarnessForProject`, which never throws.
 * @example getHarnessByName("pi").createSession(project)
 * @param {string} name
 * @param {Object} [opts]
 * @param {Object} [opts.eventBridge] - Bridge injected into the factory on first build (defaults to the shared event bridge).
 * @returns {Object} The AgentHarness.
 ***/
export function getHarnessByName(name, { eventBridge } = {}) {
 const entry = harnessFactories.get(name);
 if (!entry) {
  throw new Error(`Unknown harness "${name}" — not registered`);
 }
 if (!harnessInstances.has(name)) {
  harnessInstances.set(
   name,
   entry.factory({ eventBridge: eventBridge || sharedEventBridge }),
  );
 }
 return harnessInstances.get(name);
}

/***
 * MARK: normalizeHarnessRef
 * @description Trims a harness reference to its usable form (""
 *   when blank/non-string, i.e. "no explicit choice — inherit").
 * @example normalizeHarnessRef("  custom  ") => "custom"
 * @example normalizeHarnessRef("") => ""
 * @param {unknown} ref - The raw harness reference (project or stage field).
 * @returns {string} The trimmed id, or "" when unset.
 ***/

/***
 * MARK: resolveHarnessName
 * @description Resolves WHICH harness name a run wants, without checking that
 *   it exists: an explicit per-stage override (`opts.harnessName`,
 *   `stage.harness`) wins, then the project's own choice, then the configured
 *   default, then the built-in default. Existence checking + fallback live in
 *   `resolveHarnessForProject` (the single warning point).
 * @example resolveHarnessName({ harness: "pi" }) => "pi"
 * @example resolveHarnessName({}, { harnessName: "custom" }) => "custom"
 * @example resolveHarnessName({}) => config.defaultHarness || "pi"
 * @param {Object} [project] - The project entity (its optional `harness` field).
 * @param {Object} [opts]
 * @param {string} [opts.harnessName] - Explicit per-stage override (blank = inherit).
 * @returns {string} The requested harness name.
 ***/
export function normalizeHarnessRef(ref) {
 return typeof ref === "string" ? ref.trim() : "";
}

export function resolveHarnessName(project, { harnessName } = {}) {
 const fromStage = normalizeHarnessRef(harnessName);
 if (fromStage) return fromStage;
 const fromProject = normalizeHarnessRef(project?.harness);
 if (fromProject) return fromProject;
 const fromConfig =
  typeof config.defaultHarness === "string" ? config.defaultHarness.trim() : "";
 if (fromConfig) return fromConfig;
 return DEFAULT_HARNESS;
}

/***
 * MARK: resolveHarnessForProject
 * @description Resolves the harness a run should execute on and NEVER throws.
 *   Resolution order: explicit per-stage override (`opts.harnessName`,
 *   `stage.harness`) → `project.harness` → `config.defaultHarness` →
 *   the built-in default. An unknown override warns and degrades to the
 *   project's own resolution (so a stage typo runs on the project harness,
 *   not on pi); an unknown project-level name warns and falls back to the
 *   built-in default. Warnings go to console.warn + a [SYSTEM] line in the
 *   project's process log, deduplicated per project + name.
 * @example resolveHarnessForProject(project).harness.createSession(project)
 * @example resolveHarnessForProject(null) // default-configured harness (no project context)
 * @example resolveHarnessForProject(project, { harnessName: "custom" }) // stage override
 * @param {Object} [project] - The project entity (`id`, optional `name`, optional `harness`).
 * @param {Object} [opts]
 * @param {Object} [opts.eventBridge] - Bridge used for harness construction + warnings (defaults to the shared event bridge; tests inject fakes).
 * @param {string} [opts.harnessName] - Explicit per-stage override (blank = inherit the project resolution).
 * @returns {{name: string, harness: Object}} The resolved harness name and instance.
 ***/
export function resolveHarnessForProject(project, { eventBridge, harnessName } = {}) {
 const bridge = eventBridge || sharedEventBridge;
 const override = normalizeHarnessRef(harnessName);
 if (override) {
  if (hasHarness(override)) {
   return {
    name: override,
    harness: getHarnessByName(override, { eventBridge: bridge }),
   };
  }
  // Unknown stage override: warn, then degrade to the project's own
  // resolution (never straight to the built-in default).
  const projectFallback = resolveHarnessName(project);
  warnUnknownHarness(project, override, bridge, projectFallback);
 }
 const requested = resolveHarnessName(project);
 if (hasHarness(requested)) {
  return {
   name: requested,
   harness: getHarnessByName(requested, { eventBridge: bridge }),
  };
 }
 warnUnknownHarness(project, requested, bridge);
 return {
  name: DEFAULT_HARNESS,
  harness: getHarnessByName(DEFAULT_HARNESS, { eventBridge: bridge }),
 };
}

/***
 * MARK: warnUnknownHarness
 * @description Emits the unknown-harness warning once per (project, harness
 *   name) pair so a hot resolution loop cannot spam the process logs.
 * @param {Object} [project]
 * @param {string} requestedName
 * @param {Object} bridge - The event bridge receiving the [SYSTEM] log line.
 * @param {string} [fallbackName] - The harness actually used (defaults to the built-in default).
 * @returns {void}
 ***/
function warnUnknownHarness(project, requestedName, bridge, fallbackName = DEFAULT_HARNESS) {
 const projectId = project?.id || "system";
 const dedupeKey = `${projectId}:${requestedName}`;
 if (warnedUnknownHarnesses.has(dedupeKey)) return;
 warnedUnknownHarnesses.add(dedupeKey);
 const projectLabel = project?.name
  ? `${project.name} (${projectId})`
  : projectId;
 const message = `[SYSTEM] Unknown harness "${requestedName}" for project ${projectLabel}; falling back to "${fallbackName}". Update the project's harness in Settings.`;
 console.warn(message);
 bridge?.emitSystemLog?.(projectId, message);
}

/***
 * MARK: createHarnessRegistry
 * @description Creates an id-keyed VIEW registry over live harness instances
 *   for the composition root and the `/harnesses` HTTP routes. Unlike the
 *   construction registry above it holds no factories and builds nothing:
 *   the composition root materializes each harness (the SessionStore already
 *   owns the default instance) and registers the live entry here, so the
 *   harness discovery API is a projection over registered data instead of
 *   hardcoded route content. Registration is isolated per call (tests get a
 *   fresh view every time) and re-registering an id replaces its entry, so a
 *   composition root can refresh an entry without rebuilding the view.
 * @example
 *   const registry = createHarnessRegistry();
 *   registry.register({ id: "pi", name: "pi coding agent", capabilities: {}, harness });
 *   registry.get("pi")?.harness.listModels();
 * @returns {Object} Registry with `register(entry)`, `get(id)`, `list()`.
 ***/
export function createHarnessRegistry() {
 const harnesses = new Map(); // id -> { id, name, description, capabilities, harness }
 return {
  /***
   * MARK: harnessRegistry.register
   * @description Registers (or replaces) the entry for `entry.id`. The entry
   *   must carry a stable `id`, display `name`, `description`, a
   *   `capabilities` flag map, and the live `harness` instance. The optional
   *   `supportTier` / `supportTierLabel` / `supportTierSummary` / `testOnly`
   *   fields are the support-tier projection the composition root carries over
   *   from the construction registry for the `/harnesses` route.
   ***/
  register(entry) {
   harnesses.set(entry.id, entry);
  },

  /***
   * MARK: harnessRegistry.get
   * @description Returns the entry for `id`, or null when unknown.
   ***/
  get(id) {
   return harnesses.get(id) || null;
  },

  /***
   * MARK: harnessRegistry.list
   * @description Returns every registered entry (registration order).
   ***/
  list() {
   return [...harnesses.values()];
  },
 };
}

// Built-in harness registrations. Any future harness registers itself the
// same way (from its own module at load), then the composition root projects
// its materialized instance into the /harnesses view registry
// (createHarnessRegistry).
/**
 * MARK: HARNESS_CUSTOM
 * @description The registry id of the custom-command harness (kept next to the
 *   built-in registration so no other file hard-codes the literal).
 * @example HARNESS_CUSTOM // => "custom"
 ***/
export const HARNESS_CUSTOM = HARNESS_ID_CUSTOM;

/**
 * MARK: HARNESS_MOCK
 * @description The registry id of the built-in mock harness (kept next to
 *   the built-in registration so no other file hard-codes the literal).
 * @example HARNESS_MOCK // => "mock"
 ***/
export const HARNESS_MOCK = HARNESS_ID_MOCK;

registerHarness(DEFAULT_HARNESS, createPiHarness, {
 description:
  "pi coding-agent harness (the reference AgentHarness implementation).",
 supportTier: "1",
});
registerHarness("antigravity", createAntigravityHarness, {
 description:
  "Antigravity harness — two-way ACP programmatic session over the Google Antigravity agent (steerable turns, permission interception, swallowed-502 filter), with per-turn `agy -p` exec fallback when no ACP endpoint is configured.",
 supportTier: "2",
});
registerHarness("opencode", createOpencodeHarness, {
 description:
  "OpenCode server harness (spawns or connects to `opencode serve`, one server per project; SDK client, SSE events, and steer/abort over a live server).",
 supportTier: "2",
});
registerHarness("muse", createMuseHarness, {
 description:
  "Muse Code harness — two-way MSP programmatic session over `muse serve` (steerable turns, per-request permission interception, live model catalogue), with per-turn `muse exec` fallback (KAINBAIN_MUSE_MSP=off).",
 supportTier: "2",
});
registerHarness("codex", createCodexHarness, {
 description:
  "Codex CLI harness (Tier 2 theoretical shim) — registers the codex harness in KainBain without spawning real processes on this device (codex is not installed). Shows honest 'not installed' messaging when codex is unavailable.",
 supportTier: "2",
});
registerHarness("vibe", createVibeHarness, {
 description:
  "Mistral Vibe harness — two-way ACP programmatic session over the standalone vibe-acp agent (steerable turns, permission interception, live usage telemetry, per-session model pinning), with per-turn `vibe --prompt` exec fallback (KAINBAIN_VIBE_ACP=off).",
 supportTier: "2",
});

// The custom-command harness: a project selects "custom" together with a
// free-text command line (project.harnessCommand, e.g. `claude -p`); agent
// stages run that command with the curated prompt appended as the final
// argument. It is the documented workaround for CLI harnesses without a
// dedicated integration (docs/EngineDetails/CustomHarness.md).
registerHarness(HARNESS_CUSTOM, createCustomHarness, {
 description:
  "Custom command harness: runs a project-configured command line (e.g. `claude -p`) with the curated prompt appended.",
 supportTier: "3",
});

// The mock harness: a zero-credential built-in whose sessions echo the
// prompt back (`Mock reply: …`) — no AI runs here. Explicitly selected
// only (project.harness / stage.harness / KAINBAIN_DEFAULT_HARNESS): the
// resolution chain NEVER falls back to it silently, so fake output can
// never mask a real outage. For evaluation, CI, demos, and cold-start
// guidance on boxes with no CLIs and no keys.
registerHarness(
 HARNESS_MOCK,
 () => createMockHarness({ models: MOCK_MODELS }),
 {
  description:
   "Mock harness: zero-credential synthetic replies for evaluation/CI (no AI runs here).",
  supportTier: "1",
  testOnly: true,
 },
);
