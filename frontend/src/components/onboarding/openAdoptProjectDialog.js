/***
 * MARK: OPEN_ADOPT_PROJECT_EVENT
 * @description Window CustomEvent name the onboarding empty state
 *   dispatches to open the Header's "Add Existing Project" (adopt)
 *   dialog, for users with a local checkout and no git remote yet.
 * @example window.dispatchEvent(new window.CustomEvent(OPEN_ADOPT_PROJECT_EVENT))
 ***/
export const OPEN_ADOPT_PROJECT_EVENT = 'kainbain:open-adopt-project';

/***
 * MARK: openAdoptProjectDialog
 * @description Asks the Header to open its "Add Existing Project" dialog
 *   via `OPEN_ADOPT_PROJECT_EVENT`. No-op outside a browser window.
 * @example openAdoptProjectDialog()
 ***/
export function openAdoptProjectDialog() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new window.CustomEvent(OPEN_ADOPT_PROJECT_EVENT));
}
