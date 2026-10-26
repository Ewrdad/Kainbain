# Audit register — WCAG 2.2 AAA delta re-audit — 2026-10-15

**Auditor:** automated stage (vitest contrast locks + source-scan gates +
axe-core canary + computed in-page AAA text-contrast walk) with manual
code-review of each cited site · **Scope:** the UI that landed since the
2026-09-20 register, plus every view the canary suite can reach · **Normative
refs:** bundled WCAG 2.2 AAA requirements, WCAG 3.0 requirements/assertions,
ARIA authoring practices.

This is a **delta addendum** to
[`AUDIT-REGISTER-2026-09-20.md`](./AUDIT-REGISTER-2026-09-20.md). Unchanged
surfaces keep their 2026-09-20 rows; this file re-verifies them with the
restored gates and records the new findings.

How to read: **Before** = measured state at stage start · **Fix** = the
design-preserving change · **Evidence** = the gate that now pins it.

## 0. Instrument repair (the audit program itself had regressed)

Before auditing anything, the *instruments* cited by the 2026-09-20 register
were re-checked against the tree. Two were not actually present:

| Cited by 2026-09-20 | State found 2026-10-15 | Repair |
|---|---|---|
| `accessibility.spec.js` "14 tests: 8 axe+contrast view scans", `AAA_TEXT_CONTRAST_AUDIT` walk, explorer/docs/task-review scans, negative control (R6) | The file carried **8 tests**: orchestrator, settings, stage tray + 5 keyboard guards. No contrast walk. Explorer, docs, task review and observability were never scanned. | `canary-e2e/tests/accessibility.spec.js` rebuilt (16 tests): axe **and** the in-page AAA contrast walk on orchestrator, settings, stage tray, explorer, docs, observability, task detail, task review, the settings alias reliability cards and the compact mobile monitor; a planted 1.7:1 negative control proves the walk is live. |
| `observabilityContrast.test.js` (R5) | No such file existed. | Created: `frontend/src/theme/observabilityContrast.test.js` — recomputes the cockpit pairs and the KpiCard gradient composites, with mutation proofs for the retired shades. |
| `decorativeIcons.test.js` (R7) | Present and green. | Kept. |

New gates added this round: `frontend/src/a11y/uiTextConventions.test.js`
(literal all-caps copy; banned low-contrast shades on the cockpit) and
`frontend/src/a11y/landmarkStructure.test.js` (single `main` landmark;
`role="tabpanel"` never on `<main>`), each with a negative control.

## 1. Delta inventory (changed since 2026-10-07)

| Surface | Rendered content | Risk classes audited |
|---|---|---|
| `settings/ModelAliasesSection.jsx`, `ReliabilityLine.jsx` | reliability cards, target rows, remove/clear buttons | 1.4.1, 1.4.6, 2.5.8, 3.3.1, 4.1.2 |
| `tasks/RunAttributionBadge.jsx`, `TaskHistoryTab`, `TaskCard`, `taskFormatters.js` | harness/model/alias attribution on timeline rows + cards | 1.4.6, 1.4.13, 3.1.4, 4.1.2 |
| `settings/HarnessSection.jsx` | support-tier labels | 1.4.6, 3.1.3/3.1.4, 4.1.2 |
| `observability/*` (dashboard refactor, `MobileMonitorView`, `EngineStatePill`, widget atoms `KpiCard`/`HealthStatusCard`, `WidgetManagerModal`, `WidgetContainer`, widget registry) | KPI/health cards, pills, monitor header, widget manager tabs | 1.1.1, 1.3.1, 1.3.6, 1.4.1, 1.4.6, 2.1.1, 2.4.6, 2.4.10, 3.1.1, 4.1.2 |
| shell/chrome (`Header`, `headerLayout`, `GoToAppLink`, `CircuitBreakerBanner`, `SelectDropdown`) | header, tabs, banners | 1.4.1, 1.4.6, 2.4.4, 4.1.2/4.1.3 |

## 2. Findings and fixes

### 2.1 Perceivable

