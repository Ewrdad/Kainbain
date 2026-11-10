# Accessibility statement — content contract (WCAG-to-user-need mapping)

**Task:** `4bda7321` · **Owner:** frontend · **Created:** 2026-11-02 ·
**Next review:** with each minor release, or when the WCAG 3.0 draft moves
materially (whichever comes first). See "Review cadence" below.

This document is the content contract for the dynamic in-app accessibility
statement (`/#/accessibility`). The statement view renders statuses from the
results artifact described in "Decision note (Step 2)" below — never from
hand-edited prose — using the plain-words summaries and need groups defined
here. Copy changes land here first, then in code.

Normative references: [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[WCAG 3.0 working draft](https://www.w3.org/TR/wcag-3.0/) (advisory only —
never a conformance claim, per `frontend/src/a11y/README.md`), and the
[W3C WAI guidance on developing an accessibility
statement](https://www.w3.org/WAI/planning/statements/) (inspected
2026-11-02; required sections are commitment, standard applied, and contact
information; known limitations, measures taken, technical prerequisites, and
assessment approach are advised).

Working assumptions (survey answers were empty, so the survey's
(Recommended) options are adopted): entry via the top-right System drop-down
(primary, keyboard-operable) plus right-clicking the top-left logo
(shortcut); five need groups below; dynamic = auto-updates from the latest
stored check results; one need-grouped view with both result sets inside
each group; report = short on-site form; recipient = website team inbox from
server config.

## The five need groups

| Group id | Label | Plain-words scope |
|---|---|---|
| `seeing` | Seeing | Text size, colours, contrast, flashing, and motion. |
| `hearing` | Hearing | Sound, alerts, and alternatives to audio. |
| `getting-around` | Getting around | Keyboard, mouse, touch screen, focus, and timing. |
| `thinking` | Thinking and understanding | Clear words, simple layout, help, and forgiving forms. |
| `helpful-tech` | Helpful technology | Screen readers, input devices, and device settings. |

## WCAG 2.2 AAA mapping (the distinguishing set)

The app claims WCAG 2.2 AA conformance plus AAA conformance except the four
documented exemptions in `docs/accessibility/STATEMENT.md`. The table below
maps the 28 AAA-level success criteria — the set that distinguishes an AAA
claim from an AA claim — onto exactly one need group each, with the
instrument that verifies it. Statuses below are the position recorded by the
2026-10-25 full-scope re-audit; the checked-in results artifact carries
these values until a re-audit moves them.

Status vocabulary: `pass` (supported), `partial` (partly supported — a
documented exemption or known gap applies), `not-applicable` (the app has no
content the criterion can apply to, e.g. no video, no login).

### Seeing

| Criterion | Plain-words summary | Status | Instrument |
|---|---|---|---|
| 1.2.7 Extended audio description | Videos with extra spoken description: the app ships no video, so there is nothing to describe. | not-applicable | Manual scope check (no media shipped) |
| 1.2.8 Media alternative | A text alternative for video: the app ships no video. | not-applicable | Manual scope check (no media shipped) |
| 1.4.6 Contrast (enhanced) | Text stands out from its background at 7 to 1 or better. | pass | axe `color-contrast-enhanced` (wcag22aaa tags) + in-page AAA contrast walk + `containerContrast` / `lightThemeContrast` / `observabilityContrast` / `terminalContrast` gates |
| 1.4.8 Visual presentation | Comfortable reading: colour and size choices, wide line spacing, no justified text. A line-length control for long text is not offered (exemption 2). | partial | Manual + theme / font-size settings |
| 2.3.2 Three flashes | Nothing flashes three times per second (seizure safety). | pass | Manual check (no flashing content ships) |
| 2.3.3 Animation from interactions | Motion started by the user can be turned off; the app follows the Reduce Motion setting. | pass | `reducedMotion` gate + global CSS collapse + manual |

### Hearing

| Criterion | Plain-words summary | Status | Instrument |
|---|---|---|---|
| 1.2.6 Sign language | Sign language for video: the app ships no video. | not-applicable | Manual scope check (no media shipped) |
| 1.2.9 Live audio-only | A text alternative for live audio: the app ships no live audio. | not-applicable | Manual scope check (no media shipped) |

### Getting around

| Criterion | Plain-words summary | Status | Instrument |
|---|---|---|---|
| 2.1.3 Keyboard (no exception) | Everything works with the keyboard alone, with no exceptions. | pass | Canary keyboard guards + manual keyboard walk |
| 2.2.3 No timing | No time limits; nothing expires while you read. | pass | Manual (toasts pause on hover/focus) |
| 2.2.4 Interruptions | Nothing pops up and interrupts you. | pass | Manual |
| 2.2.5 Re-authenticating | Staying signed in while you work: the app has no sign-in. | not-applicable | Manual scope check (no authentication) |
| 2.2.6 Timeouts | Warnings before a timeout loses your work: the app has no inactivity timeouts and drafts persist. | pass | Manual (`taskDrafts` persistence) |
| 2.4.8 Location | You can always tell where you are (titles, navigation state). | pass | Manual + `titleForView` per-view titles |
| 2.4.9 Link purpose | Every link makes sense from its own text. | pass | axe `link-name` + `assertAllNamed` |
| 2.4.10 Section headings | Every section starts with a heading for screen-reader navigation. | pass | `assertSectionHeadings` + `assertHeadingOrder` |
| 2.4.12 Focus not obscured (enhanced) | The keyboard focus indicator is never hidden behind other content. | pass | Canary keyboard guards + manual |
| 2.4.13 Focus appearance | A clear focus ring (3px plus halo) on everything you tab to. With a very dark custom accent on a dark theme the ring can lose contrast (exemption 4; the accent picker warns). | partial | Shared `:focus-visible` indicator + `accentTokens` gate + manual |
| 2.5.5 Target size (enhanced) | Buttons and controls are at least 44 by 44 pixels. Dense data controls (filter pills, list rows) hold the 24px minimum instead, to keep lists readable (exemption 1). | partial | `focusVisibility` gate (44px floor) + `targetSize` heuristic |

### Thinking and understanding

| Criterion | Plain-words summary | Status | Instrument |
|---|---|---|---|
| 3.1.3 Unusual words | Unusual words are explained where they appear. | pass | `GlossaryTerm` + `uiTextConventions` gate + manual copy review |
| 3.1.4 Abbreviations | Abbreviations are expanded on first use and look-up-able everywhere. | pass | `GlossaryTerm` / `<abbr>` + manual copy review |
| 3.1.5 Reading level | Copy is written plainly. There is no automated grade-level gate yet (exemption 3); every change is reviewed by hand. | partial | Manual copy review per change |
| 3.2.5 Change on request | Nothing important changes unless you ask it to. | pass | Manual |
| 3.3.5 Help | Help is at hand: system guide, tooltips, and docs on every view. | pass | Manual |
| 3.3.6 Error prevention (all) | Important actions ask you to confirm or can be undone. | pass | Manual + form/confirm tests |
| 3.3.9 Accessible authentication (enhanced) | Signing in without solving puzzles: the app has no sign-in. | not-applicable | Manual scope check (no authentication) |

### Helpful technology

| Criterion | Plain-words summary | Status | Instrument |
|---|---|---|---|
| 2.5.6 Concurrent input mechanisms | The app never locks you to one input: touch, mouse, keyboard, and assistive technology all keep working. | pass | Manual |
| 3.1.6 Pronunciation | Words that change meaning with pronunciation are marked: no such words ship, so nothing needs marking. | pass | Manual copy review |

## WCAG 3.0 readiness mapping (draft — advisory only)

WCAG 3.0 is a working draft. These rows describe readiness against draft
outcomes as approximated by today's instruments (axe `best-practice` rules
plus the gates above). They must NEVER use conformance language
(pass/fail/conformant). Readiness vocabulary: `supported`, `partial`,
`unknown`, `not-applicable`.

