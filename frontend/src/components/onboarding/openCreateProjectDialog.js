/***
 * MARK: OPEN_CREATE_PROJECT_EVENT
 * @description Window CustomEvent name the onboarding empty state
 *   dispatches to open the Header's "Create New Project" dialog. The
 *   dialog state lives in `Header` (rendered in `App.jsx`, outside the
 *   canvas tree), so the canvas cannot open it by props — same pattern
 *   as `MOBILE_TOOLBAR_COLLAPSE_EVENT`.
 * @example window.dispatchEvent(new window.CustomEvent(OPEN_CREATE_PROJECT_EVENT))
 ***/
export const OPEN_CREATE_PROJECT_EVENT = 'kainbain:open-create-project';

/***
 * MARK: openCreateProjectDialog
 * @description Asks the Header to open its "Create New Project" dialog
 *   via `OPEN_CREATE_PROJECT_EVENT`. No-op outside a browser window.
 * @example openCreateProjectDialog()
 ***/
export function openCreateProjectDialog() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new window.CustomEvent(OPEN_CREATE_PROJECT_EVENT));
}
