import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithKainBain } from '../../testUtils';
import { ProjectSettings, PROJECT_SETTINGS_SECTIONS, PROJECT_SETTINGS_TABS, PROJECT_FORM_SECTIONS } from './ProjectSettings';
import { msToMinutes } from '../../utils/timeoutUnits';
import '@testing-library/jest-dom';

/**
 * MARK: enriched models fixture
 * @description Mirrors the /compute/models credential-aware enrichment
 *   (runnable/authConfigured/statusLabel) so the badge UI can be asserted
 *   deterministically without the live backend. Declared with vi.hoisted so
 *   the hoisted vi.mock factory can reference it.
 ***/
const ENRICHED_MODELS = vi.hoisted(() => [
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    input: ['text', 'image'],
    runnable: false,
    authConfigured: false,
    statusLabel: 'No credentials',
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    input: ['text', 'image'],
    runnable: true,
    authConfigured: true,
    authSource: 'stored',
    authLabel: 'auth.json',
    statusLabel: 'Ready',
  },
  {
    id: 'deepseek-v4-flash:0731-cloud',
    name: 'DeepSeek v4 Flash (Cloud)',
    provider: 'ollama-cloud',
    input: ['text'],
    runnable: true,
    authConfigured: true,
    authSource: 'models_json_key',
    statusLabel: 'Ready',
  },
  {
    id: 'glm-5.3-flash:cloud',
    name: 'GLM 5.3 Flash (Cloud)',
    provider: 'ollama-cloud',
    input: ['text', 'image'],
    runnable: false,
    authConfigured: true,
    statusLabel: 'Unavailable',
  },
]);;

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      updateProject: vi.fn(),
      // The shared model catalogue fixture, credential-aware enrichment as
      // served by /compute/models (harness-scoped keys + runnable flags) so
      // the badge UI is asserted deterministically without the live backend.
      // The per-harness view carries each harness's modelSelection mode plus
      // the isDefault flag — the single harness control reads both.
      getModels: vi.fn().mockResolvedValue({
        models: ENRICHED_MODELS,
        harnesses: [
          {
            id: 'pi',
            label: 'pi',
            description: 'pi coding-agent harness',
            modelSelection: 'list',
            modelFlag: null,
            isDefault: true,
            models: ENRICHED_MODELS,
          },
        ],
      }),
    },
  };
});
vi.mock('../../services/logger', () => ({ logger: { error: vi.fn() } }));

import { api } from '../../services/api';
import { KainBainContext } from '../../context/KainBainContext';
import { SETTINGS_SEARCH_INDEX } from './projectSettingsSearch';

/**
 * MARK: ProjectSettings tests
 * @description Verifies the per-project configuration page across its tabs —
 *   Project (active-project selector, name, harness/model, retry/timeouts),
 *   Aliases (model alias table), Files & Links (working directory, notes
 *   symlink, git repo URL, app link), plus the settings search, the
 *   unsaved-edits tab guard, and the save flow (including the alias
 *   dirty-field and 409 conflict handling). Also asserts that UI
 *   customization lives in System Settings, not here, and that the arbitrary
 *   environment variables table is removed.
 */
const projects = [
  {
    id: 'p1',
    name: 'Project A',
    cwd: '/home/server/projects/project-a',
    notesDir: '/home/server/apps/notes/silverbullet/space/Projects/Personal/project-a',
    gitRepo: 'https://git.example.com/team/ProjectA.git',
  },
  { id: 'p2', name: 'Project B' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

test('renders configuration sections across tabs and verifies environment variables is removed', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  // Project tab holds basics + retry/timeouts only.
  expect(screen.getByText('Project Configuration')).toBeInTheDocument();
  expect(screen.getByText('Project Details')).toBeInTheDocument();
  expect(screen.getByText('Retry & Timeouts')).toBeInTheDocument();
  expect(screen.queryByText('Multi-Location Paths & Repositories')).not.toBeInTheDocument();
  expect(screen.queryByTestId('model-aliases-section')).not.toBeInTheDocument();
  expect(screen.queryByText('Environment Variables')).not.toBeInTheDocument();

  // Files & Links tab holds paths, repos, and the app link.
  fireEvent.click(screen.getByText('Files & Links'));
  expect(screen.getByText('Multi-Location Paths & Repositories')).toBeInTheDocument();
  expect(screen.getByText('Application Link & Health')).toBeInTheDocument();
  expect(screen.queryByText('Project Details')).not.toBeInTheDocument();

  // Aliases tab holds the model alias table.
  fireEvent.click(screen.getByText('Aliases'));
  expect(screen.getByTestId('model-aliases-section')).toBeInTheDocument();
  expect(screen.queryByText('Project Details')).not.toBeInTheDocument();
});

test('renders the Use Task Branches toggle reflected from the project and saves its value', async () => {
  const projectWithBranches = {
    ...projects[0],
    useBranches: true,
  };
  const updatedProject = { id: 'p1', useBranches: false };
  api.updateProject.mockResolvedValue(updatedProject);
  renderWithKainBain(<ProjectSettings />, {
    projects: [projectWithBranches],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });
  fireEvent.click(screen.getByText('Files & Links'));

  // The stored flag (true) is reflected in the checkbox.
  const toggle = screen.getByLabelText(/Use Task Branches/i);
  expect(toggle).toBeChecked();

  // Toggling off persists the new value through the save payload.
  fireEvent.click(toggle);
  expect(toggle).not.toBeChecked();
  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ useBranches: false }),
      {},
    );
  });
});

test('renders the Use Task Branches toggle unchecked by default (opt-in)', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  fireEvent.click(screen.getByText('Files & Links'));
  expect(screen.getByLabelText(/Use Task Branches/i)).not.toBeChecked();
});

test('renders the preserved-diff toggles reflected from the project and saves their values', async () => {
  const projectWithPreserve = {
    ...projects[0],
    preserveReviewDiffAfterMerge: true,
    resetReviewBaselineOnMerge: false,
  };
  const updatedProject = { id: 'p1', preserveReviewDiffAfterMerge: false };
  api.updateProject.mockResolvedValue(updatedProject);
  renderWithKainBain(<ProjectSettings />, {
    projects: [projectWithPreserve],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });
  fireEvent.click(screen.getByText('Files & Links'));

  // The stored flags are reflected in the checkboxes.
  const preserveToggle = screen.getByLabelText(/Preserve PR Review Diff/i);
  const resetToggle = screen.getByLabelText(/Reset Review Baseline/i);
  expect(preserveToggle).toBeChecked();
  expect(resetToggle).not.toBeChecked();

  // Flipping both persists the new values through the save payload without
  // clobbering the other project fields.
  fireEvent.click(preserveToggle);
  fireEvent.click(resetToggle);
  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        preserveReviewDiffAfterMerge: false,
        resetReviewBaselineOnMerge: true,
      }),
      {},
    );
  });
});

test('preserved-diff toggles default to off / reset-on (current behaviour)', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  fireEvent.click(screen.getByText('Files & Links'));
  expect(screen.getByLabelText(/Preserve PR Review Diff/i)).not.toBeChecked();
  expect(screen.getByLabelText(/Reset Review Baseline/i)).toBeChecked();
});

test('lists all projects in the active-project selector', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  const select = screen.getByLabelText('Active Project');
  fireEvent.click(select);
  // Scoped to the project listbox: the page also renders native <option>
  // elements (e.g. the Retry & Timeouts tri-state switch).
  const listbox = screen.getByRole('listbox');
  expect(listbox).toBeInTheDocument();
  expect(within(listbox).getAllByRole('option').length).toBe(2);
});

