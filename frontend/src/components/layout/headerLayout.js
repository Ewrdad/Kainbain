/***
 * MARK: header breakpoints
 * @description Single source of truth for the global header's responsive
 *   thresholds, in CSS pixels. The values mirror Tailwind classes that must
 *   stay static strings (sm/md/xl/2xl) in Header.jsx / TabNavigator.jsx /
 *   GoToAppLink.jsx — change both sides together. The canary guard in
 *   canary-e2e/tests/header-responsive.spec.js exercises the visible result,
 *   because jsdom cannot measure overlap.
 * @example HEADER_BREAKPOINTS.XL => 1280
 ***/
export const HEADER_BREAKPOINTS = Object.freeze({
  /** Below this the header stacks into Row A + scrollable Row B. */
  SM: 640,
  /** At this the git remote icon joins the strip. */
  MD: 768,
  /** At this labels, the PROJECT label, and the build badge appear. */
  XL: 1280,
  /** At this the crowded row (with an app link) fits again. */
  XXL: 1536,
});

/***
 * MARK: getHeaderLayout
 * @description Decides how the global header arranges itself for a given
 *   viewport width and project features. Pure and DOM-free so the layout
 *   contract is unit tested without a browser; the visible result is
 *   additionally guarded in canary-e2e/tests/header-responsive.spec.js
 *   (jsdom cannot measure overlap). Thresholds come from HEADER_BREAKPOINTS —
 *   change the Tailwind classes in Header.jsx / TabNavigator.jsx /
 *   GoToAppLink.jsx together with them.
 *
 *   Failure mode: an unknown or invalid width (undefined, NaN, negative,
 *   non-numeric) returns the stacked mobile layout. That layout scrolls
 *   internally instead of overlapping, so it is the safe degradation — the
 *   header never overlaps controls because its width could not be read.
 * @example getHeaderLayout(375, { hasAppLink: true }).stacked => true
 * @param {number} width - Viewport width in CSS pixels.
 * @param {{ hasAppLink?: boolean, hasUpstreamRepo?: boolean }} [features]
 * @returns {{ stacked: boolean, showLabels: boolean, showProjectLabel: boolean,
 *   showGitRemoteIcon: boolean, showGitRemoteLabel: boolean, showBuildBadge: boolean }}
 ***/
export function getHeaderLayout(width, features = {}) {
  const { SM, MD, XL, XXL } = HEADER_BREAKPOINTS;
  const safeFeatures = features !== null && typeof features === 'object' ? features : {};
  const { hasAppLink = false, hasUpstreamRepo = false } = safeFeatures;
  const px = typeof width === 'string' && width.trim() !== '' ? Number(width) : width;
  // Fail safe: without a trustworthy width the header stacks, which scrolls
  // instead of overlapping. Never throw for caller-provided values.
  if (typeof px !== 'number' || !Number.isFinite(px) || px < 0) {
    return {
      stacked: true,
      showLabels: false,
      showProjectLabel: false,
      showGitRemoteIcon: false,
      showGitRemoteLabel: false,
      showBuildBadge: false,
    };
  }
  // Below sm (640) the header stacks: Row A holds brand + project + pinned
  // controls, Row B holds the tab strip + app link and scrolls internally.
  const stacked = px < SM;
  // The expanded header (wordmark, PROJECT label, tab labels, labeled app
  // link) needs ~1061px, which even lg (1024) cannot hold — the canary guard
  // caught Retrospective ∩ monitor there. Labels wait for xl (1280).
  const showLabels = px >= XL;
  // The git remote icon joins the strip at md (768); its text label waits
  // for xl (1280), where the full 1061px layout fits.
  const showGitRemoteIcon = Boolean(hasUpstreamRepo) && px >= MD;
  const showGitRemoteLabel = Boolean(hasUpstreamRepo) && px >= XL;
  // The app link (~180px labeled) is the widest optional control: below 2xl
  // the xl row reserves room for it by deferring the PROJECT label and the
  // passive build badge (the canary guard measured the full row at ~1333px,
  // which 1280 cannot hold). The app link itself always stays inline — Row B
  // scrolls on phones instead of moving it into a menu.
  const roomy = px >= XXL || !hasAppLink;
  const showProjectLabel = px >= XL && roomy;
  // The passive build badge is wide-desktop furniture for the same reason.
  const showBuildBadge = px >= XL && roomy;
  return {
    stacked,
    showLabels,
    showProjectLabel,
    showGitRemoteIcon,
    showGitRemoteLabel,
    showBuildBadge,
  };
}
