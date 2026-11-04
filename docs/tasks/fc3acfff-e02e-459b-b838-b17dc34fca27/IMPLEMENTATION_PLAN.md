# Implementation Plan: Markdown File Cleanup

_Created for task `fc3acfff-e02e-459b-b838-b17dc34fca27`. Decision source: `SURVEY.md` (round 1, 2026-11-04)._

## 1. Context and decisions inherited from the survey

| Survey question | Answer | Policy applied by this plan |
|---|---|---|
| q1 – how clean should the main folder look | **Balanced**: welcome file plus a few standard files (change history, work rules) | Keep `README.md`, `CHANGELOG.md`, `agents.md`, `AGENTS-MAP.md`, `DEPRECATIONS.md` at root; move or delete everything else markdown at root. |
| q2 – old one-off notes/checklists/verdicts | **Delete them** | Delete all eleven task-summary markdown files at root. |
| q3 – useful guides in the main folder | **Move them into `./docs`** unless they must stay relevant in the repo root (e.g. `agents.md`, `README.md`, map files) | Move `CI_SCRIPTS.md` and `PORTABLE_DEPLOYMENT.md` into `docs/`. |
| q4 – old project plans | **Delete them** | Delete `phase2_plan.md` and `phase2_completion_plan.md`. |
| q5 – areas outside `docs` to leave alone | Tick: website help pages (`site-docs/`), small readme files inside code folders, skill instruction files. **Not** ticked: helper files for AI workers (`agent-docs/`). | Leave `site-docs/`, in-folder `README.md`s and `SKILL.md`s untouched. Move `agent-docs/` into `docs/agent-docs/`. |
| q6 – fix broken links on move | **Yes, fix links to moved files** | Update active (non-historical) references after every move. |
| q7 – unsure whether a file is still useful | **Keep it safe in `docs`** | Move, do not delete, anything uncertain: `research/phase0-branch-dry-run.md` → `docs/research/phase0-branch-dry-run.md`; keep all of `agent-docs/`. |

## 2. Goal

Make the repository root look professional and intentional: only standard, always-relevant files plus `docs/`. No one-off summaries, verdicts, checklists, or sprawled guides remain at root, while useful content is preserved under `docs/` and links are kept valid.

## 3. Non-goals

- No changes to application code, tests, or runtime behaviour.
- No cleanup of non-markdown junk at root (e.g. `*.jsonl`, `opencode-ai-sdk-*.tgz`) — out of this task.
- No edits to historical evidence under `docs/tasks/` (execution reports are evidence; do not rewrite them).
- No deletion of `site-docs/`, in-folder `README.md`s, or `SKILL.md`s.
- No reformatting of moved docs.

## 4. Target root state (markdown)

After completion, the only markdown files at the repository root should be:

- `README.md` — welcome / project overview (project entry point).
- `agents.md` — normative agent rules (required by tooling/tests).
- `AGENTS-MAP.md` — one-page repo map.
- `CHANGELOG.md` — curated change history.
- `DEPRECATIONS.md` — deprecation/EOL inventory (required by `check-doc-links.mjs`, npm configs, and CI).

Everything else markdown at root is either moved into `docs/` or deleted.

## 5. Inventory and disposition table

### 5.1 Root markdown — keep

| File | Reason |
|---|---|
| `README.md` | Welcome / project overview. |
| `agents.md` | Normative agent guidance; required by `siteDocs.integrity.test.js` and root-doc link checks. |
| `AGENTS-MAP.md` | One-page repo map referenced by `agents.md` and the link checker. |
| `CHANGELOG.md` | Curated change history. |
| `DEPRECATIONS.md` | Canonical deprecation inventory; required by `check-doc-links.mjs` and build configs. |

### 5.2 Root markdown — move to `docs/`