test('selecting a project calls selectProject', () => {
  const selectProject = vi.fn();
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject,
  });
  const trigger = screen.getByLabelText('Active Project');
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name: /Project B/i }));
  expect(selectProject).toHaveBeenCalledWith('p2', expect.anything());
});

test('saving persists the project name, paths, git repo, defaultModel, and accentColor and shows Saved state', async () => {
  const updatedProject = {
    id: 'p1',
    name: 'Project A Updated',
    accentColor: '#38bdf8',
  };
  api.updateProject.mockResolvedValue(updatedProject);
  const selectProject = vi.fn();
  const updateProjectInState = vi.fn();
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject,
    updateProjectInState,
  });

  fireEvent.change(screen.getByLabelText('Project Name'), {
    target: { value: 'Project A Updated' },
  });
  // Wait for the mocked model discovery to resolve so the selector is enabled.
  await waitFor(() => {
    expect(screen.getByLabelText('Default AI Model')).toBeEnabled();
  });
  fireEvent.click(screen.getByLabelText('Default AI Model'));
  fireEvent.click(screen.getByRole('option', { name: /Claude 3\.7 Sonnet/i }));
  fireEvent.change(screen.getByLabelText('Accent Theme Color Hex'), {
    target: { value: '#38bdf8' },
  });
  // Path fields live on the Files & Links tab; the mounted form keeps the
  // Project-tab edits above across the switch.
  fireEvent.click(screen.getByText('Files & Links'));
  fireEvent.change(screen.getByLabelText('Working Directory (Root)'), {
    target: { value: '/home/server/projects/custom' },
  });
  fireEvent.change(screen.getByLabelText('Notes Space Symlink Directory'), {
    target: { value: '/home/server/apps/notes/silverbullet/space/Projects/Personal/custom' },
  });
  fireEvent.change(screen.getByLabelText('Git Repository URL'), {
    target: { value: 'https://git.example.com/team/Custom.git' },
  });

  fireEvent.click(screen.getByText('Save Configuration'));
  // The untouched alias table is OMITTED (dirty-field save): a stale page
  // saving unrelated settings must never wipe aliases stored by another
  // browser. Only an edited table carries the key. The untouched retry
  // section instead round-trips explicit nulls (blank = follow the global
  // default), so the payload always carries the seven retry keys.
  expect(api.updateProject).toHaveBeenCalledWith(
    'p1',
    {
      name: 'Project A Updated',
      cwd: '/home/server/projects/custom',
      notesDir: '/home/server/apps/notes/silverbullet/space/Projects/Personal/custom',
      notesPath: '/home/server/apps/notes/silverbullet/space/Projects/Personal/custom',
      gitRepo: 'https://git.example.com/team/Custom.git',
      gitUrl: 'https://git.example.com/team/Custom.git',
      useBranches: false,
      preserveReviewDiffAfterMerge: false,
      resetReviewBaselineOnMerge: true,
      defaultModel: 'anthropic::claude-3-7-sonnet',
      accentColor: '#38bdf8',
      docsDirName: '',
      kainbainDirName: '',
      centralizedDocs: true,
      harness: '',
      harnessCommand: '',
      maxAutoIterations: null,
      maxTransientRetries: null,
      autoIterationEnabled: null,
      agentTimeoutMs: null,
      ciTimeoutMs: null,
      mergeTimeoutMs: null,
    },
    {},
  );
  expect(api.updateProject.mock.calls[0][1]).not.toHaveProperty('modelAliases');

  await waitFor(() => {
    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
  });

  // The in-memory project must be refreshed so the applied accent survives
  // view/tab switches without a full re-fetch.
  expect(updateProjectInState).toHaveBeenCalledWith(updatedProject);
});

test('edits custom documentation folder name and centralized docs toggle, saving them', async () => {
  api.updateProject.mockResolvedValue({ id: 'p1', docsDirName: 'kainbain-docs', centralizedDocs: false });
  const updateProjectInState = vi.fn();

  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState,
  });
  fireEvent.click(screen.getByText('Files & Links'));

  const docsDirInput = screen.getByLabelText('Documentation Folder Name');
  fireEvent.change(docsDirInput, { target: { value: 'kainbain-docs' } });

  const centralizedToggle = screen.getByLabelText('Link to Centralised Documentation');
  fireEvent.click(centralizedToggle);

  const saveButton = screen.getByRole('button', { name: /save configuration/i });
  fireEvent.click(saveButton);

  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalled();
  });

  const payload = api.updateProject.mock.calls[0][1];
  expect(payload.docsDirName).toBe('kainbain-docs');
  expect(payload.centralizedDocs).toBe(false);
});

test('invalid documentation folder name prevents save with validation alert', async () => {
  api.updateProject.mockClear();

  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  fireEvent.click(screen.getByText('Files & Links'));

  const docsDirInput = screen.getByLabelText('Documentation Folder Name');
  fireEvent.change(docsDirInput, { target: { value: 'invalid/path' } });

  const saveButton = screen.getByRole('button', { name: /save configuration/i });
  fireEvent.click(saveButton);

  await waitFor(() => {
    expect(
      screen.getByText(/Documentation folder name must be 1-64 characters/i),
    ).toBeInTheDocument();
  });

  expect(api.updateProject).not.toHaveBeenCalled();
});

test('edits custom KainBain state folder name, saving it', async () => {
  api.updateProject.mockResolvedValue({ id: 'p1', kainbainDirName: '.kb' });
  const updateProjectInState = vi.fn();

  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState,
  });
  fireEvent.click(screen.getByText('Files & Links'));

  const kainbainDirInput = screen.getByLabelText('KainBain Folder Name');
  fireEvent.change(kainbainDirInput, { target: { value: '.kb' } });

  const saveButton = screen.getByRole('button', { name: /save configuration/i });
  fireEvent.click(saveButton);

  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalled();
  });

  const payload = api.updateProject.mock.calls[0][1];
  expect(payload.kainbainDirName).toBe('.kb');
});

test('invalid KainBain folder name prevents save with validation alert', async () => {
  api.updateProject.mockClear();

  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  fireEvent.click(screen.getByText('Files & Links'));

  const kainbainDirInput = screen.getByLabelText('KainBain Folder Name');
  fireEvent.change(kainbainDirInput, { target: { value: 'invalid/slash' } });

  const saveButton = screen.getByRole('button', { name: /save configuration/i });
  fireEvent.click(saveButton);

  await waitFor(() => {
    expect(
      screen.getByText(/KainBain folder name must be 1-64 characters/i),
    ).toBeInTheDocument();
  });

  expect(api.updateProject).not.toHaveBeenCalled();
});

