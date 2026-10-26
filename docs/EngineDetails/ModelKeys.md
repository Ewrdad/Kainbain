# Model keys & resolution

How a model is referenced, stored, and resolved — and why stored references keep working across key-format changes.

## The four reference forms

| Form | Example | Status |
| --- | --- | --- |
| `harness::provider::id::reasoning` | `pi::ollama-cloud-direct::glm-5.3-flash:cloud::high` | **Canonical with Reasoning level** — optional 4th segment, only on harnesses with adjustable reasoning |
| `harness::provider::id` | `pi::ollama-cloud-direct::glm-5.3-flash:cloud` | **Canonical** — what producers emit today |
| `provider::id` | `ollama-cloud-direct::glm-5.3-flash:cloud` | Legacy composite key — still accepted everywhere |
| bare `id` / `name` | `glm-5.3-flash:cloud` | Oldest form — first-match fallback |

Model ids may contain single `:` (`glm-5.3-flash:cloud`, `deepseek-v4-flash:0731-cloud`) but never `::`. Provider ids are config keys. Harness ids are lowercase `[a-z0-9][a-z0-9_-]*` (URL-safe).

Task-history timeline rows record the *resolved* run choice (`harnessId`, `modelRef`, `aliasName`, `targetIndex`) using this same `harness::provider::id` vocabulary, on the row of the stage that ran it — see `api/flow/runAttribution.js` and `api/flow/stageExecution.js`.

## The parsing rule (the one rule to remember)

Split on the FIRST `::`, then the NEXT `::`, then the optional THIRD `::` — **never `split("::")`**, which would truncate ids that contain `:`-pairs (a naive split of `pi::ollama-cloud::glm-5.3-flash:cloud` would yield an id of `glm-5.3-flash` plus a bogus `cloud` segment). No segment may itself contain `::`; keys with 5+ segments are malformed. Malformed keys are rejected (parse → `null`, builders → thrown error), never read as a wrong model. A Reasoning level rides only on the harness-scoped form — bare and `provider::id` refs can never carry one.

## Canonical module

`shared/modelKeys.js` (plain ESM, zero deps) is the single grammar implementation, re-exported by `api/models.js` (backend canonical import point) and `frontend/src/services/api.js` (frontend switcher) — the grammars cannot drift, and a parity test (`frontend/src/services/api.test.js`, "frontend helpers match the backend canonical module") locks the matrix.

- `modelKey(provider, id)` — legacy 2-part builder (still accepted).
- `harnessModelKey(harness, provider, id)` — canonical 3-part builder; throws on malformed segments.
- `parseModelKey(ref)` — parses any accepted form into `{ form: "harnessReasoning"|"harness"|"provider"|"bare", … }` (4-part refs yield `{ harness, provider, id, reasoning }`); `null` for malformed input (resolvers treat that like an opaque string, never throw).
- `splitReasoning(ref)` / `stripReasoning(ref)` / `appendReasoning(ref, level)` — separate, drop, or attach the optional Reasoning level; builders validate (non-empty, trimmed, no `::`).
- `validateModelRefShape(ref)` — grammar shape without a catalogue: `"bare"|"provider"|"harness"|"harnessReasoning"`, or `null` when malformed/blank. Save-time validation hard-rejects malformed non-blank refs.
- `classifiesForeignHarness(ref, harnessId)` — true only for canonical 3-part keys naming a *different* harness (legacy/bare refs are harness-agnostic). Harnesses downgrade foreign misses from WARN to INFO.
- `normalizeModelRef(ref, defaultHarness)` — injects the default harness into legacy 2-part references; bare ids, `\"default\"`, and anything unparseable passes through untouched.
- `withModelKey(m, harness?)` — tags a model object with `key` (and `harness` when a harness is supplied); non-destructive, and the 1-arg legacy shape is preserved (including bare `list.map(withModelKey)` callbacks).
- `resolveModel(available, target)` / `resolveModelFromRegistry(runtime, target)` — snapshot / full-registry resolution accepting all three forms.

