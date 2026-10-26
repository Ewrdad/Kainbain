# ADR 0001 — Storage-backend abstraction

**Status:** Accepted
**Date:** 2026-10-02
**Task:** `a775d414-b3ef-4283-9c8b-f061730b285b`
**Audit:** `docs/tasks/b61469b8-5c10-498d-aa52-5bba8a397a9d/AUDIT.md`
§2.2 (storage assumption), §3.1 H-3/H-6, §4.1 L-11, §5 S-2, §6.1 C-4,
§7.1 (committed `docs` symlink); peer review F-7.

## Context

Task storage assumed the author's machine three ways at once: the `docs`
symlink itself was committed to git (mode `120000` →
`~/apps/notes/.../KainBain`), so every fresh clone carried a link
dangling at a path only the author has; every project's `notesDir` derived
from the `NOTES_SPACE_ROOT` default rooted at `~/...`; and
`taskStore` persisted to `<projectRoot>/docs/tasks/<id>/task.md` with no
alternative backend — on a clone without the notes space, `scanTasks` found
nothing and the board was silently empty (§7.1.1). Project creation called
`fs.symlinkSync(notesDir, docsLink, "dir")` unconditionally (L-11), which
needs symlink privilege on Windows.

Then the incident this decision is built around (2026-10-02): the tracked
`docs` symlink was removed from git, the engine recreated `docs/` as a real
directory holding a single task, and the UI silently showed 1 of 134 tasks
until an operator restored the link by hand. Any storage decoupling that
leaves the missing-link shape unhandled replays that incident.

Hard constraint: the app is in active use for its own development against
the author's live notes space, so every change keeps observable Linux
behavior identical for healthy projects (same scan results, same save
paths, same startup).

## Decision

Decouple task storage from the author's host in layers, with the
missing-link shape handled before it can cement a shadow directory:

- **D1 — The `docs` link is host-local, never tracked.** `/docs` is
  gitignored and untracked: fresh clones have no `docs/` at all instead of
  a dangling committed symlink, and any local copy stays out of git.
- **D2 — Storage roots are environment, with schema-owned defaults.**
  `PROJECTS_ROOT` and `NOTES_SPACE_ROOT` live in the config schema's
  storage group (`api/config/schema.js`); the container and cold-start
  paths set them explicitly, the author's host keeps working on defaults.
- **D3 — Per-project notes path, resolved case-tolerantly.** Projects
  carry `notesPath` (legacy `notesDir` alias preserved); resolution
  tolerates the historical `Personal/KainBain` vs `Personal/kainbain` case
  mismatch (peer review F-7) by matching the on-disk entry.
- **D4 — `ProjectStore.ensureDocsLink`: verify, repair only when safe.**
  One function owns the `<cwd>/docs` link with eleven explicit states:
  `ok`, `repaired` (missing link recreated), `repaired-broken-link`
  (dangling link repointed) — the only two repairs, both safe because
  nothing readable exists beneath them — and reported-but-untouched
  `broken-link`, `link-missing`, `shadowed` (real dir + populated notes
  space: needs an operator merge, never an automatic delete),
  `foreign-link`, `notes-missing` (silent: fresh clones legitimately have
  no notes space), `local-dir`, `no-cwd`, `unexpected`.
- **D5 — Two call sites close the incident window.** `prepareProjects`
  verifies every project's link at startup *before* the scan runs, so a
  missing link self-heals instead of being cemented by writes; and
  `_saveTaskMarkdown` re-verifies on every save, so a link deleted by a
  branch checkout across the track/ignore boundary is recreated before the
  write lands (the 2026-10-02 recurrence). Verification can never break
  startup or a save — failures fall through to the current resolution.
- **D6 — The deploy path warns, never fails.** `deploy.sh check_docs_link`
  surfaces a shadowed/missing link in the deploy log with merge guidance;
  it never modifies `docs/` and never fails a deploy.
- **D7 — `local-dir` reserves the future local backend.** A real `docs/`
  directory alongside an *empty* notes space is a legitimate state, not an
  error — the carve-out where a self-contained local backend lands without
  tripping the shadow detector.

Explicit non-goals: a full local backend (states and seams only — the
detector distinguishes it, the backend itself is future work), and moving
the author's live projects off the notes space.

## Consequences

- Fresh clones boot with no `docs/` and stay silent about it
  (`notes-missing`); the first project creation or link verification
  heals the link, and the cold-start guide's storage-sanity checklist
  fails loudly instead of presenting an empty board.
- The 1-of-134 failure mode is now three-deep: startup verification,
  save-time repair, and the `shadowed` error naming the merge procedure.
- Windows project creation still needs symlink privilege (L-11
  unchanged); the failure is now a loud `link-missing` error, not silent
  corruption.
- Case-insensitive filesystems no longer split state (F-7 closed by
  on-disk matching).

## Verification map

| Finding | Test |
|---|---|
| Missing/broken link repair | `api/projectStore.docsLink.test.js` (`repaired`, `repaired-broken-link`) |
| Shadow detection, never auto-repair | `api/projectStore.docsLink.test.js` (`shadowed`), `scripts/storage-sanity.mjs` shadow leg |
| Healthy link untouched | `api/projectStore.docsLink.test.js` (`ok`), `scripts/storage-sanity.mjs` healthy leg (restore 3/3) |
| Startup-before-scan ordering | `api/house/projectStartup.test.js`, `api/house/projectStartup.js:26-37` |
| Save-time repair after checkout | `api/taskStore.docsLinkSave.test.js` |
| Deploy-path diagnostic | `api/deploy.packaging.test.js` (docs-link guard), `deploy.sh check_docs_link` |
| F-7 case mismatch | `api/projectStore.docsLink.test.js` (case-insensitive resolution) |
| Fresh-clone silence | `api/projectStore.docsLink.test.js` (`notes-missing`, `local-dir`) |
