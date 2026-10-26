/***
 * MARK: reducedMotion
 * @description Single choke point for motion sensitivity (WCAG 2.3.3 Animation
 * from Interactions, AAA 2.3.2 Three Flashes awareness). Honours BOTH the OS
 * media query and the in-app Reduce Motion preference (which sets
 * `data-reduce-motion="true"` on <html> — see applyPreferencesToDom).
 * Call this before any JS-driven smooth scroll or animation.
 */

/***
 * MARK: prefersReducedMotion
 * @description True when the user asked for reduced motion via OS or app pref.
 * @returns {boolean}
 ***/
export function prefersReducedMotion() {
  if (typeof document !== 'undefined') {
    if (document.documentElement?.getAttribute('data-reduce-motion') === 'true') return true;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch {
      // matchMedia without a layout engine (some test envs): ignore.
    }
  }
  return false;
}

/***
 * MARK: scrollIntoViewRespectingMotion
 * @description scrollIntoView that degrades `smooth` to `auto` for
 * motion-sensitive users. Drop-in replacement for direct scrollIntoView calls.
 * @param {Element} el
 * @param {ScrollIntoViewOptions} [options]
 ***/
export function scrollIntoViewRespectingMotion(el, options = {}) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  if (prefersReducedMotion()) {
    el.scrollIntoView({ ...options, behavior: 'auto' });
    return;
  }
  el.scrollIntoView(options);
}