| Outcome id | Group | Plain-words summary | Readiness | Approximated by |
|---|---|---|---|---|
| `text-contrast` | seeing | Text stays readable in every theme. | supported | 7:1 gates + contrast walk |
| `motion-and-flashing` | seeing | Motion follows your settings; nothing flashes. | supported | `reducedMotion` gate + manual |
| `audio-alternatives` | hearing | Alternatives for audio content: the app ships no audio content. | not-applicable | Manual scope check |
| `sound-alerts-have-text` | hearing | Sounds are decoration only: every alert also appears as text, and sounds are off by default. | supported | Manual (`soundEffects` default off + live regions) |
| `full-keyboard-operation` | getting-around | The whole app works by keyboard. | supported | Canary keyboard guards + manual walk |
| `pointer-targets` | getting-around | Touch and mouse targets are roomy; dense lists hold a smaller minimum. | partial | `focusVisibility` gate (exemption 1) |
| `plain-language` | thinking | Words are kept simple; no automatic reading-grade check yet. | partial | Manual copy review (exemption 3) |
| `error-help-and-undo` | thinking | Forms name the problem, suggest a fix, and important actions confirm or undo. | supported | Form tests + manual |
| `screen-reader-support` | helpful-tech | Screen readers get named controls, headings, live updates, and page titles. | supported | axe + `a11yTestHelpers` + `RouteAnnouncer` |
| `respects-device-settings` | helpful-tech | The app honours Reduce Motion, themes, and text-size settings. | supported | `reducedMotion` + theme/font settings |

