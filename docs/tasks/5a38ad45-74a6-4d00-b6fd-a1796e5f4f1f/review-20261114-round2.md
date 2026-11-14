# PR Review Round 2 — Pretty tasks (task 5a38ad45)

Date: 2026-11-14. Reviewer: review stage (docs-only).
Scope: branch `kb/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` vs `origin/main` (9 files in final diff) plus prior reports.
Method: assume nothing works until evidence shows it does; re-ran build, depcheck, targeted tests; inspected every changed file.

## Prior review blockers — re-checked with evidence

The 20261114 review (`review-pretty-tasks-20261114.md`) correctly blocked integration on three concrete failures recorded in `automated-tests-failure-20261114-045255.md`:

| # | Original blocker | Evidence this round | Status |
|---|---|---|---|
| 1 | `Frontend Build` FAIL — `Rolldown failed to resolve import "mermaid"`; `depcheck (frontend)` FAIL — `Missing dependencies: mermaid`; canary timed out on cascading vite errors | `frontend/package.json` now contains `mermaid ^12.3.0` (verified in worktree and HEAD). `npm run build --prefix frontend` → `✓ built in 3.73s` with mermaid chunked out of main bundle. `depcheck:frontend` → `No depcheck issue` (both re-run in this session). | **RESOLVED** |
| 2 | No visual proof of "pretty" — plan required `capture:screenshot` before/after | `pretty-proof.png` (95 KB) now present in `docs/tasks/<id>/`; `file` reports valid image data; `*.png binary` in `.gitattributes` prevents corruption (added in f89105a). | **RESOLVED** |
| 3a | Plan non-goal drift: "No change to title derivation" vs actual `slice(0,60)` → `deriveTaskTitleFromGoal(first line, 60)` | `IMPLEMENTATION_PLAN.md` now contains explicit "Approved exception — title derivation (2026-11-14, per survey q5 ...)" with rationale, scope, and test pins cited. | **RESOLVED** |
| 3b | Stale survey premise: plan said `"answers": {}` unanswered while `SURVEY.md` has answers | `IMPLEMENTATION_PLAN.md` now opens with "Update (2026-11-14): the survey HAS since been answered" mapping q1–q6 to decided strictness (notably q4 "always write the file first"). | **RESOLVED** |

## Does it achieve the goal?

**A) API accepts nice-looking markdown** — Yes. `api/work/taskMarkdownGoal.test.js` pins byte-identical round-trip for `RICH_GOAL` (headings, bullets, table, fenced code, ` ```mermaid ` fence, `![flow](assets/flow.png)` and absolute URL image), CRLF, adversarial `javascript:` URL, blank-goal 400, and legacy paragraph untouched. Goal is stored verbatim; only `title` is sanitized via `_sanitizeTaskTitle`. Verified: `taskIdentity.test.js` and `taskMarkdownGoal.test.js` both green in this session (16 tests + 11 mermaid tests green).

**B) Skill re-structured to two-stage file-first flow** — Yes. `skills/creating-new-tickets/SKILL.md` (254 lines, `lastUpdated: 2026-11-14`) mandates Stage 1 (`{{taskDocs}}drafts/draft-<slug>.md` per ticket, template with Context/Steps/Acceptance/Notes) then Stage 2 (`POST /tasks` with `goal` = exact file bytes, `title` = first line verbatim, create→upload→patch ordering for images, verify goal-equals-file). Existing guardrails retained: dedupe, 10-cap, explicit `blockedBy`/`blockers: none`, deterministic `idempotencyKey`, `execute:false`, recursion guard. `{{taskDocs}}` is a real prompt-curation keyword (`promptCuration.js` L115/L336, covered by `promptCuration.test.js`) — not a hallucinated path.

## Code standards & best practices

- Lint: `api` 0 errors / 508 warnings, `frontend` 0 errors / 214 warnings — clean.
- Build: production build succeeds; mermaid correctly code-split via `import('mermaid')` with shared promise/memoization, not bundled into main.
- Security: `securityLevel: 'strict'` in `loadMermaid`; `sanitizeUrl` path unchanged; `logger.warn` line in `MermaidDiagram` intentionally omits diagram source so task text never leaks into logs (good).
- Degradation: broken diagram → readable source block, never blank hole; tested both as generic render failure and as "no render function" path, plus `MarkdownViewer` mid-document degradation.
- Title derivation: `deriveTaskTitleFromGoal` correctly splits on `\r\n|\r|\n`, caps at 60, returns "" for blank first line so caller falls back to "Untitled task" — new test pins this incl. `'   \ncontent'` → `'   '` case; sanitize stays separate.

## Modifiability & tech debt

Changes are additive and isolated: new helper in `taskIdentity.js` (with fallback callers only), new fixture-driven tests, single-component renderer extension with lazy import, skill-text-only rewrite. No schema migration, no storage backend change, no format versioning — legacy paragraph tasks untouched per survey q6. Minor non-blocker: `renderMermaid` export duplicates the dynamic import; harmless.

## Docs

- `IMPLEMENTATION_PLAN.md` amended for both prior gaps (see table).
- `docs/task-images.md` has "API-created tasks" ordering section.
- `CHANGELOG.md` has mermaid + two-stage skill entry.
- `.gitattributes` marks `*.png binary` so screenshot evidence survives.
- `pretty-proof.png` provides headless visual evidence per Validation 5.

## Remaining note (not a blocker)

Full `npm run test:unit` (all api + frontend suites) was not re-run end-to-end in this docs-only session due to timeout in this environment; targeted suites for the changed areas are green and both lints + build + depcheck are green. The `publish` gate failure in `publish-failure-20261114-062622.md` is unrelated to this change (generic mass-push non-fast-forward spam); it carries no signal about build correctness and was taken on a tree that lacked the mermaid dependency — not the current tree which builds.

## Verdict

All three blocking findings from the prior review have concrete, re-verified fixes in-tree. The change achieves both clauses A and B, follows the amended plan, meets code standards, is easy to modify, follows best practices, adds no unnecessary debt, and has updated docs. The current diff vs `origin/main` is 9 files and is already on `main`; the additional delta in this branch (plan amendment + `pretty-proof.png` + two targeted tests + logger + `.gitattributes`) is precisely the evidence required to close the review. Suitable to integrate.
