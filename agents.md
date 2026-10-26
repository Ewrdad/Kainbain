# Project Agents

Normative agent guidance for this repo. Architecture: [`agent-docs/KB-Architecture.md`](agent-docs/KB-Architecture.md) · Code standards: [`agent-docs/KB-Code-Standards.md`](agent-docs/KB-Code-Standards.md) — in-repo vendored copies of the SilverBullet KB pages; the external notes store is unreachable on a fresh checkout, so treat the in-repo copies as the source of truth (upstream edits must be re-vendored there).

**Read first:** [`AGENTS-MAP.md`](AGENTS-MAP.md) — one-page repo map (directory ownership, god-file entry points, test commands, log-feed endpoint).

## Start here

1. This file (`agents.md`).
2. [`AGENTS-MAP.md`](AGENTS-MAP.md) — repo map: directory ownership, god-file warnings, entry points (R1).
3. [`agent-docs/`](agent-docs) — vendored KB architecture & code standards.
4. [`site-docs/README.md`](site-docs/README.md) — Docs-tab authoring rules.
5. [`agent-docs/GitGuidance.md`](agent-docs/GitGuidance.md) — branch discipline for agents: stay on the current task branch, the engine owns the branch lifecycle.

## Commands

- Test: `npm run test:unit` (api + frontend) · full deploy gate: `npm test`
- Lint: `npm run lint` (api + frontend)
- Build: `npm run build` (api + frontend)

All commands are verbatim root `package.json` scripts, run from the repo root.

## Read budget

- Orient in ≤3 file reads before acting; use targeted reads (`rg`, single-file reads, symbol search) — never `ls -R`.
- Prefer `GET /tasks/:id/logs?feed=` over `task.md` process logs: structured `logEntries`, not the verbose rendered text.

## Task-status vocabulary

- A task `failed` on a merge stage whose git merge already landed is **parked on the merge stage, needs operator retry** — not "still running". The inspector shows a static `PARKED` row (never a ticking `ACTIVE` timer) with the failure reason; retry re-runs the git finalize. A task `failed` on a deploy stage (a ci stage running `./deploy.sh`) parks with a deploy-only reason; its retry re-runs the deploy command (flock-serialized, adopting its checkpoint).
- A park whose reason names a shared gate (`canary-e2e`, `final-test-suite`) failing on the default branch is a **project-blocker**: no task change will pass until the shared suite is fixed — see the Red Shared-Gate Runbook.

## Agent Guidelines

- History badges (`+N -M`) are per-stage commit ranges: keep generated test artifacts (`coverage/`, `test-results/`, and friends — see root `.gitignore`) gitignored so a testing stage that writes reports still shows `+0 -0`. A failed stage's partial work auto-commits with `... (failed)` and stays on that stage's badge.
- Follow the standards defined in [`agent-docs/KB-Code-Standards.md`](agent-docs/KB-Code-Standards.md).
- Refer to [`agent-docs/KB-Architecture.md`](agent-docs/KB-Architecture.md) for high-level design.
- Use the defined testing scripts to verify changes.
- Task logs are structured entries (`task.logEntries`), the only stored log representation. When an agent needs to read its own stage stream, use the feed endpoint (`GET /tasks/:id/logs?feed=main|thinking|tools&format=entries|text`) instead of reading verbose log text — `format=text` is a derived view over the entries, and the old rendered `processLogs` text is no longer stored.
- Model references in stages/projects may use any of three forms — canonical `harness::provider::id`, legacy `provider::id`, or a bare model id/name — and all resolve correctly (see `docs/EngineDetails/ModelKeys.md`). Write `harness::provider::id` for NEW references (the pi harness is `pi`); the `"default"` sentinel still means "no model switch".
- Antigravity harness: a project with `harness: "antigravity"` (or `KAINBAIN_DEFAULT_HARNESS=antigravity`) runs stages on the agy CLI (Google Antigravity) headlessly — one process per stage turn, stream-JSON parsed to normalized events. Operator-chosen YOLO policy: `--sandbox` off and `--dangerously-skip-permissions` passed by default (reversible via `KAINBAIN_AGY_SANDBOX=1` / `KAINBAIN_AGY_SKIP_PERMISSIONS=0`); every spawn logs its effective model/permissions. Child env secret-redacted. See `api/agent/harnesses/antigravity/README.md`. Default stays `pi`.
- Mistral Vibe harness (Tier 2): a project with `harness: "vibe"` runs stages on a long-lived bidirectional ACP session over the standalone `vibe-acp` binary (permission interception, live usage/cost telemetry, live model catalogue, per-session model pinning) — the default when the `vibe-acp` entrypoint resolves (`KAINBAIN_VIBE_ACP=auto`; `on` forces ACP). Rollback to the legacy per-turn `vibe --prompt` exec path: `KAINBAIN_VIBE_ACP=off`. Auto-approve is the default on both transports (no approval UI yet; `KAINBAIN_VIBE_AUTO_APPROVE=0` restores per-agent approvals). Child env secret-redacted. See `api/agent/harnesses/vibe/README.md` and `docs/EngineDetails/VibeHarness.md`. Default stays `pi`.
- Muse Code harness (Tier 2): a project with `harness: "muse"` defaults to a long-lived MSP (Muse Session Protocol) session over `muse serve` (steerable turns, `turn/interrupt` abort, per-request approval interception, live `model/list` catalogue + `session/setModel`, live usage telemetry, `session/resume` reconnect), one pooled host per project workspace. `KAINBAIN_MUSE_MSP=auto` (default) engages MSP when the resolved binary advertises `serve`; `KAINBAIN_MUSE_MSP=off` is the rollback to per-turn `muse exec`. YOLO is the default (no approval UI yet; `KAINBAIN_MUSE_YOLO=0` restores sandbox-on/`onRequest`). Child env secret-redacted. See `docs/EngineDetails/MuseHarness.md`. Default stays `pi`.

## Onboarding knowledge base

Before reading source, check the markdown site docs — the same articles the
in-app Docs tab renders: `GET /docs` returns the index
(`[{ slug, title, section, order }]` across `how-it-works` and `working-with`),
and `GET /docs/:slug` returns one article as raw markdown. Authoring rules live
in `site-docs/README.md`.
