import React from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router';
import { useKainBain } from '../../context/KainBainContext';
import { SystemSettingsContent } from './SystemSettingsContent';
import { SETTINGS_TABS } from './settingsTabs';
import { SYSTEM_SETTINGS_POPOUT_NAME } from './openSystemSettings';

const VALID_SECTION_IDS = new Set(SETTINGS_TABS.map((tab) => tab.id));

// Bookmarks and deep links from before the Runner settings replaced the
// legacy harness tab: the old `harness` section (and the singular
// `runner`) lands on the Runners tab instead of silently falling back,
// so a saved link keeps pointing at the screen it meant.
const LEGACY_SECTION_ALIASES = new Map([
  ['harness', 'runners'],
  ['runner', 'runners'],
]);

export const DEFAULT_SYSTEM_SETTINGS_SECTION = SETTINGS_TABS[0].id;

/***
 * MARK: SystemSettingsPage
 * @description Dedicated full-screen page for application-level System Settings
 * (`/system-settings` and `/system-settings/:section`). Renders SystemSettingsContent
 * with full-screen page chrome (back/close affordance, h1 title, and URL-driven
 * tab state for deep-linking and refresh persistence).
 * Distinct from project-scoped ProjectSettings (`/settings`): this screen is
 * application/platform scope, that one is per-project scope.
 * @example <SystemSettingsPage />
 ***/
export function SystemSettingsPage() {
  const { section } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setView } = useKainBain();

  // URL-driven tab state: route param /system-settings/:section wins, falling
  // back to ?section= query param, defaulting to the first tab. Unknown ids
  // fail safe to the first tab without rewriting the URL, so a typo'd deep
  // link still lands somewhere usable.
  const requestedSection = section || searchParams.get('section') || undefined;
  const aliasedSection =
    requestedSection && LEGACY_SECTION_ALIASES.has(requestedSection)
      ? LEGACY_SECTION_ALIASES.get(requestedSection)
      : requestedSection;
  const effectiveSection =
    aliasedSection && VALID_SECTION_IDS.has(aliasedSection)
      ? aliasedSection
      : DEFAULT_SYSTEM_SETTINGS_SECTION;

  const handleSectionChange = (sectionId) => {
    navigate(`/system-settings/${encodeURIComponent(sectionId)}`);
  };

  // True when this document is the popped-out settings window rather than the
  // main app tab: the primary affordance then closes the window instead of
  // navigating the shared history away from the board.
  const isPopout =
    typeof window !== 'undefined' &&
    Boolean(window.opener) &&
    window.name === SYSTEM_SETTINGS_POPOUT_NAME;

  const handleBack = () => {
    if (isPopout) {
      try {
        window.close();
        return;
      } catch {
        // window.close() can be refused (not script-opened); fall through.
      }
    }
    setView('orchestrator');
  };

  return (
    <article
      aria-label="System Settings"
      data-testid="system-settings-page"
      className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-surface-deep"
    >
      <SystemSettingsContent
        activeSection={effectiveSection}
        onSectionChange={handleSectionChange}
        onBack={handleBack}
        backLabel={isPopout ? 'Close window' : 'Back to Board'}
        headingLevel="h1"
      />
    </article>
  );
}

export default SystemSettingsPage;
