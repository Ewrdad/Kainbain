// Domain: The Crew — the members offered in the crew picker.
import {
	createHarnessRegistry,
	getHarnessByName,
	listHarnesses,
} from "../agent/harnessRegistry.js";
/***
 * MARK: buildHarnessRoster
 * @description Lists the crew members and the work each offers without starting sessions.
 * @example const roster = buildHarnessRoster(sessionStore);
 */
export function buildHarnessRoster(sessionStore) {
/***
 * MARK: harnessRegistry
 * @description The process-wide harness registry: WHICH agent harnesses exist,
 *   keyed by id. The default harness (pi) is materialized once at startup (the
 *   SessionStore already owns the instance — this only asks for it) and
 *   registered so `/harnesses` and `/harnesses/:id/models` are projections over
 *   the registry instead of hardcoded route data. Future harnesses register
 *   here without touching the route modules.
 ***/
const harness = sessionStore.getHarness();
const customHarness = getHarnessByName("custom");
const antigravityHarness = getHarnessByName("antigravity");
const opencodeHarness = getHarnessByName("opencode");
const museHarness = getHarnessByName("muse");
const codexHarness = getHarnessByName("codex");
const vibeHarness = getHarnessByName("vibe");
const mockHarness = getHarnessByName("mock");
const harnessRegistry = createHarnessRegistry();

/***
 * MARK: harnessTierByName
 * @description The support-tier projection from the construction registry
 *   (single source of truth) keyed by harness id. The view entries copy it so
 *   `/harnesses` labels every harness honestly without hard-coding a tier per
 *   row here.
 ***/
const harnessTierByName = new Map(
	listHarnesses().map((entry) => [entry.name, entry]),
);

/***
 * MARK: registerHarnessView
 * @description Projects one materialized harness into the discovery view
 *   (`/harnesses`, `/compute/models` harnesses[]). `modelSelection` /
 *   `modelFlag` are read off the live harness instance (each factory declares
 *   them: `"list"` for catalogue harnesses, `"none"` for the custom harness)
 *   with explicit fallbacks so the view never omits them. The support-tier
 *   fields are copied from the construction registry (`listHarnesses()`) so a
 *   harness's tier is declared once, at registration.
 ***/
function registerHarnessView({ id, name, description, capabilities, harness }) {
	const tier = harnessTierByName.get(id);
	harnessRegistry.register({
		id,
		name,
		description,
		capabilities,
		modelSelection: harness?.modelSelection || "list",
		modelFlag: harness?.modelFlag ?? null,
		supportTier: tier?.supportTier,
		supportTierLabel: tier?.supportTierLabel,
		supportTierSummary: tier?.supportTierSummary,
		testOnly: tier?.testOnly === true,
		harness,
	});
}
registerHarnessView({
	id: harness.id || "pi",
	name: "pi coding agent",
	description: "pi-backed AgentHarness (model discovery, sessions, history).",
	capabilities: {
		createSession: true,
		listModels: true,
		resolveModelRef: true,
		readHistoryFromDisk: true,
	},
	harness,
});

// The custom-command harness: materialized once (cheap — no SDK) and projected
// into the discovery view so the harness dropdowns can offer it. No model
// selection at all (model flags live inside the command line): the UI hides
// the model control for it.
registerHarnessView({
	id: customHarness.id || "custom",
	name: "Custom command",
	description:
		"Runs a project-configured command line (e.g. `claude -p`) with the curated prompt appended as the final argument.",
	capabilities: {
		createSession: true,
		listModels: false,
		resolveModelRef: false,
		readHistoryFromDisk: false,
	},
	harness: customHarness,
});

// The antigravity harness: materialized once (cheap — the agy CLI only spawns
// per stage turn) and projected into the discovery view so the dropdowns can
// offer it. Full capabilities: sessions, model catalog, refs, history.
registerHarnessView({
	id: antigravityHarness.id || "antigravity",
	name: "Antigravity",
	description:
		"Google Antigravity `agy` CLI harness (headless per-stage runs, stream-JSON parsed, sandboxed).",
	capabilities: {
		createSession: true,
		listModels: true,
		resolveModelRef: true,
		readHistoryFromDisk: true,
	},
	harness: antigravityHarness,
});

// The OpenCode harness: materialized once (cheap — no SDK load, servers spawn
// lazily per project) and projected into the discovery view. Without a
// running server its model list is empty and the routes serve the curated
// fallback, same as before.
registerHarnessView({
	id: opencodeHarness.id || "opencode",
	name: "OpenCode server",
	description:
		"OpenCode server harness (spawns or connects to `opencode serve`, one server per project).",
	capabilities: {
		createSession: true,
		listModels: true,
		resolveModelRef: true,
		readHistoryFromDisk: true,
	},
	harness: opencodeHarness,
});

// The Muse Code harness: materialized once (cheap — the muse CLI only spawns
// per stage turn) and projected into the discovery view so the dropdowns can
// offer it. Tier 2: the MSP transport (`muse serve`) serves a live model
// catalogue and per-session model switching, per-request approval
// interception, history via `muse export`, and a persistent steerable
// session; the legacy exec path stays the rollback (KAINBAIN_MUSE_MSP=off)
// and serves an honest empty catalogue. Runs are YOLO by default (no approval
// UI exists yet; KAINBAIN_MUSE_YOLO=0 restores sandbox-on/`onRequest`).
registerHarnessView({
	id: museHarness.id || "muse",
	name: "Muse Code",
	description:
		"Muse Code harness (two-way MSP session over `muse serve`, per-turn `muse exec` fallback, YOLO by default).",
	capabilities: {
		createSession: true,
		listModels: true,
		resolveModelRef: true,
		readHistoryFromDisk: true,
	},
	harness: museHarness,
});

// The Mistral Vibe harness: materialized once (cheap — the vibe-acp agent
// only spawns per stage turn) and projected into the discovery view so the
// dropdowns can offer it. Tier 2: sessions run on a long-lived bidirectional
// ACP connection with a live model catalogue (the deployment-fed model
// select from session/new, handshake-only discovery) and per-session model
// pinning; the legacy exec path stays the rollback (KAINBAIN_VIBE_ACP=off)
// and serves an honest empty catalogue. Runs are auto-approved by default
// (no approval UI exists yet; KAINBAIN_VIBE_AUTO_APPROVE=0 restores
// per-agent approvals), with live usage/cost telemetry on the ACP path.
registerHarnessView({
	id: vibeHarness.id || "vibe",
	name: "Mistral Vibe",
	description:
		"Mistral Vibe harness (two-way ACP session over vibe-acp, per-turn `vibe --prompt` exec fallback, auto-approve by default).",
	capabilities: {
		createSession: true,
		listModels: true,
		resolveModelRef: true,
		readHistoryFromDisk: false,
	},
	harness: vibeHarness,
});

// The Codex harness: materialized once (cheap — a theoretical shim that
// never spawns while the binary is absent) and projected into the discovery
// view so the dropdowns offer it with the unavailable-until-detected badge
// (survey q10). Honest capabilities: sessions reply with the setup hint, the
// model catalogue is empty, refs resolve to null, and disk history is empty.
registerHarnessView({
	id: codexHarness.id || "codex",
	name: "Codex",
	description:
		"Codex CLI harness (Tier 2 theoretical shim — honest 'not installed' messaging until the binary is detected).",
	capabilities: {
		createSession: true,
		listModels: true,
		resolveModelRef: true,
		readHistoryFromDisk: true,
	},
	harness: codexHarness,
});

// The mock harness: materialized once (cheap — pure in-memory) and projected
// LAST so existing positional consumers are unaffected. Full session +
// catalog capabilities over synthetic data; selected explicitly only.
registerHarnessView({
	id: mockHarness.id || "mock",
	name: "Mock",
	description:
		"Built-in mock harness: zero-credential synthetic replies for evaluation/CI (no AI runs here).",
	capabilities: {
		createSession: true,
		listModels: true,
		resolveModelRef: true,
		readHistoryFromDisk: true,
	},
	harness: mockHarness,
});

return harnessRegistry;
}
