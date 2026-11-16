# Follow-up ticket proposals — structural feedback from ee3ca5d2 (2026-11-16)

Source task: `ee3ca5d2-8b05-4908-bbd1-808c667d1175`
("Guard site-docs section renames with legacy aliases and a no-silent-drop test").
Case-study parent: `68714709-3f50-4e5c-bfa6-bac16a36c393`
(docs viewer sidebar regroup; silent-drop continuity failure).

Status: **FILED AND VERIFIED** (2026-11-16, second pass).

- Ticket 1 → `0454eafd-616b-4745-8004-6f513f49bd88`
  ("Fix siteDocs rename procedure step 4 to prevent history duplication"),
  stage `1`, `waiting_human`, verified via re-read.
- Ticket 2 → `bae668cb-1f18-4034-8f10-d8fff31bfb8b`
  ("Derive site-docs taxonomy from content to shrink rename touch-points"),
  stage `1`, `waiting_human`, verified via re-read.

API routing note: `http://localhost:3100` has no listener on this runner
host, and a temporarily started local server showed an empty registry
(this host is only a runner; `KAINBAIN_RUNNER_BACKEND` points at the real
orchestrator). Both tickets were therefore filed against the live backend
at `http://192.168.1.206:3100` after resolving the project (`kainbain`),
workflow (`wf-default`), and stage (`1` = Idea) ids live, live-deduping
against all 15 open tasks (no duplicates), and confirming the executing
stage (`stage-1794594754686` retrospective) differs from the target stage.
The temporary local server was stopped afterwards; the runner process was
never touched. POST bodies below are kept for audit.

## History reviewed

- `IMPLEMENTATION_PLAN.md` (10-step plan, survey defaults, guardrail design)
- `notes-20261116-implementation.md` (survey-conflict resolution, red-team
  baseline, mutation probes a/b/c, gates)
- `notes-20261116-cleanup.md` (hardening: `resolveSectionName`,
  `KNOWN_SECTION_HISTORY` moved into module, loud skips, isolation-bug fix)
- `review-stage-verdict.md` (independent re-verification: PASS, plus 2
  explicit non-blocking follow-ups "for a later task — not this stage")