test('rejects docs name `.kainbain` even with a custom state folder (UI/server parity)', async () => {
  api.updateProject.mockClear();
  renderWithKainBain(<ProjectSettings />, {
    projects: [{ ...projects[0], kainbainDirName: '.kb' }],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  fireEvent.click(screen.getByText('Files & Links'));
  fireEvent.change(screen.getByLabelText('Documentation Folder Name'), {
    target: { value: '.kainbain' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));
  await waitFor(() => {
    expect(
      screen.getByText(/Documentation folder name must be 1-64 characters/i),
    ).toBeInTheDocument();
  });
  expect(api.updateProject).not.toHaveBeenCalled();
});

test('rejects state folder `docs` even with a custom docs folder (UI/server parity)', async () => {
  api.updateProject.mockClear();
  renderWithKainBain(<ProjectSettings />, {
    projects: [{ ...projects[0], docsDirName: 'k-docs' }],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  fireEvent.click(screen.getByText('Files & Links'));
  fireEvent.change(screen.getByLabelText('KainBain Folder Name'), {
    target: { value: 'docs' },
  });
  fireEvent.click(screen.getByRole('button', { name: /save configuration/i }));
  await waitFor(() => {
    expect(
      screen.getByText(/KainBain folder name must be 1-64 characters/i),
    ).toBeInTheDocument();
  });
  expect(api.updateProject).not.toHaveBeenCalled();
});

test('preset accent color swatches update the accent color input and the DOM accent vars', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  const skySwatch = screen.getByRole('button', { name: 'Sky Blue' });
  fireEvent.click(skySwatch);
  expect(screen.getByLabelText('Accent Theme Color Hex')).toHaveValue('#38bdf8');

  // The accent CSS variables must be applied to the root immediately.
  const root = document.documentElement;
  expect(root.style.getPropertyValue('--accent')).toBe('56 189 248');
  expect(root.style.getPropertyValue('--accent-hex')).toBe('#38bdf8');
});

test('invalid or shorthand hex is coerced in the DOM vars and saved value', () => {
  const updateProjectInState = vi.fn();
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState,
  });

  const hexInput = screen.getByLabelText('Accent Theme Color Hex');
  const root = document.documentElement;

  // Shorthand 3-digit hex is expanded to 6 digits in the DOM vars. #3388bb
  // cannot hold 7:1 text contrast with any foreground, so the AAA token
  // contract lightens it (hue preserved) to the nearest conformant tone.
  fireEvent.change(hexInput, { target: { value: '#38b' } });
  expect(root.style.getPropertyValue('--accent')).toBe('88 157 199');
  expect(root.style.getPropertyValue('--accent-hex')).toBe('#589dc7');

  // Garbage input falls back to the default emerald so we never emit an
  // invalid CSS colour.
  fireEvent.change(hexInput, { target: { value: 'not-a-color' } });
  expect(root.style.getPropertyValue('--accent')).toBe('123 219 133');
  expect(root.style.getPropertyValue('--accent-hex')).toBe('#7bdb85');

  // Saving persists the normalised (not raw) hex value and refreshes the
  // in-memory project.
  api.updateProject.mockResolvedValue({ id: 'p1', accentColor: '#7bdb85' });
  fireEvent.click(screen.getAllByText('Save Configuration')[0]);
  return waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accentColor: '#7bdb85' }),
      {},
    );
    expect(updateProjectInState).toHaveBeenCalled();
  });
});

test('section allowlist keeps UI Customization out of project settings', () => {
  // Contract pin: only project-scoped sections may live here. App-wide UI
  // customization belongs to System Settings; per-project visual branding
  // stays as the accent-color picker inside the project form.
  expect(PROJECT_SETTINGS_SECTIONS).toEqual(['project', 'aliases', 'files', 'workflows', 'skills']);
  expect(PROJECT_SETTINGS_SECTIONS).not.toContain('ui');
});

test('tab config, section allowlists, and search index agree (no drift)', () => {
  // The tab bar, the section allowlists, and the headings all derive from
  // PROJECT_SETTINGS_TABS — a new tab is one entry, not three edits.
  expect(PROJECT_SETTINGS_SECTIONS).toEqual(PROJECT_SETTINGS_TABS.map((tab) => tab.id));
  expect(PROJECT_FORM_SECTIONS).toEqual(
    PROJECT_SETTINGS_TABS.filter((tab) => tab.sharesProjectForm).map((tab) => tab.id),
  );
  // Every searchable setting lives on a form tab (the only tabs with
  // elementIds to jump to), and every form tab has a heading for the h2.
  for (const entry of SETTINGS_SEARCH_INDEX) {
    expect(PROJECT_FORM_SECTIONS).toContain(entry.tab);
  }
  for (const tab of PROJECT_SETTINGS_TABS.filter((candidate) => candidate.sharesProjectForm)) {
    expect(typeof tab.heading).toBe('string');
  }
});

test('does not offer UI Customization in project settings (lives in System Settings)', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // Only the project-scoped sections remain: project config, aliases,
  // files & links, workflows, skills.
  expect(screen.getByText('Project Settings')).toBeInTheDocument();
  expect(screen.getByText('Aliases')).toBeInTheDocument();
  expect(screen.getByText('Files & Links')).toBeInTheDocument();
  expect(screen.getByText('Named Workflows')).toBeInTheDocument();
  expect(screen.getByText('Skills')).toBeInTheDocument();
  expect(screen.queryByText('UI Customization')).not.toBeInTheDocument();
  expect(screen.queryByText('UI & Workspace Customization')).not.toBeInTheDocument();
});

test('renders the Aliases tab and switches to it', async () => {
  const projectWithAliases = {
    ...projects[0],
    modelAliases: [{ name: 'small', harness: 'pi', model: 'google::gemini-2.5-pro' }],
  };
  renderWithKainBain(<ProjectSettings />, {
    projects: [projectWithAliases],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });

  // The alias table is hidden on the Project tab and appears on Aliases.
  expect(screen.queryByTestId('model-aliases-section')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Aliases'));
  expect(await screen.findByTestId('model-aliases-section')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('model-alias-toggle-0'));
  expect(screen.getByLabelText('Alias 1 name')).toHaveValue('small');
});

test('renders the Files & Links tab and switches to it', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // Paths, repos, and the app link are hidden on the Project tab.
  expect(screen.queryByLabelText('Working Directory (Root)')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Git Repository URL')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('App URL')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Files & Links'));
  expect(screen.getByLabelText('Working Directory (Root)')).toHaveValue(
    '/home/server/projects/project-a',
  );
  expect(screen.getByLabelText('Git Repository URL')).toHaveValue(
    'https://git.example.com/team/ProjectA.git',
  );
  expect(screen.getByLabelText('App URL')).toBeInTheDocument();
});

test('each project-related tab renders an h2 tab title above its h3 sections', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // The section components use h3 subtitles, so every project-related tab
  // needs an h2 tab title — starting at h3 would skip a heading level (axe
  // heading-order violation caught by the canary a11y scan).
  const tabTitles = [
    ['Project Settings', /Project Configuration/],
    ['Aliases', /Model Aliases/],
    ['Files & Links', /Files & Links/],
  ];
  for (const [tab, title] of tabTitles) {
    fireEvent.click(screen.getByText(tab));
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
  }
});

test('form state persists across project-tab switches', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // Edit on the Project tab, wander to the other project tabs, come back.
  fireEvent.change(screen.getByLabelText('Project Name'), {
    target: { value: 'Draft Name' },
  });
  fireEvent.click(screen.getByText('Aliases'));
  expect(screen.getByTestId('model-aliases-section')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Files & Links'));
  expect(screen.getByLabelText('Working Directory (Root)')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Git Repository URL'), {
    target: { value: 'https://git.example.com/team/Draft.git' },
  });
  fireEvent.click(screen.getByText('Project Settings'));
  expect(screen.getByLabelText('Project Name')).toHaveValue('Draft Name');
  fireEvent.click(screen.getByText('Files & Links'));
  expect(screen.getByLabelText('Git Repository URL')).toHaveValue(
    'https://git.example.com/team/Draft.git',
  );
});

test('settings search jumps to the matching tab and highlights the setting', async () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // The git setting lives on Files & Links — searching jumps there.
  expect(screen.queryByLabelText('Git Repository URL')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search settings'), {
    target: { value: 'git' },
  });
  fireEvent.mouseDown(screen.getByText('Git Repository URL'));
  expect(screen.getByLabelText('Git Repository URL')).toBeInTheDocument();

  // The target is ring-highlighted after the tab switch.
  await waitFor(() => {
    expect(
      document.getElementById('project-git-input')?.classList.contains('ring-2'),
    ).toBe(true);
  });
});

