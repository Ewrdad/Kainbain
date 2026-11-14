# PR Review — Pretty tasks for the create-task skill (task 5a38ad45)

Date: 2026-11-14. Reviewer: review stage (docs-only; no source touched).
Scope reviewed: branch `kb/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` vs `origin/main`
(21 files), plus all prior reports in this folder. Method: read every changed
file/test, assumed nothing works until the evidence shows it does.

## What the change does

- API: new `deriveTaskTitleFromGoal` (`api/work/taskIdentity.js`) takes the
  goal's first line (max 60 chars) instead of `goal.slice(0, 60)`; wired into
  `taskLifecycle.js`, `taskPersistence.js`, `taskWorkRoutes.js`. Goal itself is
  stored byte-identical (new `api/work/taskMarkdownGoal.test.js`, 214 lines).
- Rendering: `MarkdownViewer.jsx` parses ` ```mermaid ` fences into a
  `MermaidDiagram` component (lazy `import('mermaid')`, memoized promise,
  `securityLevel: 'strict'`, fallback to source block). `mermaid ^12.3.0`
  added to `frontend/package.json` + lock.
- Skill: `skills/creating-new-tickets/SKILL.md` rewritten to the two-stage flow
  (Stage 1: one `.md` draft per ticket under `{{taskDocs}}drafts/`; Stage 2:
  POST exact file bytes, create → upload → patch for images, verify
  goal-equals-file). `{{taskDocs}}` verified as a real keyword
  (`api/promptCuration.js` ~L115, L336; covered by `promptCuration.test.js`).
  Contract tests extended with two-stage pins; prompt-budget pin kept.
- Docs: `docs/task-images.md` "API-created tasks" subsection (ordering
  create → upload → patch) and a `CHANGELOG.md` entry. The skill's note that
  `PATCH /tasks/:id` trims the goal is accurate (`taskWorkRoutes.js` L434).

## What is good

- Goal A mechanics are sound: byte-identical round trip is tested (rich goal,
  CRLF, adversarial `javascript:` URL, blank-goal 400, legacy paragraph
  untouched). Sanitization stays in the renderer. Graceful mermaid degradation
  is the right call.
- First-line derivation change is strictly closer to the required "first line
  title" behaviour and identical for all legacy single-line goals; tested incl.
  CRLF/CR caps and non-string input.
- Skill keeps every guardrail (dedupe, 10-cap, `blockedBy` explicit incl.
  `blockers: none`, idempotency, recursion guard, `execute: false`).

## Why it must NOT integrate yet (concrete, evidence-backed)

1. **The only full-CI signal on record is FAIL.**
   `automated-tests-failure-20261114-045255.md`: `npm run test:unit` PASS and
   both lints PASS, but `Frontend Build` FAILS —
   `Rolldown failed to resolve import "mermaid" from
   frontend/src/components/common/MarkdownViewer.jsx` — and
   `depcheck (frontend)` FAILS (`Missing dependencies: mermaid`), and Canary
   then timed out (1500s) on cascading vite resolve errors. The `mermaid`
   dependency was added to `frontend/package.json`/lock only in a later
   commit (05:04) with **no subsequent green CI run**. There is zero proof the
   current tree builds, passes depcheck, or survives canary.
2. **No visual proof of "pretty".** The plan required headless
   `capture:screenshot` before/after evidence; none exists. The
   `MarkdownViewer.mermaid.real.test.jsx` test passes on *either* SVG render
   *or* source fallback, so it proves "never a blank hole" but not that a
   diagram ever renders.
3. **Plan-compliance gaps to reconcile before merge:** the plan lists "No
   change to title derivation" as a non-goal, yet the change alters derivation
   (`slice(0,60)` → first line). The alteration is justified and tested, but it
   needs an explicit plan amendment, not silent drift. The plan also claims the
   survey was "generated but never answered" (`"answers": {}`), while the
   current `SURVEY.md` in this folder *has* answers — stale premise that should
   be corrected so the q4 "always write the file first" strictness is recorded
   as a decided answer, not an assumption.

## Minor observations (not blockers)

- `mermaid` v12 is heavy but correctly kept out of the main bundle via dynamic
  import with a shared promise; acceptable.
- `renderMermaid` export duplicates the dynamic import; harmless.
- `deriveTaskTitleFromGoal` returns the raw first line (e.g. `# Fix it`) and
  relies on `_sanitizeTaskTitle` to strip `#` — correct, covered by the
  route-level test expecting `Fix the retry loop`.

## Required before re-review

1. Re-run the full automated-tests gate on the current tree: green `test:unit`,
   frontend production build, frontend depcheck, and a non-timed-out canary.
2. Attach headless screenshot evidence (fixture task with headings + code +
   mermaid + inline image) as the plan's Validation 5 demands.
3. Amend `IMPLEMENTATION_PLAN.md`: record the title-derivation change as an
   approved exception to the non-goal, and correct the survey-answered premise.
