# Implementation Plan — Refresh the `creating-new-tickets` skill

## Goal

Bring `skills/creating-new-tickets/SKILL.md` up to date so agents using it reliably
(1) acknowledge the `blockedBy` dependency field and (2) give every ticket a
first-line title — removing the need for the current manual workaround of
patching those in by hand.

## Context and evidence

- The skill lives at `skills/creating-new-tickets/SKILL.md` (`lastUpdated:
  2026-09-12`) with keyword defaults in `skills/creating-new-tickets/KB_config.json`.
- **Gap 1 — `blockedBy` is never mentioned.** The skill's `POST /tasks` example
  body has `projectId/title/goal/stageId/workflowId/idempotencyKey/execute` but
  no `blockedBy`. The API accepts `blockedBy` (array of task ids) on create
  (`api/work/taskLifecycle.js` → `createTask` → `parseBlockedByValue` /
  `validateBlockedBy`: self-block, unknown id, and cycle are HTTP 400) and
  documents it in `site-docs/task-dependencies.md`. Agents following the skill
  verbatim therefore never set dependencies.
- **Gap 2 — no first-line title rule for `goal`.** The skill describes `goal` as
  "one-paragraph description of the work". Display titles across ~12 UI surfaces
  (`TaskCard`, `NowPlayingBar`, `QueueOrderList`, detail pages, etc.) are
  derived from the **first line of `goal`** via `formatTaskTitleFirstLine` in
  `frontend/src/components/tasks/taskFormatters.js` (strips a leading `# `,
  falls back to `'Untitled Task'`). Tickets whose goal opens with a plain
  paragraph render badly, which matches the reported symptom.
- **Survey status:** `SURVEY.md` in this task folder contains 4 questions (q1–q4)
  with `"answers": {}` — unanswered at plan time. The assumptions below resolve
  them with reversible defaults; confirm or override before/at implementation.

## Survey mapping (SURVEY.md → plan assumptions)

| Survey Q | Topic | Plan assumption (reversible default) |
|---|---|---|
| q1 | Ticket must include title + blocked-by info? | Yes — require both (A) |
| q2 | `blockedBy` always filled vs only when blocked? | Only when actually blocked (B), BUT require an explicit statement of the decision (e.g. `"blockedBy": []` plus one line naming blockers or "none") so "acknowledge" is verifiable |
| q3 | Title style? | Action-style, verb-first (B), matching the existing `"title": "<short imperative title>"` line in the skill |
| q4 | Scoped fix vs full check-up? | Scoped fix (A) + light freshness pass (verify remaining API claims, bump `lastUpdated`); no redesign of the skill |

If the survey is answered before implementation, its answers override these rows.

## Success Criteria

1. The skill instructs agents to set `blockedBy` correctly: array of same-project
   task ids when the finding depends on unfinished work, explicit empty/disabled
   statement otherwise, and never guessed ids.
2. The skill requires `goal` to open with a title first line in the format the UI
   expects, consistent with `formatTaskTitleFirstLine`.
3. The POST example, guardrails, and verify step all reflect (1) and (2); `KB_config.json`
   `context` is updated if it needs the one-line reminder; `lastUpdated` is bumped.
4. A regression test pins the new skill content so future edits that drop either
   rule fail CI.
5. `npm run test:unit` and `npm run lint` pass; no behavior change to the API or UI.

## Approach — make the change easy, then make the change

Phase A (make the change easy): add a failing-first contract test that asserts
the skill body contains the `blockedBy` recipe and the first-line-title rule,
following the existing `api/skills/pocCreatingNewTickets.test.js` pattern (which
loads the real `skills/creating-new-tickets` package). This turns "agents ignore
the field" into a repo-enforced invariant: any future skill edit that drops the
rule breaks the build before agents ever see it.

Phase B (make the change): edit the skill text (and `KB_config.json` context if
needed) until the new contract test passes, then run the full gates.

## Steps

### Step 0 — Research spike: confirm exact contract details (do first; small)

Before writing, verify each of these against the cited source so the skill text
is precise:

1. `POST /tasks` accepts `blockedBy` as an array of task ids on create, plus
   string/CSV tolerance via `parseBlockedByValue` (`api/work/taskLifecycle.js`).
2. Validation rules to quote in the skill: self-block → 400, unknown id → 400,
   cycle → 400, same-project only, failed/cancelled blocker keeps the dependent
   blocked (`api/work/taskLifecycle.js`, `site-docs/task-dependencies.md`).
3. First-line title format: `goal.split('\n')[0]` with leading `# ` stripped;
   empty goal falls back to `title`, then `'Untitled Task'`
   (`frontend/src/components/tasks/taskFormatters.js` → `formatTaskTitleFirstLine`).
   Decide the canonical form the skill mandates (recommended: first line
   `# <same text as title>`, then a blank line, then the paragraph — satisfies
   both the markdown readers and the strip-`# ` formatter).
4. How an agent discovers blocker ids: `GET /tasks?workflowId=…` already-used
   dedupe call returns open tasks with ids — the skill should say to reuse that
   listing to pick `blockedBy` ids (no new endpoint needed).
5. Check `docs/KB Architecture.md` → "Skill keyword reference metadata" section
   referenced by the skill is still accurate (freshness pass).

Output: a short note (in the implementation report, not a new doc) listing any
correction to the assumptions above.

### Step 1 — Make the change easy: skill-content contract test (red)

