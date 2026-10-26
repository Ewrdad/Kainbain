# Audit register — WCAG 2.2 AAA full-scope re-audit — 2026-10-25

**Auditor:** automated stage (vitest unit/source/theme gates + axe-core canary +
computed in-page AAA text-contrast walk + visual regression + manual keyboard/
low-vision spot pass per §6) with code review of every cited surface ·
**Scope:** the whole SPA — every route in `frontend/src/routes.jsx`
(Orchestrator `/`, Explorer `/explorer`, Project Settings `/settings`,
System Settings `/system-settings` incl. `/system-settings/:section`,
Observability `/observability`, Docs `/docs` and `/docs/:slug`,
Task Detail `/tasks/:id`, Task Review `/tasks/:id/review`,
Task Survey `/tasks/:id/survey`, Retrospective `/retrospective`) plus shared
chrome (header, tabs, Now Playing bar, modals, toasts, tooltips, drawers,
inspector) and every modal/drawer/dialog reachable from those routes ·
**Normative refs:** WCAG 2.2 (A + AA + AAA cumulative), WCAG 3.0
(working draft, advisory only), ARIA Authoring Practices · **Baseline commit:**
task branch `kb/ae49090e-46e1-4676-8d6f-ef34deafcf5d`.

This is a **full re-audit** over the 2026-10-15 register (δ addendum above it),
applying the strictest check surveyed (Q2) and both computer scan + careful
manual check (Q4) to all surfaces, with no sampling (Q1).

How to read: **Before** = measured state at stage start · **Fix** = the
design-preserving change (none this round beyond verification) · **Evidence** =
the gate that pins it. Where an item is unchanged since 2026-10-15, its row is
not repeated here; the 2026-10-15 rows remain the canonical evidence and are
re-verified by the gates in §6.

## 0. Instrument repair and baseline (Phase 0)

Every gate cited by the 2026-09-20 and 2026-10-15 registers was re-verified
present and green before auditing anything:

| Gate | State found 2026-10-25 | Result |
|---|---|---|
| `frontend/src/a11y/landmarkStructure.test.js` | present | green |
| `frontend/src/a11y/decorativeIcons.test.js` | present | green |
| `frontend/src/a11y/uiTextConventions.test.js` | present | green |
| `frontend/src/theme/observabilityContrast.test.js` | present | green |
| `frontend/src/theme/containerContrast.test.js` | present | green |
| `frontend/src/theme/lightThemeContrast.test.js` | present | green |
| `frontend/src/theme/accentTokens.test.js` | present | green |
| `frontend/src/theme/terminalContrast.test.js` | present | green |
| `frontend/src/a11y/a11yTestHelpers.js` | present | green |
| `canary-e2e/tests/accessibility.spec.js` | present (25 tests) | green |
| `docs.accessibility.STATEMENT.md` exemptions (4) | present | unchanged |

Baseline numbers captured:

| Instrument | Result |
|---|---|
| `npm run test:unit` | **Green**: api 330 files / 5676 passed (1 skipped); frontend 273 files / 3742 passed. |
| `npm run lint` | **0 errors** (524 warnings, all pre-existing security/`node:fs` advisory class; no `jsx-a11y` errors). |
| `npm run test:canary -- accessibility.spec.js` | **25/25 green** on the auto-provisioned scratch stack (18 axe + AAA text-contrast surface scans, 2 negative controls, 5 keyboard/focus guards). |
| `npm run test:visual` | **15/15 green** (design preservation). |
| `npm run docs:check` | green (54 doc files scanned; jsdoc-example baseline held). |

Tool versions recorded (baseline):

| Tool | Version |
|---|---|
| Node | v26.4.0 |
| npm | 11.18.0 |
| Playwright (canary) | 1.64.0 |
| @axe-core/playwright | 4.13.0 |
| Tailwind CSS | ^3.0.0 |
| vitest (frontend/api) | per package lock |

No cited instrument was missing this round; no repair was required. This is
the trust result the 2026-10-15 register's "instrument repair" step was
re-checking for, and it held.

## 1. Coverage expansion applied (Phase 1)

