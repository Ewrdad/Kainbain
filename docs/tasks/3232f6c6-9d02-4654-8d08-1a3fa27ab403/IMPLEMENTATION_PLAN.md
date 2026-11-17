# Implementation Plan — Delete the `runner/package-lock.json` stub

Task: `3232f6c6-9d02-4654-8d08-1a3fa27ab403`
Case-study reference: task `b31cab50-3ece-4678-a933-3192288fbefd`

## Goal

Delete the 6-line stub file `runner/package-lock.json` (an empty `packages`
object with no matching `runner/package.json` to anchor it), so agents
auditing the runner packaging path stop tripping over an inert accidental npm
artifact.

## Success Criteria

1. `runner/package-lock.json` no longer exists in the working tree.
2. The runner packaging script still builds a valid distributable tarball.
3. Both runner test suites still pass (see Key Decision 1 for the exact
   definition).
4. No reference to the stub remains in live scripts or live docs (see Key
   Decision 2 for the historical-docs exception).
5. The final diff contains only the deletion — no source, config, or
   test edits (`runner/` stays non-empty, so no directory cleanup applies).

## Context and grounded facts

- Stub content (verified in this checkout): 6 lines / 85 bytes —
  `{"name": "runner", "lockfileVersion": 3, "requires": true, "packages": {}}`.
- `runner/package.json` does not exist (verified: `ls` fails). Nothing can
  install from a lockfile with no manifest.
- No install step targets the runner tree: a repo-wide search finds no
  `npm ci --prefix runner` / `npm install --prefix runner` in any script,
  `Dockerfile` step, or publish step. The only lockfiles the build reads are
  `api/package-lock.json` (pinned by `scripts/package-runner.mjs` for the
  discovery-leg closure) and `frontend/package-lock.json` (Dockerfile).
- The packager (`scripts/package-runner.mjs`, `copyPruned`) copies the whole
  `runner/` tree except forbidden basenames/suffixes, so the stub currently
  ships inside the tarball as inert bytes. Deleting it only removes those
  bytes; no packager logic names the file.
- The `Dockerfile` never mentions `runner/` lockfiles (only `api/` and
  `frontend/` ones). `runner/README.md` and `docs/runner-update-runbook.md`
  contain no reference to the stub.
- Case-study evidence (`b31cab50`): the stub was flagged in three reviews and
  left in place as out of scope —
  `docs/tasks/b31cab50-3ece-4678-a933-3192288fbefd/update-impact-20261116.md`
  (line 39: "cruft worth removing in a follow-up"),
  `pr-review-20261116.md` (lines 92–94: "looks like an accidental `npm`
  artifact; remove it"), and `pr-review-20261116-final.md` (lines 77–79:
  "inert cruft worth removing"). The update-impact review recorded
  `node --check runner/project.js` and
  `node --test runner/daemon.test.js runner/project.test.js` (182/182) passing
  with the stub present.
- Survey input (`SURVEY.md`, recovered from
  `origin/kb/3232f6c6-9d02-4654-8d08-1a3fa27ab403` commit `430e3636`): the
  question-me round asked a single question — "I think this is simple enough
  to not require questions. Do you agree?" ("Yes - just delete the unused
  file" / "No - I have concerns") — and recorded no answers and no concerns.
  This plan therefore keeps the change minimal (a pure deletion, no new
  abstractions, no follow-up refactors) while retaining the verification
  below, since "simple" still deserves proof of inertness.

## Key decisions

1. **"Both runner test suites" means, at minimum, `runner/daemon.test.js` +
   `runner/project.test.js`** (the pair the case-study review ran, 182/182).
   Because the full `Unit Tests (runner)` gate branch runs 20 files
   (`scripts/run-tests.mjs`, `buildBranches`), the plan runs the cited pair
   first and then the full 20-file branch, so every reading of "both suites"
   is covered. Assumption, stated explicitly: no narrower suite pair is
   intended.
2. **Historical task reports are out of scope for the "no reference remains"
   sweep.** The three `b31cab50` review files name the stub as audit evidence;
   they are immutable history and must not be edited. The acceptance sweep
   covers live scripts, live docs, and tests — i.e. everything except
   `docs/tasks/`.
