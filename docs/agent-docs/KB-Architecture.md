> **Vendored:** byte-identical copy of the SilverBullet page `Projects/Personal/KainBain/KB Architecture.md` (vendored 2026-09-24).
> Source of truth is this in-repo copy — the external notes store is unreachable on a fresh checkout.
> Upstream edits must be re-vendored here; keep everything below the header identical to the source page.

# Architecture initial

## Server authoritative

The main decision maker should be the server in order to allow for rapid development of UI and to prevent undue trust in the user.

## User defininable config

We want this to be very flexible as It be nice to adapt the app without reuse. We should follow a non-declarative model where it is flexible and we don’t restrict config to a set shape(Ie if I put in a custom flag for something that doesn’t  exist it just ignores it)

Due to modularity each function should touch the min

## Diagram

```excalidraw
url:Projects/Personal/KainBain/architecture.excalidraw
height:500px
```

## Domain driven design

In this context I will  use DDD to refer to the fact that we want business logic describable language and structure. Imagine everything written had to be described by a PO/BA and needs to match what it does.

System call heirarchies should be reflected in the file system and some duplication of code is allowed if the “logic” or “user reason” is drastically different as to avoid coupling between unrelated parts of the app.

## No in memory storage

This should be horizontally scalable and not require much in memory storage such as local sessions etc.

## One session per stage

Agent/review stages never share a session. Every stage execution begins a brand-new agent session whose only context is that stage's curated prompt: the task goal, the stage instructions, references to prior stages' report artifacts, and any failure/steering guidance. Earlier stages contribute their distilled REPORTS, never the research/conversation they performed to produce them.

Why: long-lived shared sessions accumulate stale context (context rot) and bias later stages with irrelevant detail, and oversized histories make provider requests stall entirely (KB-9940). Fresh-per-stage keeps prompts small (smaller/cheaper models per stage), keeps runs isolated from each other's failures, and every run's full transcript is still persisted to disk per stage for audit and debugging.

Interactive surfaces (chat, steering, follow-ups) address the CURRENT stage's live session while it streams; steering/follow-up guidance given mid-run is also appended to the task goal so later stages inherit the intent, not the transcript.

## Locality of code

relevant code should be near eachother. For example unit tests should be placed next to the functions they test:

```
FunctionA.js
FunctionA.test.js
FunctionA/ComponentA.js
FunctionA/ComponentA.test.js

```

Relevant code should be nearby allowing a user/agent to get all the required context in a short burst

## The agent harness boundary

The engine does not know which agent harness (SDK/runtime) it is talking to. All harness-specific code — SDK imports, on-disk session layout, model discovery, raw event names — lives behind `api/agent/`, and the configured harness is selected per project (pi by default) through the harness registry:

```text
api/agent/
  sessionEvents.js            the engine's normalized agent-event vocabulary
  harnessContract.js          the HarnessSession / AgentHarness contract (docs-as-code)
  harnessRegistry.js          WHICH harnesses exist (id → { factory, description }) + the per-project resolver + the /harnesses view factory
  sessionContract.test.js     the acceptance suite ANY harness session must pass
  harnessBoundary.test.js     regression gate: no SDK/raw-event leakage
  harnesses/pi/               the ONLY place the pi SDK is known
    piHarness.js              session creation, model runtime, persisted history
    piSessionEvents.js        raw pi event -> normalized event (pure translation)
    piExtensionUI.js          pi extension UI context (ctx.ui.notify forwarding)
```

The engine consumes exactly this HarnessSession surface (optional methods are guarded, present ⇒ must behave):

| Capability | Contract surface |
| --- | --- |
| Conversation | `prompt(text, { onChunk })`, `getMessages()`/`messages`, `getLastAssistantText()` |
| Streaming events | `subscribe(handler)` → unsubscribe; handler receives NORMALIZED events (`run_started`, `assistant_delta`, `message_started`, `tool_started`, `tool_updated`, `tool_finished`, `run_finished`, `run_error` — see `api/agent/sessionEvents.js`) |
| Lifecycle | `isStreaming`, `abort()`, `dispose()` |
| Context control | `steer(text)`, `followUp(text)`, `compact()`, `getContextUsage()` |
| History tree | `navigateTree(id)`, `sessionManager.getEntries()`, `sessionManager.branch(id)` |
| Model control | `getActiveModel()`, `switchModel(ref)`, `listModels()`, `resolveModelRef(target)` |

