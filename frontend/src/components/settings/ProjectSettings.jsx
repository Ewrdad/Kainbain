import { useEffect, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { SkillsSection } from './SkillsSection';
import { SelectDropdown } from '../common/SelectDropdown';
import { ProjectSettingsForm } from './ProjectSettingsForm';
import { WorkflowManagementPanel } from './WorkflowManagementPanel';
import { SettingsSearchInput } from './SettingsSearchInput';



/***
 * MARK: PROJECT_SETTINGS_TABS
 * @description Single source of truth for the Project Settings tab bar: every
 *   tab's section id, button label + icon, tab-title heading, and whether the
 *   tab shares the one mounted `ProjectSettingsForm` (edits survive switches
 *   between form tabs; workflows/skills render their own panels). Adding a
 *   tab means adding one entry here — the buttons, the `h2` titles, and the
 *   section allowlists below all derive from this list so they cannot drift.
 *   App-wide UI & Workspace customization is NOT one of them — it lives in
 *   System Settings (SystemSettingsPage, `/system-settings`); per-project
 *   visual branding stays here as the accent-color picker inside the form.
 * @example PROJECT_SETTINGS_TABS.map((tab) => tab.id) => ['project', 'aliases', 'files', 'workflows', 'skills']
 ***/
export const PROJECT_SETTINGS_TABS = [
  { id: 'project', label: 'Project Settings', buttonIcon: '📂', heading: 'Project Configuration', headingIcon: '⚙️', sharesProjectForm: true },
  { id: 'aliases', label: 'Aliases', buttonIcon: '🏷️', heading: 'Model Aliases', headingIcon: '🏷️', sharesProjectForm: true },
  { id: 'files', label: 'Files & Links', buttonIcon: '📁', heading: 'Files & Links', headingIcon: '📁', sharesProjectForm: true },
  { id: 'workflows', label: 'Named Workflows', buttonIcon: '🔀', heading: null, headingIcon: null, sharesProjectForm: false },
  { id: 'skills', label: 'Skills', buttonIcon: '🧩', heading: null, headingIcon: null, sharesProjectForm: false },
];

/***
 * MARK: PROJECT_SETTINGS_SECTIONS
 * @description Allowlisted sub-sections of the Project Settings page, derived
 *   from `PROJECT_SETTINGS_TABS` so the allowlist and the tab bar agree.
 * @example PROJECT_SETTINGS_SECTIONS.includes('aliases') => true
 ***/
export const PROJECT_SETTINGS_SECTIONS = PROJECT_SETTINGS_TABS.map((tab) => tab.id);

/***
 * MARK: PROJECT_FORM_SECTIONS
 * @description The project-related tabs share one mounted `ProjectSettingsForm`
 *   (edits survive tab switches); workflows/skills render their own panels.
 *   Derived from `PROJECT_SETTINGS_TABS` so a new form tab needs no second edit.
 * @example PROJECT_FORM_SECTIONS.includes('files') => true
 ***/
export const PROJECT_FORM_SECTIONS = PROJECT_SETTINGS_TABS.filter((tab) => tab.sharesProjectForm).map((tab) => tab.id);

// How the jump-to-setting highlight behaves: a short wait lets the newly
// selected tab render before scrolling, then the ring stays visible briefly
// so the eye lands on the right field before it clears.
const HIGHLIGHT_SHOW_DELAY_MS = 80;
const HIGHLIGHT_HIDE_DELAY_MS = 2100;

/***
 * MARK: ProjectSettings
 * @description A dedicated Project Management / Settings page for configuring
 * the active project across focused tabs — Project (basics + retry/timeouts),
 * Aliases (model aliases), Files & Links (paths, repos, app link) — plus
 * multiple named workflows, and skills. App-wide UI &
 * Workspace customization lives in System Settings (SystemSettingsPage,
 * `/system-settings`). Distinct from that platform-scoped screen, this page is
 * per-project and keeps the `/settings` route.
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
  const [highlightTarget, setHighlightTarget] = useState(null);
  // Fail-safe: `effectiveSection` is always a known tab, but the lookup still
  // falls back to the first tab so a heading always renders (never blank).
  const activeTab = PROJECT_SETTINGS_TABS.find((tab) => tab.id === effectiveSection)
    ?? PROJECT_SETTINGS_TABS[0];
  // Unsaved-edits flag reported by the shared project form.
  const [formDirty, setFormDirty] = useState(false);

  /***
   * MARK: handleSectionChange
   * @description Tab switch guard: leaving the project-related tabs
   *   (Project/Aliases/Files & Links) with unsaved edits asks for
   *   confirmation first. Moving between project tabs never warns — the
   *   shared form stays mounted and keeps the edits.
   ***/
  const handleSectionChange = (nextSection) => {
    if (
      formDirty &&
      PROJECT_FORM_SECTIONS.includes(effectiveSection) &&
      !PROJECT_FORM_SECTIONS.includes(nextSection) &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm('You have unsaved changes. Switch tabs anyway?')
    ) {
      return;
    }
    setSettingsSection(nextSection);
  };

  /***
   * MARK: handleSearchSelect
   * @description Jumps to a search result: switches to the entry's tab, then
   *   the highlight effect scrolls the target into view and rings it.
   ***/
  const handleSearchSelect = (entry) => {
    if (!entry) return;
    handleSectionChange(entry.tab);
    setHighlightTarget({ id: entry.elementId, at: Date.now() });
  };

  // Scrolls the search target into view and highlights it briefly. Guarded
  // for test DOMs without `scrollIntoView`, and no-ops when the target id
  // is not on the active tab (e.g. a conditional field).
  useEffect(() => {
    if (!highlightTarget) return undefined;
    const showTimer = setTimeout(() => {
      const el = typeof document !== 'undefined'
        ? document.getElementById(highlightTarget.id)
        : null;
      if (el) {
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        el.classList.add('ring-2', 'ring-primary', 'rounded-sm');
      }
    }, HIGHLIGHT_SHOW_DELAY_MS);
    const hideTimer = setTimeout(() => {
      const el = typeof document !== 'undefined'
        ? document.getElementById(highlightTarget.id)
        : null;
      el?.classList?.remove('ring-2', 'ring-primary', 'rounded-sm');
    }, HIGHLIGHT_HIDE_DELAY_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
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
        <div className="flex gap-2 flex-wrap">
        {PROJECT_SETTINGS_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => handleSectionChange(tab.id)}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer ${
            effectiveSection === tab.id
              ? 'bg-primary text-on-primary font-bold shadow-sm'
              : 'bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface'
          }`}
        >
          <span>{tab.buttonIcon}</span>
          <span>{tab.label}</span>
        </button>
        ))}
        </div>
        <div className="shrink-0">
          <SettingsSearchInput onSelect={handleSearchSelect} />
        </div>
      </div>

      {PROJECT_FORM_SECTIONS.includes(effectiveSection) && (
        <div>
          {/* Every project-related tab gets an h2 tab title: the section
              components below use h3 subtitles, and starting at h3 would skip
              a heading level (axe heading-order violation). */}
          <h2 className="text-lg font-bold uppercase tracking-tight text-text-high mb-4 flex items-center gap-2 font-headline-md">
            <span className="text-primary">{activeTab.headingIcon}</span> {activeTab.heading}
          </h2>
          {effectiveSection === 'project' && (
            <>
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
                    onChange={selectProject}
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </div>
              </div>
            </>
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
    </section>
  );
}