test('a second search jump clears the previous highlight ring (no stuck rings)', () => {
  vi.useFakeTimers();
  try {
    renderWithKainBain(<ProjectSettings />, {
      projects,
      activeProjectId: 'p1',
      selectProject: vi.fn(),
    });

    const searchBox = () => screen.getByLabelText('Search settings');
    fireEvent.change(searchBox(), { target: { value: 'git' } });
    fireEvent.mouseDown(screen.getByText('Git Repository URL'));
    vi.advanceTimersByTime(80);
    expect(
      document.getElementById('project-git-input')?.classList.contains('ring-2'),
    ).toBe(true);

    // Jump again while the first ring is still showing: the first ring must
    // clear (its hide timer is superseded) instead of sticking around.
    fireEvent.change(searchBox(), { target: { value: 'branch' } });
    fireEvent.mouseDown(screen.getByText('Use Task Branches'));
    vi.advanceTimersByTime(80);
    expect(
      document.getElementById('project-git-input')?.classList.contains('ring-2'),
    ).toBe(false);
    expect(
      document.getElementById('project-use-branches-input')?.classList.contains('ring-2'),
    ).toBe(true);

    // The second ring still clears on its own timer.
    vi.advanceTimersByTime(2100);
    expect(
      document.getElementById('project-use-branches-input')?.classList.contains('ring-2'),
    ).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('tab bar exposes tablist semantics and arrow-key navigation', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  expect(screen.getByRole('tablist', { name: 'Project settings sections' })).toBeInTheDocument();
  // Five tabs in order; icons are aria-hidden so names are the labels.
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  for (const name of ['Project Settings', 'Aliases', 'Files & Links', 'Named Workflows', 'Skills']) {
    expect(screen.getByRole('tab', { name })).toBeInTheDocument();
  }
  // Exactly one tab is selected, and the panel names it.
  expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Project Settings');
  expect(screen.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    'project-settings-tab-project',
  );

  // ArrowRight moves focus and selects the next tab (automatic activation).
  screen.getByRole('tab', { name: 'Project Settings' }).focus();
  fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Aliases');
  expect(screen.getByTestId('model-aliases-section')).toBeInTheDocument();

  // ArrowLeft wraps back, End jumps to the last tab, Home to the first.
  fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
  expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Project Settings');
  fireEvent.keyDown(document.activeElement, { key: 'End' });
  expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Skills');
  fireEvent.keyDown(document.activeElement, { key: 'Home' });
  expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Project Settings');
  expect(screen.getByLabelText('Project Name')).toBeInTheDocument();
});

test('every search index entry resolves to an element on its tab', async () => {
  const { unmount } = renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  // The model picker renders once model discovery resolves.
  await screen.findByLabelText('Default AI Model');

  const entriesFor = (tab) => SETTINGS_SEARCH_INDEX.filter((entry) => entry.tab === tab);
  // The custom-harness command line only renders for that harness — covered
  // by a second fixture below (a custom harness hides the model picker, so
  // the two entries need different projects).
  for (const entry of entriesFor('project').filter((e) => e.id !== 'harness-command')) {
    expect(document.getElementById(entry.elementId)).not.toBeNull();
  }
  fireEvent.click(screen.getByText('Aliases'));
  for (const entry of entriesFor('aliases')) {
    expect(document.getElementById(entry.elementId)).not.toBeNull();
  }
  fireEvent.click(screen.getByText('Files & Links'));
  for (const entry of entriesFor('files')) {
    expect(document.getElementById(entry.elementId)).not.toBeNull();
  }
  unmount();

  renderWithKainBain(<ProjectSettings />, {
    projects: [{ ...projects[0], harness: 'custom', harnessCommand: 'claude -p' }],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  expect(document.getElementById('project-harness-command-input')).not.toBeNull();
});

test('switching to Workflows with unsaved edits asks for confirmation', () => {
  const originalConfirm = window.confirm;
  const confirm = vi.fn();
  window.confirm = confirm;
  try {
    renderWithKainBain(<ProjectSettings />, {
      projects,
      activeProjectId: 'p1',
      selectProject: vi.fn(),
    });

    fireEvent.change(screen.getByLabelText('Project Name'), {
      target: { value: 'Draft Name' },
    });

    // Cancelling keeps the project form (and the draft) in place.
    confirm.mockReturnValue(false);
    fireEvent.click(screen.getByText('Named Workflows'));
    expect(confirm).toHaveBeenCalledWith(
      'You have unsaved changes. Switch tabs anyway?',
    );
    expect(screen.getByLabelText('Project Name')).toHaveValue('Draft Name');

    // Confirming leaves for Workflows.
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText('Named Workflows'));
    expect(screen.getByText('Named Workflows & Pipelines')).toBeInTheDocument();
  } finally {
    window.confirm = originalConfirm;
  }
});

test('switching between project tabs with unsaved edits never warns', () => {
  const originalConfirm = window.confirm;
  const confirm = vi.fn();
  window.confirm = confirm;
  try {
    renderWithKainBain(<ProjectSettings />, {
      projects,
      activeProjectId: 'p1',
      selectProject: vi.fn(),
    });

    fireEvent.change(screen.getByLabelText('Project Name'), {
      target: { value: 'Draft Name' },
    });
    fireEvent.click(screen.getByText('Aliases'));
    fireEvent.click(screen.getByText('Files & Links'));
    fireEvent.click(screen.getByText('Project Settings'));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Project Name')).toHaveValue('Draft Name');
  } finally {
    window.confirm = originalConfirm;
  }
});

test('saving clears the dirty flag so leaving no longer warns', async () => {
  const originalConfirm = window.confirm;
  const confirm = vi.fn();
  window.confirm = confirm;
  api.updateProject.mockResolvedValue({ id: 'p1' });
  try {
    renderWithKainBain(<ProjectSettings />, {
      projects,
      activeProjectId: 'p1',
      selectProject: vi.fn(),
      updateProjectInState: vi.fn(),
    });

    fireEvent.change(screen.getByLabelText('Project Name'), {
      target: { value: 'Saved Name' },
    });
    fireEvent.click(screen.getByText('Save Configuration'));
    await waitFor(() => {
      expect(screen.getByText('Saved ✓')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Named Workflows'));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText('Named Workflows & Pipelines')).toBeInTheDocument();
  } finally {
    window.confirm = originalConfirm;
  }
});

test('switches to Named Workflows sub-tab and manages workflows', async () => {
  const mockCreateWorkflow = vi.fn();
  const mockSwitchWorkflow = vi.fn();

  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    projectWorkflows: [
      {
        id: 'wf-default',
        name: 'Feature Pipeline',
        isDefault: true,
        stages: [{ id: '1', name: 'Idea', type: 'agent' }],
      },
      {
        id: 'wf-hotfix',
        name: 'Hotfix Pipeline',
        isDefault: false,
        stages: [{ id: '2', name: 'Patch', type: 'agent' }],
      },
    ],
    activeWorkflowId: 'wf-default',
    createWorkflow: mockCreateWorkflow,
    switchWorkflow: mockSwitchWorkflow,
  });

  fireEvent.click(screen.getByText('Named Workflows'));
  expect(screen.getByText('Named Workflows & Pipelines')).toBeInTheDocument();
  expect(screen.getByText('Feature Pipeline')).toBeInTheDocument();
  expect(screen.getByText('Hotfix Pipeline')).toBeInTheDocument();

  // Test switching workflow
  const switchBtn = screen.getByRole('button', { name: 'Switch to Active' });
  fireEvent.click(switchBtn);
  expect(mockSwitchWorkflow).toHaveBeenCalledWith('p1', 'wf-hotfix');

  // Test creating a new workflow
  fireEvent.change(screen.getByLabelText('Workflow Name'), {
    target: { value: 'Release Pipeline' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Workflow' }));
  expect(mockCreateWorkflow).toHaveBeenCalledWith(
    'p1',
    expect.objectContaining({
      name: 'Release Pipeline',
    }),
  );
});

test('syncs the stored default model when the project loads after mount (no clobber)', () => {
  const storedProject = {
    ...projects[0],
    defaultModel: 'ollama-cloud::glm-5.3-flash:cloud',
  };
  api.updateProject.mockResolvedValue({ ...storedProject });

  // Mount while the projects list is still loading (project undefined).
  const first = renderWithKainBain(<ProjectSettings />, {
    projects: [],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });

  // The project object arrives after the form mounted (fetch resolved).
  const value = { ...first.value, projects: [storedProject] };
  // Mirror the renderWithKainBain root so the mounted form (and its state)
  // survives the update — a different root would remount instead.
  first.rerender(
    <MemoryRouter initialEntries={['/']}>
      <KainBainContext.Provider value={value}>
        <ProjectSettings />
      </KainBainContext.Provider>
    </MemoryRouter>,
  );

  // Saving WITHOUT touching the model dropdown must persist the project's
  // stored model — not a mount-time placeholder like '' or 'gemini-2.5-pro'.
  fireEvent.click(screen.getByText('Save Configuration'));

  expect(api.updateProject).toHaveBeenCalledWith(
    'p1',
    expect.objectContaining({ defaultModel: 'ollama-cloud::glm-5.3-flash:cloud' }),
    {},
  );
});

test('syncs stored name, cwd, notes, git, and accent when the project loads after mount', () => {
  const storedProject = {
    ...projects[0],
    accentColor: '#38bdf8',
  };
  api.updateProject.mockResolvedValue({ ...storedProject });

  // Mount while the projects list is still loading (project undefined).
  const first = renderWithKainBain(<ProjectSettings />, {
    projects: [],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });

  // The project object arrives after the form mounted (fetch resolved).
  const value = { ...first.value, projects: [storedProject] };
  first.rerender(
    <MemoryRouter initialEntries={['/']}>
      <KainBainContext.Provider value={value}>
        <ProjectSettings />
      </KainBainContext.Provider>
    </MemoryRouter>,
  );

  // Saving WITHOUT touching the identity fields must persist the stored
  // values — not mount-time placeholders like '' or the projects root
  // (which orphaned project.json and broke branch operations in prod).
  fireEvent.click(screen.getByText('Save Configuration'));

  expect(api.updateProject).toHaveBeenCalledWith(
    'p1',
    expect.objectContaining({
      name: 'Project A',
      cwd: '/home/server/projects/project-a',
      notesDir:
        '/home/server/apps/notes/silverbullet/space/Projects/Personal/project-a',
      gitRepo: 'https://git.example.com/team/ProjectA.git',
      accentColor: '#38bdf8',
    }),
    {},
  );
});

test('refuses to save a blank name or a projects-root working directory', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  fireEvent.change(screen.getByLabelText('Project Name'), {
    target: { value: '   ' },
  });
  fireEvent.click(screen.getByText('Save Configuration'));
  expect(api.updateProject).not.toHaveBeenCalled();
  expect(screen.getByText('Project name must not be blank.')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Project Name'), {
    target: { value: 'Project A' },
  });
  // The working directory lives on the Files & Links tab; the corrected
  // name above survives the switch because the form stays mounted.
  fireEvent.click(screen.getByText('Files & Links'));
  fireEvent.change(screen.getByLabelText('Working Directory (Root)'), {
    target: { value: '/home/server/projects/' },
  });
  // (The save button relabels to "Error — Retry" after the first refusal.)
  fireEvent.click(screen.getByText('Error — Retry'));
  expect(api.updateProject).not.toHaveBeenCalled();
});

test('refuses to save while the project object is still loading', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects: [],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  fireEvent.click(screen.getByText('Save Configuration'));

  expect(api.updateProject).not.toHaveBeenCalled();
});

test('harness row offers the default harness plus the Alias entry (alias-free empty state)', async () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // The harness row offers the registered harness plus the virtual Alias
  // entry: alias-free projects still list it (its empty state points at
  // Settings), so the row is live — not a disabled single-harness row.
  const harnessTrigger = await screen.findByRole('combobox', { name: 'AI Harness' });
  expect(harnessTrigger.id).toBe('project-harness-select');
  expect(harnessTrigger).not.toBeDisabled();
  fireEvent.click(harnessTrigger);
  expect(screen.getByRole('option', { name: /pi \(default\)/i })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Alias' })).toBeInTheDocument();

  // An empty draft under the Alias harness shows the Settings pointer (no
  // Refresh action on that entry).
  fireEvent.click(screen.getByRole('option', { name: 'Alias' }));
  expect(screen.getByTestId('model-empty-note')).toHaveTextContent('Settings');
  expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();

  // Back on the default harness, the model dropdown keeps its stable id and
  // adopts the fetched catalogue.
  fireEvent.click(harnessTrigger);
  fireEvent.click(screen.getByRole('option', { name: /pi \(default\)/i }));
  const modelTrigger = screen.getByRole('combobox', { name: 'Default AI Model' });
  expect(modelTrigger.id).toBe('project-default-model-select');
  fireEvent.click(modelTrigger);
  // Grouped by provider: headers render, and plain labels carry no provider suffix.
  expect(screen.getByText('google')).toBeInTheDocument();
  expect(screen.getByText('anthropic')).toBeInTheDocument();
  expect(screen.getByText('ollama-cloud')).toBeInTheDocument();
  // (Badge labels may follow the plain model name in the accessible name.)
  expect(screen.getByRole('option', { name: /Claude 3\.7 Sonnet( Ready)?$/ })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Claude 3\.7 Sonnet \(/ })).not.toBeInTheDocument();
});

test('default-model dropdown options carry credential-status badges', async () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: 'Default AI Model' })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'Default AI Model' }));

  // Ready badge on the credentialed model.
  const claudeOption = screen.getByRole('option', { name: /Claude 3\.7 Sonnet/i });
  expect(within(claudeOption).getByText('Ready')).toBeInTheDocument();

  // No-credentials badge on the uncredentialed model.
  const geminiOption = screen.getByRole('option', { name: /Gemini 2\.5 Pro/i });
  expect(within(geminiOption).getByText('No credentials')).toBeInTheDocument();

  // Unavailable badge on the configured-but-unavailable model.
  const glmOption = screen.getByRole('option', { name: /GLM 5\.3 Flash/i });
  expect(within(glmOption).getByText('Unavailable')).toBeInTheDocument();
});

