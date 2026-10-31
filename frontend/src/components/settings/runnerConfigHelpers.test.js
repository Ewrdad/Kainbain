import { describe, it, expect } from 'vitest';
import {
  JOB_TYPE_KEYS,
  jobSwitchChecked,
  jobTypeLabels,
  defaultRunnerConfig,
  runnerDisplayName,
  advertisedToolIds,
  effectiveTools,
  loadedProjectIds,
  partitionProjects,
  withProjectLoaded,
  withProjectUnloaded,
  scopePatchForLoaded,
  validateDirectories,
} from './runnerConfigHelpers';

/***
 * MARK: runnerConfigHelpers tests
 * @description Pins the pure logic behind the Runner settings screen:
 *   config normalization, display-name fallback, tool subsets, the
 *   Available/Loaded project split and moves, scope patch encoding, and
 *   directory validation.
 ***/
describe('runnerConfigHelpers', () => {
  it('labels the three job switches with the survey meanings', () => {
    expect(JOB_TYPE_KEYS).toEqual(['runsCi', 'runsMerges', 'runsImpromptu']);
    const labels = jobTypeLabels();
    expect(labels.map((l) => l.key)).toEqual(JOB_TYPE_KEYS);
    expect(labels.find((l) => l.key === 'runsCi').label).toBe('Runs CI');
    expect(labels.find((l) => l.key === 'runsMerges').label).toBe('Runs merges');
    expect(labels.find((l) => l.key === 'runsImpromptu').label).toBe('Runs Impromptu');
  });

  it('defaults a missing operatorConfig to all-on', () => {
    expect(defaultRunnerConfig({})).toEqual({
      displayName: null,
      availableTools: null,
      jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
      directories: { masterDir: '', worktreeDir: '' },
      projectScope: null,
    });
    expect(defaultRunnerConfig(undefined).jobTypes.runsMerges).toBe(true);
  });

  it('keeps configured values and drops wrong-typed ones', () => {
    const config = defaultRunnerConfig({
      operatorConfig: {
        displayName: 'Primary',
        availableTools: ['pi', 42],
        jobTypes: { runsCi: false, runsMerges: 'yes' },
        directories: { masterDir: '/srv/kb' },
        projectScope: ['p1', null],
      },
    });
    expect(config.displayName).toBe('Primary');
    expect(config.availableTools).toEqual(['pi']);
    expect(config.jobTypes).toEqual({ runsCi: false, runsMerges: true, runsImpromptu: true });
    expect(config.directories).toEqual({ masterDir: '/srv/kb', worktreeDir: '' });
    expect(config.projectScope).toEqual(['p1']);
  });

  it('falls back to the Runner id for display', () => {
    expect(runnerDisplayName({ runnerId: 'r1' })).toBe('r1');
    expect(
      runnerDisplayName({ runnerId: 'r1', operatorConfig: { displayName: 'Primary' } }),
    ).toBe('Primary');
  });

  it('reads advertised tools and prefers the operator subset', () => {
    const runner = { capabilities: { harnesses: [{ id: 'pi' }, 'vibe', {}] } };
    expect(advertisedToolIds(runner)).toEqual(['pi', 'vibe']);
    expect(advertisedToolIds({})).toEqual([]);
    expect(effectiveTools(runner)).toEqual(['pi', 'vibe']);
    expect(
      effectiveTools({ ...runner, operatorConfig: { availableTools: ['pi'] } }),
    ).toEqual(['pi']);
  });

  it('resolves loaded projects from override, scope, or all', () => {
    const all = [{ id: 'a' }, { id: 'b' }];
    expect(loadedProjectIds({ projectScope: ['a'] }, all)).toEqual(['a']);
    expect(
      loadedProjectIds({ operatorConfig: { projectScope: ['b'] }, projectScope: ['a'] }, all),
    ).toEqual(['b']);
    expect(loadedProjectIds({}, all)).toEqual(['a', 'b']);
  });

  it('partitions projects into Available vs Loaded', () => {
    const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const { available, loaded } = partitionProjects(all, ['b']);
    expect(loaded.map((p) => p.id)).toEqual(['b']);
    expect(available.map((p) => p.id)).toEqual(['a', 'c']);
    // Stale loaded ids (deleted projects) vanish from both columns.
    expect(partitionProjects(all, ['zzz']).loaded).toEqual([]);
  });

  it('moves projects between columns idempotently', () => {
    expect(withProjectLoaded(['a'], 'b')).toEqual(['a', 'b']);
    expect(withProjectLoaded(['a'], 'a')).toEqual(['a']);
    expect(withProjectUnloaded(['a', 'b'], 'a')).toEqual(['b']);
    expect(withProjectUnloaded(['a'], 'zzz')).toEqual(['a']);
  });

  it('encodes a full load as the serves-all null scope', () => {
    const all = [{ id: 'a' }, { id: 'b' }];
    expect(scopePatchForLoaded(['a', 'b'], all)).toBeNull();
    expect(scopePatchForLoaded(['a'], all)).toEqual(['a']);
    expect(scopePatchForLoaded([], all)).toEqual([]);
  });

  it('drops deleted project ids from the scope patch', () => {
    const all = [{ id: 'a' }, { id: 'b' }];
    // A stale id neither blocks the serves-all null nor lingers in the patch.
    expect(scopePatchForLoaded(['a', 'b', 'gone'], all)).toBeNull();
    expect(scopePatchForLoaded(['a', 'gone'], all)).toEqual(['a']);
    expect(scopePatchForLoaded(['gone'], all)).toEqual([]);
    // With no known projects there is nothing to filter against.
    expect(scopePatchForLoaded(['gone'], [])).toEqual(['gone']);
  });

  it('reads one job switch without computed access and fails closed', () => {
    const config = defaultRunnerConfig({
      operatorConfig: { jobTypes: { runsCi: false } },
    });
    expect(jobSwitchChecked(config, 'runsCi')).toBe(false);
    expect(jobSwitchChecked(config, 'runsMerges')).toBe(true);
    expect(jobSwitchChecked(config, 'nope')).toBe(false);
    expect(jobSwitchChecked(null, 'runsCi')).toBe(false);
  });

  it('requires both directory paths', () => {
    expect(validateDirectories({ masterDir: '/srv/kb', worktreeDir: '/srv/trees' }).ok).toBe(
      true,
    );
    const bad = validateDirectories({ masterDir: '  ', worktreeDir: '' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.masterDir).toBeTruthy();
    expect(bad.errors.worktreeDir).toBeTruthy();
  });
});
