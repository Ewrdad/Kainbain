# Implementation plan — dynamic accessibility statement

## Goal

Add a dynamic, easy-to-read accessibility statement to the website that:

- Is grouped by user need (not by report structure).
- Shows both WCAG 2.2 AAA results and WCAG 3.0 readiness results inside each
  need-based group.
- Is reachable from the top-right drop-down menu, from right-clicking the logo
  in the top left, or both.
- Carries a call to action for raising accessibility issues, whether or not
  the issue is covered by any standard.
- Is itself WCAG-compliant (it must pass the same AAA gates as every other
  view).

## Inputs consulted

- Task brief (this stage): entry points, dual AAA + 3.0 results, need-based
  grouping, universal report-a-problem CTA.
- `docs/tasks/4bda7321-3aef-4ca9-b746-42b8c6969630/SURVEY.md` — the grill-me
  survey. Note: its `answers` object is empty (no answers were recorded), so
  this plan adopts the survey's marked (Recommended) options as working
  assumptions and flags each one for one-line confirmation before build (see
  Open questions). The survey's recommended options are: top-right drop-down
  entry; five need-based groups (Seeing, Hearing, Getting around, Thinking
  and understanding, Helpful technology); dynamic = auto-updates from latest
  check results; one simple need-grouped view with both scores inside each
  group; report = short on-site form; recipient = website team by email.
- The prior-stage report `idea-20261102-093540.md` listed in the stage brief
  was not present in the task directory; only `SURVEY.md` exists there. If
  that report turns up, re-check it against the assumptions below.
- Codebase evidence: `frontend/src/routes.jsx` + `frontend/src/routing.js`
  (how to add a view), `frontend/src/components/layout/Header.jsx`
  (`getSystemMenuItems`, the top-right System drop-down),
  `frontend/src/components/BrandMark.jsx` (top-left logo),
  `frontend/src/a11y/README.md` (app targets WCAG 2.2 AAA; WCAG 3.0 is a
  working draft — never claim conformance), `frontend/src/components/FeedbackDialog.jsx`
  (existing modal feedback-collection pattern), `canary-e2e/tests/accessibility.spec.js`
  (axe at wcag22aaa tags + AAA contrast walk over every route).

## Success criteria

1. A new `/accessibility` view exists, reachable from the top-right System
   drop-down and from right-clicking the top-left logo (right-click is
   supplementary; a keyboard-operable path always exists).
2. Content is grouped by the five user needs from the survey, in plain words,
   with each group showing its WCAG 2.2 AAA status and its WCAG 3.0 readiness
   status side by side in that group's own language.
3. "Dynamic" holds: the displayed statuses derive from the latest stored check
   results (with a visible "last checked" date), not from hand-edited prose;
   hand-written fallback copy renders only when no results artifact exists.
4. A "Report an accessibility problem" call to action is present on the page
   (and reachable without scrolling past the whole statement), opens a short
   form accepting any issue including non-standard ones, and delivers it to
   the website team inbox with a confirmation state for the reporter.
5. The new view passes `npm run test:unit`, `npm run lint` (zero jsx-a11y
   errors), and the canary axe + contrast scans at the wcag22aaa tag set;
   the view is added to the e2e accessibility coverage list.
6. Docs updated: authoring guide notes the new view and results pipeline;
   statement content review cadence is recorded.

## Approach

"Make change easy, then make the change", with big/research work first:

1. **Research first (Steps 1-2).** The two unknowns that shape everything are
   the WCAG-criteria-to-user-need mapping and the shape of a "latest check
   results" artifact the frontend can consume. Both are settled before any UI
   code is written.
2. **Make change easy (Steps 3-5).** Build the enabling seams with no visible
   behaviour change: a results-data module with a fixed schema, a results
   artifact pipeline (or documented stub), and route + menu plumbing behind
   the existing patterns. Each lands with tests, independently reviewable.
3. **Make the change (Steps 6-8).** Build the statement view, entry points,
   and report form on top of those seams.
4. **Assure it (Steps 9-11).** Dedicated testing, documentation, and
   conformance-review steps close the work; nothing is declared done until
   the gates in Validation plan are green.

No new router, state library, or design system is introduced: the view uses
the existing HashRouter table, Tailwind tokens, `Modal`, `Announcer`,
`useDocumentTitle`/`titleForView`, and `GlossaryTerm` primitives.