test('failed model discovery shows the Alias empty state (no stale providers)', async () => {
  api.getModels.mockRejectedValueOnce(new Error('api down'));

  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // Discovery failed with an empty draft: the always-known draft list still
  // yields the Alias entry, so its honest empty state renders (pointing at
  // Settings, with no Refresh action) instead of the curated fallback list.
  // The hook-level fallback semantics are pinned in useModelCatalog.test.js;
  // here the removed stale google/anthropic fallback models must never
  // reappear, and no badge may render without enrichment.
  const note = await screen.findByTestId('model-empty-note');
  expect(note).toHaveTextContent('Settings');
  expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  expect(screen.queryByText('google')).not.toBeInTheDocument();
  expect(screen.queryByText('anthropic')).not.toBeInTheDocument();
  expect(screen.queryByText('ollama-cloud')).not.toBeInTheDocument();
  expect(screen.queryByText('Ready')).not.toBeInTheDocument();
  expect(screen.queryByText('No credentials')).not.toBeInTheDocument();
});

/** Catalogue fixture with pi (default) + the custom free-type harness. */
const PI_AND_CUSTOM_CATALOGUE = {
  models: ENRICHED_MODELS,
  harnesses: [
    {
      id: 'pi',
      label: 'pi coding agent',
      description: 'pi harness',
      modelSelection: 'list',
      modelFlag: null,
      isDefault: true,
      models: ENRICHED_MODELS,
    },
    {
      id: 'custom',
      label: 'Custom command',
      description: 'custom harness',
      modelSelection: 'none',
      modelFlag: null,
      isDefault: false,
      models: [],
    },
  ],
};

