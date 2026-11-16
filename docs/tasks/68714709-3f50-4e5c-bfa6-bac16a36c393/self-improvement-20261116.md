# Self-improvement review — docs viewer sidebar (ticket 68714709-3f50-4e5c-bfa6-bac16a36c393)

Reference ticket: `68714709-3f50-4e5c-bfa6-bac16a36c393` (docs viewer sidebar: header definition + collapsible groups).
Reviewed: SURVEY.md, IMPLEMENTATION_PLAN.md, all failure reports, both audits, code-standards and PR reviews.

## Recurring difficulties found

1. **Proof PNGs corrupted through text tools — twice on this ticket.** The three
   `docs-sidebar-*-proof.png` files were rewritten via a text path (magic
   `efbfbd` instead of `89504e47`), failing full CI in
   `automated-tests-failure-20261115-195001.md` and
   `automated-tests-failure-20261115-205407.md` (~1000s burned per cycle plus
   fallback routing). A docs-only stage had to restore them with
   `git checkout HEAD` (`review-pr-20261116.md` section 7).
2. **Silent data loss on section rename.** The regroup renamed `DOC_SECTIONS`
   ids with `readDocFile` returning null for old values, so custom
   `KAINBAIN_SITE_DOCS` articles silently vanished. Only the upgrade-safety
   audit's live reproduction caught it (`continueity-failure-20261115-214114.md`);
   all existing API suites passed. Fixed ad hoc with `LEGACY_SECTION_ALIASES`.
3. **Canary/full-CI flake unrelated to ticket scope** (192142, 202338, 205407
   canary failures; 003251 runner daemon cadence timing). Long 15–20 min cycles
   per retry.

## Dedupe check (KainBain project `0fd41821`, workflow `wf-default`)

- `b1c069e0` "Enforce binary-safe proof artifacts…" (completed): built
  **detection** (proof-hygiene check). Recurrence above shows prevention is
  still missing — follow-on filed, not a duplicate.
- `8769b002` "Quarantine flaky CI tests…" (completed): covers quarantine +
  attribution for finding 3 — no new ticket.
- No open ticket in stage `1` covers findings 1 or 2 (only open stage-1 task
  is `6ba7e727`, unrelated).

## Tickets created (target: project `0fd41821`, workflow `wf-default`, stage `1`, `execute:false`)

- `ee3ca5d2-8b05-4908-bbd1-808c667d1175` — Guard site-docs section renames with
  legacy aliases and a no-silent-drop test. Verified `currentStageId: 1`.
- `ef569a1a-d301-4e10-aaba-8cde942b97e8` — Prevent binary proof PNG corruption
  instead of only detecting it. Verified `currentStageId: 1`.

## Deliberately not ticketed

- Single survey image-generation fetch failure (`SURVEY.md` r1/q5 option 2):
  one-off flake, low value.
