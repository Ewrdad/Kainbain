/***
 * MARK: writeOnboardingDismissed
 * @description Persists the checklist-banner dismissal. Failures are
 *   swallowed — dismissal is a preference, never load-bearing.
 * @example writeOnboardingDismissed()
 ***/
export function writeOnboardingDismissed() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('kainbain:onboardingDismissed', 'true');
    }
  } catch {
    // Storage unavailable; the banner simply reappears next visit.
  }
}
