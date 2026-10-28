# ADR 0004 — Harness pluggability and mock mode

**Status:** Accepted
**Date:** 2026-10-04
**Task:** `f5c0c49f-d241-46a0-aeaa-1c874ea274e9`
**Audit:** docs/tasks/b61469b8-5c10-498d-aa52-5bba8a397a9d/AUDIT.md (notes-space run archive, pre-reversal; not a repo path)
§3.2 N-5/N-6, §6.1 C-13, §8 item 3, §8 item 9, §10 U-10/U-12;
peer review F-8.

## Context

The default harness (`pi`) and the model catalog assumed the author's
machine: hardcoded `ollama-cloud` fallback lists, a `deepseek-v4-flash`
substring match in model resolution, agent CLIs (`agy`, `muse`,
`opencode`) expected on `PATH`, and LiteLLM/SecObserve homelab endpoints
in the probe path. A fresh box with no CLIs and no API keys could not run
an agent stage at all — and failures surfaced as generic 500s, not as
"this box has no harness". Meanwhile the only harness internals
documentation lived in `docs/EngineDetails/*.md`, out-of-repo in the
notes space (C-13): it does not travel with a clone, so it could neither
record platform decisions (§8 item 9) nor guide an independent user.
(api/docs/ is untracked pi-harness scratch with one tracked exception,
`testing-with-mock-harness.md` — F-8 — not engine state.)

Hard constraint: the app is in active use for its own development on the
author's pi harness, so resolution order, model identity, and every
working harness path stay behavior-identical.

## Decision

Make harnesses a registry with honest availability, and ship a mock that
runs anywhere but never silently:

- **D1 — One registry, one resolution chain.**
  `api/agent/harnessRegistry.js` owns `registerHarness` and
  `resolveHarnessForProject`: an explicit `stage.harness` override wins,
  then `project.harness`, then `config.defaultHarness` (env
  `KAINBAIN_DEFAULT_HARNESS`, default `pi`). Unknown names warn once and
  fall back to the built-in default — the single warning point.
- **D2 — Capability guard, never a 500.** Optional harness surface
  (steering, follow-up, compaction, context usage, session-tree ops) is
  called through `api/agent/harnessContract.js`: an unsupported capability
  answers `501 { code: "unsupported_by_harness", capability }`, and
  unknown session entries answer `404 { code: "entry_not_found" }`.
- **D3 — Discovery is cheap, cached, and honest.**
  `api/agent/harnessDiscovery.js` probes from `fs` existence checks only
  (never spawns, never network — pi via its model snapshot, CLI harnesses
  via binary resolution, opencode additionally via `OPENCODE_URL`
  connect-mode), TTL-cached (`KAINBAIN_MODEL_CACHE_TTL_MS`), with
  `custom`/`mock` reported `available: true` (`detectionSource: 'builtin'`)
  by definition. Unresolvable models render as "Unknown" with a hint
  naming the fix — never a default harness name.
- **D4 — The mock harness is first-class and explicit-only.**
  `api/agent/harnesses/mock/` ships a zero-credential harness: sessions
  echo the prompt (`Mock reply: …`), the catalog is one honestly-labeled
  synthetic model (`mock::mock::echo-v1`), and sessions pass the SAME
  `runSessionContractTests` acceptance gate as pi, so dispatch, review,
  and retrospective chat run against mock exactly like real ones. It
  engages only by explicit selection (`project.harness`/`stage.harness`/
  `KAINBAIN_DEFAULT_HARNESS=mock`) — the chain never falls back to it
  silently, so synthetic output can never mask a real outage.
- **D5 — The custom harness is the escape hatch.** A project selects
  `custom` plus a free-text command line; the curated prompt is appended
  as the final argv element (no shell interpolation), giving any CLI agent
  a Tier-0 path with no dedicated integration.
- **D6 — `docs/EngineDetails/*.md` stay Tier docs; decisions live here.**
  The seven notes-space files keep documenting harness wire formats and
  recipes (read-only sources), while the platform decisions they implied
  are recorded in-repo as this ADR (U-10 read the seven files; no
  remaining platform coupling was left unrecorded).

Explicit non-goals: changing pi's model resolution semantics, auto-falling
back to mock on real-harness failure (rejected — it would mask outages),
and tracking harness credential stores in-repo (they stay in `~/.pi`,
`~/.muse*`, env).

## Consequences

- A box with no CLIs and no keys boots self-contained: harness calls
  degrade honestly until credentials arrive, and `KAINBAIN_DEFAULT_HARNESS=mock`
  gives evaluation/CI a deterministic agent surface.
- Adding a harness is registration + contract conformance, not engine
  surgery (pi, antigravity, muse, opencode, custom, mock all hang off the
  same registry).
- Operators see availability (`/harnesses` discovery), not 500s: every
  "cannot run here" state carries its fix in the hint vocabulary.
- The out-of-repo notes are no longer load-bearing for architecture —
  this directory is the decision record (§8 item 9 closed).

## Verification map

| Finding | Test |
|---|---|
| Default-harness machine assumption | `api/agent/harnessDiscovery.test.js` (per-harness availability, hints) |
| Resolution order | `api/agent/harnessRegistry.test.js` (stage → project → config → default) |
| 500s on missing capabilities | `api/agent/harnessContract.test.js`, `api/capabilityGuard.test.js` (501/404 vocabulary) |
| pi-assumption leakage into engine | `api/agent/harnessBoundary.test.js` (SDK imports + raw event names stay in-harness) |
| Mock parity with pi | `api/agent/harnesses/mock/mockHarness.contract.test.js` (shared conformance suite) |
| Mock always available | `api/agent/harnessDiscovery.test.js` (`mock`/`custom` builtin entries) |
| Mock never a silent fallback | `api/agent/harnesses/mock/mockHarness.registration.test.js` + `mock/README.md` contract |
| Custom-harness escape hatch | `api/agent/harnesses/custom/` suites |
| U-10 EngineDetails sweep | this ADR (decisions) + `docs/EngineDetails/*.md` retained as Tier docs |