| # | SC | Finding (measured) | Fix | Evidence |
|---|----|--------------------|-----|----------|
| D1 | 1.4.6 (7:1) | Cockpit muted text: `text-slate-500` (3.75–4.23:1) at 16 sites and `text-slate-600` (2.36–2.66:1) at 2 sites — the latter fails even the 4.5:1 AA floor. Sites: `HealthStatusCard` message, `HarnessReliabilityWidget`, `RecentOutcomesWidget`, `QueueOrderWidget`, `ActiveTaskPromptWidget`, `LiveConsoleWidget`, `MobileMonitorView`, `ObservabilityDashboard`, `WidgetManagerModal`. | `text-slate-400` (≥ 7.04:1 on every cockpit surface); the `MobileMonitorView` idle line (on `#0f172a`, where slate-400 is 6.96:1) uses `text-slate-300` (12.02:1). | `observabilityContrast.test.js`; `uiTextConventions.test.js` bans both shades under `src/components/observability`; axe `color-contrast-enhanced` clean on the observability + compact-monitor scans |
| D2 | 1.4.6 | Cockpit header/controls: `text-slate-400` on `#0f172a` (6.96:1) on the three health pills and the mobile provider line; on `bg-slate-800` `#1e293b` (5.70:1) on the console filter chips, auto-scroll and Clear buttons. | `text-slate-300` (12.0:1 / 9.0:1). | axe canary observability + compact monitor scans |
| D3 | 1.4.6 | `KpiCard` accent text: `rose-400` 6.69–6.88:1, `rose-300/80` unit 6.47–6.66:1, `indigo-400` 6.00–6.08:1, `indigo-400/80` unit 6.15–6.24:1, `sub` `slate-400` 6.70–7.03:1 across the card gradient. The `indigo-400` regression is the exact shade the 2026-09-20 register removed from the KPI ribbon before the ribbon→atom split reintroduced it. | Same-hue shade steps: `rose-300` (9.5:1), `rose-200/80` (8.4:1), `indigo-300` (9.0:1), `indigo-200/80` (8.0:1), `slate-300` (12.1:1). `KpiEngineWidget`'s inline indigo lines follow. | `observabilityContrast.test.js` (per-accent × 5 gradient samples + revert lock on the class strings); `KpiCard.test.jsx` asserts the classes |
| D4 | 1.4.6 | `text-text-muted/70` at 6.77:1 on the stage "Extend pipeline" label and the logs-panel section label. | `text-text-muted` (9.6–11.3:1). | orchestrator + task-detail AAA contrast walk |
| D5 | 1.4.6 | Task-detail secondary badge: `text-secondary` `#9acbff` on `bg-secondary/20` over the card composited to `#38414c` = 6.09:1. | `text-secondary-fixed` `#d0e4ff` (8.00:1) — same-hue lighter step. | task-detail AAA contrast walk + axe scan |
| D6 | 1.4.1 Use of Colour (+1.3.1, 4.1.2) | The new `HealthStatusCard` atom renders the subsystem state as a **colour-only dot**: ok/warn/error/disabled are distinguishable by hue alone, and no text states the status. | New `healthStatusLabel()` maps the status to a word; the card renders it in an `sr-only` node ("Status: Warning") and marks the dot `aria-hidden`. Visuals byte-identical. | `healthStatus.test.js`, `HealthStatusCard.test.jsx` (status matrix, sr-only assertion, `aria-hidden` dot) |

### 2.2 Operable / Understandable / Robust

