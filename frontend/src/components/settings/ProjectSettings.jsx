import React, { useEffect, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { FALLBACK_MODELS } from '../stageTypes';
import { SkillsSection } from './SkillsSection';
import { SelectDropdown } from '../common/SelectDropdown';
import { AppLinkSection } from './AppLinkSection';
import { ModelSelector, resolveStoredModelValidity } from '../common/ModelSelector';
import { ModelAliasesSection, validateAliasList } from './ModelAliasesSection';
import { accentTokens } from '../../theme/accentTokens';
import { ALIAS_HARNESS_ID, findAliasUsages } from '../../../../shared/modelAliases.js';
import { msToMinutes, minutesToMs } from '../../utils/timeoutUnits';
import { RetryNumberField } from './RetryNumberField';
import { parseRetrySettings } from './projectSettingsValidation';
import { ProjectSettingsForm } from './ProjectSettingsForm';
import { WorkflowManagementPanel } from './WorkflowManagementPanel';
import { SettingsSearchInput } from './SettingsSearchInput';



/***
 * MARK: PROJECT_SETTINGS_SECTIONS
 * @description Allowlisted sub-sections of the Project Settings page:
 * `project` (basics + retry/timeouts), `aliases` (model aliases), `files`
 * (paths, repos, app link), `workflows` (named workflows), and `skills`.
 * App-wide UI & Workspace customization is NOT one of them — it lives in
 * System Settings (SystemSettingsPage, `/system-settings`); per-project visual
 * branding stays here as the accent-color picker inside the project form.
 * @example PROJECT_SETTINGS_SECTIONS.includes('aliases') => true
 ***/
export const PROJECT_SETTINGS_SECTIONS = ['project', 'aliases', 'files', 'workflows', 'skills'];

/***
 * MARK: PROJECT_FORM_SECTIONS
 * @description The project-related tabs share one mounted `ProjectSettingsForm`
 *   (edits survive tab switches); workflows/skills render their own panels.
 * @example PROJECT_FORM_SECTIONS.includes('files') => true
 ***/
export const PROJECT_FORM_SECTIONS = ['project', 'aliases', 'files'];

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
    }, 80);
    const hideTimer = setTimeout(() => {
      const el = typeof document !== 'undefined'
        ? document.getElementById(highlightTarget.id)
        : null;
      el?.classList?.remove('ring-2', 'ring-primary', 'rounded-sm');
    }, 2100);
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
        <button
          type="button"
          onClick={() => handleSectionChange('project')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer ${
            effectiveSection === 'project'
              ? 'bg-primary text-on-primary font-bold shadow-sm'
              : 'bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface'
          }`}
        >
          <span>📂</span>
          <span>Project Settings</span>
        </button>
        <button
          type="button"
          onClick={() => handleSectionChange('aliases')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer ${
            effectiveSection === 'aliases'
              ? 'bg-primary text-on-primary font-bold shadow-sm'
              : 'bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface'
          }`}
        >
          <span>🏷️</span>
          <span>Aliases</span>
        </button>
        <button
          type="button"
          onClick={() => handleSectionChange('files')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer ${
            effectiveSection === 'files'
              ? 'bg-primary text-on-primary font-bold shadow-sm'
              : 'bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface'
          }`}
        >
          <span>📁</span>
          <span>Files & Links</span>
        </button>
        <button
          type="button"
          onClick={() => handleSectionChange('workflows')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer ${
            effectiveSection === 'workflows'
              ? 'bg-primary text-on-primary font-bold shadow-sm'
              : 'bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface'
          }`}
        >
          <span>🔀</span>
          <span>Named Workflows</span>
        </button>
        <button
          type="button"
          onClick={() => handleSectionChange('skills')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center gap-2 cursor-pointer ${
            effectiveSection === 'skills'
              ? 'bg-primary text-on-primary font-bold shadow-sm'
              : 'bg-surface-container hover:bg-surface-container-high text-text-muted hover:text-on-surface'
          }`}
        >
          <span>🧩</span>
          <span>Skills</span>
        </button>
        </div>
        <div className="shrink-0">
          <SettingsSearchInput onSelect={handleSearchSelect} />
        </div>
      </div>

      {PROJECT_FORM_SECTIONS.includes(effectiveSection) && (
        <div>
          {effectiveSection === 'project' && (
            <>
              <h2 className="text-lg font-bold uppercase tracking-tight text-text-high mb-4 flex items-center gap-2 font-headline-md">
                <span className="text-primary">⚙️</span> Project Configuration
              </h2>
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

export { RetryNumberField, parseRetrySettings, ProjectSettingsForm, WorkflowManagementPanel };
