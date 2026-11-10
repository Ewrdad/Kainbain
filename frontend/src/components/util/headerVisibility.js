/***
 * MARK: shouldShowGlobalHeader
 * @description Decides whether the global KainBain application header (brand,
 * project selector, orchestrator tabs) is shown for a given
 * app view. Two views render their own full-bleed chrome and hide it to avoid
 * a confusing double header: the monitoring (observability) view, whose
 * telemetry header tracks the application as a whole, and the standalone
 * System Settings screen (`system-settings`), which owns an h1 title plus a
 * back/close affordance — including inside its popout window. Every other view
 * keeps the global header.
 * @example shouldShowGlobalHeader('observability') => false
 * @example shouldShowGlobalHeader('system-settings') => false
 * @example shouldShowGlobalHeader('orchestrator') => true
 * @param {string} view - The active app view (e.g. 'orchestrator', 'observability').
 * @returns {boolean} False for the monitor, system-settings, and task-detail views, true otherwise.
 ***/
export function shouldShowGlobalHeader(view) {
  // Hide the global header for full-screen views where a dedicated header is already present.
  // This includes the observability monitor and system settings, as well as the task detail view,
  // which renders its own top bar and does not need the global navigation bar.
  return view !== 'observability' && view !== 'system-settings' && view !== 'task-detail';
}