| # | SC | Finding | Fix | Evidence |
|---|----|---------|-----|----------|
| D7 | 3.1.1 / 4.1.2 | Literal all-caps source strings that some screen readers spell out: `DASHBOARD CUSTOMIZATION MODE ACTIVE`, `PIPELINE DISTRIBUTION`, `ENGINE HEALTH CHECKS`, `FAILED`, `PAUSED`, `STREAMING LIVE`, `OBSERVABILITY`, `PROJECT`, `AUTO` (×4), and the five `KpiCard` labels (`✓ SUCCESSES`, `✕ FAILURES`, `⏳ QUEUE DEPTH`, `👤 HUMAN REVIEW`, `⚙️ ACTIVE ENGINE`). The 2026-09-20 S1 sweep had regressed or never covered these. | Normal-case source + the `uppercase` CSS utility at every site (pixel-identical). | `uiTextConventions.test.js` (source scan of JSX text nodes and `label`/`title`/`placeholder` props, with a negative control); updated exact-match component tests |
| D8 | 3.1.4 / 1.4.13 | `RunAttributionBadge` exposed raw harness/model ids with the only expansion in a hover-only `title` on a non-focusable `<span>` — no keyboard or AT path to what "pi · mistral::large" means. | Rendered as `<abbr title="Stage run attribution — harness: …, model: …, alias: …">`: the expansion is exposed when AT reads the value; visible text and layout unchanged (no added tab stop, no underline). | `RunAttributionBadge.test.jsx` (abbr semantics + expansion text + no tabindex/role) |
| D9 | 4.1.2 / 1.4.1 | `WidgetManagerModal` tab strip marked the active tab with colour only (`border-emerald-400 text-emerald-400`); no programmatic state. | `aria-current="true"` on the active tab (the existing bottom border is the non-colour visual cue). | `WidgetManagerModal.test.jsx` (aria-current follows selection) |
| D10 | 1.3.1 / 1.3.6 (axe `landmark-main-is-top-level`, `landmark-no-duplicate-main`, `landmark-unique`) | Three views rendered a **second `<main>`** inside the shell's `<main id="main-content">`: `ObservabilityDashboard` (`#observability-grid`), `ProjectExplorer` ("Document Viewer"), `RetrospectivePage`. | Plain `<div>`s; the shell keeps the single `main` landmark. | `landmarkStructure.test.js` (source scan + negative control); axe scans clean |
| D11 | 1.3.1 / 2.4.10 (axe `heading-order`) | `DocsView` sidebar avenue headings were `h3` before the article's `h1`; `BlockedByEditor` used `h3` directly under the page `h1`. | `h2` at both sites (heading order never skips). | `DocsView.test.jsx`, `BlockedByEditor.test.jsx`; axe scans clean |
| D12 | 2.4.6 / 2.4.10 (axe `page-has-heading-one`) | The observability route — full cockpit and compact monitor — had **no level-one heading** (its title was an `h2` and the shell header is hidden there). | `sr-only` `<h1>Observability monitor</h1>` on both branches. | `ObservabilityDashboard.test.jsx`; axe scans clean |
| D13 | 2.1.1 Keyboard (axe `scrollable-region-focusable`) | Six cockpit widget bodies and the active-prompt viewer were `overflow-y-auto` scroll containers with no focusable content and no keyboard path to scroll them; `MarkdownViewer`'s `overflow-x-hidden` made every docs article a focus-less scroll region. | Widget bodies became focusable labelled groups (`tabIndex={0}` + `role="group"` + `aria-label`, with the documented `no-noninteractive-tabindex` rationale); `MarkdownViewer` uses `overflow-x-clip` so it is no longer a scroll container (identical clipping). | `HarnessReliabilityWidget.test.jsx`, `ObservabilityDashboard.test.jsx`, `MarkdownViewer.test.jsx`; axe scans clean |
| D14 | 4.1.2 (axe `aria-allowed-role`) | `TaskDetailPage` put `role="tabpanel"` on a `<main>` element — ARIA does not allow overriding `main` with `tabpanel`. | The tab panel is a `<div role="tabpanel">` (tab semantics and id unchanged). | `landmarkStructure.test.js` bans the pattern; axe task-detail scan clean |

### 2.3 Design preservation

Every fix reuses the existing system: theme tokens/`border-standard`, the
shared `:focus-visible` rule, `sr-only`, and the `uppercase` utility. No new
colours, focus styles, or layout rewrites. The only visible deltas are the
one-shade contrast steps in §2.1 (required by the measured 7:1 floor) and the
`RunAttributionBadge` `<abbr>` (no underline added). CSS-uppercase conversions
are pixel-identical; `sr-only` additions are invisible.

## 3. Contrast measurement summary (worst sample on the surface)

| Pair | Before | After | Floor |
|---|---|---|---|
| `slate-500` muted on cockpit | 3.75–4.23:1 | — (retired) | 7:1 |
| `slate-600` muted on cockpit | 2.36–2.66:1 | — (retired) | 7:1 |
| `slate-400` muted on cockpit | 7.04–7.86:1 | kept | 7:1 |
| `slate-400` on `#0f172a` (mobile header) | 6.96:1 | `slate-300` 12.02:1 | 7:1 |
| `slate-400` on `bg-slate-800` (console controls) | 5.70:1 | `slate-300` 9.0:1 | 7:1 |
| `rose-400` / `rose-300/80` on rose KpiCard | 6.69 / 6.47:1 | `rose-300` 9.53 / `rose-200/80` 8.46:1 | 7:1 |
| `indigo-400` / `indigo-400/80` on indigo KpiCard | 6.00 / 6.15:1 | `indigo-300` 8.97 / `indigo-200/80` 8.02:1 | 7:1 |
| `secondary` on `bg-secondary/20` (task badge) | 6.09:1 | `secondary-fixed` 8.00:1 | 7:1 |
| `text-muted/70` (orchestrator label) | 6.77:1 | `text-muted` ~9.6:1 | 7:1 |