test('harness control lists registered harnesses with the default flagged', async () => {
  api.getModels.mockResolvedValueOnce(PI_AND_CUSTOM_CATALOGUE);
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // The single wired harness control (ModelSelector's harness row) offers
  // every registered harness; the server default is labelled "(default)".
  const trigger = await screen.findByRole('combobox', { name: 'AI Harness' });
  fireEvent.click(trigger);
  await waitFor(() => {
    expect(screen.getByRole('option', { name: /pi coding agent \(default\)/i })).toBeInTheDocument();
  });
  expect(screen.getByRole('option', { name: /Custom command/i })).toBeInTheDocument();
});

test('selecting Custom hides the model control and saves harness + command (model baked in)', async () => {
  api.getModels.mockResolvedValueOnce(PI_AND_CUSTOM_CATALOGUE);
  api.updateProject.mockResolvedValue({ id: 'p1' });
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // No custom extras while a catalogue harness is selected.
  expect(screen.queryByLabelText('Custom Harness Command')).not.toBeInTheDocument();

  fireEvent.click(await screen.findByRole('combobox', { name: 'AI Harness' }));
  fireEvent.click(screen.getByRole('option', { name: /Custom command/i }));

  // Selecting custom reveals the free-text command line and hides the model
  // dropdown entirely (model flags bake into the command itself).
  expect(screen.getByLabelText('Custom Harness Command')).toBeInTheDocument();
  expect(screen.queryByLabelText('Custom Harness Model Flag')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Default AI Model' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Custom Harness Command'), {
    target: { value: 'claude --model sonnet -p' },
  });

  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        harness: 'custom',
        harnessCommand: 'claude --model sonnet -p',
      }),
      {},
    );
  });
});

test('custom without a command refuses to save (inline alert, no API call)', async () => {
  api.getModels.mockResolvedValueOnce(PI_AND_CUSTOM_CATALOGUE);
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  fireEvent.click(await screen.findByRole('combobox', { name: 'AI Harness' }));
  fireEvent.click(screen.getByRole('option', { name: /Custom command/i }));

  fireEvent.click(screen.getByText('Save Configuration'));
  expect(api.updateProject).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/command line/i);
});

test('a project stored on custom prefills the command and switching back to default clears it', async () => {
  api.getModels.mockResolvedValueOnce(PI_AND_CUSTOM_CATALOGUE);
  api.updateProject.mockResolvedValue({ id: 'p1' });
  const customProject = {
    ...projects[0],
    harness: 'custom',
    harnessCommand: 'muse exec --yolo',
  };
  renderWithKainBain(<ProjectSettings />, {
    projects: [customProject],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // The stored command line is reflected in the input.
  expect(await screen.findByLabelText('Custom Harness Command')).toHaveValue('muse exec --yolo');

  // Switching back to the default hides the extras; saving returns the
  // project to follow-the-default (harness '') with the command cleared.
  fireEvent.click(screen.getByRole('combobox', { name: 'AI Harness' }));
  fireEvent.click(screen.getByRole('option', { name: /pi coding agent \(default\)/i }));
  expect(screen.queryByLabelText('Custom Harness Command')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ harness: '', harnessCommand: '' }),
      {},
    );
  });
});

test('renders the Model Aliases section and includes aliases in the save payload', async () => {
  const projectWithAliases = {
    ...projects[0],
    modelAliases: [{ name: 'small', harness: 'pi', model: 'google::gemini-2.5-pro' }],
  };
  api.updateProject.mockResolvedValue({ id: 'p1' });
  renderWithKainBain(<ProjectSettings />, {
    projects: [projectWithAliases],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });
  fireEvent.click(screen.getByText('Aliases'));

  // The stored alias renders as a collapsed card; expand it to edit.
  expect(await screen.findByTestId('model-aliases-section')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('model-alias-toggle-0'));
  expect(screen.getByLabelText('Alias 1 name')).toHaveValue('small');

  // Renaming the alias persists the new list through the save payload.
  fireEvent.change(screen.getByLabelText('Alias 1 name'), { target: { value: 'medium' } });
  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        modelAliases: [
          {
            name: 'medium',
            harness: 'pi',
            model: 'google::gemini-2.5-pro',
            targets: [{ harness: 'pi', model: 'google::gemini-2.5-pro', percent: 100 }],
          },
        ],
      }),
      {},
    );
  });
});

test('a newly added alias row appears in the page default-model picker before saving', async () => {
  api.getModels.mockClear();
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });

  // Wait for the catalogue so the alias row targets a real harness.
  const harnessTrigger = await screen.findByRole('combobox', { name: 'AI Harness' });
  await waitFor(() => expect(harnessTrigger).toHaveTextContent('pi (default)'));

  // Alias rows live on the Aliases tab; nothing is saved yet.
  fireEvent.click(screen.getByText('Aliases'));
  fireEvent.click(screen.getByText('+ Add alias'));
  fireEvent.change(screen.getByLabelText('Alias 1 name'), { target: { value: 'small' } });
  fireEvent.click(screen.getByLabelText('Alias 1 model'));
  fireEvent.click(screen.getByRole('option', { name: /Claude 3\.7 Sonnet/i }));
  expect(api.updateProject).not.toHaveBeenCalled();

  // The draft survives the switch back: the name is offered under the
  // Alias harness in the Project tab's model picker, with no refresh call.
  fireEvent.click(screen.getByText('Project Settings'));
  fireEvent.click(screen.getByLabelText('AI Harness'));
  fireEvent.click(screen.getByRole('option', { name: 'Alias' }));
  fireEvent.click(screen.getByLabelText('Default AI Model'));
  expect(screen.getByRole('option', { name: 'small' })).toBeInTheDocument();
  expect(api.getModels).toHaveBeenCalledTimes(1);
});

test('untouched aliases are omitted from the save but the concurrency token is sent', async () => {
  const projectWithAliases = {
    ...projects[0],
    updatedAt: '2026-09-24T10:00:00.000Z',
    modelAliases: [{ name: 'small', harness: 'pi', model: 'google::gemini-2.5-pro' }],
  };
  api.updateProject.mockResolvedValue({ id: 'p1', modelAliases: projectWithAliases.modelAliases });
  renderWithKainBain(<ProjectSettings />, {
    projects: [projectWithAliases],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });
  fireEvent.click(screen.getByText('Aliases'));

  expect(await screen.findByTestId('model-aliases-section')).toBeInTheDocument();

  // Saving WITHOUT touching the alias table omits the key (a stale page
  // must never wipe aliases) while still sending the concurrency token so
  // a rival save conflicts instead of clobbering.
  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.not.objectContaining({ modelAliases: expect.anything() }),
      { expectedUpdatedAt: '2026-09-24T10:00:00.000Z' },
    );
  });
  expect(api.updateProject.mock.calls[0][1]).not.toHaveProperty('modelAliases');
});

