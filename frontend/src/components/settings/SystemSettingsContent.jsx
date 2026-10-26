import React, { useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { Icon } from '../Icon';
import { FALLBACK_MODELS } from '../stageTypes';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { useModelRefreshSetting } from '../../hooks/useModelRefreshSetting';
import { HarnessSection } from './HarnessSection';
import { RunnersSection } from './RunnersSection';
import { StorageSection } from './StorageSection';
import { PushNotificationsSection } from './PushNotificationsSection';
import { PromptLayoutSection } from './PromptLayoutSection';
import { UiPreferencesPanel } from './UiPreferencesPanel';
import { MODEL_REFRESH_CONFIG_KEY } from './modelRefreshFlag';
import { SETTINGS_TABS, isFooterResetVisible } from './settingsTabs';

export const SYSTEM_SETTINGS_SECTIONS = SETTINGS_TABS.map(({ id, label }) => ({ id, label }));

export const DEFAULT_SYSTEM_SETTINGS_DRAFT = {
  defaultHarness: 'pi',
  stageTimeoutSecs: 600,
  allowPermissionBypass: false,
  defaultModel: '',
  fallbackModel: '',
  maxConcurrentTasks: 1,
  autoAdvanceStages: true,
  startComputeOnBoot: false,
};

/***
 * MARK: SettingRow
 * @description Label + control row used by the System Settings wireframe.
 * @example <SettingRow label="Default harness" hint="..."><select /></SettingRow>
 ***/
export function SettingRow({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-border-standard last:border-b-0">
      <span className="text-xs font-bold text-on-surface">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </div>
  );
}

/***
 * MARK: SystemSettingsContent
 * @description Route- and shell-agnostic System Settings content component.
 * Renders header, tablist, all section panels (Harness, Models, Engine, Storage,
 * Notifications, Prompt Layout, UI), and footer actions. Rendered by the
 * standalone SystemSettingsPage screen (`/system-settings`); it takes no
 * modal state and never renders a dialog shell.
 * @param {Object} props
 * @param {string} [props.activeSection] - Controlled active tab id (e.g. from route).
 * @param {Function} [props.onSectionChange] - Callback when tab changes: (sectionId) => void.
 * @param {Function} [props.onClose] - Close callback (close button and Done button). The page leaves this unset and navigates via onBack instead.
 * @param {Function} [props.onBack] - Back callback (page back button and Done button fallback).
 * @param {string} [props.backLabel='Back to Board'] - Visible/accessible label for the back affordance. The page swaps it to "Close window" inside a popout.
 * @param {'h1'|'h2'} [props.headingLevel='h2'] - Level for the "System Settings" title.
 ***/
export function SystemSettingsContent({
  activeSection: controlledSection,
  onSectionChange,
  onClose,
  onBack,
  backLabel = 'Back to Board',
  headingLevel = 'h2',
}) {
  const { harnessPrefs, updateHarnessPref, resetHarnessPrefs } = useKainBain();

  const [internalActiveSection, setInternalActiveSection] = useState('harness');
  const activeSection = controlledSection ?? internalActiveSection;

  const setActiveSection = (sectionId) => {
    setInternalActiveSection(sectionId);
    onSectionChange?.(sectionId);
  };

  const [draft, setDraft] = useState(DEFAULT_SYSTEM_SETTINGS_DRAFT);

  // Live config gate and shared model catalogue hooks are enabled whenever this
  // content component is mounted.
  const { runtimeValue: modelRefreshRuntimeValue, enabled: modelRefreshEnabled } =
    useModelRefreshSetting(true);
  const {
    models,
    harnesses,
    refreshing: modelsRefreshing,
    refresh: refreshModels,
  } = useModelCatalog(FALLBACK_MODELS, { enabled: true });

  const [storageResetKey, setStorageResetKey] = useState(0);

  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const resetDraft = () => {
    setDraft(DEFAULT_SYSTEM_SETTINGS_DRAFT);
    setStorageResetKey((prev) => prev + 1);
  };

  const handleDone = () => {
    if (onClose) {
      onClose();
    } else if (onBack) {
      onBack();
    }
  };

  // Fail-safe section resolution: an unknown id falls back to the first tab.
  const effectiveSection = SYSTEM_SETTINGS_SECTIONS.some((section) => section.id === activeSection)
    ? activeSection
    : SYSTEM_SETTINGS_SECTIONS[0].id;

  const isDraftOnlySection = effectiveSection === 'models' || effectiveSection === 'engine';

  const showReset = isFooterResetVisible(effectiveSection);

  const inputClass =
    'w-full max-w-sm p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors';
  const toggleClass = 'flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface';

  const HeadingTag = headingLevel === 'h1' ? 'h1' : 'h2';

  return (
    <>
      <header className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-border-standard bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="px-3 py-1.5 min-h-[44px] bg-surface hover:bg-surface-container-high border border-border-standard rounded text-xs font-mono font-bold uppercase text-on-surface hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <span>←</span>
              <span>{backLabel}</span>
            </button>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-primary text-base select-none" aria-hidden="true">
              ⚙️
            </span>
            <HeadingTag
              id="system-settings-title"
              className="text-xs sm:text-sm font-bold uppercase tracking-wider text-on-surface font-label-caps truncate"
            >
              System Settings
            </HeadingTag>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 min-h-[44px] min-w-[44px] hover:bg-surface-container-high rounded text-text-muted hover:text-on-surface transition-colors flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Close system settings"
          >
            <Icon name="close" />
          </button>
        )}
      </header>

      {/* shrink-0 invariant: bar never shrinks, the details pane scrolls */}
      <div
        role="tablist"
        aria-label="System settings sections"
        className="flex gap-1 px-4 sm:px-6 pt-3 bg-surface border-b border-border-standard overflow-x-auto shrink-0"
      >
        {SYSTEM_SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={effectiveSection === section.id}
            onClick={() => setActiveSection(section.id)}
            className={`px-3 py-2 min-h-[44px] text-xs font-bold uppercase tracking-wider rounded-t-sm transition-colors cursor-pointer whitespace-nowrap ${
              effectiveSection === section.id
                ? 'text-primary border-b-2 border-primary bg-surface-container-high'
                : 'text-text-muted hover:text-on-surface'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-2 custom-scrollbar bg-surface-deep">
        {isDraftOnlySection && (
          <p
            id="system-settings-wireframe-note"
            className="mt-3 px-3 py-2 text-[11px] font-mono text-text-muted bg-surface-container-high border border-border-standard rounded-sm"
          >
            Wireframe — changes here are not saved yet. Backend persistence lands in a later stage.
          </p>
        )}

        {effectiveSection === 'harness' && (
          <div role="tabpanel" aria-label="Harness settings">
            <HarnessSection
              draft={draft}
              update={update}
              inputClass={inputClass}
              toggleClass={toggleClass}
              prefs={harnessPrefs}
              updatePref={updateHarnessPref}
              resetPrefs={resetHarnessPrefs}
              onModelsRefresh={refreshModels}
              modelsRefreshing={modelsRefreshing}
              modelRefreshRuntimeValue={modelRefreshRuntimeValue}
            />
            <RunnersSection />
          </div>
        )}

        {effectiveSection === 'models' && (
          <div role="tabpanel" aria-label="Model settings">
            <div
              data-testid="model-catalogue"
              className="flex flex-col gap-2 py-3 border-b border-border-standard"
            >
              <span className="text-xs font-bold text-on-surface">Discovered models</span>
              <p data-testid="model-catalogue-count" className="text-[11px] text-text-muted">
                {models.length} models across {harnesses.length} harnesses in the shared catalogue.
              </p>
              {modelRefreshEnabled && (
                <button
                  type="button"
                  onClick={() => void refreshModels()}
                  disabled={modelsRefreshing}
                  className="self-start px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:cursor-default"
                >
                  {modelsRefreshing ? 'Refreshing…' : 'Refresh models'}
                </button>
              )}
              {!modelRefreshEnabled && (
                <p
                  data-testid="model-refresh-disabled-note"
                  className="text-[11px] text-text-muted"
                >
                  Model refresh is disabled by the {MODEL_REFRESH_CONFIG_KEY} setting.
                </p>
              )}
            </div>
            <SettingRow
              label="Default model"
              hint="Model reference for new stages, e.g. harness::provider::id."
            >
              <input
                type="text"
                aria-label="Default model"
                placeholder="e.g. pi::ollama-cloud::glm-5.3-flash"
                value={draft.defaultModel}
                onChange={(e) => update('defaultModel', e.target.value)}
                className={inputClass}
              />
            </SettingRow>
            <SettingRow label="Fallback model" hint="Used when the default model is unavailable.">
              <input
                type="text"
                aria-label="Fallback model"
                placeholder="e.g. pi::ollama-cloud::glm-4.6"
                value={draft.fallbackModel}
                onChange={(e) => update('fallbackModel', e.target.value)}
                className={inputClass}
              />
            </SettingRow>
          </div>
        )}

        {effectiveSection === 'engine' && (
          <div role="tabpanel" aria-label="Engine settings">
            <SettingRow
              label="Max concurrent tasks"
              hint="How many tasks the compute engine may run at once."
            >
              <input
                type="number"
                aria-label="Max concurrent tasks"
                min={1}
                max={16}
                value={draft.maxConcurrentTasks}
                onChange={(e) => update('maxConcurrentTasks', Number(e.target.value))}
                className={inputClass}
              />
            </SettingRow>
            <SettingRow label="Stage flow" hint="Advance stages automatically when gates pass.">
              <label className={toggleClass}>
                <input
                  type="checkbox"
                  checked={draft.autoAdvanceStages}
                  onChange={(e) => update('autoAdvanceStages', e.target.checked)}
                  className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                />
                <span>Auto-advance stages</span>
              </label>
            </SettingRow>
            <SettingRow label="Boot behaviour" hint="Start the compute engine when the app boots.">
              <label className={toggleClass}>
                <input
                  type="checkbox"
                  checked={draft.startComputeOnBoot}
                  onChange={(e) => update('startComputeOnBoot', e.target.checked)}
                  className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                />
                <span>Start compute on boot</span>
              </label>
            </SettingRow>
          </div>
        )}

        {effectiveSection === 'storage' && (
          <div role="tabpanel" aria-label="Storage settings">
            <StorageSection key={storageResetKey} />
          </div>
        )}

        {effectiveSection === 'notifications' && (
          <div role="tabpanel" aria-label="Notification settings">
            <PushNotificationsSection />
          </div>
        )}

        {effectiveSection === 'prompt-layout' && (
          <div role="tabpanel" aria-label="Prompt Layout settings">
            <PromptLayoutSection />
          </div>
        )}

        {effectiveSection === 'ui' && (
          <div role="tabpanel" aria-label="UI settings">
            <UiPreferencesPanel onOpenPushNotifications={() => setActiveSection('notifications')} />
          </div>
        )}
      </div>

      <footer className="px-4 sm:px-6 py-3 border-t border-border-standard bg-surface flex justify-between items-center gap-2 shrink-0">
        {showReset ? (
          <button
            type="button"
            onClick={resetDraft}
            className="px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
          >
            Reset
          </button>
        ) : (
          <span className="text-[11px] text-text-muted">
            Changes save automatically in this section.
          </span>
        )}
        <button
          type="button"
          onClick={handleDone}
          className="px-6 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 cursor-pointer"
        >
          Done
        </button>
      </footer>
    </>
  );
}
