# Git Guidance for Agents

> **Status:** initial version created for AUDIT R2 (forward pointer from
> `agents.md`). Owned by R10 — R10 may expand or replace this file without
> touching `agents.md`.

## Branch discipline

- Stay on the current task branch (form `kb/<task-id>`). Do your work there.
- The engine owns the branch lifecycle: it creates the task branch, commits,
  pushes, and merges into the main branch after the stage passes.
- Do NOT checkout, merge, rebase, push, or delete branches — the pipeline's
  merge stage integrates your work.

## Commit hygiene

- Keep the working tree clean: only the files your stage owns should change.
- Never commit, amend, push, tag, rebase, cherry-pick, revert, or
  `reset --hard` unless the user asked for that exact write in this session.
- After installer/generator commands, check `git status` and revert collateral
  edits you did not intend (e.g. lockfile rewrites).
- Never touch the `docs/` symlink target (out-of-repo notes store, not versioned).

## Binary-safe proof artifacts

- Binary files (PNG screenshots, JPEG/GIF/WebP captures, `.tgz` bundles) must
  be written through a binary-safe path only — never through text edit tools.
  A text-mode read/write round-trip replaces high bytes with U+FFFD
  (`ef bf bd`), silently corrupting the image while the filename still looks
  right (this shipped a corrupted `pretty-proof.png` that `file` reported as
  `data` on task 5a38ad45).
- Safe paths: screenshot capture scripts that write bytes directly (e.g.
  `node scripts/capture-screenshot.mjs --out <path>`), or restoring a known
  good copy with `git checkout <ref> -- <path>`. Never open a binary in an
  editor or rewrite it with a text-oriented tool. The copy-pasteable safe
  recipe lives at `docs/tasks/_PROOF_RULE.md` — follow it exactly, no
  improvisation.
- Before claiming a proof file is valid, verify the worktree bytes:
  `xxd -l 8 <path>` (expect `8950 4e47 0d0a 1a0a` for PNG) and
  `file <path>` (expect `PNG image data, ...`, not `data`). Quote both
  outputs in the stage report next to the claim. The capture script also
  self-verifies PNG magic after writing — quote its `PNG magic verified`
  line as the primary evidence.
- Fail fast locally before handoff: `npm run check:binaries`
  (scripts/check-binary-guard.mjs) magic-checks every binary you changed
  (images plus `.zip`/`.gz`/`.tgz`) in seconds, exiting non-zero naming
  the file with expected vs actual magic and the safe remedy. Run it
  before every handoff so a text-path rewrite fails on your machine, not
  after a 15+ minute CI run. It also runs automatically in `npm test`
  (the `Binary Guard` gate branch), so a corrupt binary fails the gate on
  the next automated stage even when the commit-time hook is absent.
  A pre-commit hook ships at `scripts/githooks/pre-commit` and runs the
  same guard in `--staged` mode; it is installed automatically by
  `npm run setup` (or manually via `npm run hooks:install`, which sets
  `core.hooksPath` to `scripts/githooks` — linked worktrees, including
  engine-created `kb-*` task worktrees, inherit it through the shared
  common config). The hook fails closed: if it cannot run, the commit is
  refused; `git commit --no-verify` is for intentional baseline entries
  only.
- Enforcement: `npm run check:proof-hygiene` (scripts/check-proof-and-hygiene.mjs)
  fails any proof image whose magic bytes do not match its extension, naming
  the file with expected vs actual magic and the remedy. It runs automatically
  in `npm test` (the `Proof Hygiene` gate branch), so a corrupt proof or stray
  root scratch file fails the gate on the next automated stage. Pre-existing
  damage owned by other tasks lives in
  `scripts/baselines/proof-hygiene-known-violations.json` (same-path,
  same-bytes only; use `--strict` to fail on those too).

## Repo-root scratch hygiene

- Ad-hoc scratch (repro scripts like `rt.mjs`, `*.log`/`*.tmp` notes, loose
  captures) stays in `scratch/` (gitignored) or `/tmp` — never at the repo
  root, and never committed. A stray root scratch file once shipped alongside
  the corrupted proof above.
- The same `npm run check:proof-hygiene` gate rejects root scratch files
  (`rt.*`, root `*.mjs`/`*.cjs`, `*.log`, `*.tmp`, loose root images,
  `t<digits>.*` ad-hoc notes). To keep a scratch-shaped file at the root
  permanently, add its exact path to `scripts/allowlists/repo-root-files.json`.
