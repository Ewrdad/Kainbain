# ADR 0016 — One trusted central model catalogue (persisted fleet snapshot)

**Status:** Accepted.
**Date:** 2026-11-11.
**Context:** Task `9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7` — runners fail to
autodetect reliably (notably Muse Code), a brand-new harness model is not
selectable in the UI, and muse alias targets keep losing their stored
model. Diagnosis (`docs/tasks/9d2b75a2-1ecd-47ce-a9f9-b3068c5f5cf7/ROOT_CAUSE.md`):
the runner leg drops grammar-valid ids, pins/cadence hide discovery, the
fleet catalogue is live-derived and never persisted (offline runners vanish
silently), and the backend muse `modelSelection` flips with the transport,
which also wipes stored alias models on load.

## Decision

1. **The fleet catalogue gains a persisted snapshot; the live derivation
   stays the computation.** `GET /runners/models/catalogue` updates a
   snapshot from the current registry records on every read (same
   freshness guarantee as before — joins, leaves, heartbeat updates,
   and allowlist edits reflect on the next read) and serves the
   snapshot: available entries with harness attribution, effort tiers,
   runner counts, and per-runner provenance (detecting leg +
   detected-at), unavailable entries marked with a reason instead of
   deleted, and malformed ids quarantined with a reason instead of
   silently dropped. The snapshot persists to
   `~/.kainbain/engine/fleet-catalog.json`
   (`KAINBAIN_FLEET_CATALOG_FILE`, empty disables) so the UI never
   depends on a transient read; after a backend restart, entries read
   as unavailable until their runners heartbeat again.
2. **`GET /compute/models` is the central list; its harness set is the
   UNION of backend-known and fleet-served harnesses.** Backend
   sections merge fleet-only ids (backend entries win ties by key);
   fleet-only harness ids gain synthesized sections, so a future
   harness needs no backend registration to be selectable. Fleet ids
   stay byte-identical end to end (dispatch matches verbatim).
3. **Dispatch and save-time validation keep reading the live derivation**
   (`buildFleetModelCatalog`, unchanged semantics): only
   claim-eligible runners decide what can run. The snapshot is the
   UI/diagnostics source, never a dispatch input.
4. **Effort rides as catalogue attributes, not a new key format.** The
   brief's `harness::model::effort` is the canonical
   `harness::provider::id(::reasoning)` key plus the entry's `tiers`
   union (and the reasoning segment where advertised) — see
   `docs/EngineDetails/ModelKeys.md`. No stored-format migration.
5. **Aliases are never silently wiped or retargeted.** Stored targets
   survive catalogue churn byte-identical (kept with a warning, never
   blanked on load); new models appear as extra options only.

## Consequences

- Staleness is now explicit: unavailable entries render
  marked-unavailable with reasons in every picker (survey q4 default);
  quarantined ids surface in Settings › Runners instead of vanishing.
- Old runners (no `modelSource`/`modelProvenance`) read as
  unknown-source entries; old UI builds ignore the additive snapshot
  fields.
- Rollback is per layer: the fleet endpoint can revert to the pure
  live derivation, and `/compute/models` can drop the `fleet` merge
  input, without losing the runner-leg detection fixes.
- Fallback considered and rejected: live-derived central computation
  with no store. It fixes selection but keeps the transient-read
  failure (a restart or a brief runner outage blanks the list with no
  explanation), which the snapshot's mark-unavailable semantics solve.

## Amendment (same day, post-review): pin ∪ discovered advertisement

Review found the catalogue could still hide a brand-new harness model:
pinned Runners (`KAINBAIN_RUNNER_MODELS`/`KAINBAIN_RUNNER_MODEL`) skipped
discovery entirely, so a fresh release (e.g. a new Muse model) never
reached the fleet. The Runner default is now **pin ∪ discovered**
(`resolveAdvertisedModels`): discovery scans pinned Runners too (boot,
cadence, Re-detect), grammar-validated discovered ids join the pin, and
the pin is never dropped — a broken scan cannot hide it. The heartbeat
labels this `facts.modelSource: "pinned+discovered"` (additive vocabulary;
old backends drop it silently). `KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1`
keeps discovery-replaces-pin as the explicit opt-in. The muse leg's
`muse serve` probe now passes `--provider <meta>` and the same handshake
shape as the backend MSP catalogue, so both sides read the host
identically.

## Amendment (2026-11-12, post-review): stale claims are not dispatchable