`SessionStore` owns lifecycle only (TTL sweep, sockets, session-directory policy) and delegates creation to the harness; `agentRunner` and `eventBridge` speak the normalized vocabulary only (the eventBridge keeps a legacy-name alias table for direct callers). A future harness is added by implementing the contract in a new `api/agent/harnesses/<name>/` folder, registering it with the registry (`registerHarness("name", factory, { description })` — built-ins register at registry module load, and the registry is the only module allowed to import from `harnesses/pi/`), projecting its materialized instance into the composition root's `createHarnessRegistry()` view so `/harnesses` lists it, and passing `sessionContract.test.js` — no engine changes.

The registry module carries two cooperating layers: the construction + selection singleton described above (factories, memoized instances, per-project resolution with warning/fallback) and `createHarnessRegistry()` — an id-keyed VIEW over live instances that `api/index.js` hands to the `/harnesses` routes. The view never builds harnesses; the composition root materializes each harness once (the SessionStore already owns the default instance) and registers `{ id, name, description, capabilities, harness }` entries, so the harness discovery API is a projection over registered data instead of hardcoded route content.

### Model keys & resolution

A model is referenced by one of three forms — **canonical `harness::provider::id`** (harness-scoped), legacy `provider::id`, or a bare `id`/`name` — and every resolver accepts all three, so nothing already stored breaks:

| Legacy input | Where it appears | Behavior |
| --- | --- | --- |
| `provider::id` | stored `stage.model`, project `defaultModel`, config default, old API clients | Accepted by all resolvers; normalized to the configured harness on read |
| bare `id` / `name` | oldest stored records, task YAML | First-match fallback preserved exactly |
| `"default"` | `stage.model` sentinel | Still skips model switching entirely |
| `provider::id` with `:` in the id | e.g. `ollama-cloud::glm-5.3-flash:cloud` | Parsed on the first `::` only — ids keep their single colons |

**Grammar and canonical module.** The pure key grammar lives in `shared/modelKeys.js` (plain ESM, zero deps) and is re-exported verbatim by the backend's canonical module (`api/models.js`) and the frontend switcher (`frontend/src/services/api.js`) — the two grammars cannot drift, and a parity test (`frontend/src/services/api.test.js`) locks the matrix. Parsing rule: split on the FIRST `::`, then the NEXT `::` — never `split("::")`, because model ids may contain single `:` (e.g. `glm-5.3-flash:cloud`) but never `::`; no segment may itself contain `::`, and harness ids must match `[a-z0-9][a-z0-9_-]*`. Malformed keys are rejected, never parsed incorrectly into a wrong model (`parseModelKey` → null, builders → thrown error). Key builders: `modelKey(provider, id)` (legacy, still accepted) and `harnessModelKey(harness, provider, id)` (canonical); `withModelKey(m, harness?)` tags model objects non-destructively.

**Resolution order** (locked by tests in `api/models.test.js` and `api/agent/harnesses/pi/piHarness.modelResolution.test.js`): availability snapshot first (`resolveModel`), then the runtime's full registry (`resolveModelFromRegistry`) — the snapshot can transiently drop a provider when an auth re-check flakes — then a bare `id`/`name` first-match fallback for the oldest stored references. Composite keys match by provider + id (storing an exact `key` match first), so a 3-part key naming a harness other than the one resolving it still resolves to the same `provider::id` model — with one configured harness, that is the same model, and `agentRunner` emits a visible deprecation-style warning for it instead of silently accepting the stale key form.

