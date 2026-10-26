# Accessibility statement — KainBain frontend

**Date:** 2026-10-25 · **Owner:** frontend · **Next review:** 2027-04-15
**Scope:** the SPA views Orchestrator `/`, Explorer `/explorer`, Settings
`/settings`, Observability `/observability`, Docs `/docs/:slug?`, Task detail
`/tasks/:id`, Task review `/tasks/:id/review`, Retrospective `/retrospective`,
plus shared chrome (header, tabs, Now Playing bar, modals, toasts, tooltips).
The 2026-10-15 delta re-audit is recorded in the
[2026-10-15 register](./AUDIT-REGISTER-2026-10-15.md), which adds the
post-2026-09-20 UI delta (alias reliability cards, harness/model attribution,
cockpit widget refactor, shell rework) and re-verifies the full surface with
the restored canary view scans + AAA contrast walk.

The 2026-10-25 full-scope re-audit is recorded in the
[2026-10-25 register](./AUDIT-REGISTER-2026-10-25.md) and certified by
[WCAG_CERTIFICATE_2026-10-25.md](./WCAG_CERTIFICATE_2026-10-25.md); it
re-verifies every route and shared-chrome surface (no new findings,
no new exemptions).

## Position

- **WCAG 2.2 Level AA: conformant** across the audited scope.
- **WCAG 2.2 Level AAA: conformant except the documented exemptions below.**
  AAA criteria that do not apply (no prerecorded audio/video, no login
  challenges) are recorded N/A in the
  [audit register](./AUDIT-REGISTER-2026-09-20.md), not claimed.
- **WCAG 3.0: no conformance claim.** WCAG 3.0 is a working draft; the
  [audit register](./AUDIT-REGISTER-2026-09-20.md) records an alignment note
  per applicable draft outcome instead.

## What this means in practice

- Full keyboard operation: visible 2px accent focus ring (3px yellow in the
  high-contrast theme), skip link, no traps, dialogs trap + restore focus,
  drag/reorder/resize all have keyboard equivalents (Alt+arrows, arrow keys).
- Screen-reader support: per-view document titles, one `h1` per view, named
  landmarks, live regions for async status (saves, logs, telemetry) and a
  route announcer for SPA navigation.
- Motion: OS `prefers-reduced-motion` and the in-app Reduce Motion setting
  collapse animations/transitions to instant swaps.
- Text contrast: body and muted text hold 7:1 in every shipped theme
  (dark, light, midnight, high-contrast); terminal surfaces stay dark in all
  themes so severity text holds 7:1 (gated by `terminalContrast.test.js`), and
  the dark-anchored observability cockpit is gated by
  `observabilityContrast.test.js` + a live in-page AAA contrast walk in the
  canary suite.
- Status is never colour-only: health cards state their status in text next
  to the dot, and the cockpit's muted shades are machine-banned from the
  contrast-failing range (`uiTextConventions.test.js`).
- Dynamic project accents: only accents admitting a 7:1 text-on-accent
  foreground ship silently; mid-luminance customs raise a warning with a fix
  suggestion (gated by `accentTokens.test.js`).

## Exemptions (AAA)

| # | Criterion | Exemption | Owner | Review |
|---|-----------|-----------|-------|--------|
| 1 | 2.5.5 Target Size Enhanced (44×44) | Dense data controls (filter pills ≥32px, listbox options, table rows) hold the AA 24px minimum (2.5.8) but not 44px, to preserve information density. Primary actions, icon/close buttons, tabs, and dialog controls are 44px. | frontend | 2027-04-15 |
| 2 | 1.4.8 Visual Presentation | Themes + font-size setting cover colour/size choice; justified text is never used and body line-height ≥1.5 — but no 80-character line-length control is offered for long-form text. | frontend | 2027-04-15 |
| 3 | 3.1.5 Reading Level | User-facing copy is written plainly and reviewed per change (see contributor checklist); no automated grade-level gate is enforced. | frontend | 2027-04-15 |
| 4 | 2.4.13 Focus Appearance (custom accents) | The focus ring follows the project accent. With the default and all preset accents it exceeds 3:1 on every theme; a user-picked dark custom accent on a dark theme can reduce focus-ring contrast. The accent picker warns on mid-luminance values. | frontend | 2027-04-15 |

## Feedback

Accessibility issues in the app chrome above: file them with the view, the
barrier, and (for contrast) the active theme + accent — the regression gates
(`npm run lint`, `npm run test:frontend`) run on every change.
