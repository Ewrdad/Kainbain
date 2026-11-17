# Implementation Plan — Default screenshot capture output to the task docs folder

## Goal

Make the no-flag invocation of `scripts/capture-screenshot.mjs` already correct: without `--out`, the script resolves the current task id and writes to `docs/tasks/<task-id>/screenshot-<timestamp>.png` (creating the directory), instead of defaulting to `screenshot.png` at the repo root. An explicit `--out` always wins as an override. This closes the loop left open by task `ef569a1a-d301-4e10-aaba-8cde942b97e8` (deep review `docs/tasks/ef569a1a-d301-4e10-aaba-8cde942b97e8/review-pr-20261116.md`, section 4, nit 2: "a task-folder-aware default would close the loop") while leaving the PNG byte-writing mechanism, the binary guard, and the proof-hygiene detector semantics untouched.

## Success criteria (maps to acceptance criteria)

1. No-flag capture on a task branch writes a valid PNG (magic `89504e47`) under `docs/tasks/<task-id>/`, never repo root.
2. Explicit `--out` overrides the default exactly as today.
3. No discoverable task id → exit non-zero with a message showing the `--out` form.
4. `npm run check:proof-hygiene`, `npm run check:binaries`, and the existing capture/guard test suites stay green.

## Context and evidence (researched this session)

- Current default (root cause): `scripts/capture-screenshot.mjs:74` — `const outputPath = getArg("--out") || "screenshot.png";` resolved against `process.cwd()` at line 97–98 (`path.resolve` + `mkdirSync recursive`). Forgetting `--out` therefore lands a PNG at the repo root, which trips the root scratch-hygiene gate in `scripts/check-proof-and-hygiene.mjs`.
- Safe recipe that works only with the easy-to-forget flag: `docs/tasks/_PROOF_RULE.md:15` — `node scripts/capture-screenshot.mjs --path "#/tasks/<task-id>" --out docs/tasks/<task-id>/<name>-proof.png`.
- Agent rule pointing at the recipe: `docs/agent-docs/GitGuidance.md` ("Binary-safe proof artifacts" section, lines 32–37) — shows `--out <path>` form and defers to `_PROOF_RULE.md`.
- Existing test style to mirror: `tests/capture-screenshot.test.mjs` — `node:test` + `assert/strict`, temp fixture trees via `makeFixtureTree`, currently covers only the exported `verifyPngMagic`, not arg/output resolution.
- Env-var search this session: no existing `TASK_ID` / `KAINBAIN_TASK_ID` consumer found under `scripts/` or `docs/agent-docs/` — the plan must define the precedence explicitly (env first, branch second) since there is no established helper to reuse. Confirm the runner's actual variable name during implementation; support both names.
- Branch convention: `docs/agent-docs/GitGuidance.md:9` — task branches have form `kb/<task-id>`.
- Grill survey (`docs/tasks/b3ab7335-f277-4aa7-b265-ad421e09ad1a/SURVEY.md`, round 1, all Recommended options selected) binds three decisions: (Q1) default into the current task folder; (Q2) fail fast with a short `--out` message when no task is discoverable — never silently fall back to root or a temp folder; (Q3) timestamped unique filename per capture so nothing is overwritten.

## Key decisions

1. **Default path shape:** `docs/tasks/<task-id>/screenshot-<timestamp>.png` (timestamp e.g. `YYYYMMDD-HHMMSS`, local time; survey Q3). Directory created with the existing `mkdirSync recursive` behavior (Fix statement: "creating the directory as today").
2. **Task-id resolution order (Fix statement):** (a) explicit env var `TASK_ID`, else `KAINBAIN_TASK_ID`, if set and non-empty; (b) else current git branch name matching `kb/<task-id>` (take the segment after `kb/`, validate non-empty, no path separators); (c) else fail fast, exit non-zero, message naming the expected `--out` form (survey Q2). Never fall back to `screenshot.png`, repo root, or a shared temp folder.
3. **Override semantics:** explicit `--out` wins byte-for-byte exactly as today (relative paths still resolve against `process.cwd()`); default logic runs only when `--out` is absent (acceptance criterion 2).
4. **"Make change easy, then make the change":** first extract a small pure, exported, unit-testable resolver (e.g. `resolveDefaultOut({ argv, env, branch })` or equivalent) with zero new runtime dependencies (stdlib `node:child_process` for `git branch --show-current`, or read first; non-goal: no new runtime deps), keeping `main()` behavior identical; then wire it into `main()` and update docs/tests. This keeps the risky branch/env parsing testable without launching Playwright.
5. **No behavior changes beyond the default:** PNG byte writing, `verifyPngMagic` self-check, `check-binary-guard` (`BINARY_MAGIC`), and proof-hygiene detector semantics are untouched (Non-goals).