## Group status aggregation (the rule the code implements)

- AAA status per group: ignore `not-applicable` rows. All remaining `pass`
  → "Supported". Any `partial` → "Partly supported". (A future
  `not-supported` value would surface as "Not supported"; none exists today.)
  All rows `not-applicable` → "Does not apply here".
- 3.0 readiness per group: ignore `not-applicable` outcomes. Any `unknown`
  → "Unknown". Else any `partial` → "Partly ready". Else → "Ready". All
  `not-applicable` → "Does not apply here".

## Required statement boilerplate (from W3C WAI)

The view carries these sections in plain words: commitment to accessibility;
standard applied (WCAG 2.2 AA conformant; AAA conformant except the listed
exemptions; WCAG 3.0 draft readiness shown without any conformance claim);
scope (the SPA routes, named); feedback contact (the report form plus the
team inbox address from server config); known limitations (the four
exemptions as user-facing known issues); measures taken (the gates above);
technical information (works in current browsers with JavaScript; no
plug-ins); assessment approach (automated scans plus manual keyboard /
screen-reader passes); approval and review date.

## Decision note (Step 2): the "latest check results" source

Inventory: the canary axe run emits no persisted artifact; the contrast walk
runs in-page during e2e; `containerContrast` / `observabilityContrast` /
theme gates run in vitest; lint runs in CI. None is persisted — confirmed.

Decision (the plan's recommended default): a versioned JSON artifact,
`api/accessibility-results.json`, served read-only at
`GET /accessibility/results`, containing per-criterion status +
per-outcome readiness + known issues + `generatedAt` timestamp + app
version + contact inbox. The frontend fetches it at runtime and renders
statuses from it; when the fetch fails or the artifact is missing, a
curated static fallback renders with an honest "latest results unavailable"
note. The mapping tables above are the single source of truth, shared by
both sides as `shared/accessibilityStatement.js`, so the producer and the
view cannot drift apart. A manual refresh command,
`node scripts/refresh-accessibility-results.mjs`, re-stamps `generatedAt`
and the app version after a re-audit; automating the producer (emit the
artifact from the gate run) is recorded follow-up work, not this slice.

Rejected: live re-scan on page open (slow, flaky, needs backend
orchestration for axe) and hand-edited prose as the primary source (violates
"dynamic" — statuses must derive from stored results).

Artifact schema (v1, draft — authoritative in
`shared/accessibilityStatement.js`):

```json
{
  "schemaVersion": 1,
  "generatedAt": "<ISO timestamp>",
  "appVersion": "<string>",
  "contactEmail": "<team inbox or empty when unconfigured>",
  "wcag22aaa": [{ "criterion": "1.4.6", "status": "pass", "evidence": "<short>" }],
  "wcag30": [{ "outcome": "text-contrast", "readiness": "supported", "note": "<short>" }],
  "knownIssues": [{ "id": "target-size-dense", "summary": "<plain words>", "group": "getting-around" }]
}
```

Fallback behaviour: missing artifact, failed fetch, or malformed entries →
curated fallback copy renders (statuses marked as last-known, honestly
dated); malformed entries are skipped, unknown criterion ids ignored and
logged, and rendering never crashes.

## Review cadence

Re-check this mapping and the plain-words copy on each minor release and
whenever the WCAG 3.0 draft moves materially; refresh the artifact stamp at
the same time. Owner: frontend. The statement view always shows its
"last checked" date, so staleness is visible, never silent.

## Step 8 decision: no footer link

Skipped with rationale: the app has no global footer surface (the only
footers in the codebase are modal footers), and building a new footer for
this task is out of scope. The statement stays reachable from the System
menu (primary, keyboard-operable), the logo right-click shortcut, and the
`A` keyboard shortcut.