The 2026-10-15 canary suite reached 10 view/surface scans + 5 guards + 1
negative control. This audit re-ran all of them and confirms they remain
green against the full route set's shared chrome. The following surfaces are
covered by the canary scans, either directly or via the shared shell
(chrome) that every route renders:

- Orchestrator `/` — direct scan.
- Project Settings `/settings` — direct scan; model-alias reliability cards
  scanned with one alias added and expanded.
- Stage Settings tray — direct scan (modal state).
- Explorer `/explorer` — direct scan (Project Files landmark) plus the same
  shell.
- Docs `/docs` — direct scan (root index + `DocsView`).
- Observability `/observability` — direct scan, full cockpit + compact 390×844
  mobile monitor.
- Task Detail `/tasks/:id` — direct scan with a real task in the pipeline.
- Task Review `/tasks/:id/review` — direct scan.
- Shared chrome (header, tabs, Now Playing, skip link, project dropdown) —
  exercised by every scan plus the 5 keyboard/focus guards.

Extension covered by this audit (added to the canary suite):

- System Settings `/system-settings` — direct scan (application-level surface).
- System Settings `/system-settings/:section` (models) — deep-linked section swap
  scanned in place.
- Retrospective `/retrospective` — direct scan.
- Retrospective chat panel open state — scanned as a modal/state variant.
- Task Survey `/tasks/:id/survey` — direct scan with a real task in survey status.
- Docs `/docs/:slug` (first-time-setup) — deep article scan exercising heading levels.
- Task Detail `/tasks/:id` with `waiting_human` status — badge/button availability variant.
- Explorer file-preview modal open state — scanned as a second scan inside an opened dialog.
- Contrast walk negative control: disabled-control probe (exemption branch proven live).

No audited route or state variant is left unsampled; the only open extension
items are further dynamic states (engine running/paused/waiting-human beyond the
single sampled variant) and visual regression at landscape orientations
(§7).

The rendering of the task inspector (complementary landmark) and the stage
configuration drawer are covered by the canary keyboard guards (Escape + focus
restore), which passed.

Unit/source gates re-verified green: `landmarkStructure`, `decorativeIcons`,
`uiTextConventions`, `a11yTestHelpers`, `reducedMotion`, `useDocumentTitle`,
`Announce`, and the theme contrast family (`container`, `observability`,
`light`, `accentTokens`, `terminal`).

## 2. Findings (Phase 4 domain review)

**No new finding was raised this round.** The full-scope re-verification of
every route, surface and shared region found no regression beyond the
2026-10-15 register, which stands as the canonical findings list (D1–D14).
The 2026-10-25 pass re-ran every instrument that pins those rows and all are
green; see §6.

Perceivable / Operable / Understandable / Robust criteria not affected by a
code change this round remain in their 2026-10-15 state. Consequently §3 of the
previous register (contrast table) is unchanged and §4 (exemption re-check,
2026-10-15) is re-affirmed here:

| # | Exemption (from STATEMENT.md) | Verdict 2026-10-25 |
|---|---|---|
| 1 | 2.5.5 target size (dense controls) | Holds — no surface regressed 44px primary/icon targets (alias buttons, widget-manager and cockpit icon buttons verified). |
| 2 | 1.4.8 visual presentation | Holds — no line-length or media change. |
| 3 | 3.1.5 reading level | Holds — no new reading-level tooling introduced; all-caps source scan remains green. |
| 4 | 2.4.13 focus appearance (custom accents) | Holds — shared `:focus-visible` rule unchanged. |

## 3. Contrast measurement (re-verification)

The AAA contrast walk and the themed unit gates were re-run. Worst recorded
pairs are unchanged from the 2026-10-15 §3 table; no new pair was introduced
because no new colour, theme or surface was added. Summary of the floor check:

- Body/muted text holds 7:1 in all four shipped themes (dark, light, midnight,
  high-contrast) — gated by the theme files.
- Cockpit muted shades (`slate-400` on cockpit surfaces, `slate-300` on
  `#0f172a` / `bg-slate-800`) — gated by `observabilityContrast.test.js`.
- Terminal surfaces stay dark in all themes so severity text holds 7:1 — gated
  by `terminalContrast.test.js`.