| Source | Destination | Notes |
|---|---|---|
| `CI_SCRIPTS.md` | `docs/CI_SCRIPTS.md` | Useful CI/CD guide; no current references. |
| `PORTABLE_DEPLOYMENT.md` | `docs/PORTABLE_DEPLOYMENT.md` | Overwrite/merge with the existing (shorter) `docs/PORTABLE_DEPLOYMENT.md`. Root copy is the canonical, richer version — merge rather than blindly overwrite. |
| `agent-docs/` (directory) | `docs/agent-docs/` | Vendored KB architecture/code standards + guides; update `agents.md` paths. |
| `research/phase0-branch-dry-run.md` | `docs/research/phase0-branch-dry-run.md` | Historical-but-useful verification note; no references. Keep (q7). |

### 5.3 Root markdown (and one directory) — delete (one-off/obsolete)

Old one-off summaries/checklists/verdicts:

| File | Why obsolete |
|---|---|
| `CHANGES_SUMMARY.md` | Single-task change summary. |
| `CHECKLIST.md` | Single-task completion checklist. |
| `FINAL_SUMMARY.md` | Single-task final summary. |
| `IMPLEMENTATION_SUMMARY.md` | Single-task implementation summary. |
| `IMPLEMENTATION_VERIFICATION.md` | Single-task verification report. |
| `PR_REVIEW_SUMMARY.md` | Single PR review summary. |
| `README_IMPLEMENTATION.md` | Single-task implementation readme. |
| `REVIEW_SUMMARY.md` | Single-task review summary. |
| `STAGE_REVIEW_SUMMARY.md` | Single stage review summary. |
| `STAGE_VERDICT.md` | Single stage verdict. |
| `VERDICT_WP5.md` | WP5 verdict report. |

Old project plans (q4):

| File | Why obsolete |
|---|---|
| `phase2_plan.md` | Superseded Phase 2 plan. |
| `phase2_completion_plan.md` | Superseded Phase 2 completion plan. |

After `research/phase0-branch-dry-run.md` is moved, remove the now-empty `research/` directory.

### 5.4 Left untouched (q5)

| Area | Reason |
|---|---|
| `site-docs/` | Website help pages (explicitly kept). |
| `*/README.md` inside code folders (`api/`, `runner/`, `canary-e2e/`, `frontend/src/a11y/`, etc.) | Small in-folder readme files (explicitly kept). |
| `skills/*/SKILL.md` | Skill instruction files (explicitly kept). |
| `docs/` (all existing content) | Already the documentation home. |

## 6. Principle: make the change easy, then make the change

Execute in three waves so each is trivially reviewable and reversible:

1. **Wave A (research / make-easy):** snapshot current references and reconcile the duplicate `PORTABLE_DEPLOYMENT.md`; no file is moved or deleted.
2. **Wave B (make the change):** perform `git mv` operations for the keep/move set, then `git rm` the obsolete set in one commit.
3. **Wave C (verify):** update references, run docs/tests, and confirm the end-state.

Biggest/most-research-heavy pieces (`PORTABLE_DEPLOYMENT.md` reconciliation, `agent-docs/` relocation, reference discovery) come **before** any deletion.

## 7. Detailed step-by-step plan

### Phase 0 — Baseline and inventory (do first)

1. Confirm the working tree is clean except for the current task artefacts:
   ```bash
   git status --short
   ```
   Expected: only `docs/tasks/fc3acfff-…/SURVEY.md` and `…/idea-…md` modifications.
2. Capture the markdown inventory:
   ```bash
   find . -path ./.git -prune -o -name '*.md' -print | grep -v '^./docs/tasks/' | sort > /tmp/md-inventory-before.txt
   ```
3. Capture a reference snapshot for everything being moved/deleted (excluding historical task reports):
   ```bash
   grep -RInE 'CI_SCRIPTS\.md|PORTABLE_DEPLOYMENT\.md|agent-docs/|research/phase0-branch-dry-run\.md|CHANGES_SUMMARY\.md|CHECKLIST\.md|FINAL_SUMMARY\.md|IMPLEMENTATION_SUMMARY\.md|IMPLEMENTATION_VERIFICATION\.md|PR_REVIEW_SUMMARY\.md|README_IMPLEMENTATION\.md|REVIEW_SUMMARY\.md|STAGE_REVIEW_SUMMARY\.md|STAGE_VERDICT\.md|VERDICT_WP5\.md|phase2_plan\.md|phase2_completion_plan\.md' . \
     --exclude-dir=.git --exclude-dir=docs/tasks --exclude='*.jsonl' \
     > docs/tasks/fc3acfff-e02e-459b-b838-b17dc34fca27/md-ref-baseline.txt
   ```