**Default-harness injection points.** `HARNESS_ID = "pi"` is the single source of pi harness identity (exported from `api/agent/harnesses/pi/piHarness.js`, also carried as the harness instance's `id`); no other file hard-codes `"pi"` as a key segment. The engine reads harness identity from the session contract (`session.harnessId`, exposed by `wrapPiSession`) — never by importing the harness — and normalizes stored references with `normalizeModelRef(ref, session.harnessId)` before resolving; harnesses without it keep the reference as-is. The pi harness normalizes `project.defaultModel` in `resolveInitialModel` and in `resolveModelRef` the same way. Which harness (and thus which key segment) serves a project is decided by the registry's per-project resolution (see “Per-project harness selection” below).

### Model aliases (per-project harness + model shortcuts)

Projects define named aliases in Settings › Model Aliases, each binding **one or more weighted harness + model targets** (`project.modelAliases: [{ name, targets: [{ harness, model, percent }] }]`, e.g. `review` at 90% Muse / 10% antigravity to balance quota; legacy single-target records `{ name, harness, model }` still read (and write) as one 100% target, with the first target mirrored onto the legacy `harness`/`model` fields for rollback safety). Target percents are integers 1–100 summing to exactly 100; the UI shows a live total and a normalize-to-100 helper. Every model picker (project default, per-stage override) offers them through a virtual `alias` entry in the harness selector whose model dropdown lists the alias names; a stage stores `harness: "alias"` + `model: "<name>"` — a reference, never a copy — so editing an alias updates all referencing stages with no stage edits, and renaming migrates every reference atomically in the same project save (`inferAliasRenames` + `applyAliasRename`). Dispatch resolves aliases before harness resolution through one shared smooth weighted round-robin selector (`selectAliasTarget` in `api/aliasSelector.js`, called by `resolveStageTarget` in `api/agentRunner.js` for both explicit per-stage refs and inherited project-default aliases — the production runners in `api/index.js` and the tasks-route fallback both wire `getProject` so stage refs resolve against the real project — by `SessionStore.resolveDisplayTarget` for display reads (dashboards, queue listings — `resolveDisplayHarness` keeps serving the harness-only half by delegating to it), and by the stuck checker for explicit alias diagnoses, the read-only paths always via the non-consuming `peek`): each resolution advances the alias's rotation so the configured split lands exactly in every ~100-resolution window (deterministic `selectWeightedIndex` in `shared/modelAliases.js` — no random clustering); counters live in memory keyed `projectId:aliasName` (per server process — statistically correct, not exact, across instances) and reset automatically when a split is edited (targets fingerprint). Targets on a harness unknown to this server are skipped for that resolution (share redistributes across the remaining targets); unknown/deleted/blank aliases warn visibly — always naming the alias, never the virtual `alias` harness id (stage log every run, console + process log deduped) — and fall back to the project default, or to the built-in default when the project default itself is the unresolvable alias — never a silent wrong-model run. No caller passes the virtual id `"alias"` into harness resolution: every `harness: "alias"` reference resolves through `selectAliasTarget` first. Alias names match `[a-z0-9][a-z0-9_-]*` (max 64); `alias` can never be registered as a real harness; a blank alias model means the target harness manages its own model (`modelSelection: "none"`). Grammar and validation live in `shared/modelAliases.js`, shared verbatim by backend and frontend. Observability reports `alias: <name>` plus the picked concrete harness/model: `activeTask` and queue items carry `alias: { name, targetIndex }` (the picked weighted-target index) with `modelDetails.source: "alias"`, while unknown/deleted/blank aliases carry `alias: null` plus `aliasMissing: "<name>"` with the fallback actually shown — never a silent wrong-model display. Queued/idle picks are peek previews of the next rotation slot; live-session values are actuals. All pre-existing stored values (`provider::id`, `harness::provider::id`, bare ids, `"default"`, blank inherit) work unchanged.

### Model discovery is a harness capability

Model listing is a HARNESS CONTRACT capability: every harness exposes `listModels({ refresh })` (an optional, network-free disk refresh first — request paths must never block on provider catalogs), and the model views serve that listing projected onto the stable public shape. Concretely:

- `GET /compute/models` (served by `getAvailableModels({ refresh, harness })` in `api/routes/compute.js`, a thin route over the default harness from `sessionStore.getHarness()`) and `GET /harnesses/:id/models` (served by `api/routes/harnesses.js` from the registry view) share ONE implementation: `listPublicModels({ harness, refresh })` in `api/models.js`, TTL-cached per harness id by the process-wide `modelListCache` (`config.modelCacheTtlMs`, env `KAINBAIN_MODEL_CACHE_TTL_MS`). `?refresh=true` bypasses the cache read and refreshes the snapshot network-free.
- When the harness yields nothing, has no `listModels`, or throws, the served list falls back to the curated `FALLBACK_MODELS` (`api/models.js`, shared by both views) — the picker must never render empty. Task 970c0045 **de-staled** that fallback rather than removing it: the former google (`gemini-2.5-*`) and anthropic (`claude-3-7-sonnet`) entries — no configured registry, no credentials, never runnable — were deleted from the API and frontend lists (pinned by tests), so every fallback row mirrors the live ollama-cloud catalogue, and the credential-aware enrichment labels fallback rows honestly (a fallback entry is only ever "Ready" when the snapshot proves it; see “Per-harness health probes & credential-aware model availability” below). Projections go through `toPublicModel(m, harnessId)`, which drops SDK internals (`baseUrl`, `api`, `cost`, `maxTokens`, …) and tags every model with the owning harness's harness-scoped `key` (`harness::provider::id`) plus a `harness` field; both views validate against the shared `publicModelJsonSchema`. Every reference form resolves against the served snapshot.
- What a harness lists is its own concern: pi's `listModels` serves its ModelRuntime availability snapshot (with optional refresh); the old file-scan discovery path (`discoverModelFileModels`) was removed when listing moved behind the contract.

Per-project model lists (a different model set per harness instance) stay deferred; the per-harness cache slots above are what they would build on.

### Per-project harness selection

The engine resolves the harness PER PROJECT through the harness registry (`api/agent/harnessRegistry.js`) — the layer harness-scoped model keys unblocked. Session creation resolves in this order:

1. `project.harness` (the project's own choice, persisted only when the project chose explicitly),
2. `config.defaultHarness` (env `KAINBAIN_DEFAULT_HARNESS`, default `"pi"`),
3. the built-in default `"pi"`.

An unknown name never crashes — it warns once per (project, name) pair (console + a `[SYSTEM]` line in the project's process log) and falls back to the built-in default. Harness instances are memoized per name (harnesses own harness-level model caches), and the SessionStore keeps model runtimes keyed per harness name (`sessionStore.modelRuntimes`) so caches never bleed across harness types. A harness change applies on the NEXT session creation; a project's existing live sessions run on until disposal. The `/harnesses` API lists registered harnesses from the registry's id-keyed view, with `isDefault` computed live against the SessionStore's resolved harness.

### Per-harness health probes & credential-aware model availability

The `AgentHarness` contract carries an OPTIONAL `probeHealth({ refresh })` member (see
`api/agent/harnessContract.js`): the harness returns a
`{ name, status: 'ok'|'warning'|'error', latencyMs, timestamp, message, checks: { runtime, models, auth } }`
result. The engine never calls it unguarded — callers duck-type
`harness.probeHealth?.(opts)` (a regression gate in `api/agent/harnessContract.test.js`),
and a harness without the member is simply not probed. The pi harness implements it
(`api/agent/harnesses/pi/piHarness.js`): offline by default (snapshot + per-provider auth
status + the availability-refresh error, no network); `refresh: true` additionally re-checks
provider availability.

`HealthChecker` (`api/healthChecker.js`) accepts registered probes
(`registerProbe({ name, probe })`, names validated against `^[a-z][a-z0-9-]*$`). `api/index.js`
registers the session store's harness as the `pi` probe via a duck-typed adapter; probes run
in the same `Promise.all` as the built-in subsystem checks, each raced against
`KAINBAIN_HEALTH_HARNESS_TIMEOUT_MS` (default 4000, see `api/config.js`), and failures,
timeouts, and malformed results are normalized to an `error` check. Probe output is reported
under `checks.harnesses.<name>` in `/status` and `/status/health`; with zero probes the
aggregate is unchanged. The frontend surfaces the probe in `SubsystemHealthWidget` (a
"Models (pi harness)" card) and `HealthTrafficLight` (a fourth dot + popover row), both
hidden when the payload has no `checks.harnesses` entry.

**Runnability = credential validity.** The pi SDK's `ModelRuntime.getAvailableSnapshot()`
only contains models whose provider passed an auth check, so it is the source of truth for
"can this model actually run". The pure helper `withRunnableFlags(models, runtime)`
(`api/models.js`) tags each discovered model with `runnable`, `authConfigured`, `authSource`,
`authLabel`, and a human `statusLabel` (`Ready` / `Unavailable` / `No credentials`);
`providerAuthSummary(runtime)` produces the per-provider credential summary. With no runtime
the helpers are no-ops. `GET /compute/models` applies the enrichment (plus a top-level
`auth.providers` summary) whenever the shared runtime is reachable, and degrades to plain
_discovery_ output when it is not. Stage dispatch (`api/agentRunner.js`) warns loudly when a
requested model is not snapshot-confirmed runnable, naming the provider's auth state; the
opt-in `KAINBAIN_STRICT_MODEL_RUNNABLE` knob makes dispatch fail fast with the standard
`[Authentication Error]` classification instead.

**The curated fallback is de-staled, never misleading.** The never-empty picker semantics were kept (master's product decision): `listPublicModels` (`api/models.js`) serves the curated `FALLBACK_MODELS` when a harness yields nothing, has no `listModels`, or throws, and the frontend's `useModelCatalog` falls back to the shared `stageTypes.js` list the same way. Task 970c0045's contribution is the **de-stale policy**: the google (`gemini-2.5-*`) and anthropic (`claude-3-7-sonnet`) fallback entries that no real discovery produced and that could not run were removed from both lists (`api/models.js`, `frontend/src/components/stageTypes.js` — pinned by `api/models.test.js` and `api/routes/compute.test.js`), and every served row — discovered or fallback — carries the credential-aware badges (`runnable` / `statusLabel`), so an entry is never presented as "Ready" unless the availability snapshot confirms its provider's credentials.

## The task log pipeline

Task logs (the per-task Logs tab and the persisted `# Process Logs` markdown section) are built by a pure, harness-agnostic streamer, not by raw token streaming:

```text
normalized agent events (api/agent/sessionEvents.js)
  ├─ eventBridge.handleAgentEvent → WS MSG_*/TOOL_*  (activity console — id-grouped, unchanged)
  └─ agentRunner → api/agent/logStream/agentLogStreamer.js  (THE log seam)
        → structured entries (one per semantic block, never per token)
              ├─ task.logEntries   (capped, `config.logEntriesMaxCount`)
              ├─ task.processLogs  (rendered block text, byte-capped, `# Log Entries` round-trips)
              └─ feeds: main / thinking / tools
                    (GET /tasks/:id/logs?feed=&format= serves one feed)
```

Key behaviours: `thinking_delta` tokens are buffered and collapsed to a sized `[THINKING] (N chars)` marker on the main feed (full text stays on the thinking feed, expandable in the UI via a `fullTextId` link); tool calls are `[TOOL] name(args)` lines correlated to their `[RESULT]` excerpt by `meta.toolCallId`; entries carry `turn` numbers so the frontend renders turn → text/tool → result groups (`frontend/src/components/tasks/logEntryModel.js` + shared `LogsPanel`). Legacy tasks without `logEntries` fall back to parsing the old line-based text with the same tag grammar — no migration needed.

## Stage skills injection

Stages can attach user-authored **skill packages** (`skills/<name>/SKILL.md` + optional tolerant `KB_config.json`, global library at `<repo>/skills/` with a `<projectRoot>/skills/` overlay that shadows by name). At curation time `api/skills/skillInjection.js` appends two optional sections to the curated prompt — `# Stage Skills` (direct mode: full body + KB_config `context`, keywords layered stage-config > KB_config > built-ins via `customKeywords`) and `# Available Skills` (option mode: name + description + absolute SKILL.md path only; the agent self-reads the file with its own tools). Sections land after `# Stage` and before `# Previous Reports` so stage guidance keeps the last word; total injected text is capped (`KAINBAIN_STAGE_SKILLS_MAX_CHARS`, overflow omitted with a visible marker).

Why option mode is prompt-manifest + file (harness boundary respected): pi loads skills from the agentDir / project `.agents/skills` (trust-gated), not from an arbitrary KainBain skills dir, so wiring a native `skillPaths` bridge would couple the engine to the pi SDK. A prompt manifest plus an on-disk file the agent reads with its own file tools is harness-agnostic — every harness can implement it with plain file reads. Skills are operator-authored (same trust level as `stage.prompt`): server-authoritative content, never executed, KB_config JSON size-capped and tolerated (unknown fields preserved, invalid JSON flagged not thrown). With `stage.skills` absent or empty the curated prompt is byte-identical to the legacy format — locked by `api/promptCuration.skills.contract.test.js`.

Operators manage the library in **Settings › Skills**: the seven KainBain defaults (read-only) plus the active project's custom overlay. Custom skills import via `POST /projects/:id/skills/import` (a `.md` file, or a single-skill `.zip` with `SKILL.md` at the root or inside exactly one top-level folder, plus an optional sibling `KB_config.json`) into the project overlay only; missing frontmatter is normalized with reported warnings, name clashes are `409` unless `overwrite=true`, and shadowing a default is allowed but flagged. Project skills delete via `DELETE /projects/:id/skills/:name`. Full contract: `site-docs/api-reference.md` (Skills) and `site-docs/prompts-tokens.md` (Authoring and importing skills).

## Skill keyword reference metadata (kbRef)

KB_config keyword entries may carry optional `kbRef` (`"project" | "workflow" | "stage"`) and `dependsOn` metadata declaring that the keyword's value domain is a KainBain entity — `skills/creating-new-tickets/KB_config.json` is the reference example (`targetProject.kbRef=project`, `targetWorkflow.kbRef=workflow` + `dependsOn=targetProject`, `targetStage.kbRef=stage` + `dependsOn=targetWorkflow`). The metadata is data, not behaviour: `normalizeSkillKeywords` still flattens every entry to a plain `key → value` string map for prompt injection, while the raw shape survives verbatim on the descriptor as `config.keywords[key].kbRef` / `.dependsOn` and is exposed unchanged by `GET /skills` and `GET /skills/:name` (locked by `api/skills/skillsRegistry.test.js`).

**Canonical id storage + resolution rules.** The stage-skills config UI (StageSkillsPanel) reads the metadata and renders cascading entity dropdowns (Project → Workflow → Stage, scoped per `dependsOn`) instead of free-text inputs for those keywords. Selecting from a dropdown stores the canonical entity **id** in `stage.skills[i].config[key]`; options display `Name (id)` and mark the default workflow. Every selector keeps an explicit "Enter value manually…" escape hatch, and stored legacy values that match no known entity render as-is with a neutral "custom value" badge — nothing that worked before stops working.

Reference values are resolved by `api/kbReferences.js` (the one authoritative resolver, mirrored for UI labels by `frontend/src/hooks/useKbReferenceData.js`):

- **project**: exact `id`, then case-insensitive `name`, then case-insensitive `slug`.
- **workflow** (within the target project): exact `id`, then case-insensitive `name`.
- **stage** (within the target workflow): exact `id`, then case-insensitive `name`; without a workflow scope a stage reference must match **uniquely** across the project's workflows (ambiguous → unresolvable).
- `{{project}}` (optionally space-padded) is a valid built-in meaning "the project the stage runs in"; any other `{{…}}` template is treated as a valid run-time built-in and left alone.
- Empty-string overrides and non-string values mean "use the KB_config default" and are tolerated.

**Effective-project scoping (cross-project targets).** Validation resolves the _effective project_ first, order-independently (project-type keys before workflow keys, workflow keys before stage keys): an absent, empty, or `{{project}}` project-type key means the project being edited; a resolvable plain project reference means that known project. Workflow and stage references are then validated against the **effective project's** workflows — so a `creating-new-tickets` attachment on project A may target project B's workflow/stage (the documented primary use: the project that receives the new tickets), exactly matching the cascading dropdowns in the stage-skills panel. `listKnownEntities` exposes a cached `workflowsFor(projectRef)` accessor over the project store to make that per-project enumeration possible. When the project key itself does not resolve, the pre-existing fallback applies (the edited project's workflow set and the unique-match rule for stages).

**Save-time validation (fail-closed, legacy-tolerant).** `PUT /projects/:id/workflow` validates every `stage.skills[i].config` value whose keyword declares `kbRef` via `collectInvalidSkillReferences` (api/kbReferences.js) and rejects unknown references with a descriptive 400:

```json
{ "error": "Invalid skill target references in stage.skills", "details": [
  { "skill": "creating-new-tickets", "key": "targetWorkflow", "value": "wf-ghost", "reason": "Unknown workflow reference \"wf-ghost\" — no workflow with a matching id or name exists in project \"Scratch (proj-2)\"" }
] }
```

The `reason` names the effective scoping: a resolved project scope is quoted as `"Name (id)"` (the project whose workflows were searched), and a workflow scope as its id. Without a resolvable scope the message falls back to the unscoped wording ("…in this project's workflows").

Tolerated (never rejected): skills missing from the registry, skills whose SKILL.md/KB_config is unreadable or invalid, skills with no `kbRef` metadata (legacy KB_configs), unknown keys, non-string/empty values, and `{{…}}` built-ins. Injection logic is unchanged — `skillInjection.js` keeps consuming the flattened keyword map exactly as before (locked by the characterization tests in `api/skills/skillInjection.test.js`).

# project/kainbain#architecture #modular #3layer
