# Implementation plan — binary-safe proof artifacts and repo-root scratch hygiene

Task `b1c069e0-1875-4aa7-b51d-4c4399b2be31`. Case study: task `5a38ad45`
pretty-tasks Deep Review failure (`deep-review-failure-20261114-093429.md`,
`review-20261114-round3.md`): a committed `pretty-proof.png` with UTF-8
replacement bytes (`ef bf bd` where `0x89` belongs; `file` → `data`) that
contradicted the implementation report's validity claim, plus a tracked dead
scratch file `rt.mjs` at the repo root.

## Goal

Make proof-file corruption and stray root scratch files structurally hard to
ship: documented binary-safe handling rules agents will actually see, plus a
cheap automated gate that fails loudly with a fix-it message. Human reviewers
must be able to trust proof validity claims without byte-level re-verification.

## Success criteria

- A committed proof PNG with wrong magic bytes fails the new check; the
  message names the file and shows expected vs actual magic.
- A scratch file at the repo root fails the new check or is blocked from commit.
- Valid PNG proof plus no stray root files passes the check.
- Guidance exists where agents look, and the stale-claim question (step 3) is
  resolved with byte evidence, touching history only if still wrong.

## Survey answers (SURVEY.md — questions were unanswered, defaults chosen here)

The survey on `origin/kb/b1c069e0-1875-4aa7-b51d-4c4399b2be31` records four
questions with `"answers": {}`. This plan resolves each; the implementer treats
these as binding defaults unless a human overrides them.

- **q1 — where does the guidance live?** Both places (survey option 3), with
  one canonical source and pointers elsewhere to prevent drift: normative rule
  in agent guidance (`docs/agent-docs/GitGuidance.md` commit-hygiene section,
  pointed to from `agents.md`) plus a short checklist at the proof workflow
  (alongside the screenshot/proof capture docs; see Phase 3).
- **q2 — how strict is the check?** Block plus explain how to fix (option 3):
  non-zero exit in an automated gate, message names the file, expected vs
  actual magic (or the matched scratch pattern), and the exact remedy command.
- **q3 — which stray root files are stopped?** All three survey categories:
  ad-hoc scripts (`rt.*`, root `*.mjs`/`*.cjs` not allowlisted), temp notes
  and logs at root, and loose images outside proof folders. Enforcement is
  allowlist-based: legitimate root files are enumerated, everything else
  matching a scratch pattern fails.
- **q4 — what about the old false validity claim?** Fix it now only if still
  wrong (option 1, matching ticket step 3). Current-branch evidence (gathered
  2026-11-14, see Phase 0) says the claim is already corrected by banners and
  the PNG is valid — so the expected outcome is verify-and-leave-untouched,
  recorded with evidence. No new sidecar correction note.

## Key decisions (with rejected alternatives)

1. **Enforce in the automated gate, not (only) a git hook.** The repo has no
   hook infrastructure (no `.husky`, `.githooks`, or `pre-commit` config), and
   the KainBain engine — not the agent — performs stage-output commits, so a
   locally installed hook is not a reliable enforcement point for agent
   behavior. The check must live where automated stages run: a new
   `scripts/check-*.mjs` following the existing check-script convention,
   wired into `scripts/run-tests.mjs` (fast overlap window or Harness
   Self-Tests branch) with an `npm run` script and `tests/*.test.mjs` pinning
   it. A documented optional local hook may be offered as a convenience, but
   it is not the enforcement mechanism. Rejected: pre-commit-only (no infra,
   wrong enforcement point) and review-stage-only (human re-verification is
   what this ticket eliminates).
2. **Scan the worktree + tracked set, not just the staged diff.** The failure
   mode is bytes corrupted before commit by text-oriented edit tools
   (`.gitattributes *.png binary` did not help — corruption happened
   pre-commit). The check reads actual file bytes from disk and compares
   against tracked/expected files, so it catches corruption regardless of
   staging state. Rejected: `--cached`-only diff scan (misses worktree
   corruption an agent is about to claim as valid).
3. **One checker, two rule families, shared exit path.** Magic-byte validation
   (proof paths) and root scratch detection share one script, one allowlist
   file, and one failure format, so there is a single gate branch to maintain.
   Rejected: two separate scripts (double wiring, double docs).