The AAA contrast walk exempts **incidental** glyph-only text (separator `|`
and drag-handle `⠿`), per WCAG 1.4.6's incidental-text clause; all
letter/digit-bearing text is measured.

## 4. Statement exemptions re-check

| # | Exemption | Verdict this round |
|---|---|---|
| 1 | 2.5.5 target size (dense controls) | Holds — no delta surface regressed the 44px primary/icon targets (alias remove/delete/clear buttons verified 44×44; widget-manager and cockpit icon buttons unchanged). |
| 2 | 1.4.8 visual presentation | Holds — no line-length/media change. |
| 3 | 3.1.5 reading level | Holds — copy changes were case-only. |
| 4 | 2.4.13 custom-accent focus | Holds — the shared focus ring is unchanged. |

No criterion flipped N/A: the delta introduced no media, no timed UI, no new
login/cognitive challenge.

## 5. WCAG 3.0 draft alignment (advisory — no conformance claim)

| Draft outcome | Alignment |
|---|---|
| Text/visual contrast detectability | Strengthened: the cockpit is now covered by a computed contrast gate (`observabilityContrast.test.js`) and a live in-page walk, not just theme-token tests. |
| Focus & keyboard controllability | Strengthened: scrollable cockpit regions are keyboard-reachable; a single `main` landmark is enforced by gate. |
| Clear language / visual aids | Strengthened: no literal all-caps copy remains; harness/model attribution carries an `<abbr>` expansion. |
| Status/health not by colour alone | Strengthened: health cards state the status in text. |
| Usability testing with disabled users | Open — human screen-reader pass remains scheduled (owner: frontend, see statement). |

## 6. Verification (recorded, not assumed)

| Instrument | Result |
|---|---|
| `npm run test:unit` (api + frontend vitest) | **Green**: frontend 234 files / 3019 tests (incl. the new gates); api 248 files / 4485 passed + 1 skipped. (One `gitGate` 60s timeout was observed once under a loaded box; it passed 2/2 in isolation and the final quiet run was fully green — environmental, pre-existing.) |
| `npm run lint` | 0 errors (140 warnings, all the pre-existing security/`node:fs` advisory class; no new `jsx-a11y` warnings). |
| `canary-e2e/tests/accessibility.spec.js` | **16/16 green** on the auto-provisioned scratch stack: 10 axe + AAA-contrast view/surface scans, the planted-contrast negative control, and 5 keyboard/focus guards. |
| `npm run test:visual` | **15/15 green** — orchestrator/header/homepage snapshots unchanged (design-preservation acceptance). |
| Manual keyboard pass (protocol §Phase 1) | Performed on the delta surfaces via the canary keyboard guards (drawer Escape+focus restore, inspector Escape, dropdown Escape, skip link) — no traps, focus visible. |
| Reduced motion / 200% reflow | CSS blanket + relative units unchanged; no delta surface added JS motion or fixed widths. |
| Screen-reader spot pass (NVDA/VoiceOver) | Not run in this automated stage — carried forward in the statement as a human task (owner: frontend). |

## 7. Residual risks

- The in-page contrast walk cannot measure text over CSS gradients or images
  (it skips them honestly); the KpiCard gradients are covered by the unit
  contrast gate instead.
- axe evaluates ~30–40% of AAA; the walk covers AAA text contrast, not every
  criterion. The manual protocol remains the conformance instrument.
- `RetrospectivePage` was fixed (nested `main`) but is not yet in the canary
  axe scan set; its route is covered by shared chrome scans only.
- Environment note: the KainBain engine shares one working tree across
  concurrent tasks and switched this stage's branch mid-run, auto-committing
  partial work to another task's branch before it was restored to
  `kb/036a50f5-ef8b-4bd1-90c5-ee1958d35019`. The final verified tree is the one
  on the task branch; commits `61b3708` (partial) and `33790a2` (full, on the
  other branch) are the recovery trail.
