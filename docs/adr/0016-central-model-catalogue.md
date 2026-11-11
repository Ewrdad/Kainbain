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