4. **Extension→magic table covers at least PNG, JPEG, GIF, WebP** (the
   extensions `.gitattributes` already marks binary), with PNG (`89504e47`)
   pinned first. Unknown extensions are skipped, never failed — the check is a
   corruption detector, not a file-type police. Proof paths: everything under
   `docs/tasks/*/`, plus any `*-proof.*` / `screenshot*` naming the repo
   already uses.

## Approach — make the change easy, then make the change

Phases 0–2 create the seams (evidence baseline, reusable pure-function checker
module, test harness placement). Phases 3–5 are the actual change (rules,
wiring, docs, claim resolution), each small because the seams exist.

## Steps

### Phase 0 — Evidence baseline (research, first because everything conditions on it)

0.1. Re-confirm the step-3 precondition on the implementation branch (do not
assume this plan's evidence transfers): `xxd -l 8` and `file` on
`docs/tasks/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f/pretty-proof.png`,
`git ls-files | grep -E '^(rt\.mjs|scratch)'`, and read the correction banners
at the top of `implementation-report-20261114.md` (lines 1–65 on the planning
branch already correct the stale inner claim at old step 3).
0.2. Inventory legitimate repo-root files (`git ls-files` depth-1 plus
root dotfiles) to seed the scratch-check allowlist without false positives.
0.3. Read one check-script pair end to end for convention
(`scripts/check-doc-links.mjs`, `tests/check-one-function-per-file.test.mjs`,
and the Harness Self-Tests file list in `scripts/run-tests.mjs`): export pure
functions from the script, test via `node --test`, register the test file in
the gate list.
- Depends on: nothing. Validates: step-3 decision, allowlist seed, wiring points.

### Phase 1 — Checker module with pure, testable core (the big build)

1.1. Create `scripts/check-proof-and-hygiene.mjs` (name follows
`check-*.mjs` convention; exact filename is the implementer's choice):
- `magicForExtension(ext)` — table: `.png` → `89504e47`,
  `.jpg`/`.jpeg` → `ffd8ff`, `.gif` → `47494638`, `.webp` → `52494646`
  (RIFF; note the 8-byte `WEBP` marker handling).
- `checkFileMagic(absPath)` — reads first 8 bytes with `fs.readFileSync`,
  returns `{ ok, expected, actual }`; missing/unreadable files and unknown
  extensions return `ok: true` with a `skipped` reason (never fail closed
  on what the check does not understand).
- `isProofPath(relPath)` — matches `docs/tasks/**` image extensions and
  `*-proof.*` / `screenshot*` names.
- `isRootScratch(relPath, allowlist)` — matches root-level scratch
  patterns (`rt.*`, `*.mjs`/`*.cjs` repro scripts, `*.log`, `*.tmp`,
  `*.png`/`*.jpg` loose images, `t1.json`-style ad-hoc notes) unless the
  exact path is allowlisted.
- `formatFailure(...)` — one line per violation:
  `path: expected magic <expected>, found <actual> (<remedy>)` or
  `path: root scratch file matching <pattern> (<remedy>)`, where remedy is
  the concrete fix (e.g. `restore via git checkout <ref> -- <path> and
  re-verify with xxd/file`, `move to scratch/ (gitignored) or delete`).
1.2. CLI behavior: exit 0 with a one-line PASS summary when clean; exit 1
listing every violation otherwise. Support `--root <dir>` (default: repo
root) so tests run it against fixture trees.
- Depends on: phase 0. This is the seam every later phase uses.

### Phase 2 — Tests and gate wiring (makes the change safe to land)

2.1. Add `tests/check-proof-and-hygiene.test.mjs` in the existing
`node:test` + `assert/strict` style: valid-PNG passes, corrupt-PNG fixture
(first byte `ef bf bd`) fails with expected-vs-actual message, each scratch
pattern fails, allowlisted root files pass, unknown extensions skip.
Register the file in the Harness Self-Tests branch list in
`scripts/run-tests.mjs` (the list is explicitly exhaustive — an unregistered
file silently never runs).
2.2. Add an `npm run` script (e.g. `check:proof-hygiene`) and a fast
low-priority branch in `buildBranches` (or fold into Harness Self-Tests if a
separate branch is judged too heavy — decide in implementation, record why).
Keep it dependency-free (Node stdlib only) so the branch never needs
workspace provisioning.
- Depends on: phase 1.

### Phase 3 — Guidance docs (q1: both places, one canonical source)

3.1. Canonical rule in `docs/agent-docs/GitGuidance.md` under commit
hygiene: binary files (PNG screenshots, etc.) are written only through a
binary-safe path — never through text edit tools; verify with
`xxd -l 8` (expect `8950 4e47…` for PNG) and `file` before claiming
validity; ad-hoc scratch stays in `scratch/` (gitignored) or `/tmp`, never
at the repo root.
3.2. Short checklist at the proof workflow: next to whatever documents the
screenshot/proof capture flow (`scripts/capture-screenshot.mjs` usage docs
/ `npm run capture:screenshot`), pointing back to the canonical rule.
3.3. One-line pointer from `agents.md` if that file indexes agent hygiene
rules (check first; do not duplicate prose).
- Depends on: phase 0 (needs the corruption mechanism wording from the
  round-3 review). Small because phase 1 fixes the exact commands to quote.

### Phase 4 — Resolve the stale validity claim (ticket step 3)

4.1. If phase 0 shows the report still asserting validity of corrupt bytes:
correct the claim in place with a dated correction banner (same style as the
existing banners), citing `xxd`/`file` evidence.
4.2. If phase 0 confirms the current state (valid PNG, correction banners
present, `rt.mjs` gone): change nothing; record the verification evidence in
the stage report. History stays untouched.
- Depends on: phase 0 only; may run parallel with phases 1–3.

### Phase 5 — Acceptance rehearsal and report

5.1. Run the three acceptance scenarios against the real script (in a
throwaway fixture tree or temp worktree, never by corrupting the real PNG):
corrupt PNG → exit 1 naming file + expected vs actual; root scratch file →
exit 1; valid PNG + clean root → exit 0.
5.2. Run the full affected gates: the new `npm run` script, the Harness
Self-Tests branch, and `npm run test:unit` per the repo's testing guidance.
5.3. Stage report records: survey-default mapping (q1–q4), step-3 evidence
and outcome, and the exact commands a reviewer can re-run.

## Validation plan

| Work unit | Check | Expected evidence |
|---|---|---|
| Phase 0 baseline | `xxd -l 8`, `file`, `git ls-files`, report read | Magic `89504e47`, `file` → PNG, no `rt.mjs`, banners present (or a concrete diff list if the branch moved) |
| Phase 1 checker | `node --test tests/check-proof-and-hygiene.test.mjs` | All new tests green; corrupt fixture message shows `expected 89504e47, found efbfbd…` |
| Phase 2 wiring | New `npm run` script + Harness Self-Tests branch | Gate branch PASS on clean tree; FAIL (exit 1) with fixture violations |
| Phase 3 docs | `npm run docs:check` (link checker covers edited docs) | PASS; prose reviewed for non-duplication |
| Phase 4 claim | Byte evidence quoted in stage report | Either a dated correction banner or a leave-untouched justification with `xxd`/`file` output |
| Acceptance | Script run over the three scenarios | exit 1 / exit 1 / exit 0 as specified |

Highest-risk validation: the gate actually runs the new test file
(`run-tests.mjs` uses an explicit file list — forgetting registration is a
silent pass). Mitigation: after wiring, temporarily break one fixture
expectation, confirm the gate branch goes red, then restore.

## Risks and open questions

- **Risk:** allowlist too narrow → false failures on legitimate new root
  files. Mitigation: seed from the phase-0.2 inventory; failure message tells
  the author exactly how to allowlist; keep patterns scratch-shaped
  (`rt.*`, ad-hoc scripts) rather than extension-broad.
- **Risk:** agents corrupt binaries again before any gate runs. The gate
  catches it at the next automated stage, but same-stage claims could still be
  wrong. Mitigation: the guidance (phase 3) makes `xxd`+`file` verification
  part of the claim procedure itself; review stages re-run the check.
- **Non-goals:** retrying or changing the pretty-tasks feature; touching
  `pretty-proof.png` bytes (it is valid on the planning branch); git-hook
  installation machinery; history rewrites of the 5a38ad45 reports.
- **Open questions:** none requiring human input — survey q1–q4 are defaulted
  above with rationale, and all remaining unknowns are branch-state facts for
  phase 0 to establish. If a human disagrees with a survey default, that is a
  one-line plan edit, not new research.

## Documentation plan

- Normative guidance: `docs/agent-docs/GitGuidance.md` (+ pointer from
  `agents.md` if it indexes such rules).
- Workflow checklist: alongside the `capture:screenshot` / proof-capture docs.
- Machine-readable contract: the checker's `--help`/header comment and the
  allowlist file document patterns and escape hatches.
- Audit trail: stage report with survey mapping, step-3 byte evidence, and
  re-runnable commands.