## Steps

### Step 1 — Research: WCAG-to-user-need mapping (research, first)

- Map each WCAG 2.2 AAA success criterion the app is held to, plus the WCAG
  3.0 draft outcomes the axe "best-practice" checks approximate, onto exactly
  one of the five survey groups: Seeing, Hearing, Getting around, Thinking
  and understanding, Helpful technology.
- For each mapping row record: criterion/outcome id, plain-words summary,
  group, and which instrument verifies it (axe tag, contrast walk/gate,
  manual check, or "not auto-checkable").
- Explicitly mark everything WCAG 3.0 as draft/readiness (per
  `frontend/src/a11y/README.md`: never claim WCAG 3.0 conformance) and decide
  the honest status vocabulary for 3.0 rows (e.g. supported / partial /
  unknown — never pass/fail conformance language).
- Decide the required statement boilerplate sections (commitment, scope,
  feedback contact, review date) following W3C WAI accessibility-statement
  guidance; inspect the WAI guidance during this step and cite it in the
  mapping doc.
- Output: a short mapping document (new file under
  `docs/tasks/4bda7321-3aef-4ca9-b746-42b8c6969630/`, e.g.
  `a11y-mapping.md`) reviewed for plain-words quality. This document is the
  content contract for Steps 6-7.
- Depends on: confirmation of the five groups (survey q2; assumed yes).

### Step 2 — Research: "latest check results" source (research, first)

- Inventory what check results exist today and in what form: canary axe run
  output, the in-page contrast walk, `containerContrast` /
  `observabilityContrast` gates, lint results. None is currently persisted
  as an artifact — confirm that and decide the minimal artifact that makes
  the statement "dynamic".
- Decision to make (recommended default in brackets): [a versioned JSON
  artifact, e.g. `accessibility-results.json`, written by the accessibility
  gate run, containing per-criterion status + checked-at timestamp + app
  version; the frontend fetches it at runtime with a curated static fallback
  when the fetch fails].
- Reject (with recorded rationale): live re-scan on page open (slow, flaky,
  needs backend orchestration) and hand-edited prose as the primary source
  (violates "dynamic").
- Output: a one-page decision note appended to the mapping doc: artifact
  schema (draft), producer (which job writes it), consumer contract, and the
  fallback behaviour.
- Depends on: Step 1 (needs the criterion list to size the schema).

### Step 3 — Enabling: results-data module + schema (make change easy)

- Add a frontend module (e.g. `frontend/src/a11y/statementResults.js`) that
  owns: the results-artifact schema, parsing/validation with safe defaults
  for missing or malformed data, the criterion-to-group mapping import from
  Step 1, and selectors like "status per group per standard".
- Ship it with unit tests covering: valid artifact, missing artifact
  (fallback copy path), malformed entries (skipped, never crashing render),
  unknown criterion ids (ignored + logged), and timestamp/version surfacing.
- No UI change in this step. This is the seam Steps 6-7 build on, and it lets
  content review happen against data, not JSX.
- Depends on: Steps 1-2.

### Step 4 — Enabling: results artifact pipeline or documented stub (make change easy)

- If the producer from Step 2 is cheap (e.g. axe run already emits JSON):
  wire it to write the artifact where the frontend can fetch it, and add a
  freshness check (stale artifact = show "last checked" date honestly, never
  fake freshness).
- If the producer is expensive: ship a checked-in stub artifact generated
  from the current known-good state plus a documented manual refresh command,
  and record the automated producer as follow-up work. The statement must
  still render correctly from the stub (proving the dynamic path end to end).
- Either way, add the artifact's schema test on the producer side so drift
  breaks a test, not the page.
- Depends on: Steps 2-3.

### Step 5 — Enabling: route + entry-point plumbing (make change easy)

- Add the canonical `/accessibility` route following the documented recipe:
  `ROUTES` + `viewToPath`/`routeToView` rows in `frontend/src/routing.js`,
  `<Route>` in `frontend/src/routes.jsx`, legacy-normalisation handling,
  `titleForView` entry, and routing tests. Render a clearly-marked placeholder
  view (temporary) so plumbing can be verified before content lands.
- Add the System drop-down item via `getSystemMenuItems` in
  `frontend/src/components/layout/Header.jsx` (unit-testable item list),
  pointing at the new route. Keep APG menu-button keyboard behaviour intact.
