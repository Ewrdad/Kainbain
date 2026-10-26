/**
 * MARK: harnessContract
 * @description The contract between the KainBain engine and an agent harness
 *   (pi today; any future harness later). This file is documentation-as-code:
 *   it defines, in one place, what a harness must provide so the engine can
 *   run stages, stream events, control models, and manage context — without
 *   knowing which harness is underneath.
 *
 *   1. `AgentHarness` — the harness-level factory. It knows how to create
 *      sessions for a project, discover models, and read persisted history.
 *   2. `HarnessSession` — one live conversation with an agent, exposing the
 *      engine's normalized event vocabulary (see `api/agent/sessionEvents.js`).
 *
 *   TWO built-in harnesses exist today — pi (`api/agent/harnesses/pi/`, the
 *   reference implementation and the only file allowed to import the pi SDK)
 *   and antigravity (`api/agent/harnesses/antigravity/`, the agy CLI harness).
 *   Both satisfy this contract, both pass the same conformance gate
 *   (`runSessionContractTests`), and a future harness joins by registering a
 *   factory in `api/agent/harnessRegistry.js` — never by touching engine code.
 *
 *   UI-facing seam: the composition root's harness VIEW registry
 *   (`createHarnessRegistry` — `deps.harnessRegistry`) plus the harness
 *   contract's `listModels()` power the UI's harness-first model selector:
 *   `GET /compute/models` serves the flat default-harness catalogue plus an
 *   additive `harnesses[]` view (one entry per registered harness, each with
 *   its own catalogue), and `/harnesses` + `/harnesses/:id/models` expose the
 *   same data per harness. This contract file stays about session behaviour;
 *   registry layers (construction + selection, and the HTTP view) live in
 *   `harnessRegistry.js`, model projections in `api/models.js`.
 *
 *   Acceptance: every session handed to the engine must pass
 *   `api/agent/sessionContract.test.js` (runSessionContractTests), and every
 *   harness must satisfy `assertHarnessSessionShape`. The reference
 *   implementation of the full session surface is `createReferenceMockSession`
 *   in that test file.
 *
 *   Task-log contract: harnesses deliver model thinking as
 *   `assistantMessageEvent` deltas tagged `thinking_delta` (per the pi-ai
 *   AssistantMessageEvent protocol) and MUST NOT rely on raw delta text
 *   reaching the task logs — the log streamer (`api/agent/logStream/`) groups
 *   deltas into semantic blocks and collapses thinking by default, so token
 *   fragments never appear in the task's structured `logEntries`. Harnesses
 *   additionally surface telemetry/permissions/plans/reasoning/harness logs
 *   through the unified vocabulary and any unmapped wire data lands in a
 *   bounded raw evidence lane.
 *
 *   ## Registry
 *
 *   Harnesses are registered in `api/agent/harnessRegistry.js` — the ONE
 *   module that knows which harnesses exist (and the only file outside
 *   `harnesses/pi/` that may import from it):
 *
 *   - Register: `registerHarness("name", factory, { description })` where
 *     `factory({ eventBridge })` returns an AgentHarness. Built-ins register
 *     at module load; duplicate names throw. "pi" and "custom" are registered
 *     automatically (custom = the free-text command-line harness, see
 *     `docs/EngineDetails/CustomHarness.md`).
 *   - Select per project: set `project.harness = "name"` (persisted only when
 *     the project chose explicitly; "custom" also stores a free-text command
 *     line in `project.harnessCommand`, with model flags baked into the
 *     command itself). Any agent stage may override with its own `stage.harness`
 *     (blank/absent = inherit the project harness — e.g. one antigravity
 *     visual-debugging stage inside a pi pipeline, each with its own model
 *     from its own harness catalogue). Resolution order: `stage.harness` →
 *     `project.harness` → `config.defaultHarness` (env `KAINBAIN_DEFAULT_HARNESS`)
 *     → the built-in default `"pi"`. Call
 *     `resolveHarnessForProject(project, { harnessName: stage?.harness })`
 *     for `{ name, harness }`.
 *   - Unknown names never crash: resolution warns once per (project, name)
 *     via `console.warn` + a `[SYSTEM]` line in the project's process log and
 *     falls back to the built-in default.
 *   - Memoization: one harness instance per name (harnesses own harness-level
 *     model caches); the SessionStore keeps model runtimes per harness name.
 */

