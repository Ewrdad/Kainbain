import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKbReferenceData, formatEntityLabel, resolveReference } from './useKbReferenceData';

vi.mock('../services/api', () => ({
  api: {
    listProjects: vi.fn(),
    getWorkflows: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../services/api';

/***
 * MARK: useKbReferenceData tests
 * @description Verifies the cascading KB reference data hook: projects fetched
 *   once on mount, workflows fetched lazily per project with per-id caching,
 *   loading and error state, tolerance of odd API payloads, pure stagesFor
 *   reads, and unmount safety. Also covers the pure helpers formatEntityLabel
 *   and resolveReference (the frontend mirror of the API resolver).
 ***/
const projects = [
  { id: 'proj-alpha', name: 'Alpha', slug: 'alpha' },
  { id: 'proj-beta', name: 'Beta', slug: 'beta' },
];

const workflowsPayload = {
  workflows: [
    {
      id: 'wf-default',
      name: 'Feature Pipeline',
      isDefault: true,
      stages: [
        { id: 'stage-idea', name: 'Idea' },
        { id: 'stage-build', name: 'Build' },
      ],
    },
    {
      id: 'wf-hotfix',
      name: 'Hotfix',
      isDefault: false,
      stages: [
        { id: 'stage-idea', name: 'Idea' },
        { id: 'stage-ship', name: 'Ship' },
      ],
    },
  ],
  activeWorkflowId: 'wf-default',
};

/***
 * MARK: renderLoadedProjects
 * @description Renders the hook and flushes the mount-time projects fetch
 *   inside act (the explicit call dedupes onto the in-flight mount fetch).
 ***/
async function renderLoadedProjects(options = {}) {
  const rendered = renderHook(() => useKbReferenceData(options));
  await act(async () => {
    await rendered.result.current.loadProjects();
  });
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useKbReferenceData', () => {
  describe('projects cascade', () => {
    it('auto-fetches projects once on mount', async () => {
      api.listProjects.mockResolvedValue(projects);
      const { result } = await renderLoadedProjects();
      expect(api.listProjects).toHaveBeenCalledTimes(1);
      expect(result.current.projects).toEqual(projects);
      expect(result.current.projectsError).toBeNull();
      expect(result.current.projectsLoading).toBe(false);
    });

    it('does not fetch workflows until loadWorkflows is invoked (lazy cascade)', async () => {
      api.listProjects.mockResolvedValue(projects);
      api.getWorkflows.mockResolvedValue(workflowsPayload);
      const { result } = await renderLoadedProjects();
      expect(api.getWorkflows).not.toHaveBeenCalled();
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      expect(api.getWorkflows).toHaveBeenCalledTimes(1);
      expect(api.getWorkflows).toHaveBeenCalledWith('proj-alpha');
      expect(result.current.workflowsFor('proj-alpha')).toEqual(workflowsPayload.workflows);
      expect(result.current.workflowsByProject['proj-alpha']).toEqual(workflowsPayload.workflows);
    });

    it('defaults loadWorkflows to the active project when called without an id', async () => {
      api.listProjects.mockResolvedValue(projects);
      api.getWorkflows.mockResolvedValue({ workflows: [], activeWorkflowId: null });
      const { result } = await renderLoadedProjects({ activeProjectId: 'proj-beta' });
      await act(async () => {
        await result.current.loadWorkflows();
      });
      expect(api.getWorkflows).toHaveBeenCalledWith('proj-beta');
    });
  });

  describe('workflows cache', () => {
    it('reuses the cache: a second loadWorkflows with the same id does not refetch', async () => {
      api.listProjects.mockResolvedValue([]);
      api.getWorkflows.mockResolvedValue(workflowsPayload);
      const { result } = await renderLoadedProjects();
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      expect(api.getWorkflows).toHaveBeenCalledTimes(1);
      expect(result.current.workflowsFor('proj-alpha')).toEqual(workflowsPayload.workflows);
    });

    it('fetches different project ids independently and caches each', async () => {
      api.listProjects.mockResolvedValue([]);
      api.getWorkflows.mockImplementation((projectId) =>
        Promise.resolve({
          workflows: [{ id: `wf-${projectId}`, name: 'One', stages: [] }],
          activeWorkflowId: `wf-${projectId}`,
        }),
      );
      const { result } = await renderLoadedProjects();
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha'); // cached, no refetch
      });
      await act(async () => {
        await result.current.loadWorkflows('proj-beta');
      });
      expect(api.getWorkflows).toHaveBeenCalledTimes(2);
      expect(api.getWorkflows).toHaveBeenNthCalledWith(1, 'proj-alpha');
      expect(api.getWorkflows).toHaveBeenNthCalledWith(2, 'proj-beta');
      expect(result.current.workflowsFor('proj-alpha')[0].id).toBe('wf-proj-alpha');
      expect(result.current.workflowsFor('proj-beta')[0].id).toBe('wf-proj-beta');
    });

    it('dedupes concurrent in-flight fetches for the same project', async () => {
      api.listProjects.mockResolvedValue([]);
      let resolveWorkflows;
      api.getWorkflows.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveWorkflows = resolve;
          }),
      );
      const { result } = await renderLoadedProjects();
      let first;
      let second;
      act(() => {
        first = result.current.loadWorkflows('proj-alpha');
      });
      act(() => {
        second = result.current.loadWorkflows('proj-alpha');
      });
      expect(api.getWorkflows).toHaveBeenCalledTimes(1);
      await act(async () => {
        resolveWorkflows(workflowsPayload);
        await Promise.all([first, second]);
      });
      expect(api.getWorkflows).toHaveBeenCalledTimes(1);
      expect(result.current.workflowsFor('proj-alpha')).toEqual(workflowsPayload.workflows);
      expect(result.current.workflowsLoadingFor('proj-alpha')).toBe(false);
    });
  });

  describe('per-level loading and error state', () => {
    it('rejecting listProjects sets projectsError and keeps projects empty', async () => {
      api.listProjects.mockRejectedValue(new Error('boom'));
      const { result } = await renderLoadedProjects();
      expect(result.current.projectsError).toBe('boom');
      expect(result.current.projects).toEqual([]);
      expect(result.current.projectsLoading).toBe(false);
    });

    it('rejecting getWorkflows sets that id error without poisoning other ids', async () => {
      api.listProjects.mockResolvedValue([]);
      api.getWorkflows.mockImplementation((projectId) =>
        projectId === 'proj-bad'
          ? Promise.reject(new Error('wf boom'))
          : Promise.resolve(workflowsPayload),
      );
      const { result } = await renderLoadedProjects();
      await act(async () => {
        await result.current.loadWorkflows('proj-bad');
      });
      await act(async () => {
        await result.current.loadWorkflows('proj-good');
      });
      expect(result.current.workflowsErrorFor('proj-bad')).toBe('wf boom');
      expect(result.current.workflowsErrorFor('proj-good')).toBeNull();
      expect(result.current.workflowsFor('proj-good')).toEqual(workflowsPayload.workflows);
      expect(result.current.workflowsFor('proj-bad')).toEqual([]);
      expect(result.current.workflowsLoadingFor('proj-bad')).toBe(false);
    });

    it('a reload clears the projects error and refetches', async () => {
      api.listProjects.mockRejectedValueOnce(new Error('boom'));
      const { result } = await renderLoadedProjects();
      expect(result.current.projectsError).toBe('boom');
      api.listProjects.mockResolvedValue(projects);
      await act(async () => {
        await result.current.reloadProjects();
      });
      expect(result.current.projectsError).toBeNull();
      expect(result.current.projects).toEqual(projects);
      expect(api.listProjects).toHaveBeenCalledTimes(2);
    });

    it('a failed workflows fetch is not cached: a retry clears the error', async () => {
      api.listProjects.mockResolvedValue([]);
      api.getWorkflows
        .mockRejectedValueOnce(new Error('wf boom'))
        .mockResolvedValue(workflowsPayload);
      const { result } = await renderLoadedProjects();
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      expect(result.current.workflowsErrorFor('proj-alpha')).toBe('wf boom');
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      expect(result.current.workflowsErrorFor('proj-alpha')).toBeNull();
      expect(result.current.workflowsFor('proj-alpha')).toEqual(workflowsPayload.workflows);
      expect(api.getWorkflows).toHaveBeenCalledTimes(2);
    });

    it('tracks per-level loading flags while fetches are in flight', async () => {
      let resolveProjects;
      api.listProjects.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveProjects = resolve;
          }),
      );
      const { result } = renderHook(() => useKbReferenceData({}));
      expect(result.current.projectsLoading).toBe(true);
      await act(async () => {
        resolveProjects(projects);
        await result.current.loadProjects();
      });
      expect(result.current.projectsLoading).toBe(false);
      expect(result.current.projects).toEqual(projects);
    });

    it('tracks per-project workflows loading flags independently', async () => {
      api.listProjects.mockResolvedValue([]);
      let resolveWorkflows;
      api.getWorkflows.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveWorkflows = resolve;
          }),
      );
      const { result } = await renderLoadedProjects();
      let loadPromise;
      act(() => {
        loadPromise = result.current.loadWorkflows('proj-alpha');
      });
      expect(result.current.workflowsLoadingFor('proj-alpha')).toBe(true);
      expect(result.current.workflowsLoadingFor('proj-beta')).toBe(false);
      await act(async () => {
        resolveWorkflows(workflowsPayload);
        await loadPromise;
      });
      expect(result.current.workflowsLoadingFor('proj-alpha')).toBe(false);
    });
  });

  describe('empty and odd payloads', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a string', 'nope'],
      ['a non-array object', { foo: 'bar' }],
    ])('degrades %s from listProjects to an empty array', async (_label, payload) => {
      api.listProjects.mockResolvedValue(payload);
      const { result } = await renderLoadedProjects();
      expect(result.current.projects).toEqual([]);
      expect(result.current.projectsError).toBeNull();
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a bare array', []],
      ['an object without a workflows array', { workflows: 'nope' }],
    ])('degrades %s from getWorkflows to an empty workflows array', async (_label, payload) => {
      api.listProjects.mockResolvedValue([]);
      api.getWorkflows.mockResolvedValue(payload);
      const { result } = await renderLoadedProjects();
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      expect(result.current.workflowsFor('proj-alpha')).toEqual([]);
      expect(result.current.workflowsErrorFor('proj-alpha')).toBeNull();
      expect(result.current.stagesFor('proj-alpha', 'wf-default')).toEqual([]);
    });
  });

  describe('stagesFor', () => {
    it('returns the stages of the requested workflow from the cache without fetching', async () => {
      api.listProjects.mockResolvedValue([]);
      api.getWorkflows.mockResolvedValue(workflowsPayload);
      const { result } = await renderLoadedProjects();
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      const callsAfterLoad = api.getWorkflows.mock.calls.length;
      expect(result.current.stagesFor('proj-alpha', 'wf-default')).toEqual([
        { id: 'stage-idea', name: 'Idea' },
        { id: 'stage-build', name: 'Build' },
      ]);
      expect(result.current.stagesFor('proj-alpha', 'wf-hotfix')).toEqual([
        { id: 'stage-idea', name: 'Idea' },
        { id: 'stage-ship', name: 'Ship' },
      ]);
      expect(api.getWorkflows).toHaveBeenCalledTimes(callsAfterLoad);
    });

    it('returns [] for unknown workflow ids, missing workflowId, or unloaded projects', async () => {
      api.listProjects.mockResolvedValue([]);
      api.getWorkflows.mockResolvedValue(workflowsPayload);
      const { result } = await renderLoadedProjects();
      await act(async () => {
        await result.current.loadWorkflows('proj-alpha');
      });
      expect(result.current.stagesFor('proj-alpha', 'wf-missing')).toEqual([]);
      expect(result.current.stagesFor('proj-alpha', undefined)).toEqual([]);
      expect(result.current.stagesFor('proj-unloaded', 'wf-default')).toEqual([]);
      expect(api.getWorkflows).toHaveBeenCalledTimes(1); // stagesFor never fetches
    });
  });

  describe('unmount safety', () => {
    it('resolving a pending projects fetch after unmount updates nothing and does not throw', async () => {
      let resolveProjects;
      api.listProjects.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveProjects = resolve;
          }),
      );
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result, unmount } = renderHook(() => useKbReferenceData({}));
      unmount();
      await act(async () => {
        resolveProjects(projects);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(result.current.projects).toEqual([]);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('resolving a pending workflows fetch after unmount updates nothing and does not throw', async () => {
      api.listProjects.mockResolvedValue([]);
      let resolveWorkflows;
      api.getWorkflows.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveWorkflows = resolve;
          }),
      );
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result, unmount } = await renderLoadedProjects();
      let loadPromise;
      act(() => {
        loadPromise = result.current.loadWorkflows('proj-alpha');
      });
      unmount();
      await act(async () => {
        resolveWorkflows(workflowsPayload);
        await loadPromise;
      });
      expect(result.current.workflowsFor('proj-alpha')).toEqual([]);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});

