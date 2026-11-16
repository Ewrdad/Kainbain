# PR Review (stage re-verification) — copy-or-warn for missing task assets

Branch `kb/b31cab50-3ece-4678-a933-3192288fbefd` vs `origin/main` (29 files,
+2249/−36). Docs-only stage: no source modified. This review independently
re-verified the earlier [pr-review-20261116.md](./pr-review-20261116.md)
(PASS) instead of trusting it. Unlike the prior reviews, dependencies are
installed in this workspace, so every gate below ran for real.

## Verdict: PASS — suitable to integrate

## Does it achieve the goal? Yes (proven independently)

Acceptance: a task referencing `assets/image.png` either has a readable file
in the workspace or its prompt carries the missing-asset warning. I wrote my
own probe script (kept outside the repo, in `/tmp`) against the real code —
20 assertions, all passing:

- Dangling ref: `findMissingAssetRefs` returns the exact
  `{ref, name, expectedPath}` entry; `curatePrompt` renders a prompt starting
  with `# Missing Task Assets\n`, containing `MISSING-ASSET`,
  `assets/image.png`, and `docs/tasks/<id>/assets/image.png`, positioned
  before `# Task`.
- Healthy and ref-free tasks: no warning, prompt starts with `# Task`.
- Drifted-but-servable (`assets/My Shot.PNG` vs on-disk `my-shot.png`):
  `present: true`, no warning.
- Non-image refs (`assets/spec.pdf`, no bytes): warned (extension-agnostic
  detection). Absolute/protocol URLs: never warned.
- Byte-identical: old 10-token default layout vs new 11-token default render
  identically when the warning is empty.
- Custom layout with all mandatory tokens but no `{{missingAssets}}`: warning
  prepended for agent stages, omitted for script stages. (An invalid custom
  layout missing mandatory tokens falls back to the default layout, which
  includes the warning — correct behavior, verified.)
- Remote delivery round-trip: `collectTaskAssetPayload` ships on-disk images;
  `writeClaimTaskAssets` lands them byte-identical in a fresh worktree,
  never overwrites existing files, and skips hostile entries
  (`../../evil.png`, `x.exe`, corrupt base64) without throwing.
- Branch-flap second look: verified with a real git repo — asset on
  `kb/<taskId>` while a sibling branch is checked out does not warn, while a
  genuinely absent file in the same state still warns.

## Did it follow the plan? Yes

- Step 1: `shared/taskAssetRefs/` owns the grammar; `api/work/taskAssets.js`
  owns resolve/find/format/payload. Dense unit tests beside each.
- Step 2: hook in `curatePrompt`, the choke point both embedded and
  `curateRunnerPrompt` paths share (confirmed `curateRunnerPrompt` calls
  `engine.curatePrompt`); first-section placement via `{{missingAssets}}`
  with prepend-on-reinject for custom layouts.
- Step 3a/3b/3c: local `syncTaskDocs` proven by regression test plus
  asset-count logging; remote gap closed via `taskAssets` on claim and
  dispatch leases with daemon-side `writeClaimTaskAssets` before the first
  stage; branch-flap second look via `filterBranchBackedRefs`.
- Step 4: `docs/task-images.md` and `site-docs/task-images.md` both extended.
- All six plan success criteria hold. Survey: q1/q3 match exactly; q2's "any
  attached file" is met by extension-agnostic detection (delivery stays
  image-capped only because uploads are images-only — there is nothing else
  to ship, and the grammar is future-proof); q4's "general warning" yields
  to the task FIX clause, which explicitly requires naming the file —
  per-file naming satisfies both, and following q4 literally would have
  violated the task contract.

## Standards, modifiability, best practices, tech debt

- Gates run in this session, all green: `test:api` 7286 passed / 3 skipped
  (447 files), `test:frontend` 4791 passed (353 files), `node --test`
  runner suites 182/182, `lint` 0 errors (220 warnings, all pre-existing
  classes — the `sectionMap[token]` flags match the identical pattern on
  main), `docs:check` PASS, `check:one-function` PASS.
- Modifiable: one grammar owner (frontend viewer resolves through it too),
  one curate-time decision point (a future hard gate stays a small local
  change), stored goal text never mutated so re-upload self-heals.
- Best practices: total (never-throw) helpers, best-effort curation hook,
  argv-only git with validated branch shape and 5s timeout, per-file/total
  caps, strict-base64 guard, never-overwrite writes, traversal-safe
  compare-without-join, backward compatible in both fleet directions.
- Tech debt: none blocking. Two follow-up nits (same as prior reviews):
  1. `runner/package-lock.json` is a 6-line stub with no `runner/package.json`
     — inert cruft worth removing.
  2. `filterBranchBackedRefs` runs a synchronous `git ls-tree` in the curate
     path, but only when dangling refs exist; cache per task+branch only if
     curate latency ever matters.

## Docs

Updated where the plan required, with accurate content (verified against the
diff): copy-or-warn behavior, warning text, self-healing, remote note, and
shared-grammar ownership in both task-images docs. No other docs needed
changing. Not a UI feature — no screenshots applicable.