4. Run the documentation gate once before changes to establish a green baseline:
   ```bash
   npm run docs:check
   ```

### Phase 1 — Make the change easy (research)

5. Reconcile `PORTABLE_DEPLOYMENT.md` vs `docs/PORTABLE_DEPLOYMENT.md`:
   ```bash
   diff PORTABLE_DEPLOYMENT.md docs/PORTABLE_DEPLOYMENT.md
   ```
   - Open both in an editor.
   - Confirm every section present in the root copy survives in `docs/PORTABLE_DEPLOYMENT.md` (scenario tables, scenario D, "Runner updates").
   - Preserve any root-only content; if the docs copy has unique lines not in root, merge them into the root version first, then use root as canonical.
   - Do **not** delete either file yet.
6. Confirm no hidden code references to the files being moved:
   ```bash
   grep -RIn "agent-docs" --include='*.js' --include='*.mjs' --include='*.json' --include='*.yaml' --include='*.yml' --include='*.sh' .
   grep -RIn "CI_SCRIPTS" . --include='*.js' --include='*.mjs' --include='*.json' --include='*.yaml' --include='*.yml' --include='*.sh'
   ```
   (Expected: agent-docs only in `agents.md`, `docs/EngineDetails/UnifiedLogging.md`, and `.pi-lens.json`; CI_SCRIPTS in none.)
7. Update `.pi-lens.json` ignore entry ahead of the move:
   - change `"agent-docs/**"` to `"docs/agent-docs/**"`.
   - keep `"agents.md"`.
   (This keeps lint/lens behaviour stable after relocation.)

### Phase 2 — Move (keep/move set) before any deletion

8. Move the CI/CD guide:
   ```bash
   git mv CI_SCRIPTS.md docs/CI_SCRIPTS.md
   ```
9. Move the portable deployment guide (root is canonical after step 5):
   ```bash
   git mv -f PORTABLE_DEPLOYMENT.md docs/PORTABLE_DEPLOYMENT.md
   ```
10. Move the vendored agent docs directory:
    ```bash
    git mv agent-docs docs/agent-docs
    ```
11. Move the phase-0 research note:
    ```bash
    mkdir -p docs/research
    git mv research/phase0-branch-dry-run.md docs/research/phase0-branch-dry-run.md
    rmdir research 2>/dev/null || true
    ```

At this point all moved content exists at its new (kept) location; nothing is deleted yet.

### Phase 3 — Delete obsolete notes and plans

12. Delete one-off summaries/checklists/verdicts:
    ```bash
    git rm \
      CHANGES_SUMMARY.md CHECKLIST.md FINAL_SUMMARY.md IMPLEMENTATION_SUMMARY.md \
      IMPLEMENTATION_VERIFICATION.md PR_REVIEW_SUMMARY.md README_IMPLEMENTATION.md \
      REVIEW_SUMMARY.md STAGE_REVIEW_SUMMARY.md STAGE_VERDICT.md VERDICT_WP5.md
    ```
13. Delete superseded Phase 2 plans:
    ```bash
    git rm phase2_plan.md phase2_completion_plan.md
    ```
14. Remove the now-empty `research/` directory if no other files remain:
    ```bash
    rmdir research 2>/dev/null || true
    ```

### Phase 4 — Repair references (q6)

15. Update `agents.md` paths from `agent-docs/…` to `docs/agent-docs/…`:
    - `[agent-docs/KB-Architecture.md]`, `[agent-docs/KB-Code-Standards.md]`, `[agent-docs/GitGuidance.md]`.
    - Header text and numbered orientation list.
    Do a global replace within `agents.md`: `agent-docs/` → `docs/agent-docs/`.
