import React, { useState } from 'react';
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



/***
 * MARK: PROJECT_SETTINGS_SECTIONS
 * @description Allowlisted sub-sections of the Project Settings page.
 * App-wide UI & Workspace customization is NOT one of them — it lives in
 * System Settings (SystemSettingsPage, `/system-settings`); per-project visual
 * branding stays here as the accent-color picker inside the project form.
 * @example PROJECT_SETTINGS_SECTIONS.includes('workflows') => true
 ***/
export const PROJECT_SETTINGS_SECTIONS = ['project', 'workflows', 'skills'];

/***
 * MARK: ProjectSettings
 * @description A dedicated Project Management / Settings page for configuring
 * the active project (name, working directory, SilverBullet notes directory,
 * Git repository URL), multiple named workflows, and skills. App-wide UI &
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

  return (
    /* A named <section> landmark (NOT another <main>): the app shell already
       provides the single top-level <main id="main-content"> (App.jsx), and a
       nested main triggers axe landmark violations. A labelled section keeps
       the settings content inside a landmark without duplicating main. */
    <section
      aria-label="Project settings"
      className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar text-on-surface bg-surface-deep"
    >
      {/* Top section switcher */}
      <div className="flex gap-2 border-b border-border-standard pb-4">
        <button
          type="button"
          onClick={() => setSettingsSection('project')}
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
          onClick={() => setSettingsSection('workflows')}
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
          onClick={() => setSettingsSection('skills')}
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

      {effectiveSection === 'project' && (
        <div>
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

          <ProjectSettingsForm
            key={activeProjectId}
            project={activeProject}
            projectId={activeProjectId}
            onProjectUpdated={selectProject}
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