test('a saved alias edit stops re-sending the table on later saves (no stale re-send)', async () => {
  const projectWithAliases = {
    ...projects[0],
    modelAliases: [{ name: 'small', harness: 'pi', model: 'google::gemini-2.5-pro' }],
  };
  api.updateProject.mockResolvedValue({
    id: 'p1',
    modelAliases: [{ name: 'medium', harness: 'pi', model: 'google::gemini-2.5-pro' }],
  });
  renderWithKainBain(<ProjectSettings />, {
    projects: [projectWithAliases],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });
  fireEvent.click(screen.getByText('Aliases'));

  // Edit the alias and save: the first payload carries the table.
  expect(await screen.findByTestId('model-aliases-section')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('model-alias-toggle-0'));
  fireEvent.change(screen.getByLabelText('Alias 1 name'), { target: { value: 'medium' } });
  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ modelAliases: expect.any(Array) }),
      {},
    );
  });

  // A later save that touches only the project name must omit the alias
  // table again — the saved draft now equals server truth, so re-sending it
  // could wipe aliases stored by another browser since.
  await waitFor(() => {
    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
  });
  // The name field lives on the Project tab; the saved alias edit survives
  // the switch because the shared form stays mounted.
  fireEvent.click(screen.getByText('Project Settings'));
  fireEvent.change(screen.getByLabelText('Project Name'), {
    target: { value: 'Project A Renamed' },
  });
  // The save button still shows the first save's confirmation label.
  fireEvent.click(screen.getByRole('button', { name: /saved/i }));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledTimes(2);
  });
  expect(api.updateProject.mock.calls[1][1]).not.toHaveProperty('modelAliases');
});

test('clearing every alias row still sends the (empty) list — an explicit wipe', async () => {
  const projectWithAliases = {
    ...projects[0],
    modelAliases: [{ name: 'small', harness: 'pi', model: 'google::gemini-2.5-pro' }],
  };
  api.updateProject.mockResolvedValue({ id: 'p1' });
  renderWithKainBain(<ProjectSettings />, {
    projects: [projectWithAliases],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });
  fireEvent.click(screen.getByText('Aliases'));

  expect(await screen.findByTestId('model-aliases-section')).toBeInTheDocument();
  // Removing the only row marks the table touched, so the save carries the
  // explicit empty list (the backend clears on empty) rather than omitting.
  fireEvent.click(screen.getByRole('button', { name: /Delete alias/i }));
  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ modelAliases: [] }),
      {},
    );
  });
});

test('renders the Retry & Timeouts section prefilled from stored overrides', () => {
  const budgetedProject = {
    ...projects[0],
    maxAutoIterations: 3,
    maxTransientRetries: 2,
    autoIterationEnabled: false,
    agentTimeoutMs: 111111,
    ciTimeoutMs: 22222,
  };
  renderWithKainBain(<ProjectSettings />, {
    projects: [budgetedProject],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  expect(screen.getByText('Retry & Timeouts')).toBeInTheDocument();
  expect(screen.getByLabelText('Max auto-iterations')).toHaveValue(3);
  expect(screen.getByLabelText('Max transient retries')).toHaveValue(2);
  expect(screen.getByLabelText('Automatic iteration')).toHaveValue('disabled');
  // Stored milliseconds display as minutes through the shared helper.
  expect(screen.getByLabelText('Agent stage timeout (minutes)')).toHaveValue(
    msToMinutes(111111),
  );
  expect(screen.getByLabelText('CI stage timeout (minutes)')).toHaveValue(
    msToMinutes(22222),
  );
  // Unset fields stay blank and point at the global default.
  expect(screen.getByLabelText('Merge stage timeout (minutes)')).toHaveValue(null);
  // Set fields claim the project override; blank ones the global default.
  expect(screen.getAllByText('Source: project override.').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Source: global default.').length).toBeGreaterThan(0);
});

test('a project without overrides shows blank retry fields on the global default', () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  expect(screen.getByLabelText('Max auto-iterations')).toHaveValue(null);
  expect(screen.getByLabelText('Max transient retries')).toHaveValue(null);
  expect(screen.getByLabelText('Automatic iteration')).toHaveValue('default');
  expect(screen.getByLabelText('Agent stage timeout (minutes)')).toHaveValue(null);
  expect(screen.queryByText('Source: project override.')).not.toBeInTheDocument();
  expect(screen.getAllByText('Source: global default.').length).toBe(6);
});

test('saving persists edited retry budgets and the tri-state switch', async () => {
  api.updateProject.mockResolvedValue({ id: 'p1' });
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });

  fireEvent.change(screen.getByLabelText('Max auto-iterations'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Max transient retries'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Automatic iteration'), { target: { value: 'disabled' } });
  // Minute inputs persist as the identical millisecond values as before.
  fireEvent.change(screen.getByLabelText('Agent stage timeout (minutes)'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('CI stage timeout (minutes)'), { target: { value: '1.5' } });

  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        maxAutoIterations: 3,
        // A zero count disables that loop (it round-trips as 0, not null).
        maxTransientRetries: 0,
        autoIterationEnabled: false,
        agentTimeoutMs: 60000,
        ciTimeoutMs: 90000,
        // Untouched fields stay "follow the default".
        mergeTimeoutMs: null,
      }),
      {},
    );
  });
});

test('blanking a set retry field clears it back to the global default', async () => {
  const budgetedProject = {
    ...projects[0],
    maxAutoIterations: 3,
    autoIterationEnabled: true,
  };
  api.updateProject.mockResolvedValue({ id: 'p1' });
  renderWithKainBain(<ProjectSettings />, {
    projects: [budgetedProject],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });

  expect(screen.getByLabelText('Max auto-iterations')).toHaveValue(3);
  fireEvent.change(screen.getByLabelText('Max auto-iterations'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Automatic iteration'), { target: { value: 'default' } });

  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ maxAutoIterations: null, autoIterationEnabled: null }),
      {},
    );
  });
});

test('blanking a set timeout override clears it back to the global default', async () => {
  const budgetedProject = {
    ...projects[0],
    agentTimeoutMs: 1800000,
  };
  api.updateProject.mockResolvedValue({ id: 'p1' });
  renderWithKainBain(<ProjectSettings />, {
    projects: [budgetedProject],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });

  // The stored 30-minute override displays as minutes, not milliseconds.
  expect(screen.getByLabelText('Agent stage timeout (minutes)')).toHaveValue(30);
  fireEvent.change(screen.getByLabelText('Agent stage timeout (minutes)'), {
    target: { value: '' },
  });

  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ agentTimeoutMs: null }),
      {},
    );
  });
});

test('invalid retry values refuse to save (inline alert, no API call)', async () => {
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  // The error surfaces twice (inline beside the field + once at the
  // section level), so match across every alert on the page.
  const alerted = (pattern) =>
    screen.getAllByRole('alert').some((alert) => pattern.test(alert.textContent || ''));

  // Fractional counts are rejected (whole numbers only).
  fireEvent.change(screen.getByLabelText('Max auto-iterations'), { target: { value: '2.5' } });
  fireEvent.click(screen.getByText('Save Configuration'));
  expect(api.updateProject).not.toHaveBeenCalled();
  expect(alerted(/whole number/i)).toBe(true);

  // Zero timeouts are rejected (timeouts must clear or stay above 0).
  // (The save button relabels to "Error — Retry" after the first refusal.)
  fireEvent.change(screen.getByLabelText('Max auto-iterations'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('CI stage timeout (minutes)'), { target: { value: '0' } });
  fireEvent.click(screen.getByText('Error — Retry'));
  expect(api.updateProject).not.toHaveBeenCalled();
  expect(alerted(/above 0/i)).toBe(true);
  expect(alerted(/minutes/i)).toBe(true);
});

test('a 409 save conflict tells the user to reload instead of failing silently', async () => {
  const conflict = new Error('API 409 on /projects/p1: {"error":"Conflict"}');
  conflict.status = 409;
  api.updateProject.mockRejectedValue(conflict);
  const notifyError = vi.fn();
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    notifyError,
  });

  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(/another tab or browser.*reload/i);
  });
  expect(notifyError).toHaveBeenCalledWith(expect.stringMatching(/reload and try again/i), 'Save Conflict');
  expect(screen.getByText('Error — Retry')).toBeInTheDocument();
});

