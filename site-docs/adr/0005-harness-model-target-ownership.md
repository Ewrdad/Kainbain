# ADR 0005 — Harness↔model target ownership (dispatch owns the combination)

**Status:** Accepted
**Date:** 2026-10-05
**Task:** `92435310-d3d3-4716-a56d-5dd144ba2988`

## Context

A stage run's harness↔model combination was decided in three independent
places with different context:

1. **Dispatch** (`resolveStageTarget` in `api/agentRunner.js`) computed the
   correct concrete target (alias-aware) but handed only the harness half to
   session creation, applying the model later via a second `switchModel` path.
2. **Session creation** (every harness's `createSession`) independently
   re-resolved `project.defaultModel` against its OWN catalog via
   `resolveInitialModel(project)` — with no stage context.
3. **Save time** never tied a stored model ref to the harness that would
   consume it, and the init log reported un-resolved values
   (`harness: <store default>, Model: <alias name>`).

Every harness change (stage overrides, alias rotation, post-hoc edits)
therefore turned a formerly valid combination into a foreign one, discovered
only at spawn time as a loud `[WARN] Configured model … could not be
resolved against the <harness> model catalog` plus a silent fallback —
even when the run then switched to the correct alias model (the warning's
"will be used" claim was false). Three harnesses also implemented three
different `resolveInitialModel` semantics (only pi normalized legacy refs).

Hard constraint: the app is in live use; the seam change must be additive
(optional `opts.model`), with no stored-format migrations and no silent
rewrites of user data.

## Decision

**Dispatch owns the harness+model combination for stage runs; harness
`createSession` consumes it.**

- **D1 — Target hand-off into `createSession`.** `agentRunner` forwards the
  dispatch-resolved ref as `stageMeta.model`; `SessionStore.beginStageSession`
  → `_create` threads it into `harness.createSession(project,
  { …, model })`. When `model` is present the harness resolves it via its own
  `resolveModelRef()` and pins it, **skipping** `resolveInitialModel`
  entirely. Unresolvable hand-offs warn once and use the harness default —
  never a silent swap. `none`-selection harnesses (muse, custom) accept and
  ignore `model`. Creations *without* `model` (chat, warm-up, retro without
  a target) keep the documented `resolveInitialModel` behavior. The runner's
  post-creation switch is idempotent (a no-op when the active model already
  matches provider+id+effort).
- **D2 — `resolveInitialModel` parity + classification.** All catalog
  harnesses (pi, antigravity, opencode) normalize stored refs via
  `normalizeModelRef(ref, HARNESS_ID)`. A canonical 3-part key naming a
  *different* harness is not that harness's default at all: one INFO line
  (deduped per project+ref), never the scary WARN. Unqualified misses keep
  the loud WARN, upgraded to name the cross-harness possibility and the
  Settings fix path.
- **D3 — Save-time validation tiers** (`api/aliasTargets.js`, wired in
  `api/routes/projects.js` POST/PATCH):
  - HARD (400): model on a `none` harness; unknown harness id; malformed
    ref (`parseModelKey` null); malformed payload `defaultModel`.
  - SOFT (200 + `warnings[]`): catalog-miss alias targets / defaults
    (`list` harnesses only, via an injectable `modelIdsFor` probe — an
    unreadable catalog warns about nothing); ignored defaults on `none`
    harnesses; unresolvable project-default aliases. Stored values
    re-checked under a changed harness warn softly only.
  - `warnings[]` is declared in the POST 201 response schema (Fastify
    strips undeclared fields); PATCH carries no response schema.
- **D4 — Canonical keys on new writes, no migrations.** `ModelSelector`
  already emits harness-scoped keys; legacy refs keep resolving via
  read-time normalization. Changing a project's harness never rewrites
  stored values — the UI shows the mismatch with explicit actions.
- **D5 — Honest init line.** `executeStage` peeks the display target ONCE
  (`peekStageDisplayTarget`, no rotation consumed) before the init line and
  logs the resolved `harness` + `Model`, reusing the same target for run
  attribution. Rigs without a session store keep the legacy wording.
- **D6 — Retrospective chat alignment.** Retro turns resolve through
  `resolveStageTarget` (consuming one rotation step like any run) and hand
  the resolved model to session creation; alias misses fall back to the
  project default, never the raw alias name.

## Alternatives considered

- **Warning-text-only fix.** Would silence the confusion but leave three
  owners of one decision; the next harness/alias change reintroduces it.
- **Rewrite stored refs on harness change.** Rejected: silent data rewrites
  destroy user intent (a pi-scoped default is *correct* for pi stages).
- **Block catalog misses at save (hard).** Rejected: catalogs drift and
  discovery may be offline at save time; blocking saves on transient state
  bricks Settings.

## Consequences

- Cross-harness runs no longer warn about the project default; genuinely
  foreign stored defaults surface once as INFO (creators without a target)
  or as Settings-time soft warnings.
- New tests pin the contract per harness, the validation tiers at route
  level, the init line, and the frontend badges; `npm run test:unit` and
  `npm run lint` are the gates.
- Rollback is per-phase: dropping `stageMeta.model` restores pre-fix
  dispatch with validation + init-line fixes intact.

## Deviation note

The plan listed "`defaultModel` blank/“default” on a `none`-harness project"
as a HARD reject; that reading rejects every default none-harness project,
and the sane correction (non-blank → hard) would 400 existing Settings
saves that always re-send the stored default. Implemented as a SOFT warning
instead (stored value ignored at dispatch, surfaced for cleanup).