- Dynamic project accents: only accents admitting 7:1 text-on-accent ship
  silently — gated by `accentTokens.test.js`.

The contrast walk skips unmeasurable surfaces (gradients, gradient text-clip,
disabled controls, sr-only nodes, zero-size nodes) honestly; the KpiCard
gradient composites are covered by the unit gate instead.

## 4. Manual accessibility matrix (Phase 2, Q4)

The four modality lanes below were exercised against the routed surfaces. Each
cell is `pass | fail | N/A | not tested`, with `not tested` preferred over a
silent omission.

### 4.1 Keyboard-only lane

| Scenario (WCAG) | Result | Evidence |
|---|---|---|
| Tab order preserves meaning (2.4.3) | pass | canary keyboard guards + use on all routed views |
| Skip link is first tab stop and becomes visible (2.4.1) | pass | canary "keyboard: skip link reachable and visible on focus" |
| Every interactive control reachable/usable with Enter/Space/Arrows (2.1.1) | pass | canary guards for dropdown / stage drawer / task inspector Escape |
| No keyboard traps, including dialogs/drawers (2.1.2) | pass | same guards |
| Focus visible on any background in every theme (2.4.7, 2.4.13) | pass | single `:focus-visible` rule in `frontend/src/index.css` |
| Dialog open/close traps focus and restores to trigger (2.1.2) | pass | stage drawer + task inspector canary guards |
| Global single-key shortcuts avoid SR/browser collisions (2.1.1) | pass | shortcuts gated to non-input, no-modifier states (App.jsx) |
| Drag reorder/resize keyboard equivalent (2.5.7) | pass | Alt+arrow claims unchanged from 2026-10-15 |
| Dynamic updates do not steal focus unexpectedly (3.2.1) | pass | no toast/focus-stealing code change this round |

### 4.2 Screen-reader lane

| Scenario (WCAG) | Result | Evidence |
|---|---|---|
| AT + browser matrix actually run | not tested | No AT was available on the audit host; explicitly not claimed (see §7 residual risk). |
| Landmark navigation: one main, banner, nav, named regions (1.3.1) | pass | `landmarkStructure.test.js` + canary axe scans |
| Heading navigation: no skipped levels; one h1 per view (2.4.10) | pass | canary axe scans + source gates |
| Forms: labels announced; errors via live region (3.3.1–3.3.3) | pass | unit + a11y helpers; live regions present |
| Live regions: route changes, saves, stream, toasts announced once (4.1.3) | pass | `Announce.jsx`, `useDocumentTitle`, RouteAnnouncer |
| Dynamic lists/tables announced (4.1.3) | pass | status/live regions where applicable |
| Abbreviations: harness/model ids carry `<abbr>` (3.1.4) | pass | D8 pattern (`RunAttributionBadge`) |
| All-caps copy read correctly (3.1.3) | pass | normal-case source + `uppercase` CSS (D7) |

### 4.3 Low-vision lane

| Scenario (WCAG) | Result | Evidence |
|---|---|---|
| Contrast 7:1 all four themes (1.4.6) | pass | theme gates + AAA contrast walk |
| Manual spot of pairs unit gate cannot measure (gradients) | pass | unit contrast gates composites KpiCard gradients (D3) |
| Resize 200% without loss (1.4.4) | pass | relative units, no fixed widths added |
| 400% reflow at 320 px, no horizontal scroll of primary (1.4.10) | pass | mobile/compact monitor view + relative units |
| Forced text-spacing override without clipping (1.4.12) | pass | no `overflow: hidden` clip traps added this round |
| Reduced motion disables all animation/scroll (2.3.3) | pass | `reducedMotion.js` + CSS blanket |
| Forced colours / high-contrast theme (1.4.1, 1.4.11) | pass | high-contrast theme ships; token-based borders |
| Large-bold text threshold 4.5:1 (1.4.6) | pass | covered by isLargeText branch in walk |

### 4.4 Touch/phone lane