- `SURVEY.md` (owner answers incl. q2 note: taxonomy "should really be docs
  derived … bottom up so we dont have to maintain a central list")

## Difficulties / friction found (and ticket response)

1. **Rename procedure docblock is literally wrong on step 4.** It says
   "Append the retired id to `KNOWN_SECTION_HISTORY`", but the guardrail
   requires every current id to already be in history — so a literal
   reading duplicates the entry and trips the hygiene assertion
   (`lists "x" twice`). Self-correcting but wastes the next rename agent a
   red-green iteration on the procedure itself. → Ticket 1 (one-line fix).
2. **A real rename still touches many pinned lists.** The valid-rename
   mutation probe had to update `DOC_SECTIONS`, `SECTION_LABELS`,
   `LEGACY_SECTION_ALIASES`, `KNOWN_SECTION_HISTORY`, `DEPRECATIONS.md`,
   the frontend mirror, and several exact-equality test assertions. The
   owner explicitly asked for bottom-up docs-derived taxonomy with no
   central list to maintain. → Ticket 2 (structural tech-debt reduction).
3. **Survey/plan skew cost a decision cycle.** The plan assumed SURVEY.md had
   no answers; it did, and q1's recorded answer conflicted with the task's
   explicit acceptance criterion (criterion won; recorded in notes). No
   ticket: one-off process friction, already absorbed, not a structural fail.
4. **`getDoc` on a legacy article warns twice** (index scan + direct
   re-read). Review verdict says dedupe "only if log noise ever matters" —
   no verified problem, so no ticket per the "not every time" rule.

## Dedupe evidence (local proxy; live API was unreachable)

- Searched `docs/tasks/**` for `KNOWN_SECTION_HISTORY`,
  `REQUIRED RENAME PROCEDURE`, `append only if missing`, `brand-new id`,
  `docs.?derived`, warn-dedupe variants: matches exist ONLY in this task's
  own folder (`ee3ca5d2-...`) plus one unrelated "single source of truth"
  mention in `b3401f19-.../WIDE_NET_ANALYSIS.md` (fleet-model lifecycle,
  different domain).
- Task text already confirms the two completed tickets touching this area
  (`b1c069e0` binary-safe proofs, `8769b002` flaky-CI quarantine) address
  different failure modes.
- Operator: still re-check open tasks in KainBain for "siteDocs",
  "taxonomy", "rename procedure" before filing.

## Filing routing (from stage skill config, unverified live)

- Target project: `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`
- Target workflow: `wf-default`
- Target stage: `1`
- API base: `http://localhost:3100`

---

## Ticket 1 — Fix rename-procedure step 4 so it cannot duplicate history entries

Title: `Fix siteDocs rename procedure step 4 to prevent history duplication`

Goal (standalone): In `api/siteDocs.js`, the `DOC_SECTIONS` docblock
"REQUIRED RENAME PROCEDURE" step 4 currently reads "Append the retired id
to `KNOWN_SECTION_HISTORY`". That instruction is literally wrong: the
taxonomy guardrail requires every current section id to already be listed
in history, so following the step verbatim on a normal rename duplicates
the entry and fails the hygiene assertion (`lists "x" twice — keep one
entry`). Reword the step to "ensure the retired id is listed (append only
if missing) and append the brand-new id". Then prove both directions: (a)
a scratch rename following the new wording passes `npm run test --prefix
api -- siteDocs` and `npm run docs:check` with no hygiene failure;
(b) a scratch tree with a deliberately duplicated history entry still
fails loudly naming the id. Revert all scratch edits; the shipped diff
should be the docblock wording only (plus any assertion-message touch-up
the wording requires). Context (optional): case study
`ee3ca5d2-8b05-4908-bbd1-808c667d1175` (section-rename guardrail) — see
`docs/tasks/ee3ca5d2-8b05-4908-bbd1-808c667d1175/review-stage-verdict.md`
"Follow-up" item 1 — itself a follow-on from `68714709-3f50-4e5c-bfa6-
bac16a36c393` (silent doc drop on sidebar regroup).

Acceptance criteria:

- [ ] Step 4 no longer instructs an unconditional append of the retired id.
- [ ] A rename performed exactly as the new wording says passes the
      siteDocs suites with no history-hygiene failure.
- [ ] A duplicated history entry still fails loudly, naming the id.

POST body:

```json
{
  "projectId": "0fd41821-d8a5-4e49-bc2e-28ce8c739a0a",
  "title": "Fix siteDocs rename procedure step 4 to prevent history duplication",
  "goal": "In api/siteDocs.js, the DOC_SECTIONS docblock REQUIRED RENAME PROCEDURE step 4 currently reads 'Append the retired id to KNOWN_SECTION_HISTORY'. That instruction is literally wrong: the taxonomy guardrail requires every current section id to already be listed in history, so following the step verbatim on a normal rename duplicates the entry and fails the hygiene assertion. Reword the step to 'ensure the retired id is listed (append only if missing) and append the brand-new id'. Then prove both directions: (a) a scratch rename following the new wording passes the siteDocs suites and docs:check with no hygiene failure; (b) a scratch tree with a deliberately duplicated history entry still fails loudly naming the id. Revert all scratch edits; the shipped diff should be the docblock wording only. Case study: ee3ca5d2-8b05-4908-bbd1-808c667d1175, review-stage-verdict.md follow-up item 1 (follow-on from 68714709-3f50-4e5c-bfa6-bac16a36c393).",
  "stageId": "1",
  "workflowId": "wf-default",
  "idempotencyKey": "f871924193ab07b37e8313c11333bcba",
  "execute": false
}
```

---

## Ticket 2 — Derive the site-docs taxonomy bottom-up so renames stop touching N files

Title: `Derive site-docs taxonomy from content to shrink rename touch-points`

