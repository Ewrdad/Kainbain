# ROOT_CAUSE — Runner autodetect + model catalogue (task 9d2b75a2)

Phase 0 diagnosis. Chain under test:

```
muse CLI model/list → runner leg → facts.models → heartbeat →
fleet catalogue → /compute/models sections → withFleetModels merge → picker
```

A second chain covers aliases: stored target → load sanitize →
editor draft → save validation → persisted.

Verdicts use CONFIRMED (breaks the chain) / RULED-OUT / CONDITIONAL
(real mechanism, fires only in some configurations).

## Suspect verdicts (plan 0.1)

### (a) No backend `muse` harness section — RULED-OUT (as stated)

The backend always registers all 8 harnesses including `muse`
(`api/crew/harnessRoster.js:143-155`), so `/compute/models`
`harnesses[]` always carries a `muse` entry and `withFleetModels`
always has a section to merge fleet muse ids into.

BUT the entry can be `modelSelection: "none"` with `models: []`
(see suspect (f)): user-visible effect is near-identical ("nowhere to
select a muse model") whenever the fleet does not serve muse.

### (b) The `serving` gate — CONFIRMED mechanism, CONDITIONAL trigger

`fleetModelsForHarness` (`frontend/src/services/fleetModelOptions/fleetModelsForHarness.js:38`)
drops a harness-scoped id from its own section when the fleet entry's
serving-harness union is non-empty and lacks that harness. Fires
whenever a runner advertises muse ids without `muse` in its
configured harnesses (stale harness pin, manual model pin, harnessAuto
missing the CLI). Silent drop, no warning.

### (c) Runner muse-leg colon filter — CONFIRMED

`runner/modelDiscovery.js:132` drops any row whose provider or model
contains `:`:

```js
if (!provider || !model || provider.includes(":") || model.includes(":")) continue;
```

The shared grammar explicitly allows single `:` in ids
(`shared/modelKeys.js:16-18`, e.g. `glm-5.3-flash:cloud`), the
curated fallback is full of `:cloud` ids, and the backend MSP parser
(`parseMuseMspModels`) has no such filter — so backend-MSP and the
runner leg disagree: the backend would serve the id while the runner
silently drops it. Any new `muse serve` row with a `:` in
provider/model never reaches `facts.models`.

### (d) Pin-wins + 12 h cadence — CONFIRMED (by design, but invisible)

- Pinned runners skip scanning entirely (`runner/daemon.js:747`).
- Unpinned runners scan at boot + every 12 h
  (`MODEL_DISCOVERY_INTERVAL_MS_DEFAULT`, `runner/modelDiscovery.js:187`).

A new model stays hidden until the next round (or forever when
pinned). The effective source (pinned vs discovered, last scan time)
is not visible per runner anywhere in the UI.

### (e) TTL caches — CONFIRMED as delay, not loss

`modelListCache` (backend, `config.modelCacheTtlMs`), MSP catalogue
5 min (`MUSE_MSP_MODEL_CACHE_TTL_MS`), client 60 s
(`MODELS_CACHE_TTL_MS`). `?refresh=true` / Refresh bypasses all
three. Delay-only; cannot permanently hide a model.

### (f) Transport-dependent muse `modelSelection` — CONFIRMED (primary break)

`api/agent/harnesses/muse/museHarness.js:562`:

```js
modelSelection: transport === "msp" ? "list" : "none",
```

`auto` engages MSP only when the resolved binary advertises `serve`
(`selectMuseTransport`, `museMspSupport.js:400`); otherwise the
backend runs exec and muse is `none`. Consequences:

1. `/compute/models` muse entry is `none` + `models: []`; the picker
   renders "This harness manages its own model" and offers NO model
   control unless the fleet serves muse (`effectiveModelSelection`
   none→list flip). New muse models are unselectable on exec
   backends with no fleet coverage.
2. Alias wipe on load (see W1 below).
3. Alias save refusal (see W2 below).

Note the exec transport DOES consume a model (`--model` plumbing,
`museHarness.js:693-696`), so `none` means "no catalogue to pick
from", not "model meaningless" — destroying stored muse models is
data loss, not cleanup.

### (g) Operator allowlist shadow — CONFIRMED mechanism, by design

`effectiveRunnerModels` (`api/flow/dispatch/runnerMatches/effectiveRunnerModels.js:14`)
replaces the advertised list with `operatorConfig.availableModels`
when set. A stale allowlist hides runner-discovered new models from
BOTH the fleet catalogue and dispatch. Consistent, but there is no
staleness signal.

## Alias wipe verdicts (plan 0.2)

### W1 Load-path blanking — CONFIRMED (the reported wipe)

`sanitizeAliasTargetModels` (`api/aliasTargets.js:458-483`) blanks
the model on every `none`-harness target at project load
(`api/projectStore.js:393-399`), and the next save persists the
blanked row. Whenever the backend muse transport is exec, EVERY
project load wipes EVERY muse alias target model. Console-only
warning; the stored value is destroyed.

### W2 Save-time hard refusal — CONFIRMED

`validateAliasTargetModels` (`api/aliasTargets.js:242-249`)
hard-refuses muse+model when `modelSelectionFor(muse)` is `none`.
The projects routes wire fleet-aware probes
(`api/routes/projects.js:43-47`, `api/index.js:254` + `:301`), so the
refusal lifts while the fleet serves muse — and returns the moment
fleet coverage lapses. Flapping gate.

### W3 UI harness-change clear — CONFIRMED (user-action-triggered)

`ModelAliasesSection.jsx:584` (and `:719` in the blocked-level
notice) clears the draft model on harness switch. Silent draft data
loss; saving persists it.

### W4 `normalizeModelAliases` drops — RULED-OUT as churn wipe

It drops only structurally invalid records (bad name, bad percent,
non-object) and never consults a catalogue, so catalogue churn
cannot invalidate a saved alias through this path.

### W5 Picker rewrite of unknown models — RULED-OUT

`modelKeyForValue` returns the stored value verbatim when
unresolvable, drafts (not resolved values) are saved, unknown-model
is soft (`targetValidity` → badge + save succeeds), and
`SelectDropdown` never fires `onChange` by itself. The stored value
survives catalogue churn in the UI.

## Other-leg audit (plan 0.3)

The colon-drop defect class is muse-runner-leg-only:

| Leg | Verdict |
|---|---|
| `pi` | OK — serves SDK ids verbatim; honest-empty `PI_MODELS_EMPTY` |
| `muse` (runner) | BROKEN — `:` filter (suspect c) |
| `muse` (backend MSP) | OK — no colon filter |
| `antigravity` | OK — `withModelKey`, single `:` fine; classified errors retained |
| `vibe` | OK — `withModelKey`, single `:` fine; retained errors |
| `opencode` | OK for `:`, note: `::`-bearing rows skipped silently in try/catch (`runner/harnessModelDiscovery.js:635-639`); string rows pass through to leg validation which drops invalid ids silently when siblings are valid (`runDiscoveryLeg`, `:213-231`) |
| `codex` | OK — honest-empty by design (`CODEX_DISCOVERY_UNAVAILABLE`) |

Latent (out of scope, noted): `withModelKey` THROWS on
`::`-containing ids, so one weird agy/vibe row fails the whole
parse into a classified error instead of quarantining the row.

## Failing tests (red → green)

Written in Phase 1.2, all red on this tree before the fix:

1. `runner/modelDiscovery.test.js`: `muse serve` row with single-`:` id
   flows through `discoverClaudeModels` (suspect c).
2. `api/flow/dispatch/fleetModelCatalog` quarantine test: malformed
   runner-advertised id is quarantined with a reason, never served
   (plan 3.2; no quarantine exists today).
3. Route test: `/compute/models` carries a union section for a
   fleet-only harness id after one runner heartbeat (plan 3.3).
4. `api/aliasTargets.test.js` + project load test: muse alias target
   model survives load+save on an exec backend with a warning (W1).
5. `ModelAliasesSection` test: harness switch preserves the draft
   model (W3).

## Chain diagram (muse new-model, exec backend + healthy runner)

```
muse CLI model/list (new row, e.g. id with ':')
  │  backend exec: no backend listing at all (listModels → [])
  ▼
runner leg probes `muse serve` stdio
  │  ✗ (c) ':' row dropped   ✗ (d) pinned/12h hides scan
  ▼
facts.models ──heartbeat──▶ registry capabilities
  │  ✗ (g) operator allowlist replaces list
  ▼
fleet catalogue (live-derived, never persisted)
  │  ✗ offline/paused runner: entry vanishes silently
  ▼
/compute/models muse section (none + []) + fleet merge
  │  ✗ (b) serving gate drops id when runner harnesses lack muse
  │  ✗ (e) TTLs delay visibility
  ▼
picker: "manages its own model" OR option without the new id
```

And the alias chain on an exec backend:

```
stored {harness:'muse', model:'muse::meta::x'}
  │  ✗ (W1) load sanitize blanks model → next save persists ''
  ▼
editor draft (model already '') ──harness switch──▶ ✗ (W3) clears again
  │  ✗ (W2) save refused while fleet does not serve muse
  ▼
persisted '' — the wipe the task reports
```
