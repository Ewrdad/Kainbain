# Frontend Accessibility Authoring Guide (WCAG 2.2 AAA + WCAG 3.0 ready)

The app targets **WCAG 2.2 Level AAA**. WCAG 3.0 work is pre-preparation only
(it is a working draft — never claim conformance). Follow these rules and the
gates below will stay green.

## 1. Contrast: use tokens, never raw hex for text

- Text pairs must hold **>= 7:1** (criterion 1.4.6). Every pair is locked by
  `src/theme/containerContrast.test.js` — run it after any palette edit.
- Mid-tone backgrounds can NEVER reach 7:1 with any text. The container
  tokens (`primary/secondary/tertiary-container` + `on-*-container`) therefore
  sit at the light/dark ends with opposing text. Do not "enrich" them back
  toward the middle.
- Component-identifying boundaries (input borders, control edges) need
  **>= 3:1** (1.4.11). `border-standard` meets this in every theme; do not
  drop input borders to a decorative grey.
- Never convey meaning by colour alone (1.4.1): pair every colour cue with an
  icon, label, or text (status dots have text labels; error copy names the
  field, not just its colour).
- Dark-anchored surfaces (the observability cockpit: `#0b0f17`, `#0a0e1a`,
  `#0f172a`, `bg-slate-800/900` chips) are NOT covered by the surface-theme
  gates. There, `text-slate-500` (3.7-4.2:1) and `text-slate-600` (2.4-2.7:1)
  fail 7:1, and `text-slate-400` fails on `#0f172a` (6.96:1). Use
  `text-slate-400` or lighter for muted text, and `text-slate-300` on
  `#0f172a`/`bg-slate-800`. Locked by
  `src/theme/observabilityContrast.test.js`; the shades are banned on the
  cockpit by `src/a11y/uiTextConventions.test.js`.

## 2. Focus: one shared indicator, no per-component hacks

- `:focus-visible` in `src/index.css` owns the indicator: 3px accent outline
  plus a dark separator halo, so it holds 3:1 on ANY adjacent colour (2.4.13).
  Do not add competing `focus:` rings that remove it.
- Initial focus on user action (dialog open, editor shown) is owned by
  `Modal.jsx` plus per-site effects. The `jsx-a11y/no-autofocus` lint rule
  stays `error` on shipped source — each remaining use carries a rationale.

## 3. Announcements, titles, motion: use the primitives

- `Announcer` / `RouteAnnouncer` (`src/a11y/Announce.jsx`): polite for status,
  assertive (`role="alert"`) for errors only (4.1.3).
- `useDocumentTitle` + `titleForView`: the App shell owns `document.title`;
  views must not set it themselves (2.4.2).
- `prefersReducedMotion()` / `scrollIntoViewRespectingMotion`: call before any
  JS-driven scroll or animation (2.3.3). CSS animations are already collapsed
  globally under `prefers-reduced-motion` and `[data-reduce-motion]`.
- Toasts pause their auto-dismiss timer on hover/focus and resume on leave
  (2.2.1/2.2.3). Do not add unpausable timed UI.

## 4. Pointer targets: 44px minimum, no exceptions by default

- Every button, link, input, option row, menuitem, and tab must be at least
  **44x44 CSS px** (2.5.8 AAA). New `min-h-[32/36/40px]` classes fail review.
- Inline text links inside sentences (e.g. "Refresh" inside a paragraph) are
  the only routine exception (the "inline" clause of 2.5.8).

## 5. Language: expand jargon through GlossaryTerm

- Wrap unusual words and abbreviations in `<GlossaryTerm term expansion
definition>` (`src/components/common/GlossaryTerm.jsx`) — it renders an
  `<abbr>` with a dotted underline and an accessible `title` (3.1.3 / 3.1.4).
  Still expand each term on first use in long prose; the component is the
  safety net, not a licence to skip that.
- Write UI copy in **normal case** and uppercase it visually with the
  `uppercase` CSS utility. Literal all-caps source strings are spelled
  letter-by-letter by some screen readers (VoiceOver's "spell out capital
  words"); `DASHBOARD CUSTOMIZATION MODE ACTIVE` becomes an alphabet recital.
  Short acronyms (<= 3 letters: `LLM`, `RAM`, `ID`) and bracketed log tags
  (`[AGENT]`) are read correctly and are allowed. Gated by
  `src/a11y/uiTextConventions.test.js` (text nodes and `label`/`title`/
  `placeholder` props).
- Inline abbreviations of technical values (harness/model ids) use `<abbr
title=…>` (as `RunAttributionBadge` does), so the expansion reaches
  assistive technology instead of living in a hover-only `title` on a span.

## 6. Forms and consequential actions

- Every input gets a visible `<label>` (3.3.2); errors name the field and
  suggest a fix (3.3.1/3.3.3); consequential actions (delete, deploy, merge)
  require confirmation or are reversible (3.3.4/3.3.6).
- Custom controls must expose name/role/value (4.1.2): assert with
  `assertAllNamed` / `assertDialogLabelled` / `assertLiveRegion` /
  `assertHeadingOrder` / `assertSectionHeadings` from `a11yTestHelpers.js`.

## Gates (all must pass)

- `npm run test:unit` — api + frontend vitest (incl. the contrast gate).
- `npm run lint` — zero `jsx-a11y` errors on shipped source.
- `canary-e2e/tests/accessibility.spec.js` — axe at `wcag22aaa` tags,
  runs on the auto-provisioned scratch stack, never live.