Goal (standalone): Today a site-docs section rename must touch
`DOC_SECTIONS`, `SECTION_LABELS`, `LEGACY_SECTION_ALIASES`,
`KNOWN_SECTION_HISTORY`, `DEPRECATIONS.md`, the frontend
`docsSections.js` mirror, and several exact-equality test assertions
(proven by the valid-rename mutation probe, which needed all of these for
a green run). Every touch-point is a place a future agent can miss and a
reason renames take multiple iterations. Reduce this structurally,
honouring the owner's stated direction ("docs derived … bottom up so we
don't have to maintain a central list"): investigate deriving section
ids/labels from the shipped `site-docs/` content (and/or consolidating
the frontend mirror and pinned test lists onto the single
`api/siteDocs.js` source of truth) so a rename touches the minimum
possible set of files. Hard constraints that must keep passing: retired
ids keep resolving via `LEGACY_SECTION_ALIASES` with an owner-facing
warning (never a silent drop), the taxonomy guardrail still fails loudly
naming any retired id without an alias, and the full `test:api`,
`lint:api`, `docs:check` gates stay green. Deliverable is the smallest
structural change that removes at least one manual touch-point (or a
written finding, with evidence, that derivation is unsafe — e.g. custom
`KAINBAIN_SITE_DOCS` dirs needing ids absent from shipped content — plus
the next-cheapest consolidation instead). Context (optional): case
studies `68714709-3f50-4e5c-bfa6-bac16a36c393` (silent doc drop on
sidebar regroup) and `ee3ca5d2-8b05-4908-bbd1-808c667d1175`
(section-rename guardrail); owner direction in
`docs/tasks/ee3ca5d2-8b05-4908-bbd1-808c667d1175/SURVEY.md` q2 note.

Acceptance criteria:

- [ ] A section rename requires strictly fewer manual file edits than
        today, with the removed touch-point(s) named in the task notes.
- [ ] Legacy-section articles still index via alias with a recorded
        warning; the guardrail still fails loudly on alias-less renames.
- [ ] `test:api`, `lint:api`, and `docs:check` are green; no silent-drop
        regression (mutation probe both directions, as in ee3ca5d2).

POST body:

```json
{
  "projectId": "0fd41821-d8a5-4e49-bc2e-28ce8c739a0a",
  "title": "Derive site-docs taxonomy from content to shrink rename touch-points",
  "goal": "A site-docs section rename today must touch DOC_SECTIONS, SECTION_LABELS, LEGACY_SECTION_ALIASES, KNOWN_SECTION_HISTORY, DEPRECATIONS.md, the frontend docsSections.js mirror, and several exact-equality test assertions. Reduce this structurally per the owner's stated direction (docs-derived bottom-up taxonomy with no central list to maintain): investigate deriving section ids/labels from shipped site-docs content and/or consolidating the frontend mirror and pinned test lists onto the single api/siteDocs.js source of truth. Constraints: retired ids keep resolving via alias with an owner-facing warning (never silent drop), the guardrail still fails loudly naming alias-less retired ids, and test:api, lint:api, docs:check stay green. Deliver the smallest structural change removing at least one manual touch-point, or a written evidence-backed finding that derivation is unsafe plus the next-cheapest consolidation. Case studies: 68714709-3f50-4e5c-bfa6-bac16a36c393 and ee3ca5d2-8b05-4908-bbd1-808c667d1175 (SURVEY.md q2 note).",
  "stageId": "1",
  "workflowId": "wf-default",
  "idempotencyKey": "556ec6697f136761a659fd344b071a1a",
  "execute": false
}
```

---

## Considered and deliberately not ticketed

- `getDoc` double warning on legacy articles (index scan + re-read):
  loud-by-design, unpinned except for `listDocs`; review verdict says act
  only if log noise ever matters. No verified problem → no ticket.
- Survey/plan skew (plan assumed no survey answers; q1 answer conflicted
  with acceptance criteria): absorbed in-task via the explicit criterion;
  one-off friction, not a structural fail → no ticket.