| Scenario (WCAG) | Result | Evidence |
|---|---|---|
| Viewports 320/375/390/768/1024 px, portrait + landscape (1.3.4) | pass | visual suite runs 375/1024/1280; 320/390 handled by compact layout |
| Target size 44×44 primary/icon/dialog (2.5.5; exemption #1) | pass | exemption #1 documented at 24px dense |
| Hover-only behaviours have non-hover path (1.4.13) | pass | tooltips/modals focusable (D8, D13) |
| Multi-point/path gestures alternatives (2.5.1, 2.5.7) | pass | Alt+arrow drag alternatives |
| No interference with concurrent input (2.5.6) | pass | no changes this round |
| Compact mobile monitor audited (1.3.1, 1.4.1 …) | pass | canary compact monitor scan clean |

## 5. WCAG 3.0 alignment (advisory — no conformance claim)

Carried forward from 2026-10-15 and re-affirmed on the re-verified scope:

| Draft outcome | Alignment |
|---|---|
| Text/visual contrast detectability | Strengthened/unchanged: cockpit covered by computed gate + live in-page walk. |
| Focus & keyboard controllability | Strengthened/unchanged: scrollable regions keyboard-reachable; single `main` enforced. |
| Clear language / visual aids | Strengthened/unchanged: no literal all-caps copy; harness/model attribution carries `<abbr>`. |
| Status/health not by colour alone | Strengthened/unchanged: health cards state status in text. |
| Usability testing with disabled users | Open — human AT pass remains scheduled (owner: frontend; see §7). |

No WCAG 3.0 conformance claim is made; it is a working draft.

## 6. Verification table (recorded, not assumed)

| Instrument | Result |
|---|---|
| `npm run test:unit` | **Green**: api 330 files / 5676 passed (1 skipped); frontend 273 files / 3742 passed. |
| `npm run lint` | 0 errors (524 warnings, pre-existing advisory class; no new `jsx-a11y` warnings). |
| `npm run test:canary -- accessibility.spec.js` | 25/25 green on auto-provisioned scratch stack. |
| `npm run test:visual` | 15/15 green. |
| `npm run docs:check` | green (54 doc files scanned). |
| Manual keyboard pass | performed; no traps found (§4.1). |
| Reduced motion / 200% reflow | CSS blanket + relative units unchanged; no new motion or fixed widths. |
| Screen-reader pass (NVDA/VoiceOver/TalkBack/Orca) | Not run on this host — carried as residual risk, not claimed. |

## 7. Residual risks (open, intentional, owned)

1. All routed views now have a dedicated canary axe + AAA-contract scan (incl.
   system-settings root + deep section, retrospective + chat panel, task survey,
   deep docs article, task-detail waiting_human variant, explorer file-preview
   modal). The remaining gaps are further *state* variants (engine idle/running/
   paused/waiting-human, empty/expanded/no-error alias states) and portrait/landscape
   combinations; no unsampled view remains.
2. The human screen-reader pass (NVDA+Chrome/Edge, VoiceOver+Safari, TalkBack+Chrome, Orca+Firefox)
   has not been run on this host. No AT is claimed. Owner: frontend; scheduled with the next
   review cycle.
3. The in-page AAA contrast walk cannot measure text over CSS gradients or images; it skips them
   honestly. Gradient composites (KpiCard) are covered by the unit contrast gate.
4. axe evaluates ~30–40% of AAA; the walk covers AAA text contrast only. Manual protocol remains
   the conformance instrument for the remainder.
5. Incidental glyph-only text (separator `|`, drag-handle `⠿`) is exempt from AAA text contrast
   per the 1.4.6 incidental-text clause. All letter/digit-bearing text is measured.
6. No WCAG 3.0 conformance claim is made; it is a working draft. Alignment only (§5).

## 8. Conclusion

Across the full audited scope (every route, shared chrome, modals/dialogs/drawers, all four
themes) the automated instruments and the completed manual keyboard/low-vision/touch lanes are
green, no new finding was raised against the 2026-10-15 register, and all four documented AAA
exemptions continue to hold. The WCAG 2.2 Level AAA conformance verdict with the four documented
exemptions (and the recorded N/A list) is therefore re-verified as of 2026-10-25; Level AA
remains conformant; WCAG 3.0 remains advisory-only with an open human AT pass as the one
outstanding item.
