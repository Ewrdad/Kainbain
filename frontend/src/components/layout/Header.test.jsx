import { expect, test, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { Header, getSystemMenuItems } from './Header';
import { WorkflowCanvas } from '../workflow/WorkflowCanvas';
import { openSystemSettings } from '../settings/openSystemSettings';
import '@testing-library/jest-dom';

// The System Menu entry delegates to the popout-first action; stub it so the
// header test asserts the wiring (which action, which setView) without
// touching window.open or the router.
vi.mock('../settings/openSystemSettings', () => ({
  openSystemSettings: vi.fn(),
}));

/***
 * MARK: Header tests
 * @description Verifies brand, project selector, git-remote link, hide/show archived toggle,
 * absence of the header pipeline switcher (single-switcher dedup), and quick access buttons.
 ***/
const projects = [
  { id: 'proj-1', name: 'Project Alpha', slug: 'project-alpha' },
  { id: 'proj-2', name: 'Project Beta', slug: 'project-beta' },
];

const dedupStages = [
  { id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas.' },
  { id: '2', name: 'Review', type: 'human', prompt: 'Human review.' },
];

const dedupWorkflows = [
  { id: 'wf-1', name: 'Main Pipeline', isDefault: true },
  { id: 'wf-2', name: 'Hotfix Pipeline', isDefault: false },
];

test('renders brand, project selector, and git-remote quick-link when upstream repo exists (#24, #32)', () => {
  renderWithKainBain(<Header />, {
    projects: [
      {
        id: 'proj-1',
        name: 'Project Alpha',
        slug: 'project-alpha',
        hasUpstreamRepo: true,
        repoUrl: 'https://git.example.com/team/project-alpha',
      },
      { id: 'proj-2', name: 'Project Beta', slug: 'project-beta', hasUpstreamRepo: false },
    ],
    activeProjectId: 'proj-1',
  });
  expect(screen.getByText(/KAINBAIN/i)).toBeInTheDocument();
  expect(screen.getByText('Project Alpha')).toBeInTheDocument();

  const remoteLink = screen.getByRole('link', { name: /Open git remote/i });
  expect(remoteLink).toBeInTheDocument();
  expect(remoteLink).toHaveAttribute('href', 'https://git.example.com/team/project-alpha');
});

test('does not render git-remote link when hasUpstreamRepo is false (#32)', () => {
  renderWithKainBain(<Header />, {
    projects: [
      { id: 'proj-1', name: 'Project Alpha', slug: 'project-alpha', hasUpstreamRepo: false },
    ],
    activeProjectId: 'proj-1',
  });
  expect(screen.queryByRole('link', { name: /Open git remote/i })).not.toBeInTheDocument();
});

test('does not render git-remote link when no remote URL is configured (never fabricated)', () => {
  renderWithKainBain(<Header />, {
    projects: [
      { id: 'proj-1', name: 'Project Alpha', slug: 'project-alpha', hasUpstreamRepo: true },
    ],
    activeProjectId: 'proj-1',
  });
  expect(screen.queryByRole('link', { name: /Open git remote/i })).not.toBeInTheDocument();
});

test('compute controls and context meter are not present in the header', () => {
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    computeRunning: true,
  });
  expect(screen.queryByText(/Start Engine/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Stop Engine/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Context:/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Compact')).not.toBeInTheDocument();
});

test('opening the dropdown and selecting a project calls selectProject', () => {
  const selectProject = vi.fn();
  const setIsProjectDropdownOpen = vi.fn();
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    selectProject,
    isProjectDropdownOpen: true,
    setIsProjectDropdownOpen,
  });
  fireEvent.click(screen.getByText('Project Beta'));
  expect(selectProject).toHaveBeenCalledWith('proj-2');
});

test('supports toggling hide project and show archived toggle in dropdown (#29)', () => {
  const toggleHideProject = vi.fn();
  const setShowArchived = vi.fn();

  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    isProjectDropdownOpen: true,
    hiddenProjectIds: ['proj-2'],
    toggleHideProject,
    showArchived: false,
    setShowArchived,
  });

  const hideBtn = screen.getByRole('button', { name: 'Hide Project Alpha' });
  fireEvent.click(hideBtn);
  expect(toggleHideProject).toHaveBeenCalledWith('proj-1');

  const showArchivedCheckbox = screen.getByLabelText(/Show Archived/i);
  fireEvent.click(showArchivedCheckbox);
  expect(setShowArchived).toHaveBeenCalled();
});

