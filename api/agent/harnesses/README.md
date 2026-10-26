# Agent harnesses

Every folder here is one agent harness: a self-contained adapter that teaches
the KainBain engine to run sessions on a specific agent SDK/runtime. The
engine never imports an SDK directly — it talks to the `AgentHarness` /
`HarnessSession` contract documented in `api/agent/harnessContract.js`.

## Supported harnesses

| Harness | Folder | Model selection | Notes |
| --- | --- | --- | --- |
| `pi` | `pi/` | `list` (model catalogue dropdown) | In-process pi coding agent SDK sessions (engine default). |
| `antigravity` | `antigravity/` | `list` (`agy models` discovery) | Headless `agy` CLI runs per stage turn; the project default model is resolved at session creation. Discovery failures warn LOUDLY (console + bridge, with a `KAINBAIN_AGY_BIN` hint on ENOENT) — the service PATH must see the `agy` binary. |
| `opencode` | `opencode/` | `list` (server provider list) | Sessions on an OpenCode server (`opencode serve` spawned per project, or `OPENCODE_URL`); SSE streams translated to the normalized event vocabulary; per-message model selection; transcript JSONL persistence. See `opencode/FACTS.md`. Without a reachable server the list is honestly empty. |
| `custom` | `custom/` | `none` (no model selection) | Runs a project-configured command line with the curated prompt appended; model flags (e.g. `--model <id>`) bake into the command line itself. |
| `muse` | `muse/` | `none` (no model selection) | Headless `muse exec` CLI runs per stage turn (`--json` parsed, YOLO by default until an approval UI exists). See `docs/EngineDetails/MuseHarness.md`. |
| `vibe` | `vibe/` | `none` (no model selection) | Headless `vibe --prompt` CLI runs per stage turn (`--output streaming` rows parsed; auto-approve by default until an approval UI exists). Pins `VIBE_CLI=python` (`KAINBAIN_VIBE_CLI`) because the Rust TUI rejects the harness-owned `--output-dir`/`--time-limit`/`--prompt-file`; a `--help` preflight reports `VIBE_CLI_INCOMPATIBLE`. See `docs/EngineDetails/VibeHarness.md`. |
| `codex` | `codex/` | `list` (Codex catalogue when available) | Tier 2 *theoretical shim* on this device: `codex` is not installed, so the harness detects absence, marks itself unavailable, never spawns, and returns an honest "not installed" hint (`KAINBAIN_CODEX_BIN`). See `docs/EngineDetails/CodexHarness.md`. |

`modelSelection` is declared on each harness factory and projected verbatim by
the discovery routes (`/harnesses`, `/compute/models` harnesses[]) so the UI
renders the matching control (dropdown, honest empty state with Refresh, or
nothing for `"none"`). Only the DEFAULT harness ever gets the curated fallback;
every other harness serves its listing honestly — fallback models cannot run
there, and serving them lets users pick models that can never resolve.

Each harness also declares its **support tier** (integration depth, not model
quality) at registration; `/harnesses` projects `supportTier` /
`supportTierLabel` / `supportTierSummary` / `testOnly` so the System Settings ›
Harness tab labels every row without a frontend map. The current tier and
theoretical maximum per harness are recorded in
`docs/EngineDetails/HarnessSupportLevels.md` (vocabulary lives in
`api/agent/harnessSupportTiers.js`).

## Per-stage harness overrides

A project sets the default harness (`project.harness`) and default model, and
any agent stage may override both with its own `stage.harness` + `stage.model`
(blank/absent = inherit). The agent runner resolves the stage to its concrete
dispatch target (`resolveStageTarget` — alias-aware) and forwards BOTH halves
as run metadata (`stageMeta.harness` + `stageMeta.model`), and
`SessionStore.beginStageSession` resolves the harness per stage
(`stage.harness` → `project.harness` → configured default → `"pi"`), so
consecutive stages in one task can run on different harnesses — e.g. an
antigravity + gemini visual-debugging stage inside an otherwise pi pipeline.
Each harness serves its own model catalogue and switching mechanics, so the
stage model picker rescopes to the stage's effective harness. An unknown stage
harness warns once and runs on the project harness (never silently on pi).

