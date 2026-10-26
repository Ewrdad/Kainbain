# Harness registry & the model catalogue API

How the engine declares which agent harnesses exist, and how the UI's harness-first
model selector consumes that data.

## The seam

`api/agent/harnessRegistry.js` is the ONE place that knows **which harnesses exist** —
both as the construction + selection registry (factories, memoized instances,
per-project resolution: `project.harness` → `config.defaultHarness` → `"pi"`, with a
warn-once fallback for unknown names) and as the id-keyed HTTP VIEW registry
(`createHarnessRegistry()`) that `api/index.js` materializes once at startup and hands
to the `/harnesses` routes. Harness construction stays in `api/agent/harnesses/pi`, and
the session-behaviour contract stays in `harnessContract.js`. A future harness
registers a factory (`registerHarness("name", factory, { description })`) **and** is
projected into the composition root's view registry — every consumer below grows a
second entry without route or UI changes.

Model catalogues are a **harness contract capability**: each harness exposes
`listModels({ refresh })`, and every model view serves that listing projected onto the
stable public shape by `listPublicModels({ harness, refresh })` in `api/models.js`
(TTL-cached per harness id by the process-wide `modelListCache`, curated
`FALLBACK_MODELS` when a harness yields nothing/fails, `publicModelJsonSchema`
validation, harness-scoped `key` tagging — see `docs/EngineDetails/ModelKeys.md`).

## `GET /compute/models` response

```json
{
  "models": [{ "key": "pi::google::gemini-2.5-pro", "harness": "pi", "id": "…", "name": "…", "provider": "…", "input": ["text"] }],
  "harnesses": [
    { "id": "pi", "label": "pi coding agent", "description": "pi-backed AgentHarness …", "models": [ …same objects… ] }
  ]
}
```

- `models` is the default harness's catalogue (`sessionStore.getHarness()` through
  `getAvailableModels({ refresh, harness })` in `api/routes/compute.js`) — the flat
  view sessions actually resolve against.
- `harnesses` is **additive** and built by `harnessesView()` (routes/compute.js) from
  `deps.harnessRegistry.list()`: each entry carries the registry entry's `id`, its
  display `name` as `label`, its `description`, and its own catalogue through the same
  `listModels()` source. The default harness's entry reuses the flat `models` array (one
  cache slot, one listing) so `harnesses[0].models` is always the exact flat catalogue.
  The field must stay declared in the route's response schema — Fastify strips response
  fields missing from the schema.
- `?refresh=true` bypasses the model cache for both views (network-free disk refresh).
- The same data is also served per harness by `/harnesses` (identity + capabilities +
  live `isDefault`) and `/harnesses/:id/models` (one harness's catalogue).

## Frontend consumption

- `frontend/src/services/api.js` — `fetchCachedModels` caches the whole body (client TTL
  60 s, in-flight sharing) and normalizes a missing `harnesses` to `[]` (older backend /
  mocked doubles); `groupModelsByProvider(models)` turns a flat list into
  `SelectDropdown` options grouped by provider (providers in first-appearance order,
  provider-less models in an `Ungrouped` bucket); `modelOptionValue` prefers the
  backend's harness-scoped `key`.
- `frontend/src/hooks/useModelCatalog.js` — single fetch point returning
  `{ models, harnesses, loading }` with the app-wide fallback semantics.
- `frontend/src/components/common/ModelSelector.jsx` — the harness-first picker
  (see `docs/UI/DESIGN_SPEC.md` §3.6). It renders the harness row above the grouped
  model list; with no `harnesses` from the backend it wraps the flat catalogue as the
  single `pi` row, so the harness-first layout never collapses.

## Stored selection format

`project.defaultModel` and `stage.model` keep the shared reference grammar: canonical
`harness::provider::id` keys (what the current backend serves as `key` and the selector
emits on change), legacy `provider::id` composites, and oldest bare ids/names — every
resolver accepts all three, so nothing already stored breaks
(`docs/EngineDetails/ModelKeys.md` has the grammar and resolution order). The harness
choice in the selector is UI navigation, not persisted state; server-side resolution
(`agentRunner` → harness `resolveModelRef`) hands the dispatch-resolved ref to session
creation (target hand-off, ADR 0005), so a cross-harness run never re-resolves the
project default against the wrong catalogue.

## Target hand-off & save-time validation tiers

Dispatch owns the harness+model combination for stage runs: `agentRunner` forwards
`stageMeta.model` alongside `stageMeta.harness`, the session store threads it into
`harness.createSession`, and the harness pins it (skipping `resolveInitialModel`).
`none`-selection harnesses accept and ignore the hand-off. The session-init log line
reports the resolved pair (one peeked display-target read, no rotation consumed).

Project saves validate stored combinations in two tiers (`api/aliasTargets.js`, wired
in `POST/PATCH /projects`):

- **Hard (400):** model on a `none` harness; unknown harness id; malformed ref.
- **Soft (200 + `warnings[]`):** catalog-miss targets/defaults; ignored defaults on
  `none` harnesses; unresolvable project-default aliases.

Response-schema note: any added `warnings` field on save responses must be declared
in the Fastify response schema or Fastify strips it — the POST 201 schema declares
`warnings: string[]` (PATCH carries no response schema, so it passes through). The
Settings UI surfaces `warnings[]` inline next to the save button, badges each alias
target (`valid` / `unknown-model` / `unknown-harness`), and warns — with explicit
"Pick a model for this harness" / "Keep and warn" actions, never an auto-rewrite —
when the stored default no longer resolves in the effective harness's catalogue.

**Follow-up:** when a second harness is registered, the additive `harnesses[]` view and
the selector already support it (the model list simply switches with the harness row);
persisting the harness choice per project/stage stays an explicit follow-up until then.
