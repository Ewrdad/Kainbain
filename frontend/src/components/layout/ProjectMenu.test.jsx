import { afterEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectMenu } from './ProjectMenu';
import '@testing-library/jest-dom';

/***
 * MARK: ProjectMenu tests
 * @description Covers the scrollable + searchable project selector: bounded
 *   scroll region with pinned actions, search filtering with count + empty
 *   state, full keyboard flow, hide/archived interplay on filtered lists, and
 *   the grouping-compatible `group` render hook.
 ***/
const projects = [
  { id: 'p1', name: 'Project Alpha' },
  { id: 'p2', name: 'Project Beta' },
  { id: 'p3', name: 'Docs Site' },
];

function renderMenu(overrides = {}) {
  return render(
    <ProjectMenu
      projects={projects}
      visibleProjects={projects}
      activeProjectId="p1"
      selectProject={() => {}}
      onClose={() => {}}
      onCreateProject={() => {}}
      hiddenProjectIds={[]}
      toggleHideProject={() => {}}
      showArchived={false}
      setShowArchived={() => {}}
      {...overrides}
    />,
  );
}

function countText(filtered, total) {
  return (_, element) => element?.textContent === `${filtered} / ${total}`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scroll containment', () => {
  test('list region is height-bounded and scrolls internally', () => {
    renderMenu();
    const list = screen.getByTestId('project-menu-list');
    expect(list).toHaveAttribute('role', 'listbox');
    expect(list.className).toMatch(/max-h-/);
    expect(list.className).toMatch(/overflow-y-auto/);
  });

  test('count header, archived toggle, and + New Project stay outside the scroll region', () => {
    renderMenu();
    const list = screen.getByTestId('project-menu-list');
    expect(list.contains(screen.getByText('Active Projects'))).toBe(false);
    expect(list.contains(screen.getByLabelText(/Show Archived/i))).toBe(false);
    expect(list.contains(screen.getByText('+ New Project'))).toBe(false);
  });

  test('renders 100 projects inside the bounded container', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `p-${i}`, name: `Project ${i}` }));
    renderMenu({ projects: many, visibleProjects: many, activeProjectId: 'p-99' });
    const list = screen.getByTestId('project-menu-list');
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(100);
    expect(screen.getByText(countText(100, 100))).toBeInTheDocument();
  });

  test('scrolls the active project into view on open', () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    renderMenu({ activeProjectId: 'p3' });
    expect(scrollSpy).toHaveBeenCalled();
  });
});

describe('search filtering', () => {
  test('typing filters rows and updates the X / N count', () => {
    renderMenu();
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'project' } });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText(countText(2, 3))).toBeInTheDocument();
    expect(screen.queryByText('Docs Site')).not.toBeInTheDocument();
  });

  test('matching is case-insensitive and shows an explicit empty state', () => {
    renderMenu();
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'ALPHA' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'zzz-nope' } });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText(/No projects match/)).toBeInTheDocument();
    // Footer actions stay reachable on empty results.
    expect(screen.getByText('+ New Project')).toBeInTheDocument();
    expect(screen.getByLabelText(/Show Archived/i)).toBeInTheDocument();
  });

  test('selecting a project clears the query', () => {
    const selectProject = vi.fn();
    renderMenu({ selectProject });
    const search = screen.getByLabelText('Search projects');
    fireEvent.change(search, { target: { value: 'alpha' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.click(screen.getByText('Project Alpha'));
    expect(selectProject).toHaveBeenCalledWith('p1');
    expect(search.value).toBe('');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  test('search input is focused on open and wired as a combobox', () => {
    renderMenu();
    const search = screen.getByLabelText('Search projects');
    expect(document.activeElement).toBe(search);
    expect(search).toHaveAttribute('role', 'combobox');
    const listboxId = search.getAttribute('aria-controls');
    expect(listboxId).toBeTruthy();
    expect(document.getElementById(listboxId)).toBe(screen.getByTestId('project-menu-list'));
  });
});

describe('keyboard flow', () => {
  test('ArrowDown + Enter selects the highlighted filtered project', () => {
    const selectProject = vi.fn();
    renderMenu({ selectProject });
    const search = screen.getByLabelText('Search projects');
    fireEvent.change(search, { target: { value: 'project' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(selectProject).toHaveBeenCalledWith('p1');
  });

  test('ArrowUp/Down clamps at the ends; Home/End jump', () => {
    const selectProject = vi.fn();
    renderMenu({ selectProject });
    const search = screen.getByLabelText('Search projects');
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(selectProject).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: 'End' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(selectProject).toHaveBeenCalledWith('p3');
  });

  test('Escape closes the menu and clears the query', () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    const search = screen.getByLabelText('Search projects');
    fireEvent.change(search, { target: { value: 'alpha' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(search.value).toBe('');
  });
});

describe('hide/archived interplay on filtered lists', () => {
  test('hide toggle works on a filtered row', () => {
    const toggleHideProject = vi.fn();
    renderMenu({ toggleHideProject });
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'beta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Project Beta' }));
    expect(toggleHideProject).toHaveBeenCalledWith('p2');
  });

  test('hidden badge and archived toggle survive filtering', () => {
    renderMenu({ hiddenProjectIds: ['p2'] });
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'beta' } });
    expect(screen.getByText('hidden')).toBeInTheDocument();
    expect(screen.getByLabelText(/Show Archived/i)).toBeInTheDocument();
  });
});

describe('grouping compatibility hook', () => {
  const grouped = [
    { id: 'g1', name: 'Alpha One', group: 'Team A' },
    { id: 'g2', name: 'Alpha Two', group: 'Team A' },
    { id: 'g3', name: 'Beta One', group: 'Team B' },
    { id: 'g4', name: 'Ungrouped Solo' },
  ];

  test('renders section headers for consecutive shared groups', () => {
    renderMenu({ projects: grouped, visibleProjects: grouped, activeProjectId: 'g1' });
    expect(screen.getByRole('group', { name: 'Team A' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Team B' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  test('filtering still works with grouped fixtures', () => {
    renderMenu({ projects: grouped, visibleProjects: grouped, activeProjectId: 'g1' });
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'alpha' } });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText(countText(2, 4))).toBeInTheDocument();
  });
});

describe('adopt existing project + cwd disambiguation', () => {
  test('shows each project cwd so same-named projects across roots are distinguishable', () => {
    const dupes = [
      { id: 'd1', name: 'Site', cwd: '/work/a/site' },
      { id: 'd2', name: 'Site', cwd: '/mnt/nas/site' },
    ];
    renderMenu({ projects: dupes, visibleProjects: dupes, activeProjectId: 'd1' });
    expect(screen.getAllByText('Site')).toHaveLength(2);
    expect(screen.getByText('/work/a/site')).toBeInTheDocument();
    expect(screen.getByText('/mnt/nas/site')).toBeInTheDocument();
  });

  test('calls onAdoptProject when Add Existing Project is clicked', () => {
    const onAdoptProject = vi.fn();
    renderMenu({ onAdoptProject });
    fireEvent.click(screen.getByText('+ Add Existing Project…'));
    expect(onAdoptProject).toHaveBeenCalledTimes(1);
  });

  test('add-existing action stays outside the scroll region', () => {
    renderMenu({ onAdoptProject: () => {} });
    const list = screen.getByTestId('project-menu-list');
    expect(list.contains(screen.getByText('+ Add Existing Project…'))).toBe(false);
  });
});
