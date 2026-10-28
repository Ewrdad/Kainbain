/***
 * MARK: System settings tabs
 * @description Single source of truth for the System Settings section tabs:
 *   id, label, and whether the settings footer's Reset control applies. The
 *   Notifications and UI panels persist immediately through their own
 *   controls (each with its own reset), so the footer Reset — which only
 *   restores the settings draft (+ Storage remount) — would be a misleading
 *   no-op there and is hidden. Every consumer (the SystemSettingsPage screen,
 *   SystemSettingsContent, unit tests, and the canary tab-bar suite) derives
 *   from this list so a new tab can never drift the expectations again.
 * @example SETTINGS_TABS.find((t) => t.id === 'ui') => { id: 'ui', label: 'UI', showFooterReset: false }
 ***/

export const SETTINGS_TABS = [
  { id: 'harness', label: 'Harness', showFooterReset: true },
  { id: 'models', label: 'Models', showFooterReset: true },
  { id: 'engine', label: 'Engine', showFooterReset: true },
  { id: 'storage', label: 'Storage', showFooterReset: true },
  { id: 'notifications', label: 'Notifications', showFooterReset: false },
  { id: 'prompt-layout', label: 'Prompt Layout', showFooterReset: false },
  { id: 'ui', label: 'UI', showFooterReset: false },
];

/***
 * MARK: SETTINGS_TAB_LABELS
 * @description Ordered tab labels derived from SETTINGS_TABS (render order).
 * @example SETTINGS_TAB_LABELS => ['Harness', 'Models', 'Engine', 'Storage', 'Notifications', 'UI']
 ***/
export const SETTINGS_TAB_LABELS = SETTINGS_TABS.map((tab) => tab.label);

/***
 * MARK: isFooterResetVisible
 * @description Whether the settings footer Reset applies to a section id.
 *   Unknown ids fail open (true) so a future tab without metadata keeps the
 *   legacy behaviour instead of silently losing its reset.
 * @example isFooterResetVisible('ui') => false
 * @param {string} sectionId - Active section id.
 * @returns {boolean} True when the footer Reset should render.
 ***/
export function isFooterResetVisible(sectionId) {
  if (typeof sectionId !== 'string' || !sectionId) return true;
  const tab = SETTINGS_TABS.find((entry) => entry.id === sectionId);
  if (!tab) return true;
  return tab.showFooterReset !== false;
}
