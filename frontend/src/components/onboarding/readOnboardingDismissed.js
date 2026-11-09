/***
 * MARK: readOnboardingDismissed
 * @description Whether the user dismissed the onboarding checklist banner
 *   in a past session (`localStorage`, first-visit default false).
 *   Storage failures fall back to visible — a banner must never vanish
 *   from a storage error.
 * @example readOnboardingDismissed() => false
 * @returns {boolean} True when the banner stays hidden.
 ***/
export function readOnboardingDismissed() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('kainbain:onboardingDismissed') === 'true';
    }
  } catch {
    // Storage unavailable; the banner stays visible.
  }
  return false;
}
