import { useCallback, useEffect, useRef, useState } from 'react';

/***
 * MARK: mobile toolbar collapse constants
 * @description Scroll thresholds and breakpoints for the phone-only
 *   auto-collapsing toolbar (survey Q4/Q7). Desktop viewports
 *   (`>= DESKTOP_MIN_WIDTH`) never collapse — the hook fails safe there.
 ***/
export const MOBILE_TOOLBAR_BREAKPOINT = 768;
export const COLLAPSE_SCROLL_TOP = 40;
export const COLLAPSE_DELTA_DOWN = 24;
export const EXPAND_DELTA_UP = 16;
export const EXPAND_NEAR_TOP = 10;

/***
 * MARK: MOBILE_TOOLBAR_COLLAPSE_EVENT
 * @description Window CustomEvent name carrying `{ collapsed: boolean }` in
 *   `detail`. `WorkflowCanvas` dispatches it when the toolbar collapse state
 *   flips so the sibling `Header` (rendered in `App.jsx`, outside the canvas
 *   tree) can collapse its secondary tab row in sync without prop drilling.
 ***/
export const MOBILE_TOOLBAR_COLLAPSE_EVENT = 'kainbain:mobile-toolbar-collapse';

/***
 * MARK: isDesktopViewport
 * @description Width guard for the collapse behavior. A missing `window`
 *   (SSR/tests) or a wide viewport means "desktop": never collapse.
 * @example isDesktopViewport() => false // on 390px mobile viewport
 ***/
function isDesktopViewport() {
  return (
    typeof window === 'undefined' ||
    typeof window.innerWidth !== 'number' ||
    !Number.isFinite(window.innerWidth) ||
    window.innerWidth >= MOBILE_TOOLBAR_BREAKPOINT
  );
}

/***
 * MARK: resolveScrollTop
 * @description Normalizes the `handleScroll` argument: either a raw scrollTop
 *   number (tests, programmatic callers) or a React/DOM scroll event whose
 *   scrolled element is `currentTarget` (preferred) or `target`. Negative
 *   scroll positions (such as iOS Safari rubber-band/bounce overscroll) are
 *   clamped to 0 so bounce rebounds do not trigger false scroll-down collapse.
 * @example resolveScrollTop(150) => 150
 * @example resolveScrollTop({ currentTarget: { scrollTop: -15 } }) => 0
 * @example resolveScrollTop(null) => null
 ***/
function resolveScrollTop(source) {
  if (typeof source === 'number' && Number.isFinite(source)) {
    return Math.max(0, source);
  }
  const el = source?.currentTarget ?? source?.target;
  const top = el?.scrollTop;
  return typeof top === 'number' && Number.isFinite(top) ? Math.max(0, top) : null;
}

/***
 * MARK: useMobileToolbarCollapse
 * @description Phone-only auto-collapse state for the pipeline board chrome.
 *   The page itself never scrolls (`100dvh overflow-hidden` shell) — only the
 *   active `StageColumn` card list scrolls — so the canvas feeds that list's
 *   `onScroll` into `handleScroll`. Scrolling down past the threshold
 *   collapses the secondary controls (pipeline selector, card order toggle,
 *   header tab row); the compact search input and stage tabs stay pinned.
 *   Scrolling up, reaching the top, tapping the expand affordance, or moving
 *   keyboard focus into the collapsed region re-expands.
 *
 *   Accessibility contract: `isCollapsed` drives `aria-expanded` on the
 *   toolbar region; consumers must auto-expand on `onFocusCapture` so Tab
 *   users never get trapped behind a collapsed row (WCAG 2.1.1). Visual
 *   bounds stay compact on phones while every control keeps its 44px tap
 *   target; consumers must switch transitions off when
 *   `prefersReducedMotion` is true (WCAG 2.3.3).
 *
 *   Failure contract (how this hook can fail — and why it fails safe):
 *   - SSR / missing window: behaves as desktop (isCollapsed remains false).
 *   - Invalid or non-finite scroll inputs: safely ignored, state unaffected.
 *   - Negative scroll offsets (iOS bounce): clamped to 0, preventing false collapses.
 *   - Viewport resizing/rotation past 768px: automatically resets isCollapsed to false.
 *   - matchMedia missing or throwing: defaults safely to prefersReducedMotion = false.
 * @example const { isCollapsed, handleScroll, expand } = useMobileToolbarCollapse();
 ***/
export function useMobileToolbarCollapse() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  // Lazily read so no setState runs inside an effect (lint: cascading
  // renders); the subscription below only mirrors later OS changes.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
      }
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
      return false;
    }
  });

  // Reduced-motion preference: transitions become instant when set.
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return undefined;
      }
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      const onChange = (event) => setPrefersReducedMotion(event.matches === true);
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
      }
      if (typeof query.addListener === 'function') {
        query.addListener(onChange);
        return () => query.removeListener(onChange);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }, []);

  // Rotating a phone to landscape (or resizing past the breakpoint) while
  // collapsed must restore the full desktop toolbar, never a stuck collapse.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return undefined;
    }
    const onResize = () => {
      if (isDesktopViewport()) {
        lastScrollY.current = 0;
        setIsCollapsed(false);
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const collapse = useCallback(() => {
    if (isDesktopViewport()) return;
    lastScrollY.current = 0;
    setIsCollapsed(true);
  }, []);

  const expand = useCallback(() => {
    lastScrollY.current = 0;
    setIsCollapsed(false);
  }, []);

  const handleScroll = useCallback(
    (source) => {
      // Desktop viewports never collapse, even if a nested list scrolls.
      if (isDesktopViewport()) {
        if (isCollapsed) setIsCollapsed(false);
        lastScrollY.current = 0;
        return;
      }
      const scrollTop = resolveScrollTop(source);
      if (scrollTop === null) return;
      const previous = lastScrollY.current;
      lastScrollY.current = scrollTop;
      // At (or near) the top the full toolbar is always shown.
      if (scrollTop <= EXPAND_NEAR_TOP) {
        if (isCollapsed) setIsCollapsed(false);
        return;
      }
      if (!isCollapsed && scrollTop > COLLAPSE_SCROLL_TOP && scrollTop - previous > COLLAPSE_DELTA_DOWN) {
        setIsCollapsed(true);
        return;
      }
      if (isCollapsed && previous - scrollTop > EXPAND_DELTA_UP) {
        setIsCollapsed(false);
      }
    },
    [isCollapsed],
  );

  return {
    isCollapsed,
    setIsCollapsed,
    handleScroll,
    expand,
    collapse,
    prefersReducedMotion,
  };
}

export default useMobileToolbarCollapse;