test('renders embedded tab navigator inside the header band (#20)', () => {
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    view: 'orchestrator',
  });
  expect(screen.getByRole('button', { name: /Orchestrator/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Settings/i })).toBeInTheDocument();
});

test('customize button opens the customization modal', () => {
  const setIsCustomizationModalOpen = vi.fn();
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    setIsCustomizationModalOpen,
  });
  fireEvent.click(screen.getByLabelText('System Menu'));
  fireEvent.click(screen.getByText('Customize UI'));
  expect(setIsCustomizationModalOpen).toHaveBeenCalledWith(true);
});

test('keyboard shortcuts button opens the shortcuts modal', () => {
  const setIsShortcutsModalOpen = vi.fn();
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    setIsShortcutsModalOpen,
  });
  fireEvent.click(screen.getByLabelText('System Menu'));
  fireEvent.click(screen.getByText('Keyboard Shortcuts'));
  expect(setIsShortcutsModalOpen).toHaveBeenCalledWith(true);
});

test('system menu lists Docs first with the platform description', () => {
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
  });
  fireEvent.click(screen.getByLabelText('System Menu'));
  const docsItem = screen.getByRole('menuitem', { name: /Docs/i });
  expect(docsItem).toBeInTheDocument();
  expect(docsItem.textContent).toMatch(/not project-specific/i);
  const menu = screen.getByRole('menu', { name: 'System' });
  const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
  expect(items[0].textContent).toMatch(/Docs/);
});

test('system menu Docs entry opens the docs view via the setView facade', () => {
  const setView = vi.fn();
  const setIsOpen = vi.fn();
  const items = getSystemMenuItems({ setIsOpen, setView });
  expect(items[0].key).toBe('docs');
  items[0].onClick();
  expect(setIsOpen).toHaveBeenCalledWith(false);
  expect(setView).toHaveBeenCalledWith('docs');
  // Navigation belongs to the router (the facade navigates): the menu itself
  // must not write raw hashes, so leaving docs can never strand a location.
});

test('system menu Docs entry leaves the URL to the router', () => {
  const setView = vi.fn();
  window.location.hash = '#/docs/install-run';
  try {
    const items = getSystemMenuItems({ setIsOpen: vi.fn(), setView });
    items[0].onClick();
    expect(setView).toHaveBeenCalledWith('docs');
    expect(window.location.hash).toBe('#/docs/install-run');
  } finally {
    window.location.hash = '';
  }
});

test('clicking Docs in the system menu switches to the docs view', () => {
  const setView = vi.fn();
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    setView,
  });
  fireEvent.click(screen.getByLabelText('System Menu'));
  fireEvent.click(screen.getByRole('menuitem', { name: /Docs/i }));
  expect(setView).toHaveBeenCalledWith('docs');
});

test('system settings menu entry opens the popout-first System Settings action', () => {
  openSystemSettings.mockClear();
  const setView = vi.fn();
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    setView,
  });
  fireEvent.click(screen.getByLabelText('System Menu'));
  fireEvent.click(screen.getByRole('menuitem', { name: /System Settings/i }));
  expect(openSystemSettings).toHaveBeenCalledTimes(1);
  expect(openSystemSettings).toHaveBeenCalledWith({ setView });
});

test('system-settings entry sits after Customize UI and before Keyboard Shortcuts', () => {
  const items = getSystemMenuItems({ setIsOpen: vi.fn() });
  const keys = items.map((item) => item.key);
  expect(keys).toContain('system-settings');
  expect(keys.indexOf('system-settings')).toBeGreaterThan(keys.indexOf('customize'));
  expect(keys.indexOf('system-settings')).toBeLessThan(keys.indexOf('shortcuts'));
});

test('getSystemMenuItems exposes a system-settings entry that closes the menu and pops out System Settings', () => {
  openSystemSettings.mockClear();
  const setIsOpen = vi.fn();
  const setView = vi.fn();
  const items = getSystemMenuItems({ setIsOpen, setView });
  const entry = items.find((item) => item.key === 'system-settings');
  expect(entry).toBeDefined();
  expect(entry.label).toBe('System Settings');
  expect(entry.desc).toMatch(/new window/i);
  entry.onClick();
  expect(setIsOpen).toHaveBeenCalledWith(false);
  expect(openSystemSettings).toHaveBeenCalledWith({ setView });
});

