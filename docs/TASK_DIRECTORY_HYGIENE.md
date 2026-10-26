# Task directory hygiene

## Scope note (2026-10-26, docs-symlink reversal)

`docs/` is now a real in-repo directory (curated docs; D12). The `docs/tasks/`
tree this document governs lives in the author's notes space (the frozen
run archive, ~242 task dirs at reversal) — NOT in-repo: engine run storage
now lands in gitignored `docs/tasks/` beside the repo that ran it, and is
never committed (leak guard). Do not "restore" the archive into the repo.

## Decision (2026-10-23, recorded by WP-10)

Defer all cleanup of the ~242 task directories under `docs/tasks/` until after the
hackathon.

## Rationale

- Each directory is engine-generated audit/implementation history referenced by
  `task.md` reports; deleting silently loses decision context.
- No size or CI impact today: `npm run docs:check` only scans `docs/EngineDetails`,
  `site-docs/`, top-level docs, and (after WP-10) `CHANGELOG.md`; it does not scan
  `docs/tasks/`.
- Cleanup cost and the risk of deleting a directory depended on by an in-flight task
  outweigh the find-noise cost for the length of the hackathon.
- The `docs/tasks/` tree is not a search surface by convention; agents are told to read
  `AGENTS-MAP.md` first (`docs/TASK_DIRECTORY_HYGIENE.md`).

## What is allowed during the hackathon

- Add new task directories normally (engine writes them).
- Edit files inside an existing task directory when that task is active.
- Read `docs/tasks/.../AUDIT.md` etc. when cited by a current task.

## What is NOT allowed before the post-hackathon review

- Delete, move, rename, archive, or flatten any `docs/tasks/<uuid>/` directory.
- Bulk reorganization of task artifacts into `/archive`.

## Post-hackathon follow-up

1. Measure actual on-disk size and count; re-evaluate.
2. Consider moving directories older than 90 days into `docs/tasks/archive/<year>/` with
   a redirect note at the original path, ONLY with a one-off verification that no
   in-flight task references the moved files.
3. Revisit if repository clone size becomes a reported problem.