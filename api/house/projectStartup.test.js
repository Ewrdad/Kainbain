// Domain: House Setup — startup preserves existing projects and restores their work.
import { describe, it, expect, vi } from 'vitest';
import { prepareProjects, shouldSeedSampleProjects, projectsRootBootWarning } from './index.js';

describe('projectsRootBootWarning', () => {
  it('returns null when the configured root exists', () => {
    expect(projectsRootBootWarning('/projects', () => true)).toBeNull();
  });

  it('names the configured root and the fix when it is missing', () => {
    const message = projectsRootBootWarning('/nope/projects', () => false);
    expect(message).toContain("/nope/projects");
    expect(message).toContain('PROJECTS_ROOT');
    expect(message).toContain('PROJECTS_ROOTS');
  });

  it('is silent for a blank root and tolerates a throwing probe', () => {
    expect(projectsRootBootWarning('', () => false)).toBeNull();
    expect(projectsRootBootWarning(undefined, () => false)).toBeNull();
    expect(
      projectsRootBootWarning('/projects', () => {
        throw new Error('EACCES');
      }),
    ).toContain('/projects');
  });

  it('stays silent when any configured root exists (extra roots count)', () => {
    const exists = (p) => p === '/exists';
    expect(projectsRootBootWarning(['/missing', '/exists'], exists)).toBeNull();
    expect(projectsRootBootWarning(['/missing', '/also-missing'], exists)).toContain(
      '/also-missing',
    );
    expect(projectsRootBootWarning([], exists)).toBeNull();
  });
});

describe('shouldSeedSampleProjects', () => {
  it('defaults off and honours the explicit override', () => {
    expect(shouldSeedSampleProjects({})).toBe(false);
    expect(shouldSeedSampleProjects({ seedSamples: true })).toBe(true);
    expect(shouldSeedSampleProjects({ seedSamples: false })).toBe(false);
  });
});

describe('prepareProjects', () => {
  it('seeds only missing names before scanning all projects, without duplicating on repeat', () => {
    const projects = [{ id: 'existing', name: 'Project B', cwd: '/existing' }];
    const projectStore = {
      listProjects: () => projects,
      createProject: vi.fn(({ name }) => projects.push({ id: name, name })),
    };
    const taskStore = { scanTasks: vi.fn() };
    prepareProjects(projectStore, taskStore, { seedSamples: true });
    expect(projectStore.createProject.mock.calls).toEqual([
      [{ name: 'Project A', allowLocalOnly: true }],
      [{ name: 'Project C', allowLocalOnly: true }],
      [{ name: 'Project D', allowLocalOnly: true }],
    ]);
    expect(taskStore.scanTasks.mock.calls).toEqual([
      ['existing', '/existing'], ['Project A', undefined], ['Project C', undefined], ['Project D', undefined],
    ]);
    prepareProjects(projectStore, taskStore, { seedSamples: true });
    expect(projectStore.createProject).toHaveBeenCalledTimes(3);
    expect(taskStore.scanTasks).toHaveBeenCalledTimes(8);
  });

  it('creates nothing when seeding is off (the default)', () => {
    const projects = [{ id: 'existing', name: 'Real Project', cwd: '/existing' }];
    const projectStore = {
      listProjects: () => projects,
      createProject: vi.fn(),
    };
    const taskStore = { scanTasks: vi.fn() };
    prepareProjects(projectStore, taskStore);
    expect(projectStore.createProject).not.toHaveBeenCalled();
    expect(taskStore.scanTasks.mock.calls).toEqual([['existing', '/existing']]);
  });

  it('verifies each docs link before scanning that project (missing-link self-heal)', () => {
    const order = [];
    const projects = [
      { id: 'a', name: 'Project A', cwd: '/a' },
      { id: 'b', name: 'Project B', cwd: '/b' },
      { id: 'c', name: 'Project C', cwd: '/c' },
      { id: 'd', name: 'Project D', cwd: '/d' },
    ];
    const projectStore = {
      listProjects: () => projects,
      createProject: vi.fn(),
      ensureDocsLink: vi.fn((p) => order.push(`link:${p.id}`)),
    };
    const taskStore = { scanTasks: vi.fn((id) => order.push(`scan:${id}`)) };
    prepareProjects(projectStore, taskStore, { seedSamples: true });
    expect(projectStore.createProject).not.toHaveBeenCalled();
    expect(order).toEqual([
      'link:a', 'scan:a',
      'link:b', 'scan:b',
      'link:c', 'scan:c',
      'link:d', 'scan:d',
    ]);
  });

  it('still scans when the store has no link verification (backwards compatible)', () => {
    const projects = [{ id: 'existing', name: 'Project B', cwd: '/existing' }];
    const projectStore = {
      listProjects: () => projects,
      createProject: vi.fn(({ name }) => projects.push({ id: name, name })),
    };
    const taskStore = { scanTasks: vi.fn() };
    expect(() => prepareProjects(projectStore, taskStore, { seedSamples: true })).not.toThrow();
    expect(taskStore.scanTasks).toHaveBeenCalledTimes(4);
  });
});