/***
 * MARK: HarnessSessionEvent (typedef)
 * @description A normalized agent event delivered by HarnessSession.subscribe.
 *   `type` is a name from AGENT_EVENT_NAMES; payload fields are the ones the
 *   engine reads (delta, toolName, toolCallId, args, result, isError, error).
 * @property {string} type - Normalized event name (assistant_delta, tool_started, …).
 ***/

/***
 * MARK: HarnessSession (typedef)
 * @description One live conversation with an agent, harness-agnostic.
 *
 *   REQUIRED surface (the engine calls these unconditionally or relies on
 *   their behavior):
 *     - prompt(text, { onChunk })  → Promise<string|Object>; runs one agent
 *       turn; streams assistant deltas via the subscribed events (and
 *       optionally the onChunk callback).
 *     - subscribe(handler)         → () => void unsubscribe; handler receives
 *       HarnessSessionEvent objects (normalized vocabulary only).
 *     - getMessages() | messages   → Array<{ role, content }> conversation.
 *     - getLastAssistantText()     → string ("" when no assistant turn yet).
 *     - isStreaming                → boolean flag.
 *     - abort()                    → Promise; stops the current run.
 *     - dispose()                  → void|Promise; idempotent cleanup.
 *
 *   OPTIONAL surface (the engine guards each with a typeof check; present ⇒
 *   must behave):
 *     - steer(text) · followUp(text) · compact() · getContextUsage()
 *     - navigateTree(id) · sessionManager.getEntries() · sessionManager.branch(id)
 *     - getActiveModel() · switchModel(ref) · listModels()
 *
 *   HTTP degradation (capability-aware routes): the HTTP routes call the
 *   optional surface through `guardSessionCapability` (api/index.js). A
 *   session lacking an optional capability gets a standardized
 *   `501 { error, code: "unsupported_by_harness", capability }` instead of a
 *   500 TypeError. Additional boundary semantics the engine guarantees:
 *     - `getContextUsage` is normalized to a `{current, limit}` pair at the
 *       harness boundary (piHarness.wrapPiSession), whatever raw shape the
 *       underlying SDK reports.
 *     - `compact()` on a session too small to compact is an idempotent HTTP
 *       success (`200 {status: "compacted"}`) — the benign "Nothing to
 *       compact" harness condition is coalesced (isBenignNoOpCompactionError).
 *     - unknown entry ids passed to `navigateTree`/`sessionManager.branch`
 *       surface as `404 { code: "entry_not_found", entryId }`, not a 500.
 *
 *   IDENTITY (value, not method — the engine reads it, never calls it):
 *     - harnessId             → the owning harness's id (e.g. "pi"); the first
 *       segment of harness-scoped model keys. The engine normalizes stored
 *       model references with it (normalizeModelRef) instead of importing
 *       anything harness-specific. Absent on older/mock sessions — engine
 *       code treats that as "no harness context" and leaves references as-is.
 *       It is also the reliability-attribution id: the session's reported
 *       harnessId names the harness a run counts against (reliability
 *       samples and stage reports alike), with the engine's peeked
 *       stage/project resolution filling only the blank.
 *     - modelSelection        → reserved identity flag (currently unset by
 *       every session): catalogue-backed sessions resolve models through the
 *       registry as before. A future free-type session would set `"free"`.
 *
 * @property {Function} prompt
 * @property {Function} subscribe
 * @property {Function} [getMessages]
 * @property {Array} [messages]
 * @property {Function} getLastAssistantText
 * @property {boolean} isStreaming
 * @property {Function} abort
 * @property {Function} dispose
 * @property {Function} [steer]
 * @property {Function} [followUp]
 * @property {Function} [compact]
 * @property {Function} [getContextUsage]
 * @property {Function} [navigateTree]
 * @property {Object} [sessionManager]
 * @property {Function} [getActiveModel]
 * @property {Function} [switchModel]
 * @property {Function} [listModels]
 * @property {string} [harnessId]
 ***/

