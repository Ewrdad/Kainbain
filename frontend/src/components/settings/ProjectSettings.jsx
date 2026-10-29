import { useEffect, useRef, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { SkillsSection } from './SkillsSection';
import { SelectDropdown } from '../common/SelectDropdown';
import { ProjectSettingsForm } from './ProjectSettingsForm';
import { WorkflowManagementPanel } from './WorkflowManagementPanel';
import { SettingsSearchInput } from './SettingsSearchInput';
import { AddressesSection } from './AddressesSection';
import {
  PROJECT_SETTINGS_TABS,
  PROJECT_SETTINGS_SECTIONS,
  PROJECT_FORM_SECTIONS,
} from './projectSettingsTabs';

// Re-exported so existing consumers (`ProjectSettings.test.jsx`) keep one
// import site; the tab config itself lives in `projectSettingsTabs.js` where
// `ProjectSettingsForm` shares it without a render-cycle import.
export { PROJECT_SETTINGS_TABS, PROJECT_SETTINGS_SECTIONS, PROJECT_FORM_SECTIONS };

// How the jump-to-setting highlight behaves: a short wait lets the newly
// selected tab render before scrolling, then the ring stays visible briefly
// so the eye lands on the right field before it clears.
const HIGHLIGHT_SHOW_DELAY_MS = 80;
const HIGHLIGHT_HIDE_DELAY_MS = 2100;

/***
 * MARK: ProjectSettings
 * @description A dedicated Project Management / Settings page for configuring
 * the active project across focused tabs — Project (basics + retry/timeouts),
 * Aliases (model aliases), Files & Repos (paths, repos), Addresses (app link) — plus
 * multiple named workflows, and skills.
 * App-wide UI & Workspace customization lives in System Settings
 * (SystemSettingsPage, `/system-settings`). Distinct from that platform-scoped
 * screen, this page is per-project and keeps the `/settings` route.
 * @example <ProjectSettings />
 ***/
export function ProjectSettings() {
  const { projects, activeProjectId, selectProject } = useKainBain();
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const [settingsSection, setSettingsSection] = useState('project');
  // Fail-safe: an unknown section id (e.g. a stale 'ui' from before UI
  // customization moved to System Settings) falls back to the project form
  // instead of rendering a blank page.
  const effectiveSection = PROJECT_SETTINGS_SECTIONS.includes(settingsSection)
    ? settingsSection
    : 'project';
  // Jump-to-setting target: `{ id, at }` so repeating the same search still
  // re-fires the highlight effect below (object identity changes each time).
  // `at` is a monotonic counter (not Date.now()): the value only needs to be
  // unique per selection, and a counter keeps the update pure and testable.
  const [highlightTarget, setHighlightTarget] = useState(null);
  const highlightSeqRef = useRef(0);
  // Fail-safe: `effectiveSection` is always a known tab, but the lookup still
  // falls back to the first tab so a heading always renders (never blank).
  const activeTab =
    PROJECT_SETTINGS_TABS.find((tab) => tab.id === effectiveSection) ?? PROJECT_SETTINGS_TABS.at(0);
  // Unsaved-edits flag reported by the shared project form.
  const [formDirty, setFormDirty] = useState(false);
  // Focus targets for arrow-key tab navigation (automatic activation: moving
  // focus also selects the tab, matching the APG tabs pattern).
  const tabButtonRefs = useRef([]);
  /***
   * MARK: handleSectionChange
   * @description Tab switch guard: leaving the project-related tabs
   *   (Project/Aliases/Files & Repos/Addresses) with unsaved edits asks for
   *   confirmation first. Moving between project tabs never warns — the
   *   shared form stays mounted and keeps the edits.
   ***/
  const handleSectionChange = (nextSection) => {
    // Fail-safe: an unknown section id is ignored, never stored — storing it
    // would only be masked by the effectiveSection fallback and would hide
    // the bad caller. Returns whether the switch was accepted so callers
    // (arrow-key focus, search highlight) only follow a switch that happened.
    if (!PROJECT_SETTINGS_SECTIONS.includes(nextSection)) return false;
    if (
      formDirty &&
      PROJECT_FORM_SECTIONS.includes(effectiveSection) &&
      !PROJECT_FORM_SECTIONS.includes(nextSection) &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm('You have unsaved changes. Switch tabs anyway?')
    ) {
      return false;
    }
    setSettingsSection(nextSection);
    return true;
  };
  const focusTabAt = (index) => {
    const count = PROJECT_SETTINGS_TABS.length;
    if (count === 0) return;
    const wrapped = ((index % count) + count) % count;
    // `.at()` reads by index without the bracket-access pattern the
    // security linter flags; the wrapped index is always in range.
    const tab = PROJECT_SETTINGS_TABS.at(wrapped);
    if (!tab) return;
    // Switch first, focus second: when the unsaved-edits guard blocks the
    // switch, focus must stay on the still-selected tab instead of landing
    // on a tab that aria-selected says is not active.
    if (handleSectionChange(tab.id)) {
      tabButtonRefs.current.at(wrapped)?.focus();
    }
  };
  // Arrow-key navigation between tabs (APG automatic activation: moving
  // focus also selects the tab). Wired per-button rather than on the tablist
  // container so the handler always lives on a focusable element. Movement is
  // relative to the focused tab; if the dirty-guard blocks a switch, focus
  // stays on the selected tab, so the next keypress still starts from there.
  const onTabKeyDown = (event, fromIndex) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusTabAt(fromIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTabAt(fromIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTabAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTabAt(PROJECT_SETTINGS_TABS.length - 1);
    }
  };

  /***
   * MARK: handleActiveProjectChange
   * @description Active-project switch guard: switching projects remounts the
   *   shared form (`key={activeProjectId}`), which would silently drop unsaved
   *   drafts — so with unsaved edits on a project-related tab, ask first,
   *   matching the tab-switch guard below. Re-selecting the current project
   *   never warns. Extra dropdown args `(value, option)` forward untouched to
   *   `selectProject`, mirroring the previous direct wiring.
   ***/
  const handleActiveProjectChange = (nextProjectId, ...rest) => {
    if (
      formDirty &&
      PROJECT_FORM_SECTIONS.includes(effectiveSection) &&
      nextProjectId !== activeProjectId &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm('You have unsaved changes. Switch projects anyway?')
    ) {
      return;
    }
    // Forward untouched (value, option): the previous wiring passed
    // `selectProject` straight to the dropdown, and callers rely on both.
    selectProject(nextProjectId, ...rest);
  };

  /***
   * MARK: handleSearchSelect
   * @description Jumps to a search result: switches to the entry's tab, then
   *   the highlight effect scrolls the target into view and rings it.
   *   Fail-safe: a malformed entry (unknown tab, missing element id) is
   *   ignored instead of switching tabs or highlighting nothing.
   ***/
  const handleSearchSelect = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    if (
      !PROJECT_SETTINGS_SECTIONS.includes(entry.tab) ||
      typeof entry.elementId !== 'string' ||
      !entry.elementId
    ) {
      return;
    }
    // Only highlight when the switch actually happened: if the unsaved-edits
    // guard blocks it, the target is not on screen and ringing it (or a stale
    // element with the same id) would mislead.
    if (!handleSectionChange(entry.tab)) return;
    highlightSeqRef.current += 1;
    setHighlightTarget({ id: entry.elementId, at: highlightSeqRef.current });
  };

  // Scrolls the search target into view and highlights it briefly. Guarded
  // for test DOMs without `scrollIntoView`, and no-ops when the target id
  // is not on the active tab (e.g. a conditional field). Cleanup removes the
  // ring from the previous target: without this, picking a second result
  // while the first ring is still showing would clear the first hide timer
  // and leave that ring stuck on forever.
  useEffect(() => {
    if (!highlightTarget) return undefined;
    const targetId = highlightTarget.id;
    const clearRing = () => {
      const el = typeof document !== 'undefined' ? document.getElementById(targetId) : null;
      el?.classList?.remove('ring-2', 'ring-primary', 'rounded-sm');
    };
    const showTimer = setTimeout(() => {
      const el = typeof document !== 'undefined' ? document.getElementById(targetId) : null;
      if (el) {
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        el.classList.add('ring-2', 'ring-primary', 'rounded-sm');
      }
    }, HIGHLIGHT_SHOW_DELAY_MS);
    const hideTimer = setTimeout(clearRing, HIGHLIGHT_HIDE_DELAY_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearRing();
    };
  }, [highlightTarget, effectiveSection]);

  return (
    /* A named <section> landmark (NOT another <main>): the app shell already
       provides the single top-level <main id="main-content"> (App.jsx), and a
       nested main triggers axe landmark violations. A labelled section keeps
       the settings content inside a landmark without duplicating main. */
    <section
      aria-label="Project settings"
      className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar text-on-surface bg-surface-deep"
    >
      {/* Top section switcher (tabs left, settings search right) */}
      <div className="flex gap-2 justify-between items-center border-b border-border-standard pb-4">
        <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Project settings sections">
          {PROJECT_SETTINGS_TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(el) => {
                // eslint-disable-next-line security/detect-object-injection -- index is the map loop counter, always an integer within bounds
                tabButtonRefs.current[index] = el;
              }}
              id={`project-settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={effectiveSection === tab.id}
              aria-controls="project-settings-tabpanel"
              onClick={() => handleSectionChange(tab.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer ${
                effectiveSection === tab.id
                  ? 'bg-primary text-on-primary font-bold shadow-sm'
                  : 'bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface'
              }`}
            >
              <span aria-hidden="true">{tab.buttonIcon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="shrink-0">
          <SettingsSearchInput onSelect={handleSearchSelect} />
        </div>
      </div>

      <div
        id="project-settings-tabpanel"
        role="tabpanel"
        aria-labelledby={`project-settings-tab-${effectiveSection}`}
      >
        {PROJECT_FORM_SECTIONS.includes(effectiveSection) && (
          <div>
            {/* Every project-related tab gets an h2 tab title: the section
              components below use h3 subtitles, and starting at h3 would skip
              a heading level (axe heading-order violation). */}
            <h2 className="text-lg font-bold uppercase tracking-tight text-text-high mb-4 flex items-center gap-2 font-headline-md">
              <span className="text-primary">{activeTab.headingIcon}</span> {activeTab.heading}
            </h2>
            {effectiveSection === 'project' && (
              <div className="space-y-4 max-w-2xl mb-8">
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="active-project-select"
                    className="text-xs font-bold uppercase text-text-muted tracking-wider"
                  >
                    Active Project
                  </label>
                  <SelectDropdown
                    id="active-project-select"
                    ariaLabel="Active Project"
                    value={activeProjectId || ''}
                    onChange={handleActiveProjectChange}
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </div>
              </div>
            )}

            {/* One mounted form across the project-related tabs: edits survive
              tab switches because only the `section` prop changes. */}
            <ProjectSettingsForm
              key={activeProjectId}
              project={activeProject}
              projectId={activeProjectId}
              onProjectUpdated={selectProject}
              section={effectiveSection}
              onDirtyChange={setFormDirty}
            />
          </div>
        )}

        {effectiveSection === 'workflows' && (
          <WorkflowManagementPanel key={activeProjectId} projectId={activeProjectId} />
        )}

        {effectiveSection === 'skills' && (
          <SkillsSection key={activeProjectId} activeProjectId={activeProjectId} />
        )}

        {effectiveSection === 'addresses' && (
          <AddressesSection
            key={activeProjectId}
            project={activeProject}
            projectId={activeProjectId}
            onChanged={selectProject}
          />
        )}
      </div>
    </section>
  );
}
