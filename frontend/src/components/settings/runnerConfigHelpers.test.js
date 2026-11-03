import { describe, it, expect } from 'vitest';
import {
  JOB_TYPE_KEYS,
  jobTypeLabels,
  defaultRunnerConfig,
  runnerDisplayName,
  advertisedToolIds,
  advertisedModels,
  effectiveTools,
  effectiveModels,
  parseModelsInput,
  loadedProjectIds,
  partitionProjects,
  withProjectLoaded,
  withProjectUnloaded,
  scopePatchForLoaded,
  validateDirectories,
  visibleRunners,
  resolveSelectedId,
  runRunnerAction,
  describeRunnerVersion,
  runnerCommands,
  supportedRunnerCommands,
  canRequestCommand,
  canRequestUpdate,
  canRequestRediscovery,
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
      availableModels: null,
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
        availableModels: ['m1', null],
        jobTypes: { runsCi: false, runsMerges: 'yes' },
        directories: { masterDir: '/srv/kb' },
        projectScope: ['p1', null],
      },
    });
    expect(config.displayName).toBe('Primary');
    expect(config.availableTools).toEqual(['pi']);
    expect(config.availableModels).toEqual(['m1']);
    expect(config.jobTypes).toEqual({ runsCi: false, runsMerges: true, runsImpromptu: true });
    expect(config.directories).toEqual({ masterDir: '/srv/kb', worktreeDir: '' });
    expect(config.projectScope).toEqual(['p1']);
  });

  it('falls back to the Runner id for display', () => {
    expect(runnerDisplayName({ runnerId: 'r1' })).toBe('r1');
    expect(runnerDisplayName({ runnerId: 'r1', operatorConfig: { displayName: 'Primary' } })).toBe(
      'Primary',
    );
  });

  it('reads advertised tools and prefers the operator subset', () => {
    const runner = { capabilities: { harnesses: [{ id: 'pi' }, 'vibe', {}] } };
    expect(advertisedToolIds(runner)).toEqual(['pi', 'vibe']);
    expect(advertisedToolIds({})).toEqual([]);
    expect(effectiveTools(runner)).toEqual(['pi', 'vibe']);
    expect(effectiveTools({ ...runner, operatorConfig: { availableTools: ['pi'] } })).toEqual([
      'pi',
    ]);
  });

  it('reads advertised models and prefers the operator allowlist', () => {
    const runner = { capabilities: { models: ['m1', 42, ''] } };
    expect(advertisedModels(runner)).toEqual(['m1']);
    expect(advertisedModels({})).toEqual([]);
    expect(effectiveModels(runner)).toEqual(['m1']);
    expect(
      effectiveModels({ ...runner, operatorConfig: { availableModels: ['m9'] } }),
    ).toEqual(['m9']);
    expect(
      effectiveModels({ ...runner, operatorConfig: { availableModels: [] } }),
    ).toEqual([]);
  });

  it('parses models editor text into trimmed deduped ids', () => {
    expect(parseModelsInput('a, b,, a')).toEqual(['a', 'b']);
    expect(parseModelsInput('  ')).toEqual([]);
    expect(parseModelsInput()).toEqual([]);
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

  it('hides revoked Runners but keeps active, paused, pending, and denied', () => {
    const rows = [
      { runnerId: 'revoked-1', status: 'revoked' },
      { runnerId: 'active-1', status: 'active' },
      { runnerId: 'paused-1', status: 'active', paused: true },
      { runnerId: 'pending-1', status: 'pending' },
      { runnerId: 'denied-1', status: 'denied' },
    ];
    expect(visibleRunners(rows).map((r) => r.runnerId)).toEqual([
      'active-1',
      'paused-1',
      'pending-1',
      'denied-1',
    ]);
  });

  it('keeps unknown future statuses visible instead of dropping them', () => {
    const rows = [{ runnerId: 'x1', status: 'expired' }, { runnerId: 'x2' }];
    expect(visibleRunners(rows)).toEqual(rows);
  });

  it('maps an empty or missing roster to an empty visible list', () => {
    expect(visibleRunners([])).toEqual([]);
    expect(visibleRunners(undefined)).toEqual([]);
    expect(visibleRunners(null)).toEqual([]);
    expect(visibleRunners('nope')).toEqual([]);
  });

  it('keeps the previous selection while it is still visible', () => {
    const visible = [{ runnerId: 'a' }, { runnerId: 'b' }];
    expect(resolveSelectedId(visible, 'b')).toBe('b');
  });

  it('falls back to the first visible Runner when the selection is gone', () => {
    const visible = [{ runnerId: 'b' }, { runnerId: 'c' }];
    // Revoked or otherwise filtered out: the previous id is not visible.
    expect(resolveSelectedId(visible, 'a')).toBe('b');
    expect(resolveSelectedId(visible, null)).toBe('b');
    expect(resolveSelectedId(visible, undefined)).toBe('b');
  });

  it('resolves an empty visible roster to a null selection', () => {
    expect(resolveSelectedId([], 'a')).toBeNull();
    expect(resolveSelectedId(undefined, 'a')).toBeNull();
    expect(resolveSelectedId(null, null)).toBeNull();
  });

  it('skips roster records without a usable Runner id when resolving selection', () => {
    const visible = [{ status: 'active' }, { runnerId: '' }, { runnerId: 'b' }];
    expect(resolveSelectedId(visible, 'a')).toBe('b');
    expect(resolveSelectedId(visible, null)).toBe('b');
    expect(resolveSelectedId([{ status: 'active' }, null], 'a')).toBeNull();
  });

  it('ignores a non-string previous selection instead of matching it', () => {
    const visible = [{ runnerId: 'a' }, { runnerId: 'b' }];
    expect(resolveSelectedId(visible, 42)).toBe('a');
    expect(resolveSelectedId(visible, {})).toBe('a');
  });

  it('sends each lifecycle action to its own endpoint', () => {
    const calls = [];
    const runnerApi = {
      approveRunner: (id) => calls.push(['approve', id]),
      denyRunner: (id) => calls.push(['deny', id]),
      pauseRunner: (id) => calls.push(['pause', id]),
      resumeRunner: (id) => calls.push(['resume', id]),
      revokeRunner: (id) => calls.push(['revoke', id]),
    };
    for (const action of ['approve', 'deny', 'pause', 'resume', 'revoke']) {
      runRunnerAction({ runnerApi, runnerId: 'r1', action });
    }
    expect(calls).toEqual([
      ['approve', 'r1'],
      ['deny', 'r1'],
      ['pause', 'r1'],
      ['resume', 'r1'],
      ['revoke', 'r1'],
    ]);
  });

  it('refuses unknown actions without calling any endpoint (never a revoke)', () => {
    const runnerApi = {
      approveRunner: () => {
        throw new Error('must not approve');
      },
      denyRunner: () => {
        throw new Error('must not deny');
      },
      pauseRunner: () => {
        throw new Error('must not pause');
      },
      resumeRunner: () => {
        throw new Error('must not resume');
      },
      revokeRunner: () => {
        throw new Error('must not revoke');
      },
    };
    for (const action of ['resum', 'APPROVE', '', null, undefined, 42]) {
      expect(runRunnerAction({ runnerApi, runnerId: 'r1', action })).toBeNull();
    }
  });

  it('prefers the top-level Runner version over the nested facts copy', () => {
    expect(describeRunnerVersion({ runnerVersion: '0.3.0' })).toBe('0.3.0');
    expect(
      describeRunnerVersion({
        runnerVersion: '0.3.0',
        facts: { versions: { runner: '0.1.0' } },
      }),
    ).toBe('0.3.0');
  });

  it('falls back to the nested facts version when the top level is missing', () => {
    expect(describeRunnerVersion({ facts: { versions: { runner: '0.1.0' } } })).toBe('0.1.0');
  });

  it('reports no version for missing or wrong-typed version fields', () => {
    expect(describeRunnerVersion({})).toBeNull();
    expect(describeRunnerVersion(undefined)).toBeNull();
    expect(describeRunnerVersion({ runnerVersion: 42 })).toBeNull();
    expect(describeRunnerVersion({ runnerVersion: '' })).toBeNull();
    expect(describeRunnerVersion({ facts: { versions: { runner: 42 } } })).toBeNull();
    expect(describeRunnerVersion({ facts: null })).toBeNull();
  });

  it('requires both directory paths', () => {
    expect(validateDirectories({ masterDir: '/srv/kb', worktreeDir: '/srv/trees' }).ok).toBe(true);
    const bad = validateDirectories({ masterDir: '  ', worktreeDir: '' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.masterDir).toBeTruthy();
    expect(bad.errors.worktreeDir).toBeTruthy();
  });

  it('normalizes the commands block and falls back for older backends', () => {
    expect(
      runnerCommands({ commands: { supported: ['requestUpdate'], pending: ['requestUpdate'], results: { requestUpdate: { state: 'acked' } } } }),
    ).toEqual({
      supported: ['requestUpdate'],
      pending: ['requestUpdate'],
      results: { requestUpdate: { state: 'acked' } },
    });
    expect(runnerCommands({})).toEqual({ pending: [], results: {}, supported: [] });
    expect(runnerCommands({ commands: null })).toEqual({ pending: [], results: {}, supported: [] });
    expect(runnerCommands({ facts: { commands: ['requestModelRediscovery'] } })).toEqual({
      pending: [],
      results: {},
      supported: ['requestModelRediscovery'],
    });
  });

  it('reads supported commands and gates each request on them', () => {
    const runner = { commands: { supported: ['requestModelRediscovery', 'requestUpdate'] } };
    expect(supportedRunnerCommands(runner)).toEqual(['requestModelRediscovery', 'requestUpdate']);
    expect(supportedRunnerCommands({})).toEqual([]);
    expect(canRequestCommand(runner, 'requestUpdate')).toBe(true);
    expect(canRequestCommand(runner, 'requestRestart')).toBe(false);
    expect(canRequestCommand({}, 'requestUpdate')).toBe(false);
  });

  it('allows update-now only when the runner supports it (badge alone is not enough)', () => {
    expect(canRequestUpdate({ commands: { supported: ['requestUpdate'] } })).toBe(true);
    expect(canRequestUpdate({ commands: { supported: ['requestModelRediscovery'] } })).toBe(false);
    // An update-available badge on an old Runner needs a manual update —
    // offering the button would queue a command nothing acts on (R1).
    expect(canRequestUpdate({ updateAvailable: true })).toBe(false);
    expect(canRequestUpdate({})).toBe(false);
  });

  it('allows re-detection only when the runner supports it', () => {
    expect(canRequestRediscovery({ commands: { supported: ['requestModelRediscovery'] } })).toBe(true);
    expect(canRequestRediscovery({ commands: { supported: ['requestUpdate'] } })).toBe(false);
    expect(canRequestRediscovery({})).toBe(false);
  });
});
