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
 * @example PROJECT_SETTINGS_TABS.map((tab) => tab.id) => ['project', 'aliases', 'files-repos', 'addresses', 'workflows', 'skills']
 ***/
export const PROJECT_SETTINGS_TABS = [
  {
    id: 'project',
    label: 'Project Settings',
    buttonIcon: '📂',
    heading: 'Project Configuration',
    headingIcon: '⚙️',
    sharesProjectForm: true,
  },
  {
    id: 'aliases',
    label: 'Aliases',
    buttonIcon: '🏷️',
    heading: 'Model Aliases',
    headingIcon: '🏷️',
    sharesProjectForm: true,
  },
  {
    id: 'files-repos',
    label: 'Files & Repos',
    buttonIcon: '📁',
    heading: 'Files & Repositories',
    headingIcon: '📁',
    sharesProjectForm: true,
  },
  {
    id: 'addresses',
    label: 'Addresses',
    buttonIcon: '🌐',
    heading: 'Application Links & Health',
    headingIcon: '🌐',
    sharesProjectForm: true,
  },
  {
    id: 'workflows',
    label: 'Named Workflows',
    buttonIcon: '🔀',
    heading: null,
    headingIcon: null,
    sharesProjectForm: false,
  },
  {
    id: 'skills',
    label: 'Skills',
    buttonIcon: '🧩',
    heading: null,
    headingIcon: null,
    sharesProjectForm: false,
  },
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
export const PROJECT_FORM_SECTIONS = PROJECT_SETTINGS_TABS.filter(
  (tab) => tab.sharesProjectForm,
).map((tab) => tab.id);
