import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjects } from './useProjects';

vi.mock('../services/api', () => ({
  api: {
    listProjects: vi.fn(),
    activateProject: vi.fn(),
    createProject: vi.fn(),
    registerProject: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { api } from '../services/api';

/***
 * MARK: useProjects tests
 * @description Verifies the project list, active-project selection, dropdown state,
 * project creation, hidden project toggles, archived filter, and localStorage persistence.
 ***/
describe('useProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  const projects = [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B' },
  ];

  it('fetchProjects stores the list and sets the first as active', async () => {
    api.listProjects.mockResolvedValue(projects);
    const { result } = renderHook(() => useProjects({}));
    await act(async () => {
      await result.current.fetchProjects();
    });
    expect(result.current.projects).toEqual(projects);
    expect(result.current.activeProjectId).toBe('p1');
  });

  it('selectProject activates the chosen project, persists to localStorage, and calls onSelectProject', async () => {
    api.activateProject.mockResolvedValue({});
    const onSelectProject = vi.fn();
    const { result } = renderHook(() => useProjects({ onSelectProject }));
    await act(async () => {
      await result.current.selectProject('p2');
    });
    expect(api.activateProject).toHaveBeenCalledWith('p2');
    expect(result.current.activeProjectId).toBe('p2');
    expect(result.current.isProjectDropdownOpen).toBe(false);
    expect(onSelectProject).toHaveBeenCalledWith('p2');
    expect(window.localStorage.getItem('kainbain:activeProjectId')).toBe('p2');
  });

  it('createProject adds the project and selects it', async () => {
    api.createProject.mockResolvedValue({ id: 'p3', name: 'C' });
    const { result } = renderHook(() => useProjects({}));
    let created;
    await act(async () => {
      created = await result.current.createProject('C');
    });
    expect(created.id).toBe('p3');
    expect(result.current.projects).toContainEqual({ id: 'p3', name: 'C' });
    expect(result.current.activeProjectId).toBe('p3');
  });

  it('createProject returns null on failure', async () => {
    api.createProject.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useProjects({}));
    let created;
    await act(async () => {
      created = await result.current.createProject('C');
    });
    expect(created).toBeNull();
  });

  it('registerProject adopts the project and selects it', async () => {
    api.registerProject.mockResolvedValue({
      id: 'p4',
      name: 'Adopted Repo',
      cwd: '/repos/adopted',
    });
    const { result } = renderHook(() => useProjects({}));
    let adopted;
    await act(async () => {
      adopted = await result.current.registerProject({
        path: '/repos/adopted',
        name: 'Adopted Repo',
      });
    });
    expect(adopted.id).toBe('p4');
    expect(result.current.projects).toContainEqual({
      id: 'p4',
      name: 'Adopted Repo',
      cwd: '/repos/adopted',
    });
    expect(result.current.activeProjectId).toBe('p4');
  });

  it('toggles the project dropdown', () => {
    const { result } = renderHook(() => useProjects({}));
    expect(result.current.isProjectDropdownOpen).toBe(false);
    act(() => result.current.setIsProjectDropdownOpen(true));
    expect(result.current.isProjectDropdownOpen).toBe(true);
  });

  it('supports hiding projects and filtering visible projects', async () => {
    api.listProjects.mockResolvedValue(projects);
    const { result } = renderHook(() => useProjects({}));
    await act(async () => {
      await result.current.fetchProjects();
    });

    expect(result.current.visibleProjects).toHaveLength(2);

    act(() => {
      result.current.toggleHideProject('p1');
    });

    expect(result.current.hiddenProjectIds).toContain('p1');
    expect(result.current.visibleProjects).toHaveLength(1);
    expect(result.current.visibleProjects[0].id).toBe('p2');

    // When showArchived is true, all projects are shown in visibleProjects
    act(() => {
      result.current.setShowArchived(true);
    });
    expect(result.current.showArchived).toBe(true);
    expect(result.current.visibleProjects).toHaveLength(2);
  });

  it('updateProjectInState merges a project by id and leaves others unchanged', async () => {
    api.listProjects.mockResolvedValue(projects);
    const { result } = renderHook(() => useProjects({}));
    await act(async () => {
      await result.current.fetchProjects();
    });

    act(() => {
      result.current.updateProjectInState({ id: 'p1', accentColor: '#38bdf8', name: 'A2' });
    });

    expect(result.current.projects[0]).toMatchObject({
      id: 'p1',
      accentColor: '#38bdf8',
      name: 'A2',
    });
    expect(result.current.projects[1]).toEqual({ id: 'p2', name: 'B' });
  });

  it('updateProjectInState is a no-op for an unknown id', async () => {
    api.listProjects.mockResolvedValue(projects);
    const { result } = renderHook(() => useProjects({}));
    await act(async () => {
      await result.current.fetchProjects();
    });

    act(() => {
      result.current.updateProjectInState({ id: 'nope', accentColor: '#38bdf8' });
    });

    expect(result.current.projects).toEqual(projects);
  });
});
