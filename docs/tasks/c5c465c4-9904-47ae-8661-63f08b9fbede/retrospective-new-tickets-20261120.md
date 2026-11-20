# Retrospective — follow-on tickets from c5c465c4 (2026-11-20)

Stage: retrospective (docs-only). Source task: `c5c465c4-9904-47ae-8661-63f08b9fbede`
(About/versions page in System Settings). History reviewed: `IMPLEMENTATION_PLAN.md`,
`SURVEY.md`, `code-standards-review-20261117.md`, `pr-review-20261117.md`,
`stage-review-20261117.md`, `install-break-assessment.md`, plus branch history.

## Where the agent struggled or failed (structural causes)

1. **No authoritative "latest release" source.** The plan assumed a release feed;
   none existed, so the implementation invented hand-maintained
   `KAINBAIN_LATEST_*` env knobs with unset-means-Unknown semantics. That passed
   every gate and two reviews, then a human rejected it via screenshot (all rows
   Unknown), forcing a full rework cycle (unknown→up-to-date default, re-review,
   install-break assessment). Today's default still never verifies currency.
2. **No machine-readable per-build security report.** Research spike R1 found
   scans exist (`Security_scans.sh` → SecObserve) but no ingestible artifact, so
   the page shipped an honest-empty state that every default install still shows,
   plus a manual operator-file fallback each future agent must re-derive.
3. **API compat rule was tribal knowledge.** The same-major-means-compatible rule
   (frontend `version.json` requires vs backend `version.json` accepts) that
   enables partial redeploys lived only in the human's head; the plan built
   display-only rows and the human correction added contract reporting plus
   `checkApiCompatibility` verdicts after the fact. Nothing now stops a future
   bump from silently breaking major-alignment.

## Dedupe

Engine API was reached at `http://192.168.1.206:3100` (from
`KAINBAIN_RUNNER_BACKEND`; `localhost:3100` is refused on runner hosts).
Resolved project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (kainbain) →
workflow `wf-default` → stage `1` (Idea). Current task sits in
`stage-1794594754686` (retrospective), so stage `1` is a safe target.
Searched all 71 wf-default tasks (title + goal) for
security/latest/release/compat/about-page/version overlaps and listed the 17
open tickets in stage `1`: no substantially similar open ticket exists.
Closest items (`82e49a05` runner auto-update, `78e0522a` runner restart/update)
are completed and runner-scoped, not About-page scoped.

## Tickets created (3, all `execute:false`, all verified in stage `1`)

- `6504f949-7499-4226-9f1a-269c192eb4a7` — Publish a CI-generated
  latest-release manifest for version update checks (fixes cause 1: real source
  of truth replaces operator knobs and placeholder states).
- `9bbd80bc-a43c-4577-96fe-9eebb3a2695f` — Automate per-build security-report
  ingestion for the About page (fixes cause 2: CI writes the summary JSON
  `readSecurityReport` already consumes).
- `b39ec047-7a9d-44d5-892b-a9ade9746c62` — Add a version-contract drift gate
  protecting asymmetric UI/backend deploys (fixes cause 3: checked-in compat
  policy plus a network-free CI test over the real `version.json` files).

Each goal is self-contained (problem, scope, acceptance) and cites
`c5c465c4-9904-47ae-8661-63f08b9fbede` as the case study.

## Considered but not ticketed

- Survey q5's free-text note (dedicated view-update/view-security roles): a
  product permission decision for a human, not agent friction — left for the
  product owner.
- Phase-0 decision notes never appended to the task folder: both reviews confirm
  the decisions landed in JSDoc/schema/guides with no information lost — too
  minor for a ticket.