16. Update `docs/EngineDetails/UnifiedLogging.md` references to `agent-docs/KB-Code-Standards.md`.
17. Update the deprecation-inventory reference in `DEPRECATIONS.md`:
    - `` `PORTABLE_DEPLOYMENT.md` `` → `` `docs/PORTABLE_DEPLOYMENT.md` `` (line ~193, scenario D).
18. Update historical (non-task) research docs that reference the old root guide — exclude `docs/tasks/` (evidence) and `*.jsonl`:
    ```bash
    grep -rl 'PORTABLE_DEPLOYMENT\.md' docs --include='*.md' | grep -v '^docs/tasks/' \
      | xargs sed -i 's#`PORTABLE_DEPLOYMENT\.md`#`docs/PORTABLE_DEPLOYMENT.md`#g'
    ```
19. Update the CI/release workflow note:
    - `.github/workflows/runner-release.yml`: `See PORTABLE_DEPLOYMENT.md 'Runner updates'.` → `See docs/PORTABLE_DEPLOYMENT.md 'Runner updates'.`
20. Optional (recommended): add the relocated guides to `docs/README.md` so they remain discoverable.
21. Re-run reference discovery to catch anything missed:
    ```bash
    grep -RInE 'CI_SCRIPTS\.md|(^|[^/])agent-docs/|research/phase0-branch-dry-run\.md' . \
      --exclude-dir=.git --exclude-dir=docs/tasks --exclude='*.jsonl' || true
    ```

### Phase 5 — Verification

22. Confirm end-state root markdown list:
    ```bash
    find . -maxdepth 1 -name '*.md' -printf '%f\n' | sort
    ```
    Must be exactly: `AGENTS-MAP.md`, `CHANGELOG.md`, `DEPRECATIONS.md`, `README.md`, `agents.md`.
23. Confirm no obsolete roots remain:
    ```bash
    for f in CHANGES_SUMMARY.md CHECKLIST.md FINAL_SUMMARY.md IMPLEMENTATION_SUMMARY.md IMPLEMENTATION_VERIFICATION.md PR_REVIEW_SUMMARY.md README_IMPLEMENTATION.md REVIEW_SUMMARY.md STAGE_REVIEW_SUMMARY.md STAGE_VERDICT.md VERDICT_WP5.md phase2_plan.md phase2_completion_plan.md; do test ! -e "$f" && echo "gone: $f"; done
    ```
24. Confirm new locations exist:
    ```bash
    test -f docs/CI_SCRIPTS.md && test -f docs/PORTABLE_DEPLOYMENT.md && test -d docs/agent-docs && test -f docs/research/phase0-branch-dry-run.md && echo OK
    ```
25. Run the documentation gate:
    ```bash
    npm run docs:check
    ```
    This covers `siteDocs`, `docs.apiCoverage`, `agentGuide`, `docs.envCoverage`, `check-doc-links.mjs`, and `check-jsdoc-example.mjs`.
26. Run API unit tests to confirm integrity tests (e.g. `siteDocs.integrity.test.js`, `agentGuide` coverage) still pass:
    ```bash
    npm run test:api
    ```
27. Run a full reference sweep for any remaining references to deleted files (excluding historical reports and binaries):
    ```bash
    grep -RInE 'CHANGES_SUMMARY\.md|CHECKLIST\.md|FINAL_SUMMARY\.md|IMPLEMENTATION_SUMMARY\.md|IMPLEMENTATION_VERIFICATION\.md|PR_REVIEW_SUMMARY\.md|README_IMPLEMENTATION\.md|REVIEW_SUMMARY\.md|STAGE_REVIEW_SUMMARY\.md|STAGE_VERDICT\.md|VERDICT_WP5\.md|phase2_plan\.md|phase2_completion_plan\.md' . --exclude-dir=.git --exclude-dir=docs/tasks --exclude='*.jsonl' || echo "no stale references"
    ```
    (This should report none. Matches inside `docs/tasks/` are acceptable evidence.)