Review found the catalogue marked stale pins unavailable in the UI while
dispatch still honoured them at runtime — the fleet would route work to a
runner for a model its own scan proved absent. The shared
`confirmRunnerModel` verdict now also gates the live paths: `runnerMatches`
refuses a `stale` model exactly like an unoffered one (`NO_MODEL`, same
loud diagnostics), and `buildFleetModelCatalog` drops stale claimants
from counts (stale-only ids vanish from the live view; the snapshot
still marks them unavailable per survey q4). The match itself stays
verbatim — only conclusive `stale` verdicts refuse, so old runners,
failed scans, and legacy/bare ids match exactly as before. The
operator's `availableModels` override is an explicit servability
declaration and wins over runner-reported signals in all three views
(snapshot, live, dispatch).

## Amendment (same day, post-review): stale-pin marking

Review found the union could serve ids no harness backs: a Runner pin
naming a retired model advertises it as available ("runners muse code
doesn't have"). The snapshot now confirms every harness-scoped id
against the claimant's own discovery signals (`modelProvenance` +
`discoveryStatus`, see `api/flow/dispatch/runnerModelConfirmation.js`
+ `api/flow/dispatch/staleAdvertReason.js`):
an id every claimant's successful scan contradicts is marked
unavailable with the stale-pin reason and its `claimedBy` runners —
still shown in its section (survey q4), never served as available.
Every inconclusive shape fails open to trusted (failed/missing scan,
old runners with no provenance signal, truncated maps, legacy/bare
ids), and dispatch keeps reading the live derivation unchanged
(operator intent still wins at runtime; the catalogue is the honest
display). The frontend safety-net merge re-attaches the snapshot
verdict so the badge is identical whichever merge path added the
option, and the agy/vibe row parsers skip single unkeyable rows
instead of failing the whole harness menu.

## Amendment (2026-11-13, WP-C): canonical-id contract with verified counts

Review found the catalogue counted what it could not prove and served
ids under harnesses that never named them (task `b3401f19`, causes N4/N6):
every local-alpha entry carried the runner's WHOLE harness list, so
provider/bare ids leaked into every picker section, and pins with no
discovery result showed "1 runner" with zero verification. The
catalogue now enforces a canonical-id contract with verified counts
(task `94ee5786`):

1. **Canonical ids only.** Only `harness::provider::model[::effort]`
   ids enter `models`. Bare and `provider::id` forms are quarantined
   with a not-harness-qualified reason (audit trail, never served),
   and a harness-scoped id naming a harness the runner does not serve
   is quarantined with a harness-not-served reason.
2. **Per-entry attribution.** `entry.harnesses` is exactly
   `[parsed.harness]` — the harness named by the id — never the
   runner's whole harness list. Two harnesses may serve the same model
   differently and the user deserves that choice.
3. **Verified counts.** `runnerIds`/`runnerCount` name only
   claim-eligible runners whose own discovery CONFIRMED the id
   (`modelProvenance` lists it AND the naming `discoveryStatus` leg is
   successful and fresh, ≤1 day old). Advertised-but-unconfirmed
   claimants (pins, allowlist entries, no-signal runners) move to
   `declaredBy`; contradicted pins stay in `claimedBy`. Unverified
   entries read `available: false`, still visible/selectable, marked
   with the reason.
4. **Derived availability.** `available` (`runnerCount > 0`), `verified`,
   and `unavailableReason` are derived on read, never persisted. The
   reason priority is: declared (`declared by N runners, not verified
   by discovery`) → stale (existing stale-pin wording) → last-served
   (`0 runners -- last served 3d ago by box-a`) → `never served by
   any runner`.
5. **Indefinite retention + admin removal.** 0-runner entries are kept
   forever (no models size cap; the quarantine cap stays). Admin
   `DELETE /runners/models/catalogue/:id` and
   `DELETE .../quarantine/:id` remove one record permanently (204/404);
   a re-advertised id reappears on the next read. Project/alias
   references are untouched (still served "not currently served" via
   the derived reason).
6. **Fleet harness summary.** The response adds `harnesses: [{ id,
   runnerCount, runnerIds }]` computed live from claim-eligible
   runners' `capabilities.harnesses` (never persisted).
7. **Load-time migration (idempotent).** Persisted bare/provider entries
   move to `quarantined` on load; harness entries get `harnesses`
   rewritten to `[parsed.harness]` with last-served defaults, and
   stored `available`/`unavailableReason` dropped (derived on read).
