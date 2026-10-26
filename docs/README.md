# KainBain — design & research notes

KainBain is a **local-first AI task orchestrator**: filesystem-backed projects,
discrete multi-stage task execution (agent / human / review / CI stages),
real-time streaming into a Kanban UI, and timestamped markdown reports per stage.

## This folder vs the code repo

- **Code:** [KainBain on GitHub](https://github.com/Ewrdad/Kainbain.git)
  (`api/` Fastify backend, `frontend/` React UI, `canary-e2e/` tests).
- **This folder:** architecture, engine-spike designs, phase plans, research,
  runbooks, and the manual-testing guide — the SilverBullet side of the docs.
  In a live checkout the code repo's `./docs` is a symlink to this folder
  (git-ignored there, so run history never leaves the homelab).

## Map

- `KainBain initial scope.md`, `KB Architecture.md`, `ARCHITECTURE_DOMAINS.md` —
  what it is and how it fits together.
- `ProjectStatus.md`, `PRODUCTION_READINESS_REPORT.md`, `progress report/` —
  where it stands.
- `Phase1/`, `Phase2/` — build attempts, plans, critiques (historical).
- `EngineDetails/` — harness integrations (pi, codex, muse, vibe, T3, …).
- `research/` — background research (swarms, compliance, harness2, …).
- `adr/` — architecture decision records.
- `docs/manual-testing/` — the human test playbook.
- `TASK_DIRECTORY_HYGIENE.md` + `.gitignore` — why `tasks/` run history
  (259+ run dirs, full agent transcripts) is never committed.

## License

Apache-2.0 — see [LICENSE](LICENSE). Copyright 2026 Ewrdad.