/***
 * MARK: AgentHarness (typedef)
 * @description A harness-level factory: the single engine-visible entry point
 *   for one agent SDK/runtime. It owns harness-specific configuration (SDK
 *   imports, on-disk layout, model discovery) and returns HarnessSession
 *   objects that conform to the contract.
 *
 * @property {Function} createSession  (project, { taskId?, stageId?, sessionDir?, model? }) → Promise<HarnessSession>
 *   Creates (or resumes) a session for the project. Stage executions
 *   (taskId/stageId present) begin FRESH sessions with no inherited history.
 *   TARGET HAND-OFF (dispatch owns the harness+model combination): when the
 *   optional `model` carries the dispatch-resolved model ref, the harness
 *   resolves it via its own `resolveModelRef()` and pins it for the session,
 *   SKIPPING its `resolveInitialModel(project)` path entirely (the project
 *   default belongs to another harness's catalog for cross-harness runs —
 *   resolving it here caused the foreign-catalog WARN). An unresolvable
 *   hand-off warns once (emitModelWarning-style entry) and falls back to the
 *   harness default — never a silent swap. `none`-selection harnesses
 *   (muse, custom — they manage their own model) accept and ignore `model`.
 *   Creations WITHOUT `model` (chat, warm-up, retrospective without a
 *   target) keep the documented `resolveInitialModel` behavior.
 * @property {string} [id]  Stable harness identity (e.g. "pi") — the first
 *   segment of every harness-scoped model key (`harness::provider::id`) this
 *   harness produces; also the cache slot key for model listings and the
 *   /harnesses registry entry id.
 * @property {Function} listModels     (opts?) → Promise<Array<{provider, id, name?, …}>>
 *   Lists the models sessions can resolve, from the harness's model registry.
 *   `opts.refresh` (boolean, default false): best-effort, NETWORK-FREE disk
 *   refresh of the model snapshot before listing (implementations must never
 *   touch the network in a request path); a failed refresh keeps serving the
 *   stale snapshot. Every listed model carries a harness-scoped `key`
 *   (`harness::provider::id`) plus a `harness` field when the harness has an id.
 *   A harness with NO programmatic list (e.g. custom) returns `[]` — model
 *   routes then serve an honest empty list (never the curated fallback) and
 *   the UI hides model selection instead.
 * @property {Function} resolveModelRef(target) → Promise<Object|null>
 *   Resolves a stored model reference (composite key or bare id) against the
 *   harness's model registry; null when unresolvable (a harness with no
 *   registry, e.g. custom, always resolves null).
 * @property {string} [modelSelection]  How the UI renders model selection for
 *   this harness: `"list"` (default — dropdown over `listModels()`),
 *   `"none"` (hide model selection entirely — the harness manages its own
 *   model, e.g. custom bakes `--model` into its command line). The discovery
 *   routes (`/harnesses`, `/compute/models` harnesses[]) project this verbatim.
 * @property {string[]|null} [reasoningLevels]  Advertised adjustable reasoning
 *   levels for this harness, or null/absent when it has no such knob. The level
 *   rides as the 4th `::` segment of a harness-scoped model ID. Model entries
 *   may override with `supportedReasoning` when the level varies per model.
 * @property {Function} readHistoryFromDisk(project) → Promise<{messages, tree}>
 *   Reads persisted conversation history without instantiating a live session.
 * @property {string} [name] - Stable machine id of the harness (e.g. "pi");
 *   lowercase. Engine log prose is composed from this, never from a hard-coded
 *   vendor name, so logs stay truthful for every harness.
 * @property {string} [label] - Display name of the harness (e.g. "Pi");
 *   defaults to `name` when absent.
 * @property {Function} [probeHealth]  ({ refresh?: boolean }) → Promise<HarnessProbeResult>
 *   OPTIONAL harness-level health probe, surfaced through the HealthChecker
 *   (see api/healthChecker.js `registerProbe`). The engine NEVER calls it
 *   unguarded — callers duck-type it (`harness.probeHealth?.(opts)`), and a
 *   harness without the member is simply not probed. `refresh: true` permits
 *   network work (availability re-check); the default MUST stay offline
 *   (snapshot + cached auth state only).
 *
 *   HarnessProbeResult shape (mirrors the HealthChecker check vocabulary so
 *   aggregates and UI dot-classes can consume probes uniformly):
 *     {
 *       name: string,                 // probe identity, e.g. 'pi'
 *       status: 'ok'|'warning'|'error',
 *       latencyMs: number|null,
 *       timestamp: string,            // ISO timestamp
 *       message?: string,             // human-readable summary / error detail
 *       checks?: {                    // sub-checks, all optional
 *         runtime?: { status, message? },
 *         models?:  { status, available: number, total: number, message? },
 *         auth?:    { status, error?: string|null,
 *                     providers: Array<{ provider, configured, source?, label? }> },
 *       },
 *     }

 ***/