## Resolver order (locked by tests)

1. **Availability snapshot** — `resolveModel(available, ref)`; composite keys match by stored `key` first, then provider + id (a 3-part key naming a foreign harness still resolves by its `provider::id` segments, preferring a harness match when one exists).
2. **Full registry** — `resolveModelFromRegistry(runtime, ref)` via `getModel(provider, id)`; the availability snapshot can transiently drop a provider when an auth re-check flakes, and the registry is the safety net before giving up.
3. **Bare fallback** — first-match `id`/`name` scan, preserved exactly for the oldest stored references.

Order of the pi harness's own resolution (`resolveModelRef`, `resolveInitialModel`): snapshot → refreshed snapshot → full registry → loud, visible fallback (never a silent model swap).

## Where normalization happens

Stored references are **never rewritten at deploy time** — normalization is on-read:

- `api/agentRunner.js` (model-switch block) normalizes the stage/project model reference with `normalizeModelRef(ref, session.harnessId)` before resolving; user-visible warnings keep quoting the ORIGINAL stored reference. A 3-part key naming a foreign harness still switches (provider::id is unique with one configured harness) and emits a deprecation-style `[WARN]`. The switch is idempotent: a session created already pinned (target hand-off) skips the re-pin.
- Every catalog harness (`pi`, `antigravity`, `opencode`) normalizes `project.defaultModel` (`resolveInitialModel`) and hand-off/`resolveModelRef` targets with its own `HARNESS_ID` before resolving (parity — previously only pi normalized).
- Harness identity: each harness's `HARNESS_ID` lives in its own module (single source, also `harness.id`); the engine reads it from the session contract (`session.harnessId`) — never by importing the harness.

## Adjustable Reasoning levels (`::level`)

A model reference may carry an optional 4th `::` segment naming a Reasoning
level, e.g. `pi::ollama-cloud::glm-5.3-flash:cloud::high`. The level lives
inside the alias target's model string (no new stage field — stages deliberately
have no per-stage Reasoning override) and is carried through alias resolution
and dispatch untouched. There is no global or project-wide default level: old
1–3 part IDs keep working with no migration.

Each harness advertises its own allowed levels (`reasoningLevels`, `null` when
it has no adjustable reasoning); model lists (`GET /compute/models`,
`/harnesses/:id/models`) project the harness set plus per-model
`supportedReasoning` where known.

| Harness | Adjustable reasoning? | Allowed levels | Native knob |
| --- | --- | --- | --- |
| `pi` | Yes | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` | pi SDK `setThinkingLevel(level)` |
| `antigravity` | Yes | `low`, `medium`, `high` | `agy --effort <level>` |
| `mock` | Yes (recording-only, for tests) | `low`, `medium`, `high` | recorded on the active model |
| `opencode` | No (`null`) | — | none (server API takes only provider + model id) |
| `codex` | No (`null`) | — | none |
| `vibe` | No (`null`) | — | none |
| `muse` | No (`null`) | — | none (no client RPC to set it) |
| `custom` | No (`null`) | — | none (free-text command) |

Safety mechanisms (defense in depth):

- **Save-time hard reject** — alias, project-default, and stage saves refuse a
  level on an unknown harness, on a harness with `null` levels, or outside the
  advertised set. Live-catalog membership stays soft (catalogs drift, discovery
  may be offline); the level itself validates against the harness's declared
  static set.
- **Runtime ignore** — dispatch strips any level the run's harness does not
  currently support, emits a `[WARN] reasoning level '…' not supported by
  harness '…'; using model default` stage message, and runs on. A level problem
  alone never fails a stage.

## Optional batch migration

`scripts/migrate-model-refs.mjs` (delivered unused — runtime never needs it) rewrites legacy `provider::id` values in `.kainbain/project.json` stores (`defaultModel`, stage `model` fields) to the canonical harness-scoped form. Dry-run by default; `--write` applies. Bare ids and the `\"default\"` sentinel are left untouched.