- Add the logo right-click path: a `contextmenu` handler on the brand cluster
  that opens the statement (and must not break the existing InfoTooltip or
  suppress the native menu without providing equivalent function — decide in
  code review whether to `preventDefault` or to offer a small custom menu;
  default: navigate on right-click AND keep the System-menu path as the
  keyboard path). Right-click is never the only path: a context menu is not
  keyboard-operable, so the drop-down entry (keyboard-accessible) is the
  primary route and right-click is a shortcut.
- Tests: routing tests, `getSystemMenuItems` test for the new item, header
  test for right-click navigation, keyboard test proving the menu path works
  without a mouse.
- Depends on: Step 3 (placeholder may import selectors, but must not block
  on content).

### Step 6 — Feature: the statement view (make the change)

- Replace the placeholder with the real statement view built from Step 3
  selectors + Step 1 copy: one section per user-need group, each showing its
  AAA status and 3.0 readiness status in plain words, with "last checked"
  date and app version in the page header.
- Authoring rules (from `frontend/src/a11y/README.md`): contrast tokens only
  (>= 7:1 text), shared `:focus-visible` indicator, `GlossaryTerm` for
  unavoidable jargon (WCAG, AAA), normal-case source copy, 44px targets,
  labelled sections and correct heading order (assert with
  `a11yTestHelpers`: `assertHeadingOrder`, `assertSectionHeadings`,
  `assertAllNamed`), route announcement via `RouteAnnouncer`, title via
  `titleForView` (view must not set `document.title` itself).
- Include a "full detail" disclosure per group linking each plain-words claim
  to its criterion ids and instrument, so the page stays simple without
  hiding evidence.
- Depends on: Steps 1, 3, 5.

### Step 7 — Feature: report-a-problem call to action + form (make the change)

- Place the CTA high on the page (visible without scrolling the full
  statement) and repeat it at the end. CTA opens a short on-site form
  (survey q5 recommended option), reusing the `Modal` + labelled-field
  patterns from `FeedbackDialog` (visible labels, named errors with fix
  suggestions, single-flight submit guard, confirmation state).
- The form must explicitly invite issues "whether or not they are covered by
  accessibility standards" and accept free text (no criterion picker as a
  required field; an optional "what were you trying to do" need-group picker
  may aid triage but must never gate submission).
- Delivery (survey q6 recommended: website team by email): add a minimal API
  endpoint (e.g. `POST /api/accessibility/feedback`) with validation, rate
  limiting, and no PII beyond what the reporter volunteers; recipient inbox
  from server config/env. Provide a `mailto:` fallback link on the form when
  the endpoint is unreachable, so reporting never dead-ends.
- Anti-abuse minimum: rate limit + payload size cap; no public issue list in
  this slice (survey option, not recommended — record as possible follow-up).
- Depends on: Step 6 (placement), Step 1 (need-group labels for triage
  picker). Confirm recipient inbox owner before build.

### Step 8 — Feature: footer link (small, conditional)

- Survey q1 option 4 offers "also add a link at the bottom of every page".
  If the app has a global footer surface, add an "Accessibility" link there
  pointing at the same route (cheap, high discoverability, standard
  practice). If there is no global footer, skip and record why — do not build
  a new footer for this task.
- Depends on: Step 5.

### Step 9 — Assurance: testing (definition of done, not an afterthought)

- Unit/integration: `npm run test:unit` green, including new tests from Steps
  3-8 (schema parsing, routing, menu item, right-click, form validation and
  submit states, API endpoint validation + rate limit).
- Static: `npm run lint` with zero jsx-a11y errors on new source; contrast
  gates still pass (no new raw-hex text colours).
- E2E accessibility: extend `canary-e2e/tests/accessibility.spec.js`
  coverage to `/accessibility` (axe at wcag22aaa tags + contrast walk),
  including the report form open state; run the spec on the scratch stack
  per its header rules (never live).
- Behavioural checks (headless, no long-lived servers): keyboard-only walk
  of menu path → statement → form submit via existing test runners/fixtures;
  right-click navigation test; malformed/missing artifact rendering tests;
  `npm run capture:screenshot` for the statement view at desktop and mobile
  widths if visual review is needed.
