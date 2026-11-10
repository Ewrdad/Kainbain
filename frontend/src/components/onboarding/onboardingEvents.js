// Single entry point for the onboarding dialog events. Each opener lives
// in its own file next to this one (one function per file); this module
// only re-exports them so existing importers keep working unchanged.
export { OPEN_CREATE_PROJECT_EVENT, openCreateProjectDialog } from './openCreateProjectDialog.js';
export { OPEN_ADOPT_PROJECT_EVENT, openAdoptProjectDialog } from './openAdoptProjectDialog.js';
