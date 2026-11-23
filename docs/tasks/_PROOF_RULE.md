# Proof PNG rule (read before attaching screenshots)

**Never create, edit, or restore `*.png` — or any listed binary
(`*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.zip`, `*.gz`, `*.tgz`) — with
text edit/write tools.** A text-mode round-trip replaces high bytes with
U+FFFD (`ef bf bd`), silently corrupting the image while the filename
still looks right (`file` then reports `data` instead of `PNG image
data`). This exact corruption failed full CI twice on one ticket; the
rule below is how you stay on the binary-safe path.

## Safe recipe (copy-paste; no improvisation)

```sh
# 1. Capture — the script writes PNG bytes directly (agents only reference the path).
#    No --out needed: it defaults into the current task folder as screenshot-<timestamp>.png:
node scripts/capture-screenshot.mjs --path "#/tasks/<task-id>"
#    (Custom name instead of the timestamped default:)
#    node scripts/capture-screenshot.mjs --path "#/tasks/<task-id>" --out docs/tasks/<task-id>/<name>-proof.png

# 2. Verify the worktree bytes before claiming validity (use the path the capture printed):
xxd -l 8 docs/tasks/<task-id>/screenshot-<timestamp>.png   # expect 8950 4e47…
file docs/tasks/<task-id>/screenshot-<timestamp>.png       # expect PNG image data

# 3. Pre-handoff gate (seconds; fails fast naming the file):
npm run check:binaries
```

Then reference the path in reports — never copy bytes through chat,
editors, or "restore" snippets. The capture script self-verifies PNG
magic after writing; quote its `PNG magic verified` line plus the `xxd`
/ `file` outputs next to any validity claim.

## If a proof is already corrupt

Do not hand-edit it. Either re-capture with the command above, or
restore a known-good copy binary-safely:

```sh
git checkout <good-ref> -- docs/tasks/<task-id>/<name>-proof.png
xxd -l 8 docs/tasks/<task-id>/<name>-proof.png
file docs/tasks/<task-id>/<name>-proof.png
npm run check:binaries
```

## Enforcement layers

- `npm run check:binaries` — fail-fast local guard over changed
  binaries (run before every handoff; seconds, names the file with
  expected vs actual magic and this remedy). Also runs automatically in
  `npm test` as the `Binary Guard` branch, so a corrupt binary fails the
  verification gate even without the hook.
- Pre-commit hook (`scripts/githooks/pre-commit`) — same guard over
  staged binaries at commit time; fails closed (if it cannot run, the
  commit is refused). Installed automatically by `npm run setup`, or
  manually with `npm run hooks:install` (sets `core.hooksPath` to
  `scripts/githooks`; linked worktrees — including engine-created `kb-*`
  task worktrees — inherit it via the shared repo config). Bypass with
  `git commit --no-verify` only for an intentional baseline entry.
- `npm run check:proof-hygiene` — tree-wide CI gate re-verifying every
  proof image (detection stays as the backstop).

Canonical agent rule: `docs/agent-docs/GitGuidance.md`
("Binary-safe proof artifacts"). Guarded extensions are data in
`scripts/check-binary-guard.mjs` (`BINARY_MAGIC`); `.gitattributes`
marks them `binary` so git never normalizes them.

Runner note: when the pre-commit guard refuses a runner commit, the
rejection now surfaces as a "Commit Failed" callout on the task (hook,
files, remedy, full output) instead of failing silently.