test('getSystemMenuItems exposes a compact-monitor entry right after Docs', () => {
  window.sessionStorage.clear();
  const setIsOpen = vi.fn();
  const setView = vi.fn();
  const items = getSystemMenuItems({ setIsOpen, setView });
  const keys = items.map((item) => item.key);
  expect(keys[0]).toBe('docs');
  expect(keys[1]).toBe('compact-monitor');
  const entry = items[1];
  expect(entry.label).toBe('Compact Monitor');
  entry.onClick();
  expect(setIsOpen).toHaveBeenCalledWith(false);
  expect(setView).toHaveBeenCalledWith('observability');
  expect(window.sessionStorage.getItem('kainbain:observability:compact')).toBe('1');
  window.sessionStorage.clear();
});

test('clicking Compact Monitor in the system menu opens the compact view', () => {
  window.sessionStorage.clear();
  const setView = vi.fn();
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    setView,
  });
  fireEvent.click(screen.getByLabelText('System Menu'));
  fireEvent.click(screen.getByRole('menuitem', { name: /Compact Monitor/i }));
  expect(setView).toHaveBeenCalledWith('observability');
  expect(window.sessionStorage.getItem('kainbain:observability:compact')).toBe('1');
  window.sessionStorage.clear();
});

test('header mobile monitor button taps into the compact view without a popout', () => {
  window.sessionStorage.clear();
  const setView = vi.fn();
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  renderWithKainBain(<Header />, {
    projects: [{ id: 'proj-1', name: 'Project Alpha', slug: 'project-alpha' }],
    activeProjectId: 'proj-1',
    setView,
  });
  fireEvent.click(screen.getByRole('button', { name: /Open Compact Monitor Logs View/i }));
  expect(setView).toHaveBeenCalledWith('observability');
  expect(window.sessionStorage.getItem('kainbain:observability:compact')).toBe('1');
  expect(openSpy).not.toHaveBeenCalled();
  openSpy.mockRestore();
  window.sessionStorage.clear();
});

test('header renders no pipeline switcher even with multiple workflows (dedup ab26f9cd)', () => {
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    projectWorkflows: dedupWorkflows,
    activeWorkflowId: 'wf-1',
    switchWorkflow: vi.fn(),
  });
  expect(
    screen.queryByRole('button', { name: 'Switch project workflow pipeline' }),
  ).not.toBeInTheDocument();
});

test('main page shows exactly one pipeline switcher: the canvas selector (dedup ab26f9cd)', () => {
  renderWithKainBain(
    <>
      <Header />
      <WorkflowCanvas />
    </>,
    {
      projects,
      activeProjectId: 'proj-1',
      stages: dedupStages,
      tasks: [],
      projectWorkflows: dedupWorkflows,
      activeWorkflowId: 'wf-1',
      switchWorkflow: vi.fn(),
    },
  );
  // The canvas toolbar selector survives…
  expect(screen.getByRole('button', { name: 'Select pipeline workflow' })).toBeInTheDocument();
  // …and it is the ONLY pipeline switcher on the page (the header pill is
  // gone). Matched by exact switcher labels: a loose /pipeline|workflow/i
  // would also catch "Add new pipeline stage", which is not a switcher.
  const switchers = screen.queryAllByRole('button', {
    name: /(Select pipeline workflow|Switch project workflow pipeline)/,
  });
  expect(switchers).toHaveLength(1);
});

test('project menu search filters rows and Enter selects the highlight', () => {
  const selectProject = vi.fn();
  const setIsProjectDropdownOpen = vi.fn();
  const many = [
    { id: 'proj-1', name: 'Project Alpha', slug: 'project-alpha' },
    { id: 'proj-2', name: 'Project Beta', slug: 'project-beta' },
    { id: 'proj-3', name: 'Docs Site', slug: 'docs-site' },
  ];
  renderWithKainBain(<Header />, {
    projects: many,
    activeProjectId: 'proj-1',
    selectProject,
    isProjectDropdownOpen: true,
    setIsProjectDropdownOpen,
  });
  const search = screen.getByLabelText('Search projects');
  fireEvent.change(search, { target: { value: 'beta' } });
  expect(screen.queryByText('Docs Site')).not.toBeInTheDocument();
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(selectProject).toHaveBeenCalledWith('proj-2');
});