Add assertions (extend `api/skills/pocCreatingNewTickets.test.js` or add
`api/skills/creatingNewTickets.contract.test.js`) that load the real skill via
`loadSkill` and assert the resolved direct-mode prompt contains:

- `blockedBy` with an array-of-ids example and the "never guess an id" rule;
- the first-line-title rule for `goal` (e.g. assert the body contains the
  mandated goal format snippet);
- the existing pins keep passing (no unresolved `{{…}}` keywords, size within
  `skillsMaxChars` cap — note the mixed-attachment test asserts total prompt
  length < 18000, so added text must stay within budget).

Run the new test and confirm it FAILS against the current skill (red).

Validation: `npm run test --prefix api -- pocCreatingNewTickets` (red on new assertions).

### Step 2 — Make the change: update `SKILL.md` (green)

Edit `skills/creating-new-tickets/SKILL.md`:

1. **§3 POST body:** add `"blockedBy": ["<blocker task id>", …]` (or `[]`) to
   the JSON example, with bullets: when to set it (finding cannot start until
   another open task completes), reuse the §2 listing for ids, same-project
   only, 400 on self/unknown/cycle, explicit `[]` + one-line "blockers: none"
   statement when unblocked (per q2 assumption).
2. **§3 `goal`:** mandate the first-line title format decided in Step 0
   (recommended `# <title>` + blank line + paragraph), explain why (UI derives
   card/queue titles from the goal's first line), and require `title` and the
   goal's first line to match.
3. **§4 Verify:** extend verification to re-read the created task and confirm
   `blockedBy` and the goal's first line, not just `currentStageId`.
4. **Guardrails:** add "always acknowledge blockers explicitly" and "every goal
   opens with a title line" bullets.
5. **Freshness:** fix anything Step 0 found stale; bump frontmatter
   `lastUpdated` to the implementation date.

Keep the body concise: the direct-mode prompt must stay within the 16k
`skillsMaxChars` budget asserted by the PoC test.

Validation: new contract test goes green; `npm run test --prefix api -- skills`.

### Step 3 — Update `KB_config.json` context if needed

If the one-line `context` ("Follow the skill exactly: resolve ids, dedupe, cap
at 10 tickets, …") should name the new rules, extend it (e.g. "…state blockers
explicitly, open every goal with a title line"). Keep it one line. Note the PoC
test pins `ticketLabel`/`maxTicketsPerRun`/keyword defaults — do not change
those values.

Validation: `npm run test --prefix api -- pocCreatingNewTickets skillsRegistry`.

### Step 4 — Docs touch-up (only if Step 0 finds drift)

- If `site-docs/task-dependencies.md` or `docs/KB Architecture.md` passages the
  skill relies on are stale, correct them in the same change; otherwise no doc
  edits.
- `npm run docs:check` must pass if docs were touched.

### Step 5 — Full verification and report

1. `npm run test:unit` (primary gate per stage guidance).
2. `npm run lint`.
3. Manual end-to-end sanity (no long-lived server): curate a prompt with the
   updated skill in direct mode (reuse the PoC test harness pattern in a
   scratch vitest run or node REPL) and confirm the injected body contains the
   `blockedBy` recipe and title rule with all keywords resolved; optionally
   `POST /tasks` with `blockedBy` + titled goal against a scratch project and
   confirm the card title renders from the goal's first line.
4. Write the stage report in this task's docs folder noting: survey answers used
   (or still-default assumptions), skill diff summary, and test evidence.

## Validation Plan

| Step | Check | Expected evidence |
|---|---|---|
| 1 | New contract test on current skill | FAILS (proves it guards the gap) |
| 2–3 | `npm run test --prefix api -- skills` | All skill tests pass |
| 5 | `npm run test:unit` | Full API + frontend suites green |
| 5 | `npm run lint` | Clean |
| 4 (if docs touched) | `npm run docs:check` | Clean |
| 5 | Prompt-curation sanity | Resolved prompt contains `blockedBy` recipe + title rule, no `{{…}}` leftovers |
| 5 | Manual ticket check (optional) | Created ticket shows first-line title on card; `blockedBy` set and scheduler honours it |

Highest-risk validation: the prompt-size budget — added skill text must not push
the direct-mode prompt over the `skillsMaxChars` cap asserted in
`pocCreatingNewTickets.test.js`. If it does, compress wording rather than raising
the cap.

## Risks and mitigations

- **Survey still unanswered** → proceeding on the reversible defaults in the
  table above; each is a one-line skill edit to flip later.
- **Agents still ignore prose** → the contract test only pins skill *content*,
  not agent *behaviour*; mitigation is the explicit "state blockers or none"
  requirement plus the §4 self-verification step, which make omissions auditable
  in stage reports. A future enhancement (out of scope) could add API-side
  warnings for empty `blockedBy` + untitled goals.
- **Prompt bloat** → keep additions tight; the size assertion guards this.

## Non-goals

- No API, scheduler, or UI behaviour changes.
- No new skill keywords or `KB_config` schema changes.
- No rewrite of unrelated skill sections beyond the light freshness pass.
- No backfill of existing tickets' titles/`blockedBy` (the manual workaround
  stands for old tickets).

## Open questions

None blocking — all unknowns resolve to the documented defaults above. Only
confirm: (1) survey answers, if provided before implementation; (2) canonical
goal format if Step 0 finds a reason `# <title>` first line is wrong.