## Work plan (ordered; big/research pieces first)

### Phase 0 — Research spikes (do first, before editing)

- **Step 0.1 — Confirm task-id sources.** Check what the runner actually sets: inspect a live task worktree env / runner docs for `TASK_ID` vs `KAINBAIN_TASK_ID`; confirm `git branch --show-current` returns `kb/<task-id>` inside engine-created `kb-*` worktrees and what it returns on detached HEAD / main (resolver must treat those as "no id"). Record the exact variable name(s) supported — code supports both, docs name the one the runner sets.
- **Step 0.2 — Confirm doc touchpoints.** Re-read `docs/tasks/_PROOF_RULE.md`, `docs/agent-docs/GitGuidance.md`, and the header usage comment in `scripts/capture-screenshot.mjs:7-9`; list every line showing the old default or a mandatory `--out`. Check for any other docs/scripts referencing `screenshot.png` at root (`muse.search` for `screenshot.png` and `capture-screenshot`) so the doc update is complete but scoped.

### Phase 1 — Make the change easy (pure refactor, no behavior change)

- **Step 1.1 — Extract output-path resolution into an exported pure function.** Move lines 74/97–98 logic into e.g. `export function resolveOutputPath({ outArg, env, getBranch })` (exact name per codebase parallel; check sibling script export style first). Initial behavior identical: `outArg ?? "screenshot.png"`. Export it alongside `verifyPngMagic` so `tests/capture-screenshot.test.mjs` can import it with no Playwright launch. Verify: existing test file still passes unchanged.
- **Step 1.2 — Add the task-id helpers as pure functions.** Add `resolveTaskId({ env, branch })` implementing the precedence (env `TASK_ID` → `KAINBAIN_TASK_ID` → `kb/<task-id>` branch parse → null) plus `defaultTaskScreenshotPath(taskId, now)` producing `docs/tasks/<task-id>/screenshot-<timestamp>.png`. Keep them branch/env-injected (parameters, not direct `process.env` reads inside) so tests inject values. Sanitize: reject empty ids and ids containing `/`, `\`, `..`, or whitespace; return null (→ fail-fast path) rather than building a traversal path.

### Phase 2 — Make the change (behavior)

- **Step 2.1 — Wire the default into `main()`.** Replace `getArg("--out") || "screenshot.png"` with: if `--out` present, use it exactly as today; else `resolveTaskId(...)` → build default path → `mkdirSync recursive` as today; if unresolvable, `console.error` a message showing the `--out` form (e.g. `Cannot determine task id (checked $TASK_ID/$KAINBAIN_TASK_ID and kb/<task-id> branch). Pass --out explicitly, e.g. --out docs/tasks/<task-id>/<name>-proof.png`) and `process.exit(1)` (or throw, matching the file's existing failure style) before launching the browser. Git branch lookup failure (not a repo, git missing) counts as "no id", not a crash with a raw stack.
- **Step 2.2 — Update the header usage comment** (`scripts/capture-screenshot.mjs:7-9`): document the new no-flag default, the resolution order, and that explicit `--out` overrides. Keep the proof-checklist lines (magic `xxd`/`file`, `check:binaries`) verbatim.
- **Step 2.3 — Update `docs/tasks/_PROOF_RULE.md` recipe**: show the no-flag invocation as the primary copy-paste (`node scripts/capture-screenshot.mjs --path "#/tasks/<task-id>"` → writes into the task folder) with explicit `--out docs/tasks/<task-id>/<name>-proof.png` documented as the override / custom-name form. Keep verify + gate steps unchanged.
- **Step 2.4 — Update `docs/agent-docs/GitGuidance.md` only if it shows the default**: the "Binary-safe proof artifacts" bullet currently shows `--out <path>` as an example path, which remains valid as the override; adjust wording only to note the new default (no-flag → task folder) and keep the pointer to `_PROOF_RULE.md` canonical. Do not restructure the file.

### Phase 3 — Tests (mirror existing style, in `tests/capture-screenshot.test.mjs` or its runner's adjacent file)

- **Step 3.1 — Default resolves into the task folder when the id is discoverable.** Cases: env `TASK_ID` wins; `KAINBAIN_TASK_ID` used when `TASK_ID` unset; `kb/<task-id>` branch used when neither env is set; output matches `docs/tasks/<task-id>/screenshot-<timestamp>.png` and never equals repo-root `screenshot.png`. Inject env/branch (no real git, no browser).
- **Step 3.2 — Explicit `--out` wins.** With a discoverable id AND `--out docs/tasks/<task-id>/custom-proof.png`, resolver/main returns the explicit path exactly (relative resolution unchanged).
- **Step 3.3 — No discoverable id fails fast naming `--out`.** No env, branch `main` / detached / git-unavailable → non-zero exit (or thrown error, per Step 2.1's mechanism) with message containing `--out` and the `docs/tasks/<task-id>/` form. Assert it does NOT return a root fallback.
- **Step 3.4 — Sanitization edge.** Malicious/odd ids (`../x`, `a/b`, empty) are rejected to the fail-fast path.

### Phase 4 — Verification and handoff

- **Step 4.1 — Run the gates the acceptance criteria name:** the capture test file (via whatever invokes `tests/capture-screenshot.test.mjs` — check `scripts/run-tests.mjs` for the node:test wiring), plus `npm run check:proof-hygiene` and `npm run check:binaries`. All green.
- **Step 4.2 — Live no-flag rehearsal (optional, cheap):** on the task branch with a stubbed target (or against the normal `KAINBAIN_URL` fixture), run without `--out`, then `xxd -l 8` + `file` on the produced PNG and confirm it sits under `docs/tasks/<task-id>/` and no `screenshot.png` appears at root; delete or keep the rehearsal PNG per task convention (proof files under the task folder are legitimate; root files are not).
- **Step 4.3 — Confirm non-goals held:** `git status` / diff shows changes only in `scripts/capture-screenshot.mjs`, `tests/capture-screenshot.test.mjs` (or adjacent), `_PROOF_RULE.md`, `GitGuidance.md`, and task docs; no new entries in `package.json` dependencies.

## Documentation plan

- Update in the same change as the code (Steps 2.2–2.4), not as a follow-up: header comment, `_PROOF_RULE.md` recipe (primary no-flag form + `--out` override form), `GitGuidance.md` wording only if it shows the default.
- This plan file (`docs/tasks/b3ab7335-f277-4aa7-b265-ad421e09ad1a/IMPLEMENTATION_PLAN.md`) plus the survey (`SURVEY.md`) are the audit trail linking each decision to its source (survey Q1→default, Q2→fail-fast, Q3→timestamp name; nit 2 of the ef569a1a review → the whole task).

## Risks and mitigations

- **Runner env name differs** (`TASK_ID` vs `KAINBAIN_TASK_ID` vs unset): mitigate by supporting both names with documented precedence and verifying in Step 0.1; branch fallback covers runners that set neither.
- **Detached HEAD / non-`kb/` branch in CI or local main checkouts**: defined as "no id" → clear fail-fast message, never a root write (survey Q2). Message must be actionable (shows `--out` form), not a bare usage dump.
- **Timestamp collisions or timezone confusion**: timestamps are uniqueness aids, not ordering guarantees; format `YYYYMMDD-HHMMSS` (optionally plus short random suffix if the implementer wants collision-proofing within one second — keep stdlib-only).
- **Over-editing docs**: `GitGuidance.md` is owned guidance — change only the lines that show the default; `_PROOF_RULE.md` stays canonical.

## Non-goals (explicitly out of scope)

- No change to the PNG byte-writing mechanism, `verifyPngMagic` semantics, the binary guard (`scripts/check-binary-guard.mjs`, `BINARY_MAGIC`), or the proof-hygiene detector semantics.
- No new runtime dependencies (Node stdlib only).
- No migration of existing screenshots; no allowlist/baseline edits unless a rehearsal artifact requires cleanup (then remove the artifact, not the rule).