3. **Pure deletion, no hardening.** No `.gitignore` entry, no packager
   assertion, and no regression test are added: a test that asserts a file
   does *not* exist adds no value (any future accidental `npm` artifact would
   have a different shape), and the existing conformance tests already pin
   tarball behavior.

## Approach — make the change easy, then make the change

Because the change itself is one deletion, almost all the work is the
"make it easy" half: prove the file is inert (reference sweep), capture a
green baseline (packaging + suites pass *before* the deletion), and only then
delete and re-prove. Research and evidence gathering come first; the deletion
is a single step near the end.

## Steps

### Phase 1 — Pre-deletion inertness audit (research; biggest piece first)

1.1. **Repo-wide reference sweep for the stub.** Search for every live
reference to `runner/package-lock` (and bare `package-lock` under `runner/`):
expect hits only in `docs/tasks/b31cab50-*/` (historical, ignored per Key
Decision 2) and zero hits in `scripts/`, `runner/`, `Dockerfile`,
`publish.sh`, `startRunner.sh`, `tests/`, and live `docs/`.
Suggested commands (run from the repo root):
`grep -rn "runner/package-lock" --exclude-dir=node_modules --exclude-dir=.git .`
and `grep -rn "package-lock" runner/ scripts/package-runner.* Dockerfile publish.sh`.

1.2. **Install-step audit.** Confirm no step installs from the runner tree:
search for `--prefix runner` across shell scripts, `.mjs`/`.js` files, and
the `Dockerfile`; confirm `scripts/package-runner.mjs` reads only
`api/package-lock.json`, and the `Dockerfile` copies only `api/` and
`frontend/` lockfiles.

1.3. **Manifest-absence check.** Confirm `runner/package.json` still does not
exist (`ls runner/package.json` fails) and `runner/version.json` is the only
runner metadata the packager reads.

1.4. **Conformance-test review.** Skim `tests/package-runner-conformance.test.mjs`
to confirm no assertion pins the stub's presence in the tarball (current
assertions cover build stamps and layout, not an exact file list — re-confirm
at implementation time in case the file changed).

### Phase 2 — Green baseline (before touching anything)

2.1. **Run the cited runner pair** and record the pass count (expect 182/182
per the case study, or the current count if suites grew):
`node --test runner/daemon.test.js runner/project.test.js`

2.2. **Run the full `Unit Tests (runner)` branch** — all 20 files named in
`scripts/run-tests.mjs` (`runner/ciBranchWorkdir.test.js`,
`runner/daemon.test.js`, `runner/client.test.js`,
`runner/impromptu.test.js`, `runner/config.test.js`,
`runner/gitOps.test.js`, `runner/harness.test.js`,
`runner/logEvents.test.js`, `runner/modelDiscovery.test.js`,
`runner/harnessModelDiscovery.test.js`, `runner/project.test.js`, plus the
nine `runner/updates-*.test.js` files). Use the exact file list from
`buildBranches` (or the equivalent `publish.sh --runner` test gate); all must
pass.

2.3. **Run the runner packaging script** and record success plus the stub's
presence in the output:
`bash scripts/package-runner.sh baseline-stub-check`
then `tar -tzf dist/kainbain-runner-baseline-stub-check.tar.gz | grep "runner/package-lock.json"`
(expect one hit — proof the stub currently ships as inert bytes).
`dist/` is gitignored, so the tarball does not dirty the tree; delete it
after inspection to keep the workspace tidy.

2.4. **Run the packaging-related harness tests** as a baseline:
`node --test tests/package-runner-conformance.test.mjs tests/runner-release-manifest.test.mjs tests/check-runner-version-bump.test.mjs tests/migrate-runner-to-wrapper.test.mjs tests/install-runner-wrapper.test.mjs`

### Phase 3 — The change

3.1. **Delete the stub with git** so the removal is staged explicitly:
`git rm runner/package-lock.json`
Then `git status --short` must show exactly one change: the deletion.

### Phase 4 — Post-deletion verification

4.1. **Re-run the reference sweep** (same commands as 1.1–1.2). Live-tree
hits must be zero; only the `docs/tasks/b31cab50-*/` historical mentions
remain.

4.2. **Re-run the cited runner pair** (`node --test runner/daemon.test.js runner/project.test.js`):
must pass with the identical count as the Phase 2 baseline.