const ZERO_HARNESS_CATALOGUE = {
  // The backend serves the curated fallback as the flat list for a `list`
  // default with an empty live catalog, so a zero-detection payload still
  // carries a non-empty models array (the hook only adopts the harnesses
  // view alongside a non-empty list — see useModelCatalog).
  models: [
    {
      key: 'pi::ollama-cloud::deepseek-v4-flash:0731-cloud',
      harness: 'pi',
      id: 'deepseek-v4-flash:0731-cloud',
      provider: 'ollama-cloud',
      name: 'DeepSeek v4 Flash (Cloud)',
      input: ['text'],
    },
  ],
  harnesses: [
    {
      id: 'pi',
      label: 'pi coding agent',
      modelSelection: 'list',
      models: [
        {
          key: 'pi::ollama-cloud::deepseek-v4-flash:0731-cloud',
          harness: 'pi',
          id: 'deepseek-v4-flash:0731-cloud',
          provider: 'ollama-cloud',
          name: 'DeepSeek v4 Flash (Cloud)',
          input: ['text'],
        },
      ],
      isDefault: true,
      available: null,
      detectionSource: 'unknown',
      hint: 'No pi model snapshot found — configure pi models or set PI_AGENT_DIR.',
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      modelSelection: 'list',
      models: [],
      isDefault: false,
      available: false,
      detectionSource: 'not-found',
      hint: 'Install the Antigravity CLI or set KAINBAIN_AGY_BIN.',
    },
    {
      id: 'custom',
      label: 'Custom command',
      modelSelection: 'none',
      models: [],
      isDefault: false,
      available: true,
      detectionSource: 'builtin',
    },
    {
      id: 'mock',
      label: 'Mock',
      modelSelection: 'list',
      models: [
        {
          key: 'mock::mock::echo-v1',
          harness: 'mock',
          id: 'echo-v1',
          provider: 'mock',
          name: 'Mock Echo v1 (no AI — evaluation/CI only)',
          input: ['text'],
        },
      ],
      isDefault: false,
      available: true,
      detectionSource: 'builtin',
    },
  ],
};

test('zero detected harnesses shows the guidance panel with hints and a mock opt-in', async () => {
  api.getModels.mockResolvedValueOnce(ZERO_HARNESS_CATALOGUE);
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  const panel = await screen.findByTestId('harness-guidance-panel');
  expect(panel).toHaveTextContent('No AI harnesses detected on this host');
  expect(panel).toHaveTextContent('Install the Antigravity CLI or set KAINBAIN_AGY_BIN.');
  expect(panel).toHaveTextContent('No pi model snapshot found');
  expect(
    screen.getByRole('button', { name: 'Use mock harness for evaluation' }),
  ).toBeInTheDocument();
});

test('the guidance mock opt-in selects mock and saves it (never silently)', async () => {
  api.getModels.mockResolvedValueOnce(ZERO_HARNESS_CATALOGUE);
  api.updateProject.mockResolvedValue({ id: 'p1' });
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  fireEvent.click(
    await screen.findByRole('button', { name: 'Use mock harness for evaluation' }),
  );
  expect(screen.getByRole('combobox', { name: 'AI Harness' })).toHaveTextContent('Mock');

  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ harness: 'mock' }),
      {},
    );
  });
});

test('no guidance panel when a real harness is available', async () => {
  api.getModels.mockResolvedValueOnce({
    models: ZERO_HARNESS_CATALOGUE.models,
    harnesses: ZERO_HARNESS_CATALOGUE.harnesses.map((harness) =>
      harness.id === 'pi'
        ? {
            ...harness,
            available: true,
            detectionSource: 'pi-snapshot',
            hint: undefined,
            models: [
              {
                key: 'pi::p::m1',
                harness: 'pi',
                id: 'm1',
                provider: 'p',
                name: 'M1',
                input: ['text'],
              },
            ],
          }
        : harness,
    ),
  });
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  await screen.findByRole('combobox', { name: 'AI Harness' });
  expect(screen.queryByTestId('harness-guidance-panel')).not.toBeInTheDocument();
});

test('no guidance panel for older backends without availability fields', async () => {
  api.getModels.mockResolvedValueOnce(PI_AND_CUSTOM_CATALOGUE);
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  await screen.findByRole('combobox', { name: 'AI Harness' });
  expect(screen.queryByTestId('harness-guidance-panel')).not.toBeInTheDocument();
});

test('shows a mismatch warning when the stored default is absent from the effective catalogue', async () => {
  const staleProject = {
    ...projects[0],
    harness: 'pi',
    defaultModel: 'antigravity::google::stale-model',
  };
  renderWithKainBain(<ProjectSettings />, {
    projects: [staleProject],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });

  const banner = await screen.findByTestId('default-model-mismatch-warning');
  expect(banner).toHaveTextContent('Model mismatch');
  expect(banner).toHaveTextContent('antigravity::google::stale-model');
  // The stored value is kept, never auto-rewritten.
  expect(api.updateProject).not.toHaveBeenCalled();
});

test('mismatch actions clear the stale default or keep-and-dismiss per combination', async () => {
  const staleProject = {
    ...projects[0],
    harness: 'pi',
    defaultModel: 'antigravity::google::stale-model',
  };
  renderWithKainBain(<ProjectSettings />, {
    projects: [staleProject],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
  });
  await screen.findByTestId('default-model-mismatch-warning');

  // Keep-and-warn dismisses this combination only.
  fireEvent.click(screen.getByTestId('default-model-mismatch-keep'));
  expect(screen.queryByTestId('default-model-mismatch-warning')).not.toBeInTheDocument();
});

test('mismatch clear action resets the default model to the harness default', async () => {
  const staleProject = {
    ...projects[0],
    harness: 'pi',
    defaultModel: 'antigravity::google::stale-model',
  };
  api.updateProject.mockResolvedValue({ id: 'p1' });
  renderWithKainBain(<ProjectSettings />, {
    projects: [staleProject],
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });
  await screen.findByTestId('default-model-mismatch-warning');

  fireEvent.click(screen.getByTestId('default-model-mismatch-clear'));
  expect(screen.queryByTestId('default-model-mismatch-warning')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Save Configuration'));
  await waitFor(() => {
    expect(api.updateProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ defaultModel: '' }),
      {},
    );
  });
});

test('surfaces soft save warnings inline without failing the save', async () => {
  api.updateProject.mockResolvedValue({
    id: 'p1',
    warnings: ['project defaultModel "x::y" is not in the "pi" harness catalog right now'],
  });
  renderWithKainBain(<ProjectSettings />, {
    projects,
    activeProjectId: 'p1',
    selectProject: vi.fn(),
    updateProjectInState: vi.fn(),
  });

  fireEvent.click(screen.getByText('Save Configuration'));
  const panel = await screen.findByTestId('save-warnings-panel');
  expect(panel).toHaveTextContent('not in the "pi" harness catalog');
  expect(screen.getByText('Saved ✓')).toBeInTheDocument();
});
