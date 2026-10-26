# Audit register — WCAG 2.2 AAA + WCAG 3.0 alignment — 2026-09-20

**Auditor:** automated stage (vitest + eslint jsx-a11y + computed-contrast
matrix) with manual code-review of each cited site · **Scope:** 7 SPA views +
shared chrome (see [statement](./STATEMENT.md)) · **Normative refs:** bundled
WCAG 2.2 AAA requirements, WCAG 3.0 requirements/assertions, ARIA guides.

How to read: **Before** = state at stage start (mostly the 2026-08-26 audit
plus the in-flight 2026-09-20 a11y enablement); **After** = this stage;
**Evidence** = the gate that pins it.

## WCAG 2.2 — Perceivable

| SC | Applies | Before | After | Evidence |
|----|---------|--------|-------|----------|
| 1.1.1 Non-text Content | ✅ | Pass (decorative icons `aria-hidden`, controls named) | Pass, unchanged | jsx-a11y gate, `Icon`/`BrandMark` tests |
| 1.2.1–1.2.5, 1.2.6, 1.2.7–1.2.9 | — | N/A: no prerecorded/time-based media in product | N/A | — |
| 1.3.1 Info and Relationships | ✅ | Fail: bare `<label>`s, unlabelled dialogs | **Fixed**: labelled headings, `labelledBy` dialogs, named banner/nav | `a11yAssertions`, dialog-name tests |
| 1.3.2 Meaningful Sequence | ✅ | Pass | Pass (focus order = DOM order; dialogs trap) | Modal tests |
| 1.3.3 Sensory Characteristics | ✅ | Pass (no shape-only instructions) | Pass | review |
| 1.3.4 Orientation | ✅ | Pass (no orientation lock) | Pass | review |
| 1.3.5 Identify Input Purpose | ✅ | Pass (no in-scope personal-data fields) | Pass | review |
| 1.3.6 Identify Purpose | ✅ | Partial: landmarks unnamed | **Fixed**: named banner + nav; tabs carry `aria-current` | App banner tests |
| 1.4.1 Use of Colour | ✅ | Fail: dropdown highlight, health dots colour-only | **Fixed**: `border-l-4` active indicator; health text beside dots; icon+text status | SelectDropdown/HealthTrafficLight tests |
| 1.4.2 Audio Control | — | N/A (no autoplay audio; chimes are user-gated) | N/A | — |
| 1.4.3 Contrast (Minimum) | ✅ | Fail in light theme: terminals ~1.5:1 | **Fixed**: `.terminal-dark` contract pins dark terminals in all themes | `terminalContrast.test.js` (16 cases, mutation-proven) |
| 1.4.4 Resize Text | ✅ | Pass (relative units, font-size setting) | Pass | manual checklist |
| 1.4.5 Images of Text | ✅ | Pass (no images of text) | Pass | review |
| 1.4.6 Contrast (Enhanced 7:1) | ✅ | Fail: light-theme terminals; dynamic accents | **Fixed**: terminal contract; accent-token contract (presets ≥7:1, mid-luminance warning) | `terminalContrast` + `accentTokens` matrix tests |
| 1.4.7 Low/No Background Audio | — | N/A | N/A | — |
| 1.4.8 Visual Presentation | ✅ | Partial | **Exempted** (see statement #2) | statement |
| 1.4.9 Images of Text (No Exception) | ✅ | Pass | Pass | review |
| 1.4.10 Reflow | ✅ | Pass pattern (scroll regions, responsive) | Pass; verified via checklist | manual checklist |
| 1.4.11 Non-text Contrast | ✅ | Pass (3:1 UI boundaries; focus ring fixed for light theme) | **Fixed** light-theme focus colour `#006e28` (5.9:1) | index.css, contrast math in report |
| 1.4.12 Text Spacing | ✅ | Pass (no clipping constructs) | Pass | manual checklist |
| 1.4.13 Content on Hover/Focus | ✅ | Fail: tooltip not dismissible/hoverable by keyboard | **Fixed**: keyboard trigger, Esc dismiss, 44px trigger/close | InfoTooltip tests (11 cases) |

## WCAG 2.2 — Operable

| SC | Applies | Before | After | Evidence |
|----|---------|--------|-------|----------|
| 2.1.1 Keyboard | ✅ | Fail: clickable header bar, div-status refresh, scroll regions unreachable | **Fixed**: explicit Expand/Collapse button, traffic-light `<button>`, `tabIndex=0` labelled scroll regions | WorkflowCanvas/NowPlayingBar/LogsPanel tests |
| 2.1.2 No Keyboard Trap | ✅ | Pass | Pass | Modal/InfoTooltip Esc tests |
| 2.1.3 Keyboard (No Exception) | ✅ | Pass (Alt+Arrow reorder, separator arrows, combobox type-ahead) | Pass | `tabs.js`, canvas tests |
| 2.1.4 Character Key Shortcuts | ✅ | Pass | Pass: single-key shortcuts are focus-guarded (ignored in inputs/textareas/selects/contentEditable), modifier-only otherwise, and gated behind the `enableKeyboardShortcuts` preference (off switch) | App.jsx handler, KeyboardShortcutsModal |
| 2.2.1 Timing Adjustable | — | N/A (no time limits) | N/A | — |
| 2.2.2 Pause, Stop, Hide | ✅ | Partial: observability auto-poll (3.5s), tab-hidden pause only | Aligned: real-time essential activity + hidden-tab pause; foreground pause control noted as improvement | dashboard tests |
| 2.2.3 No Timing (AAA) | ✅ | Same basis as 2.2.2 | Aligned (real-time exception) | — |
| 2.2.4–2.2.6 Interruptions | — | N/A (no interruptions/motion auth) | N/A | — |
| 2.3.1 Flashing | ✅ | Pass (no >3/s flashing) | Pass | review |
| 2.3.2 Three Flashes | ✅ | Pass | Pass | review |
| 2.3.3 Animation from Interactions | ✅ | Fail (Aug): OS setting ignored | **Fixed**: `prefers-reduced-motion` blanket + `[data-reduce-motion]` + in-app toggle | index.css |
| 2.4.1 Bypass Blocks | ✅ | Pass (skip link) | Pass, strengthened test | App skip-link test |
| 2.4.2 Page Titled | ✅ | Fail: SPA kept boot title | **Fixed**: per-view titles + route announcer | `viewTitles` tests, App tests |
| 2.4.3 Focus Order | ✅ | Pass (dialogs move focus, no steals) | Pass (`useFocusOnMount` replaces `autoFocus`; lint-forbidden) | a11y tests, `no-autofocus` gate |
| 2.4.4 Link Purpose (In Context) | ✅ | Pass | Pass | review |
| 2.4.5 Multiple Ways | ✅ | Pass (tabs + menu + shortcuts + search) | Pass | review |
| 2.4.6 Headings and Labels | ✅ | Fail: missing view headings | **Fixed**: sr-only `h1` per view, descriptive labels | heading-role tests |
| 2.4.7 Focus Visible | ✅ | Fail: card root relied on default | **Fixed**: explicit `focus-visible` rings + 2px accent outline | TaskCard, index.css |
| 2.4.8 Location | ✅ | Pass (`aria-current="page"`, breadcrumbs) | Pass | TabNavigator tests |
| 2.4.9 Link Purpose (Link Only) | ✅ | Pass (labels carry purpose) | Pass | review |
| 2.4.10 Section Headings | ✅ | Fail: no view headings | **Fixed** (same as 2.4.6) | heading tests |
| 2.4.11 Focus Not Obscured (Minimum) | ✅ | Pass (sticky header `z-40` < modal `z-50`; drawer confined to column) | Pass | footer-overlap contract tests |
| 2.4.12 Focus Not Obscured (Enhanced) | ✅ | Pass (same basis, nothing fully covers focus) | Pass | same |
| 2.4.13 Focus Appearance (AAA) | ✅ | Fail in light theme (1.6:1) | **Fixed** for light (`#006e28`); custom-accent residual exempted | statement #4 |
| 2.5.1 Pointer Gestures | ✅ | Pass (drag + Alt+Arrow; splitter + arrows) | Pass | canvas tests |
| 2.5.2 Pointer Cancellation | ✅ | Pass (click activation, no down-event) | Pass | review |
| 2.5.3 Label in Name | ✅ | Fail (`aria-label` ≠ visible text on dialogs/inputs) | **Fixed**: names contain visible labels (dialogs, model/timeout/fallback inputs) | renamed-query tests |
| 2.5.4 Motion Actuation | — | N/A (no shake/tilt) | N/A | — |
| 2.5.5 Target Size Enhanced (AAA) | ✅ | Partial | **Exempted** (see statement #1); 44px verified for primary/icon/close/tab targets | statement |
| 2.5.6 Concurrent Input | ✅ | Pass | Pass | review |
| 2.5.7 Dragging Movements | ✅ | Pass (keyboard alternative for every drag/resize) | Pass | canvas tests |
| 2.5.8 Target Size (Minimum) | ✅ | Fail (Aug): `p-1` icon buttons | **Fixed**: 44px sweep (modal/widget/drawer/close, tooltip trigger) | class review + tests |

## WCAG 2.2 — Understandable

| SC | Applies | Before | After | Evidence |
|----|---------|--------|-------|----------|
| 3.1.1 Language of Page | ✅ | Pass (`<html lang="en">`) | Pass | index.html |
| 3.1.2 Language of Parts | — | N/A (English-only scope) | N/A | plan assumption (c) |
| 3.1.3–3.1.6 Unusual words/abbreviations/reading level/pronunciation | ✅ | Partial | Process: plain-language copy rule (checklist); 3.1.5 exempted | statement #3, checklist |
| 3.2.1 On Focus | ✅ | Pass (no context change on focus) | Pass | review |
| 3.2.2 On Input | ✅ | Pass (explicit submit/expand controls) | Pass | review |
| 3.2.3 Consistent Navigation | ✅ | Pass | Pass | review |
| 3.2.4 Consistent Identification | ✅ | Pass (shared primitives) | Pass | review |
| 3.2.5 Change on Request | ✅ | Pass | Pass | review |
| 3.2.6 Consistent Help | ✅ | Pass (System Menu + Guide + tooltips stable) | Pass | review |
| 3.3.1 Error Identification | ✅ | Pass (inline errors + warning with suggestion) | Pass | settings contrast-warning test |
| 3.3.2 Labels or Instructions | ✅ | Pass (every input labelled) | Pass | label-query tests |
| 3.3.3 Error Suggestion | ✅ | Pass (accent warning suggests darker/lighter/preset) | Pass | settings test |
| 3.3.4 Error Prevention (Legal/Financial/Data) | — | N/A (no such submissions) | N/A | — |
| 3.3.5 Help | ✅ | Pass (tooltips, guide, docs) | Pass | review |
| 3.3.6 Error Prevention (All) | ✅ | Pass (confirm modals for destructive actions) | Pass | review dialogs |
| 3.3.7 Redundant Entry | ✅ | Aligned (forms carry values, no re-entry) | Aligned | review |
| 3.3.8 Accessible Authentication | — | N/A (no login/cognitive challenge in scope) | N/A | grep: no auth UI |
| 3.3.9 Redundant Entry (AAA) | — | N/A (same basis) | N/A | — |

## WCAG 2.2 — Robust

| SC | Applies | Before | After | Evidence |
|----|---------|--------|-------|----------|
| 4.1.1 Parsing | ✅ | Pass (React 18, valid output; legacy rule retired in 2.2) | Pass | build |
| 4.1.2 Name, Role, Value | ✅ | Fail: role=status button, unlabelled dialogs, emoji-only buttons | **Fixed**: native buttons, labelled dialogs, aria-labelled emoji controls | full suite (1034 tests) |
| 4.1.3 Status Messages | ✅ | Fail: silent saves/streams/route changes | **Fixed**: save live region, `role=log` consoles, engine badge `role=status`, route announcer | LiveRegion/a11y tests |

## WCAG 3.0 draft alignment (advisory — no conformance claim)

| Draft outcome | Alignment |
|---------------|-----------|
| Text adjustability / detectability | Aligned: font-size setting, theme choice, zoom-safe relative units; 80-char control exempted (2.2/1.4.8 row). |
| Focus relevance & order | Aligned: focus trap/restore, no steals, named landmarks, enhanced focus target work. |
| Interactive-element naming & contrast | Aligned: 2.5.3 sweep, 7:1 text gates, 3:1 UI/focus gates. |
| Error association & reversibility | Aligned: inline errors with suggestions, confirm modals, drawer-local edits with explicit save/close. |
| Pointer controllability | Aligned: single-pointer + keyboard paths for drag/resize; 44px primary targets. |
| Clear language / visual aids | Process action: plain-language contributor rule; complex concepts (harness, fallback routing) carry `InfoTooltip` + docs links. No automated gate by design (draft). |
| Usability testing with disabled users; algorithm reviews (3.0 Assertions) | Policy actions outside code: recruit testers with disabilities for the manual pass; review agent-driven UI copy for clarity. Owners + dates in the manual checklist below. |

## Manual assurance pass — 2026-09-20 (recorded, tool-assisted review)

| Check | Result | Notes |
|-------|--------|-------|
| Keyboard-only: create task → review diff → pass/fail → settings change → all tabs | PASS (flow logic code-reviewed; focus stops all visible via 2px ring) | Full live run recommended at next human QA |
| Screen-reader smoke (landmarks/headings/names/live regions) | PASS via Testing Library role queries (1034 tests assert the same tree AT consumes) | Human SR run (NVDA/VoiceOver) open — owner: frontend, due 2027-03-20 |
| 200% text / text-spacing / 320px reflow | PASS by construction (relative units, scroll regions, responsive) | Live resize check open — owner: frontend, due 2027-03-20 |
| Reduced motion (OS + in-app toggle) | PASS (CSS blanket verified in source) | — |
| 7-view screenshot set | DEFERRED — headless capture requires a running server; no live-server verification was performed in this stage | Owner: frontend, next QA window |

## Re-audit pass — 2026-09-20 (evening, review-rejection follow-up)

A review rejection cited insufficient contrast, missing focus indicators,
unnamed icon buttons, missing skip link, ignored reduced-motion, unassociated
form errors, and heading hierarchy. Re-verified each claim against the tree;
the skip link, focus ring, and icon-button naming held (zero unnamed
`<button>`s by source scan; skip link + `:focus-visible` + `aria-label`
coverage confirmed), and the following genuine gaps were fixed:

| # | Criterion | Finding | Fix | Evidence |
|---|-----------|---------|-----|----------|
| R1 | 1.4.6 (7:1) | `text-red-500` error/alert text (4.9:1 dark, 3.8:1 light); `text-red-400` message text (5.9–6.7:1); `text-rose-400` on slate-900 (6.6:1); slate-400 console chips on slate-800 (5.7:1); `text-error` pastel un-remapped in light theme (~1.9:1 on white) | Error/message text moved to the `text-error` token; rose-400→rose-300 and slate-400→slate-300 on dark-anchored surfaces; new `[data-theme='light'] .text-error` → dark-red remap with a `.terminal-dark` guard | `lightThemeContrast.test.js` (new), extended `observabilityContrast`/`terminalContrast` gates; ratios: error token 9.7–15.4 dark, 8.3 light; rose-300 8.7–10.1; slate-300 9.9 |
| R2 | 1.3.1 / 2.4.10 | Two h1s per page (Header brand `<h1>` + view `<h1>`); DocsView h1→h3 skip; WidgetManagerModal h2→h4 skip; TaskDetailPage not-found branch headed by h2; Settings tabs topped by h2 with no page h1; docs article `#` rendered a second page h1 | Brand wordmark → `<p>`; DocsView sections → h2; modal subsections → h3; not-found → h1; Settings gained sr-only page h1 (workflow panel h1→h2); new `MarkdownViewer headingBase` prop (visuals unchanged) applied to the docs article | Header/DocsView/WidgetManagerModal/MarkdownViewer heading tests |
| R3 | 2.3.3 | `LiveConsoleWidget` auto-scroll and `TaskReviewPage`/`KainBainContext` smooth scrolls ignored the motion preference (only `LogsPanel` honoured it) | New shared `a11y/motion.js` (`prefersReducedMotion`/`scrollBehavior`, OS query + in-app setting); all 5 JS scroll sites routed through it | `a11y.test.jsx` motion suite (3 cases) |
| R4 | 3.3.1 | Harness-command validation error and alias-row errors announced via `role="alert"` but not programmatically linked to their fields | `aria-invalid` + `aria-describedby` (help + error ids) on both inputs; error nodes gained stable ids | ProjectSettings/ModelAliasesSection association tests |

Remaining `text-rose-400` (LiveConsoleWidget tag pill, 7.5:1) and tag-pill
`-400` tones (≥7.3:1) were measured and left as-is — they pass. Pre-existing
exemptions (#1–#4) unchanged.

## 2026-09-20 late fix round (deep-review R2 findings)

| # | Criterion | Finding | Fix | Evidence |
|---|-----------|---------|-----|----------|
| R5 | 1.4.6 (7:1) | `KpiRibbonWidget` "⚙️ ACTIVE ENGINE" label (`text-indigo-400`, 5.8–6.55:1 on the indigo card composite) and the model line (`text-indigo-400/80`, ~4.2:1 composited) failed AAA on the Observability view | Both moved to `text-indigo-300` (8.68:1 on the darkest card stop `#141836`, 9.80:1 on `#080c16`); same-hue shade step, visuals otherwise unchanged | Extended `observabilityContrast.test.js` (KPI surface ratios + `text-indigo-400` ban); StatsBreakdownWidget 7.10:1 borderline pair pinned |
| R6 | 1.4.6 regression net | Axe `color-contrast-enhanced` ships `enabled: false` in axe-core 4.13 and false-passes a planted 1.74:1 node even when force-enabled — so the canary `wcag2aaa` tag checked zero AAA text contrast; explorer, docs, and task-review had no canary scans at all | New computed in-page contrast walk (`AAA_TEXT_CONTRAST_AUDIT` in `accessibility.spec.js`: composited fg/bg, 7:1 normal / 4.5:1 large) asserted on all 7 views; a planted `#3a3a3a`-on-`#0a0a0a` negative-control test proves the walk is live; axe scans added for explorer, docs, and task-review | `canary-e2e/tests/accessibility.spec.js` (14 tests: 8 axe+contrast view scans, keyboard/focus guards, negative control) |

## Exemptions carried

Statement #1 (2.5.5 density), #2 (1.4.8 line length), #3 (3.1.5 reading level),
#4 (2.4.13 custom-accent focus) — rationale, owner, and 2027-03-20 review date
in [STATEMENT.md](./STATEMENT.md).

## Re-audit pass 2 — 2026-09-20 (late evening, second review-rejection follow-up)

A further review rejection listed 11 items (AAA contrast, non-text contrast
for icon buttons, focus-visible, reflow, skip link, `aria-describedby`,
all-caps text, responsive containers, code-block language, WCAG 3 checklist,
screenshots). Each was verified against the tree; skip link, `:focus-visible`
ring, AAA contrast gates, form-error association, WCAG 3 alignment note, and
the axe canary gate (`canary-e2e/tests/accessibility.spec.js`, wcag2a/wcag2aa/
wcag2aaa/best-practice tags, run via `./run-tests.sh --canary`) already held.
The genuine gaps found were fixed:

| # | Criterion | Finding | Fix | Evidence |
|---|-----------|---------|-----|----------|
| S1 | 3.1.1/4.1.2 (screen-reader spelling) | Literal all-caps source strings: `PIPELINE DISTRIBUTION`, `DASHBOARD CUSTOMIZATION MODE ACTIVE`, `PAUSED` (WorkflowCanvas), `ENGINE HEALTH CHECKS`, plus status tokens (`PAUSED`/`RUNNING`/`WAITING_HUMAN`/… in NowPlayingBar, TaskCard, TaskDetail badges) — announced letter-by-letter by some screen readers | Normal-case source text with CSS `uppercase` at every render site (visuals pixel-identical); NowPlayingBar gained a per-branch `statusBadgeDisplay` word (`WAITING_HUMAN` → `Waiting human`) used for text, `title`, and `aria-label`; TaskCard dot marked `aria-hidden` | Updated exact-match assertions (NowPlayingBar/TaskCard/WorkflowCanvas/TaskDetailPage/StatsBreakdown); all 10 axe canary checks green on scratch stack; orchestrator screenshot verified |
| S2 | 1.3.1/4.1.2 (dialog description) | 10 of 11 `Modal` call sites passed no `describedBy` (only CreateTaskFromFileModal did) | Every `Modal` usage now passes `describedBy` linked to a real description: existing visible text where present (Feedback/PromptReview/SystemGuide/pass/fail modals), `sr-only` text where none existed (widget manager, skill preview, shortcuts, new project); UiPreferences description kept available at all viewports (`sr-only sm:not-sr-only`) | `Modal.test.jsx` passthrough contract + new StageSkillsPanel assertion that the dialog's `aria-describedby` target exists |
| S3 | 3.1.2/4.1.2 (language identification) | Fence info string flowed raw into the badge/highlighter with no `language-*` identifier and no sanitization; a literal `CODE` fallback badge | New exported `sanitizeLanguage` (first token, lowercase, `[a-z0-9+#*.-]`, ≤20 chars, `''` fallback); `CodeBlock` renders a sanitized `language-*` class and normal-case badge; deliberately NOT an HTML `lang` attribute (that declares a human language per 3.1.2 — a programming tag there would mislead AT) | 3 new `MarkdownViewer.test.jsx` cases (sanitizer matrix, class charset, neutral fallback); 15/15 file green |
| S4 | 1.4.11 (non-text contrast) | 10 borderless icon-only close/dismiss/transport buttons (notifications, inspector, 4 NowPlaying transports, 5 dialog closes) relied on glyph contrast alone with no visible control boundary | Subtle always-visible border (`border-border-standard/50`, slate-700 on the dark-anchored widget modal); sub-44px icon buttons (widget-manager close, skill-preview close) raised to 44×44 | Axe canary 10/10 green; orchestrator screenshot shows unchanged layout with ringed transports |
| S5 | 1.4.10 (reflow) | 4 dialog panels capped with fixed `max-w-xl` (already `w-full` in a padded centered container, but not robust outside it) | `max-w-[min(36rem,calc(100vw-1.5rem))]` — identical cap on desktop, viewport-bound at 320px/200% zoom; pre-existing `overflow-x-auto` scroll regions and wrapped markdown tables confirmed by source scan | Frontend build green (arbitrary value compiles); axe + screenshots green |

No new exemptions. Pre-existing exemptions (#1–#4) unchanged.

## Re-audit pass 3 — 2026-09-21 (retry, third review-rejection follow-up)

The 2026-09-21 review re-measured every claim from the 2026-09-20-230125
rejection against the tree (computed ratios, source scans) and refuted all but
one: 8 of 11 `material-symbols` ligature spans rendered without
`aria-hidden="true"`, exposing glyph ligature text (e.g. `navigate_before`,
`expand_more`, `close`) to assistive technology as content. Inside an
`aria-label`ed control the label still wins, but anywhere else the glyph name
leaks into the accessible name or is announced as gibberish, and any refactor
that drops the parent label silently exposes it. Fixed:

| # | Criterion | Finding | Fix | Evidence |
|---|-----------|---------|-----|----------|
| R7 | 1.1.1 / 4.1.2 | `material-symbols` ligature spans without `aria-hidden`: NowPlayingBar transports (look-back, jump-to-active, play/pause, skip, look-forward), Header project-dropdown chevron, TaskDetailOverlay (open-in-full, inspector close) | `aria-hidden="true"` on all 8 spans (the 9th, queue `format_list_numbered`, was already hidden); new source-scan gate bans any unhidden `material-symbols` span repo-wide, with a negative control proving the matcher is live | `frontend/src/a11y/decorativeIcons.test.js` (2 cases); full suite 91 files / 1106 tests green; canary accessibility spec 14/14 green on the isolated scratch stack |

The remaining rejection claims (≈5:1 body contrast, sub-14px text, unnamed
icon buttons, thin focus outlines, un-muted animations, missing theme
radiogroup) were each re-measured and refuted: body `#e5e2e1`/`#0a0a0a` is
15.36:1; on-surface pairs 12.8–14.4:1, muted 9.6–11.3:1, accent 11.6:1; WCAG
sets no minimum font size and the audited 10px usages hold ≥11:1; a source
scan of all `<button>`s found zero textless buttons without an accessible
name; the 2px accent focus outline holds 11.6:1 (dark) / 5.9:1 (light) against
2.4.13's 3:1 minimum; `prefers-reduced-motion` + `[data-reduce-motion]` kill
every CSS animation and JS scrolls route through `a11y/motion.js`; and the
theme selector's `role="group"` + `aria-pressed` toggles are a valid 1.3.1/4.1.2
pattern (radiogroup is one option, not a requirement). No new exemptions.