/***
 * MARK: harnessLabel
 * @description The id a harness reports for itself, used by the engine to
 *   compose harness-aware log prose (e.g. session-init messages). The stable
 *   machine `name` wins so log prose stays a lowercase, greppable id; the
 *   display `label` is the fallback when no name is present. Falls back to
 *   "agent" when the harness (or the store seam that would return one) is
 *   absent, so engine logs never regress to a hard-coded vendor name — they
 *   simply stay neutral.
 * @example harnessLabel({ name: "pi", label: "Pi" }) => "pi"
 * @example harnessLabel({ label: "Pi" }) => "Pi"
 * @example harnessLabel(undefined) => "agent"
 * @param {Object} [harness] - The AgentHarness (or undefined in seams/tests).
 * @returns {string} The harness label (never empty, never vendor hard-coded).
 ***/
export function harnessLabel(harness) {
 const n = harness?.name || harness?.label || "agent";
 return String(n);
}

/***
 * MARK: assertHarnessShape
 * @description Throws unless a harness exposes the factory surface the engine
 *   relies on and well-formed identity metadata. Identity (`name`/`label`) is
 *   OPTIONAL — a harness without it is valid and simply logs as "agent" — but
 *   when present it must be a usable string, so log prose never renders
 *   `[object Object]` or an empty label.
 * @example assertHarnessShape(createPiHarness()) // passes
 * @example assertHarnessShape({ name: "pi", createSession: async () => session }) // passes
 * @example assertHarnessShape({ name: "" }) // throws (empty identity)
 * @param {Object} harness - The candidate AgentHarness.
 * @returns {boolean} true when the harness satisfies the required shape.
 ***/
export function assertHarnessShape(harness) {
 if (!harness || typeof harness !== "object") {
  throw new Error("AgentHarness must be an object");
 }

 const problems = [];
 if (typeof harness.createSession !== "function") {
  problems.push("createSession(project)");
 }
 if ("name" in harness && harness.name !== undefined) {
  if (typeof harness.name !== "string" || harness.name.trim() === "") {
   problems.push("name must be a non-empty string when provided");
  }
 }
 if ("label" in harness && harness.label !== undefined) {
  if (typeof harness.label !== "string" || harness.label.trim() === "") {
   problems.push("label must be a non-empty string when provided");
  }
 }

 if (problems.length > 0) {
  throw new Error(
   `Harness does not satisfy the AgentHarness contract; problems: ${problems.join(", ")}`,
  );
 }
 return true;
}

/***
 * MARK: assertHarnessSessionShape
 * @description Throws unless a session exposes every REQUIRED member of the
 *   HarnessSession contract. Used by the conformance suite as the first gate
 *   before behavioral assertions run. Optional members are deliberately NOT
 *   checked here — the engine guards them individually.
 * @example assertHarnessSessionShape(createReferenceMockSession()) // passes
 * @example assertHarnessSessionShape({}) // throws listing every missing member
 * @param {Object} session - The candidate HarnessSession.
 * @returns {boolean} true when the session satisfies the required shape.
 ***/
export function assertHarnessSessionShape(session) {
 if (!session || typeof session !== "object") {
  throw new Error("HarnessSession must be an object");
 }

 const missing = [];
 // Each required member is checked explicitly (no dynamic member access) so
 // the contract reads as a plain checklist a reviewer can verify by eye.
 if (typeof session.prompt !== "function") missing.push("prompt(text)");
 if (typeof session.subscribe !== "function")
  missing.push("subscribe(handler)");
 if (typeof session.getLastAssistantText !== "function") {
  missing.push("getLastAssistantText()");
 }
 if (typeof session.abort !== "function") missing.push("abort()");
 if (typeof session.dispose !== "function") missing.push("dispose()");
 const exposesConversation =
  typeof session.getMessages === "function" || Array.isArray(session.messages);
 if (!exposesConversation) missing.push("getMessages() or messages[]");
 if (!("isStreaming" in session)) missing.push("isStreaming");

 if (missing.length > 0) {
  throw new Error(
   `Session does not satisfy the HarnessSession contract; missing: ${missing.join(", ")}`,
  );
 }
 return true;
}