## Target hand-off (dispatch owns the combination)

Three places used to decide the run's harness+model combination independently
(dispatch, session creation, and each harness's `resolveInitialModel`), so a
cross-harness run re-resolved the project default against the wrong catalogue
and warned loudly about it. Now dispatch owns the combination (ADR 0005):

- `harness.createSession(project, { taskId?, stageId?, sessionDir?, model? })`
  — when the optional `model` carries the dispatch-resolved ref, the harness
  resolves it via its own `resolveModelRef()` and pins it, **skipping**
  `resolveInitialModel(project)` entirely.
- An unresolvable hand-off warns once (`Dispatch-resolved model …`) and uses
  the harness default — never a silent swap.
- `none`-selection harnesses (`custom`, `muse`) accept and ignore `model`
  (they manage their own model; dispatch already logged the ignore line).
- Creations WITHOUT `model` (chat, warm-up, retrospective without a target)
  keep the documented `resolveInitialModel` behavior below.

The runner's post-creation switch is idempotent: when the session was created
already pinned (same provider+id+effort), the re-pin is a no-op.

### `resolveInitialModel` warning taxonomy

All catalog harnesses (`pi`, `antigravity`, `opencode`) normalize stored refs
with `normalizeModelRef(ref, HARNESS_ID)` and classify misses identically:

| Case | Channel | Meaning |
| --- | --- | --- |
| Blank default | silent, harness default | Nothing configured — nothing to say. |
| Canonical 3-part key naming a **different** harness | one `[INFO]` line (deduped per project+ref) | Not this harness's default at all (scope it with a Model Alias). |
| Any other unresolvable ref | loud `[WARN]` (deduped per project+ref) | Names the cross-harness possibility + the Settings fix path. |

A new harness implements the hand-off by honoring `opts.model` in
`createSession` and matching this taxonomy in `resolveInitialModel` — the
per-harness contract tests (`*.targetHandoff.test.js` /
`*.contract.test.js`) pin both.

## How the engine picks a harness

`api/agent/harnessRegistry.js` maps harness ids to factories. A project uses

1. its own `project.harness` when it names a registered harness, else
2. `KAINBAIN_DEFAULT_HARNESS` (default `pi`).

`SessionStore.getHarness(project)` resolves per project and caches one harness
instance per id. The registry registers `pi` at module load; `opencode`
registers itself when the composition root imports `harnesses/opencode/index.js`.

## Adding a harness

1. Create `api/agent/harnesses/<name>/` with the harness factory
   (`createXHarness({ eventBridge })`), its raw-event → normalized translation
   (pure module), and an `index.js` calling `registerHarness("<name>", factory)`.
2. Consume the shared scaffold (`shared/harnessScaffold.js`) for the three
   lifecycles every CLI harness needs — `startSupervisedSpawn` (spawn options,
   watchdog SIGTERM→SIGKILL, decoders, stderr ring), `buildChildEnv` (allowlist
   projection with secret redaction) + `withRunContextVars` (workspace pin),
   and `createJsonLinesParser` (chunk→line framing with your `classify`
   callback) — and keep ONLY protocol mapping in your folder (argv shape,
   run-outcome semantics, event translation, model semantics). The scaffold
   imports node builtins only and names no harness, so the boundary gate below
   keeps passing. Adopt per lifecycle: a harness with no child process (pi,
   mock) or a server lifecycle (opencode) adopts only what fits.
3. Pass the shared acceptance gate: `runSessionContractTests`
   (`api/agent/sessionContract.test.js`) against sessions your harness returns.
4. Keep SDK imports inside your folder — `api/agent/harnessBoundary.test.js`
   enforces it (add your SDK specifier to its `HARNESS_SDK_MODULES` map).
5. Import your `index.js` from the composition root (`api/index.js`).
