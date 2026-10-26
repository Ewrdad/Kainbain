# Accessibility contributor checklist

For every frontend change. The gates (`npm run lint`, `npm run test:frontend`)
enforce the starred items; the rest is reviewer duty.

## Interactive elements

- [ ] Every button/input/select/textarea has an accessible name that contains
  its visible label (WCAG 2.5.3). Icon-only buttons get `aria-label`. (*)
- [ ] Clickable `div`/`span`? Use a native `<button>` instead (WCAG 4.1.2).
  If it must stay non-native (drag source, separator), add role + keyboard
  handling + a scoped `eslint-disable` with a WCAG rationale. (*)
- [ ] Primary actions, icon buttons, tab bars, and dialog controls: 44×44px
  minimum (`min-h-[44px] min-w-[44px]`). Dense list/table controls may use the
  24px AA minimum — that invokes exemption #1, so say so in the PR.
- [ ] Never use `autoFocus` (lint error). For user-initiated disclosures use
  `useFocusOnMount`; never steal focus on page load. (*)

## Dialogs, tooltips, announcements

- [ ] New dialogs go through the shared `Modal` primitive with `labelledBy`
  pointing at a visible heading (WCAG 1.3.1/4.1.2). (* via dialog tests)
- [ ] Non-modal help popovers use `role="tooltip"`; `role="dialog"` is for
  the pinned/interactive mode only.
- [ ] Async status (saves, errors, stream flips) announces via a live region
  (`LiveRegion`, `role="status"`/`alert`/`log`) — never by silent text swap.
- [ ] Status/health indicators never rely on colour alone: icon + text.

## Colour and themes

- [ ] New fixed text/background hex pairs must hold **7:1**; UI boundaries
  and focus indicators **3:1**. Check all four themes (dark, light,
  midnight, high-contrast) — the light theme flips surface/text tokens.
- [ ] Dark-anchored surfaces (observability cockpit, `bg-slate-800/900`
  chips) are outside the theme gates: there `text-slate-500/600` fail 7:1
  and `text-slate-400` fails on `#0f172a`. Use `text-slate-400`+ (300 on
  `#0f172a`/`bg-slate-800`). Gate: `uiTextConventions.test.js` +
  `observabilityContrast.test.js`. (*)
- [ ] Terminal-like surfaces (dark bg + pastel text): add `terminal-dark` to
  the container so the light theme cannot invert it (WCAG 1.4.3/1.4.6).
  Covered by `terminalContrast.test.js` — extend its samples if you add a
  severity colour.
- [ ] New project-accent usage: foreground must come from `--accent-on`
  (contrast-safe by construction). Adding an accent preset? Add it to the
  `accentTokens.test.js` matrix.

## Structure and motion

- [ ] One `h1` per view; view titles via `useViewTitle`; landmarks named
  (`aria-label` on banner/nav/region) so AT users can tell them apart.
- [ ] Never render a second `<main>`: the app shell owns the single
  `#main-content` main landmark. Views use a labelled `<section>`/`<div>`.
  Gate: `landmarkStructure.test.js`. (*)
- [ ] Scrollable panel/widget bodies need keyboard access: `tabIndex={0}` +
  `role="group"`/`region`/`log` + `aria-label` (and a scoped
  `jsx-a11y/no-noninteractive-tabindex` disable with the WCAG 2.1.1 reason).
- [ ] No new `tabIndex` on non-interactive elements except labelled scroll
  regions (`tabIndex={0}` + `role="region"`/`log` + `aria-label`). (*)
- [ ] Animations respect `prefers-reduced-motion` (the CSS blanket covers
  pure CSS; JS-driven motion must check the media query or the Reduce Motion
  setting).
- [ ] Copy is plain language; tooltips/docs explain jargon on first use.
- [ ] Copy is written in normal case; shout with the `uppercase` CSS class.
  Literal all-caps is spelled out by some screen readers. Gate:
  `uiTextConventions.test.js`. (*)

## Tests to add with the change

- [ ] New view? Assert its `h1`, its document title, and its announcer text
  (see `a11y.test.jsx` + `a11yAssertions.js` helpers).
- [ ] New dialog? Assert `expectDialogLabelled` + focus trap entry/restore.
- [ ] New colours? Extend the contrast matrix, not a screenshot.
