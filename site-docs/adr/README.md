# Architecture Decision Records

In-repo decision log for KainBain portability (audit §8 item 9), in
[Michael Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
Context, Decision, Consequences, plus a verification map pinning each
finding to its test.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-storage-backend-abstraction.md) | Storage-backend abstraction | Accepted 2026-10-02 |
| [0002](0002-schema-driven-config.md) | Schema-driven config | Accepted 2026-10-03 |
| [0003](0003-cross-platform-process-supervision.md) | Cross-platform process supervision | Accepted 2026-10-04 |
| [0004](0004-harness-pluggability-and-mock-mode.md) | Harness pluggability and mock mode | Accepted 2026-10-04 |
| [0005](0005-harness-model-target-ownership.md) | Harness model target ownership | Accepted (imported 2026-10-26) |
| [0006](0006-git-workspace-isolation.md) | Git workspace isolation | Accepted (imported 2026-10-26) |
| [0007](0007-resume-stall-recovery.md) | Resume stall recovery | Accepted (imported 2026-10-26) |
| [0008](0008-portable-runner-decisions.md) | Portable Runner: Phase 0 decisions D1–D14 | Accepted 2026-10-26 |
| [0009](0009-runner-protocol-sketch.md) | Runner↔Backend protocol sketch v1 | Accepted 2026-10-26 |

Location note: the roadmap tickets name `docs/adr/`, but `docs/` in this
repo is a host-local symlink to the author's notes space (gitignored,
absent on fresh clones) — writing ADRs there would keep them out of git,
the exact gap this directory closes. This folder is tracked, ships with
every clone, and is staged into production builds with the rest of
`site-docs/`. It is intentionally *not* indexed by the in-app Docs tab
(the index scans top-level articles only): ADRs are contributor history,
not operator documentation.

Mirror note: byte-identical copies of the in-repo files also live at
`docs/adr/` in the author's live notes space (the literal scope path from
the WP-9 ticket, which resolves through the host-local `docs` symlink).
The copies in this directory are canonical — tracked by git, shipped with
every clone — and any future edit must be applied here first, then
re-mirrored to `docs/adr/`.

Numbering note (resolved 2026-10-26): ADRs 0005–0007
(harness-model-target-ownership, git-workspace-isolation,
resume-stall-recovery) lived only in the notes space until the WP-1.4
docs reversal, which imported them here as byte-identical tracked copies
(the reversal also tracks them at `docs/adr/` as part of the curated set).
New ADRs continue the single global sequence (0008, 0009, …).