test('project menu list region is bounded and footer stays pinned', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: `proj-${i}`,
    name: `Project ${i}`,
    slug: `project-${i}`,
  }));
  renderWithKainBain(<Header />, {
    projects: many,
    activeProjectId: 'proj-0',
    isProjectDropdownOpen: true,
  });
  const list = screen.getByTestId('project-menu-list');
  expect(list.className).toMatch(/max-h-/);
  expect(list.className).toMatch(/overflow-y-auto/);
  expect(list.querySelectorAll('[role="option"]')).toHaveLength(60);
  expect(list.contains(screen.getByText('+ New Project'))).toBe(false);
});

test('opens create project modal and creates project on submit', () => {
  const createProject = vi.fn();
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    createProject,
    isProjectDropdownOpen: true,
    setIsProjectDropdownOpen: vi.fn(),
  });
  fireEvent.click(screen.getByText('+ New Project'));
  expect(screen.getByText('Create New Project')).toBeInTheDocument();

  const nameInput = screen.getByLabelText('Project Name');
  fireEvent.change(nameInput, { target: { value: 'New Test Project' } });
  fireEvent.submit(nameInput.closest('form'));

  expect(createProject).toHaveBeenCalledWith('New Test Project');
});

test('opens adopt project modal and registers the directory on submit', async () => {
  const registerProject = vi.fn().mockResolvedValue({ id: 'proj-9', name: 'Adopted Repo' });
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    registerProject,
    isProjectDropdownOpen: true,
    setIsProjectDropdownOpen: vi.fn(),
  });
  fireEvent.click(screen.getByText('+ Add Existing Project…'));
  expect(screen.getByText('Add Existing Project')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Project Directory'), {
    target: { value: '/repos/adopted' },
  });
  fireEvent.change(screen.getByLabelText('Display Name (optional)'), {
    target: { value: 'Adopted Repo' },
  });
  fireEvent.change(screen.getByLabelText('KainBain Folder Name (optional)'), {
    target: { value: '.kb' },
  });
  fireEvent.submit(screen.getByLabelText('Project Directory').closest('form'));

  expect(registerProject).toHaveBeenCalledWith({
    path: '/repos/adopted',
    name: 'Adopted Repo',
    kainbainDirName: '.kb',
  });
});