describe('formatEntityLabel', () => {
  it('renders "Name (id)"', () => {
    expect(formatEntityLabel({ id: 'wf-default', name: 'Feature Pipeline' })).toBe(
      'Feature Pipeline (wf-default)',
    );
  });

  it('degrades to the bare id, the bare name, or empty', () => {
    expect(formatEntityLabel({ id: 'wf-x' })).toBe('wf-x');
    expect(formatEntityLabel({ name: 'Feature Pipeline' })).toBe('Feature Pipeline');
    expect(formatEntityLabel(null)).toBe('');
    expect(formatEntityLabel(undefined)).toBe('');
    expect(formatEntityLabel('nope')).toBe('');
  });
});

describe('resolveReference', () => {
  const entities = { projects, workflows: workflowsPayload.workflows };

  it('resolves projects by exact id, case-insensitive name, and case-insensitive slug', () => {
    expect(resolveReference({ kind: 'project', value: 'proj-beta', entities })).toMatchObject({
      id: 'proj-beta',
      label: 'Beta (proj-beta)',
    });
    expect(resolveReference({ kind: 'project', value: 'ALPHA', entities })).toMatchObject({
      id: 'proj-alpha',
    });
    expect(resolveReference({ kind: 'project', value: 'BETA', entities })).toMatchObject({
      id: 'proj-beta',
    });
  });

  it('returns the raw entity alongside id and label', () => {
    const resolved = resolveReference({ kind: 'project', value: 'proj-alpha', entities });
    expect(resolved.entity).toBe(projects[0]);
    expect(resolved).toEqual({
      id: 'proj-alpha',
      label: 'Alpha (proj-alpha)',
      entity: projects[0],
    });
  });

  it('returns null for unknown, empty, non-string, or padded-blank project values', () => {
    expect(resolveReference({ kind: 'project', value: 'gamma', entities })).toBeNull();
    expect(resolveReference({ kind: 'project', value: '', entities })).toBeNull();
    expect(resolveReference({ kind: 'project', value: '   ', entities })).toBeNull();
    expect(resolveReference({ kind: 'project', value: 42, entities })).toBeNull();
    expect(resolveReference({ kind: 'project', value: undefined, entities })).toBeNull();
  });

  it('resolves workflows by exact id and case-insensitive name', () => {
    expect(resolveReference({ kind: 'workflow', value: 'wf-hotfix', entities })).toMatchObject({
      id: 'wf-hotfix',
      label: 'Hotfix (wf-hotfix)',
    });
    expect(resolveReference({ kind: 'workflow', value: 'feature pipeline', entities })).toMatchObject(
      { id: 'wf-default' },
    );
    expect(resolveReference({ kind: 'workflow', value: 'wf-missing', entities })).toBeNull();
  });

  it('resolves stages scoped to the resolved workflow when workflowId matches', () => {
    expect(
      resolveReference({ kind: 'stage', value: 'Idea', entities, workflowId: 'wf-default' }),
    ).toMatchObject({ id: 'stage-idea' });
    expect(
      resolveReference({ kind: 'stage', value: 'idea', entities, workflowId: 'wf-hotfix' }),
    ).toMatchObject({ id: 'stage-idea' });
    expect(
      resolveReference({ kind: 'stage', value: 'stage-build', entities, workflowId: 'wf-default' }),
    ).toMatchObject({ id: 'stage-build' });
  });

  it('falls back to a unique match across workflows when workflowId does not resolve', () => {
    expect(resolveReference({ kind: 'stage', value: 'Ship', entities })).toMatchObject({
      id: 'stage-ship',
    });
    expect(
      resolveReference({ kind: 'stage', value: 'ship', entities, workflowId: 'wf-unknown' }),
    ).toMatchObject({ id: 'stage-ship' });
  });

  it('returns null for ambiguous stage matches across workflows', () => {
    expect(resolveReference({ kind: 'stage', value: 'Idea', entities })).toBeNull();
    expect(
      resolveReference({ kind: 'stage', value: 'Idea', entities, workflowId: 'wf-missing' }),
    ).toBeNull();
  });

  it('returns null for unknown kinds or malformed entities', () => {
    expect(resolveReference({ kind: 'ticket', value: 'x', entities })).toBeNull();
    expect(resolveReference({ kind: 'project', value: 'proj-alpha', entities: null })).toBeNull();
    expect(resolveReference({ kind: 'workflow', value: 'wf-default' })).toBeNull();
  });
});