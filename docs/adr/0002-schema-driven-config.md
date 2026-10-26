# ADR 0002 — Schema-driven config

**Status:** Accepted
**Date:** 2026-10-03
**Task:** `c6252677-0f76-4b97-9401-7f6180b6aa2c`
**Audit:** `docs/tasks/b61469b8-5c10-498d-aa52-5bba8a397a9d/AUDIT.md`
§2.2 item 3 (silent fallback), §6.1 C-1…C-18 (18 fragmented stores),
§6.2 D-1 (README-vs-config drift), §8 item 7, §10 U-6.

## Context

Configuration was spread across 18 fragmented stores (C-1…C-18): 59
`KAINBAIN_*` variables plus legacy aliases parsed in `api/config.js` by
`intEnv`/`boolEnv`/`floatEnv` helpers that fell back to defaults on
missing *or malformed* values alike — a typo'd timeout booted fine and ran
wrong, with no startup diagnostic. Tunables were additionally documented in
`README.md`, `site-docs`, and skill configs by hand, and the copies drifted
(D-1: README said `200000`, the parser said `32000`). There was no minimum
Node assertion anywhere (`engines` absent from all four manifests), so the
supported floor was inferred from API usage, never declared (U-6).

Hard constraint: the app is in active use for its own development, so
every valid existing environment must boot byte-identical behavior —
same defaults, same alias handling, same values on the wire.

## Decision

One descriptor table owns every knob, and malformed values fail the boot
instead of running wrong:

- **D1 — A descriptor table, not a validation library.**
  `api/config/schema.js` declares each variable once: config key,
  canonical env name, deprecated aliases, type, default, constraints, doc
  group, and docs. A library (ajv/zod) was rejected because the
  introspection endpoint and the `.env.example` generator need per-variable
  metadata (group, doc, secret flag, aliases) a plain validation schema
  cannot carry. The table is that metadata; `loadConfig` is its one
  parser; zero new dependencies.
- **D2 — Fail fast on malformed, silent on missing.** Missing or empty
  keeps the old behavior (default, silently). A malformed value for a
  typed variable throws `ConfigError` at boot with
  `CONFIG <VAR>: <reason> (got "<value>", want <constraint>)` — fix the
  value instead of getting a silent default.
- **D3 — Aliases warn once, canonical wins.** A deprecated unprefixed
  alias (`AGENT_TIMEOUT_MS`, …) is honored with a `CONFIG DEPRECATION`
  warning when the canonical name is unset; when both are set, canonical
  wins with a warning.
- **D4 — `.env.example` is generated, never hand-edited.**
  `scripts/generate-env-example.mjs` renders the root `.env.example`
  from the schema (grouped by concern, `GENERATED` header); tunables are
  documented exactly once (the schema) and everything else links — the
  structural fix for D-1-class drift.
- **D5 — Live config is introspectable, secrets redacted.**
  `GET /status/config` serves values, defaults, and sources with
  secret-flagged entries redacted, so operators verify what a boot
  actually used.
- **D6 — Out-of-scope reads are censused, not smuggled.**
  `NODE_EXTRA_CA_CERTS` (TLS bootstrap), `PATH`/`HOME`/`USER`/`LANG`/
  `XDG_*` (inherited runtime) are documented in the schema header as
  deliberately excluded — everything else `api/` reads lives in the table.
- **D7 — Cross-package ceilings warn, not fail.** Constraints spanning
  packages (server chat ceiling vs the frontend's 31 min chat timeout)
  are warnings, because a hard fail would couple the builds; same-package
  type violations fail.
- **D8 — The Node floor is declared.** `engines: node >=20.11` in the
  root manifest plus `.nvmrc`/`.node-version` pins close U-6 structurally;
  the CI matrix legs (20.x/22.x) prove it continuously.
  *Amendment 2026-10-05:* the deprecation-removal work on master raised the
  enforced floor to `engines: node ^20.19.0 || >=22.12.0` (all three
  manifests). The mechanism is unchanged — the floor is still declared in
  `engines` and proven by the matrix — only the number moved. The portable
  deployment guide states the current floor.

Explicit non-goals: migrating file-backed stores (`project.json`,
`KB_config.json`) into env — the schema owns the env layer only; and
stateless 12-factor purity (sessions and task memory stay disk-backed by
design).

## Consequences

- A typo'd variable is a boot error with the fix in the message, not a
  silent wrong default — cold-start misconfiguration surfaces in seconds.
- `.env.example` cannot rot: it is generated from the same table the
  parser reads, and the suite pins the rendering.
- New knobs have one place to land (schema entry + group + doc), and docs
  link instead of copying.
- Deprecated aliases keep old environments booting while steering them
  to canonical names via warnings.

## Verification map

| Finding | Test |
|---|---|
| Silent-fallback parsers (§2.2 item 3) | `api/config/config.test.js` (malformed → `ConfigError`, missing → default) |
| 18-store fragmentation (C-1) | `api/config/schema.js` (single table) + `api/config/boot.test.js` |
| D-1 README drift | `api/config/config.test.js` (generated `.env.example` rendering), root `README.md` links-not-copies rule |
| Alias handling | `api/config/config.test.js` (deprecation warn-once, canonical-wins) |
| Introspection endpoint | `api/routes/status.config.test.js` (`GET /status/config`, secrets redacted) |
| U-6 Node floor | root `package.json` `engines`, `.nvmrc`, `.github/workflows/ci.yml` 20.x/22.x legs |
