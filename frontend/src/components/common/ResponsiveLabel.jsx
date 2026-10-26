import React from 'react';

/***
 * MARK: ResponsiveLabel
 * @description Presentational helper for space-constrained action strips: shows
 *   the full wording at the `sm` breakpoint and wider, and a shorter `compact`
 *   wording below `sm`. The unused variant is `display:none`, so it drops out of
 *   the accessibility tree and out of hit-testing; only the visible wording is
 *   announced by a user agent that ignores CSS-invisible text.
 *
 *   The DOM intentionally contains both strings, so a control that needs a
 *   viewport-independent accessible name (screen readers, role queries, voice
 *   control) must set an explicit `aria-label` on itself. `ProjectExplorer`'s
 *   viewer toolbar does exactly that, and WCAG 2.5.3 (Label in Name) is kept by
 *   choosing an accessible name that contains both visible variants.
 *
 * Fails safe: with no CSS (or before Tailwind loads) both strings render, which
 * is verbose but never hides an action. If `compact` is omitted the full label
 * is reused below `sm`, so a control can never end up visually unlabelled.
 * @param {Object} props
 * @param {React.ReactNode} props.full - Wording shown at `sm` and wider.
 * @param {React.ReactNode} [props.compact] - Wording shown below `sm`; defaults
 *   to `full` when omitted.
 * @example <ResponsiveLabel full="Copy Content" compact="Content" />
 ***/
export function ResponsiveLabel({ full, compact }) {
  const compactLabel = compact ?? full;
  return (
    <>
      <span className="hidden sm:inline">{full}</span>
      <span className="sm:hidden">{compactLabel}</span>
    </>
  );
}

export default ResponsiveLabel;