4.3. **Re-run the full 20-file `Unit Tests (runner)` branch**: all must pass.

4.4. **Re-run the packaging script**:
`bash scripts/package-runner.sh post-delete-check`
then `tar -tzf dist/kainbain-runner-post-delete-check.tar.gz | grep "runner/package-lock.json"`
(expect no hits — proof the tarball no longer carries the stub) and confirm
the tarball still contains `runner/`, `api/`, `shared/`, and both
`version.json` copies. Delete the scratch tarballs afterwards.

4.5. **Re-run the packaging-related harness tests** (same list as 2.4): all
must pass.

4.6. **Final tree check**: `git status --short` shows only the deletion;
`git diff --stat` shows one file removed. No `dist/` artifacts, no stray
files.

## Validation plan (evidence-oriented)

| Check | Command | Expected evidence |
|---|---|---|
| Cited pair, before + after | `node --test runner/daemon.test.js runner/project.test.js` | Identical pass counts, 0 failures, both runs |
| Full runner branch, before + after | `node --test` with the 20 files from `buildBranches` | All pass, both runs |
| Packaging, before | `bash scripts/package-runner.sh baseline-stub-check` + `tar -tzf` grep | Build succeeds; tarball contains `runner/package-lock.json` |
| Packaging, after | `bash scripts/package-runner.sh post-delete-check` + `tar -tzf` grep | Build succeeds; tarball omits the stub, keeps `runner/` + `version.json` copies |
| Harness packaging tests, before + after | `node --test tests/package-runner-conformance.test.mjs tests/runner-release-manifest.test.mjs tests/check-runner-version-bump.test.mjs tests/migrate-runner-to-wrapper.test.mjs tests/install-runner-wrapper.test.mjs` | All pass, both runs |
| Reference sweep, before + after | `grep -rn "runner/package-lock" --exclude-dir=node_modules --exclude-dir=.git .` | Before: only `docs/tasks/b31cab50-*/` hits. After: same, zero live hits |
| Tree cleanliness | `git status --short` / `git diff --stat` | Exactly one deleted file |

The highest-risk validation step is **packaging after deletion (4.4)** — the
only step whose outcome cannot be fully predicted from the audit, since it
exercises the real tar + npm-closure path. If it fails, stop and diagnose
before claiming success; do not wave it through on the strength of the unit
suites.

Manual check that cannot be automated: open the before/after `tar -tzf`
listings side by side and confirm the *only* entry difference is the missing
`runner/package-lock.json` line.

## Documentation plan

- **No live-doc edits are expected.** The audit found no live doc referencing
  the stub, so the implementation should change zero docs. If the Phase 1
  sweep surfaces a live reference, update or remove that mention and run
  `npm run docs:check` (link + JSDoc-example gates) to prove the docs tree is
  still consistent.
- **Historical reports stay untouched.** Do not edit the `b31cab50` review
  files or this plan's survey/idea inputs.
- **This plan file** (`docs/tasks/3232f6c6-9d02-4654-8d08-1a3fa27ab403/IMPLEMENTATION_PLAN.md`)
  is the stage deliverable; no other docs artifact is required.

## Risks and open questions

- **Risk (low): a hidden consumer of the stub.** Mitigated by the Phase 1
  sweep plus the before/after packaging diff; the manifest-absence check
  makes an npm consumer impossible by construction.
- **Risk (low): suite-count drift.** The 182/182 figure is from the case
  study; suites may have grown since. The plan handles this by comparing
  before/after counts rather than pinning 182.
- **Risk (negligible): `dist/` pollution.** `dist/` is gitignored; scratch
  tarballs are deleted in steps 2.3 and 4.4 regardless.
- **Open questions: none.** The survey recorded no concerns, and every
  material fact (stub content, missing manifest, no install step, no live
  references, packaging behavior) was verified against the checkout. The only
  assumption is Key Decision 1's reading of "both runner test suites", which
  the plan covers by running both the cited pair and the full branch.

## Non-goals

- No changes to the packager, Dockerfile, publish flow, or any test.
- No new regression test asserting the file's absence (see Key Decision 3).
- No cleanup of other cruft, no `.gitignore` additions, no version bump
  (`runner/version.json` is untouched — this is not a runner release).