- Manual (one pass, recorded): screen-reader skim of group headings and
  statuses; reduced-motion and zoom (200%) sanity; mailto fallback with API
  stopped.
- Depends on: Steps 6-8.

### Step 10 — Assurance: documentation

- Update `frontend/src/a11y/README.md`: the new view, its content contract
  (mapping doc), the results-artifact pipeline and refresh cadence, and how
  to extend coverage when criteria change.
- Record the statement review cadence (who re-checks plain-words copy and
  mapping after WCAG 3.0 draft updates; suggested: each minor release or when
  the draft materially changes) in the mapping doc or team runbook.
- Add/refresh API docs for the feedback endpoint (request shape, validation,
  rate limits, inbox config) wherever sibling endpoints are documented.
- Depends on: Steps 6-7, 9.

### Step 11 — Assurance: conformance and plain-words review

- A second pair of eyes (or the task's review stage) checks: every displayed
  status traces to an instrument or is honestly labelled manual/unknown; no
  WCAG 3.0 conformance claim appears anywhere; copy reads at plain-words
  level; the CTA invites non-standard issues explicitly.
- Fix findings, re-run Step 9 gates, then close.
- Depends on: Steps 9-10.

## Validation plan (per-step evidence)

| Step | Check | Expected evidence |
|---|---|---|
| 1 | Mapping doc reviewed | `a11y-mapping.md` exists; every criterion has a group + instrument; 3.0 rows use readiness vocabulary |
| 2 | Decision note | Producer/consumer contract + schema draft recorded; rejected options have rationale |
| 3 | `npm run test:unit` (frontend slice) | New schema/parser tests pass; malformed input never crashes |
| 4 | Producer test + fetch test | Schema test on producer side green; view renders from stub artifact with honest date |
| 5 | `npm run test:unit` + lint | Routing/menu/right-click/keyboard tests pass; zero jsx-a11y errors |
| 6 | Unit + `capture:screenshot` | Helper assertions pass; desktop + mobile screenshots show five groups with dual statuses |
| 7 | Unit + API tests | Form validation/submit/confirmation tests pass; endpoint validation + rate-limit tests pass; mailto fallback present |
| 8 | Unit test or skip-note | Footer link test green, or a one-line record of why skipped |
| 9 | Full gates | `npm run test:unit`, `npm run lint`, canary accessibility spec incl. new route — all green |
| 10 | Docs diff | README + API docs + cadence note present and linked |
| 11 | Review sign-off | Traceability + no-3.0-claim + plain-words checks recorded |

Highest-risk validation: Step 9's canary axe run on the new view — it is the
only gate that judges the statement page against the AAA bar it claims, so a
failure there fails the feature, not just the tests.

## Risks and open questions

- Survey answers are empty: the six (Recommended) defaults are assumed. Each
  needs a one-line confirmation (entry point scope, five groups, dynamic
  source, single grouped view, on-site form, team-email recipient) before
  Step 6 starts; a "no" on any of them re-opens Steps 1-2 only, not the
  plumbing.
- WCAG 3.0 is a working draft: any 3.0 status display must avoid conformance
  language, and the mapping must be revisited when the draft moves. Mitigation:
  readiness vocabulary + recorded review cadence (Steps 1, 10).
- Right-click discoverability and platform behaviour (touch devices have no
  right-click; some browsers restrict `contextmenu` handling): mitigated by
  making the System-menu path primary and right-click a shortcut, plus the
  conditional footer link.
- Feedback endpoint abuse and inbox ownership: mitigated by rate limiting,
  size caps, and confirming the recipient + triage owner before Step 7.
- Results-artifact staleness could mislead: mitigated by always showing the
  "last checked" date and app version, and never rendering statuses without
  provenance.
- Non-goals: live re-scanning on page open; public issue tracker; a new
  global footer; remediation of existing app issues the statement surfaces
  (those become follow-up tasks, honestly listed as known issues if the
  statement would otherwise over-claim).

## Rollout

Single feature branch; Steps 3-5 land first as independently reviewable
commits with no visible change (placeholder route may ship hidden behind the
not-yet-linked route — no menu entry until Step 5 is complete). Steps 6-8 add
the visible surface. No migration or flag cleanup beyond removing the Step 5
placeholder. Rollback is a revert of the route/menu commits; the statement
has no stored user data to migrate.