28. Inspect final diff:
    ```bash
    git status --short
    git diff --stat
    ```
29. Lens sanity (optional but recommended): update `.pi-lens.json` already done in Phase 1; run lens on changed files if available.

### Phase 6 — Commit and handoff

30. Stage and commit:
    ```bash
    git add -A
    git commit -m "docs: clean up and consolidate root-level markdown files"
    ```
31. Record the commit SHA and list of moved files in the next stage report.

### Rollback

- Before commit: `git reset --hard HEAD` restores the original tree (untracked scratch not affected).
- After commit: `git revert <commit>` reverses all moves/deletes; re-run Phase 5 to confirm.

## 8. Verification and assurance plan (testing + documentation)

### Automated (primary gate)

| Gate | Command | What it proves |
|---|---|---|
| Documentation consistency | `npm run docs:check` | Docs surfaces, env coverage, and file-path backticks all resolve. |
| Link checker | `node scripts/check-doc-links.mjs` | No stale backtick file paths in `site-docs/`, `docs/EngineDetails/`, or root docs (incl. moved `DEPRECATIONS.md`). |
| API unit tests | `npm run test:api` | `siteDocs.integrity.test.js` still finds `README.md`/`agents.md`; `agentGuide` coverage unaffected. |
| Full unit suite (recommended before merge) | `npm run test:unit` | No accidental breakage in frontend/API. |

### Manual checks

- Browse/open the moved guides at their new `docs/` paths to confirm readability.
- Open `agents.md` and confirm every `docs/agent-docs/…` link resolves.
- GitHub UI: confirm root directory now shows only the five standard markdown files.
- Confirm `.pi-lens.json` still excludes `agents.md` and the renamed agent-docs path.

### Documentation updates

- Documentation is the change: no behavioural docs beyond relocation.
- Optionally update `docs/README.md` index with moved guides (Phase 4, step 20).
- `CHANGELOG.md`: add one line under `Unreleased` → `Changed`: "Consolidated root-level markdown files into `docs/`".

## 9. Risk register (cleanup-specific)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaking `check-doc-links.mjs` because `DEPRECATIONS.md` moved | Low (kept at root) | Medium | Keep `DEPRECATIONS.md` at root per standard-file policy. |
| Breaking `siteDocs.integrity.test.js` because `README.md`/`agents.md` moved | High if moved | High | Intentionally keep both at root (q1/q3 note). |
| Broken `agent-docs` links in `agents.md` | Medium | Medium | Phase 1 inventory + Phase 4 global replace + grep verification. |
| `PORTABLE_DEPLOYMENT.md` duplicate loses content | Medium | Medium | Manual diff/merge in Phase 1, step 5 before overwrite. |
| Hidden references in scripts/CI | Low | Medium | `grep` sweep in Phase 1 + Phase 5. |
| Lens ignores stale path | Low | Low | Update `.pi-lens.json` before move. |

## 10. Appendix — exact delete list (13 files)

```
CHANGES_SUMMARY.md
CHECKLIST.md
FINAL_SUMMARY.md
IMPLEMENTATION_SUMMARY.md
IMPLEMENTATION_VERIFICATION.md
PR_REVIEW_SUMMARY.md
README_IMPLEMENTATION.md
REVIEW_SUMMARY.md
STAGE_REVIEW_SUMMARY.md
STAGE_VERDICT.md
VERDICT_WP5.md
phase2_plan.md
phase2_completion_plan.md
```

## 11. Definition of done

This stage is complete when:

1. This `IMPLEMENTATION_PLAN.md` exists at `docs/tasks/fc3acfff-e02e-459b-b838-b17dc34fca27/IMPLEMENTATION_PLAN.md`.
2. The plan reflects every survey answer (q1–q7) and the "make change easy then make the change" ordering.
3. Big/research-heavy pieces (inventory, duplicate reconciliation, reference discovery) precede destructive steps.
4. The verification and documentation plans are included.