test('adopt modal omits blank optional fields and shows a registration error inline', async () => {
  const registerProject = vi
    .fn()
    .mockRejectedValue(new Error("Project path '/nope' does not exist"));
  renderWithKainBain(<Header />, {
    projects,
    activeProjectId: 'proj-1',
    registerProject,
    isProjectDropdownOpen: true,
    setIsProjectDropdownOpen: vi.fn(),
  });
  fireEvent.click(screen.getByText('+ Add Existing Project…'));
  fireEvent.change(screen.getByLabelText('Project Directory'), {
    target: { value: '/nope' },
  });
  fireEvent.submit(screen.getByLabelText('Project Directory').closest('form'));

  expect(registerProject).toHaveBeenCalledWith({
    path: '/nope',
    name: undefined,
    kainbainDirName: undefined,
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(/does not exist/);
});

test('renders the Go to App pill when the active project has an app link', () => {
  renderWithKainBain(<Header />, {
    projects: [
      {
        id: 'proj-1',
        name: 'Project Alpha',
        slug: 'project-alpha',
        appStatus: {
          url: 'http://localhost:5173',
          networkHost: 'home.home',
          status: 'starting',
        },
      },
    ],
    activeProjectId: 'proj-1',
  });
  const link = screen.getByRole('link', { name: /Open app \(starting\)/i });
  expect(link).toHaveAttribute('href', 'http://home.home:5173/');
  expect(link).toHaveTextContent('Go to App');
});

test('hides the Go to App pill when the active project has no app link', () => {
  renderWithKainBain(<Header />, { projects, activeProjectId: 'proj-1' });
  expect(screen.queryByRole('link', { name: /Open app/i })).not.toBeInTheDocument();
});

test('header keeps the full control set in logical order with app link + git remote (task 66ad153f)', () => {
  renderWithKainBain(<Header />, {
    projects: [
      {
        id: 'proj-1',
        name: 'Project Alpha',
        slug: 'project-alpha',
        hasUpstreamRepo: true,
        repoUrl: 'https://git.example.com/team/project-alpha',
        appStatus: { url: 'http://localhost:5173', status: 'running' },
      },
    ],
    activeProjectId: 'proj-1',
    view: 'orchestrator',
  });
  // The stacked mobile header reflows visually (Row A / Row B) but the DOM
  // — and therefore keyboard tab order — stays brand → project → tabs →
  // app link → monitor → menu. Nothing may be dropped to make room.
  const header = document.querySelector('header');
  const names = Array.from(header.querySelectorAll('button, a')).map((el) =>
    (el.getAttribute('aria-label') || el.textContent || '').trim(),
  );
  const at = (re) => names.findIndex((n) => re.test(n));
  const positions = {
    firstTab: at(/Orchestrator/),
    lastTab: at(/Retrospective/),
    gitRemote: at(/Open git remote/),
    appLink: at(/Open app/),
    monitor: at(/Observability|Compact Monitor/),
    menu: at(/System Menu/),
  };
  for (const [name, i] of Object.entries(positions)) {
    expect(i, `${name} renders in the header`).toBeGreaterThanOrEqual(0);
  }
  expect(positions.firstTab).toBeLessThan(positions.lastTab);
  expect(positions.lastTab).toBeLessThan(positions.gitRemote);
  expect(positions.gitRemote).toBeLessThan(positions.appLink);
  expect(positions.appLink).toBeLessThan(positions.monitor);
  expect(positions.monitor).toBeLessThan(positions.menu);
  // Single source of navigation: the tab strip lives inside the header band.
  expect(
    within(header).getByRole('navigation', { name: 'Primary navigation' }),
  ).toBeInTheDocument();
});

test('getSystemMenuItems tolerates a bare call (all actions unset)', () => {
  expect(() => getSystemMenuItems()).not.toThrow();
  const items = getSystemMenuItems();
  expect(items[0].key).toBe('docs');
  for (const item of items) {
    expect(() => item.onClick()).not.toThrow();
  }
});

test('header survives malformed project records without crashing (fail-safe)', () => {
  renderWithKainBain(<Header />, {
    projects: [
      { id: 'proj-1', name: 'Project Alpha', slug: 'project-alpha', repoUrl: 42, gitUrl: 7 },
      null,
    ],
    activeProjectId: 'proj-1',
  });
  expect(screen.getByText('Project Alpha')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Open git remote/i })).not.toBeInTheDocument();
});

test('header renders with a null project list instead of crashing', () => {
  renderWithKainBain(<Header />, {
    projects: null,
    visibleProjects: null,
    activeProjectId: 'proj-1',
  });
  expect(screen.getByRole('banner')).toBeInTheDocument();
});

test('System Menu supports arrow-key navigation and Escape returns focus (WCAG 2.1.1)', () => {
  renderWithKainBain(<Header />, { projects, activeProjectId: 'proj-1' });
  const trigger = screen.getByRole('button', { name: 'System Menu' });
  fireEvent.click(trigger);

  const items = screen.getAllByRole('menuitem');
  expect(items.length).toBeGreaterThan(0);
  // Initial focus lands on the first menuitem.
  expect(document.activeElement).toBe(items[0]);

  // ArrowDown moves forward, ArrowUp wraps to the last item.
  fireEvent.keyDown(items[0], { key: 'ArrowDown' });
  expect(document.activeElement).toBe(items[1]);
  fireEvent.keyDown(items[1], { key: 'ArrowUp' });
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(items[0], { key: 'ArrowUp' });
  expect(document.activeElement).toBe(items[items.length - 1]);

  // Every menuitem meets the AAA 44px target-size floor.
  for (const item of items) {
    expect(item.className).toMatch(/min-h-\[44px\]/);
  }

  // Escape closes the menu and returns focus to the trigger.
  fireEvent.keyDown(items[items.length - 1], { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(document.activeElement).toBe(trigger);
});
