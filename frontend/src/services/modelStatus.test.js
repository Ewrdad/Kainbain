// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  modelStatusBadge,
  modelBadgeNode,
  modelOptionWithBadge,
  groupModelsByStatus,
  fleetCountBadgeNode,
  fleetInfoForModel,
  fleetSnapshotBadge,
  fleetSnapshotBadgeNode,
  readRunnerCount,
  fleetUnverifiedNote,
  fleetModelRowBadge,
  fleetHarnessBadgeNode,
  notCurrentlyServedBadge,
} from './modelStatus';

/***
 * MARK: modelStatus tests
 * @description Verifies the shared credential-status → badge mapping used by
 *   both model dropdowns: emerald Ready, amber Unavailable, slate No
 *   credentials, and — critically — NO badge when the payload carries no
 *   status info (runtime absent), so the UI never misleads.
 ***/
describe('modelStatusBadge', () => {
  it('maps runnable models to a Ready badge', () => {
    expect(modelStatusBadge({ runnable: true, statusLabel: 'Ready' })).toEqual({
      label: 'Ready',
      dotClass: 'bg-emerald-400',
      title: expect.any(String),
    });
  });

  it('maps uncredentialed models to a No credentials badge', () => {
    const badge = modelStatusBadge({ runnable: false, authConfigured: false });
    expect(badge.label).toBe('No credentials');
    expect(badge.dotClass).toBe('bg-slate-400');
  });

  it('maps configured-but-unavailable models to an Unavailable badge', () => {
    const badge = modelStatusBadge({ runnable: false, authConfigured: true });
    expect(badge.label).toBe('Unavailable');
    expect(badge.dotClass).toBe('bg-amber-400');
  });

  it('returns NO badge when the model carries no status info (runtime absent)', () => {
    expect(modelStatusBadge({ id: 'm', provider: 'p' })).toBeNull();
    expect(modelStatusBadge({ runnable: undefined, authConfigured: undefined })).toBeNull();
    expect(modelStatusBadge(null)).toBeNull();
    expect(modelStatusBadge(undefined)).toBeNull();
  });

  it('falls back to default labels when statusLabel is missing', () => {
    expect(modelStatusBadge({ runnable: true }).label).toBe('Ready');
    expect(modelStatusBadge({ runnable: false, authConfigured: false }).label).toBe(
      'No credentials',
    );
    expect(modelStatusBadge({ runnable: false, authConfigured: true }).label).toBe(
      'Unavailable',
    );
  });
});

describe('modelBadgeNode', () => {
  it('returns null when there is no status info', () => {
    expect(modelBadgeNode({ id: 'm' })).toBeNull();
  });

  it('renders a dot span plus label for status info', () => {
    const node = modelBadgeNode({ runnable: true, statusLabel: 'Ready' });
    expect(node).toBeTruthy();
    expect(node.props.className).toContain('inline-flex');
    const [dot, label] = node.props.children;
    expect(dot.props.className).toContain('bg-emerald-400');
    expect(label).toBe('Ready');
  });
});

describe('fleetCountBadgeNode', () => {
  it('renders the runner count with an emerald dot', () => {
    const node = fleetCountBadgeNode({ runnerCount: 2, runnerIds: ['a', 'b'] });
    expect(node.props.className).toContain('inline-flex');
    const [dot, label] = node.props.children;
    expect(dot.props.className).toContain('bg-emerald-400');
    expect(dot.props['aria-hidden']).toBe('true');
    expect(label).toBe('2 runners');
  });

  it('renders one runner singular and zero as slate 0 runners', () => {
    expect(fleetCountBadgeNode({ runnerCount: 1 }).props.children[1]).toBe('1 runner');
    const zero = fleetCountBadgeNode(null);
    expect(zero.props.children[1]).toBe('0 runners');
    expect(zero.props.children[0].props.className).toContain('bg-slate-400');
    const malformed = fleetCountBadgeNode({ runnerCount: -3 });
    expect(malformed.props.children[1]).toBe('0 runners');
  });

  it('clamps hostile counts to an honest zero, never NaN/negative labels', () => {
    for (const runnerCount of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.9, '2', null]) {
      const node = fleetCountBadgeNode({ runnerCount });
      const label =
        runnerCount === 1.9 ? '1 runner' : '0 runners';
      expect(node.props.children[1], `runnerCount ${String(runnerCount)}`).toBe(label);
    }
  });
});

describe('readRunnerCount', () => {
  it('reads entry counts and raw numbers', () => {
    expect(readRunnerCount({ runnerCount: 2 })).toBe(2);
    expect(readRunnerCount({ id: 'muse', runnerCount: 1 })).toBe(1);
    expect(readRunnerCount(3)).toBe(3);
    expect(readRunnerCount(0)).toBe(0);
  });

  it('fails safe to 0 for missing, malformed, and non-finite counts', () => {
    expect(readRunnerCount(null)).toBe(0);
    expect(readRunnerCount(undefined)).toBe(0);
    expect(readRunnerCount({})).toBe(0);
    expect(readRunnerCount({ runnerCount: '2' })).toBe(0);
    expect(readRunnerCount({ runnerCount: Number.NaN })).toBe(0);
    expect(readRunnerCount({ runnerCount: Number.POSITIVE_INFINITY })).toBe(0);
    expect(readRunnerCount(Number.NaN)).toBe(0);
  });

  it('clamps negative and fractional counts down to a whole zero-or-more', () => {
    expect(readRunnerCount({ runnerCount: -3 })).toBe(0);
    expect(readRunnerCount(-1)).toBe(0);
    expect(readRunnerCount({ runnerCount: 1.9 })).toBe(1);
  });
});

describe('fleetInfoForModel', () => {
  const counts = {
    'pi::g::m': { runnerCount: 1, runnerIds: ['r1'] },
    'ollama-cloud::deepseek-v4-flash': { runnerCount: 2, runnerIds: ['a', 'b'] },
  };

  it('prefers the option value, then key forms', () => {
    expect(
      fleetInfoForModel(counts, { key: 'other', provider: 'g', id: 'm' }, 'pi::g::m'),
    ).toEqual({ runnerCount: 1, runnerIds: ['r1'] });
    expect(fleetInfoForModel(counts, { key: 'pi::g::m' })).toEqual({
      runnerCount: 1,
      runnerIds: ['r1'],
    });
    expect(
      fleetInfoForModel(counts, { provider: 'ollama-cloud', id: 'deepseek-v4-flash' }),
    ).toEqual({ runnerCount: 2, runnerIds: ['a', 'b'] });
    expect(fleetInfoForModel(counts, { id: 'pi::g::m' })).toEqual({
      runnerCount: 1,
      runnerIds: ['r1'],
    });
  });

  it('returns null for unknown ids and malformed inputs', () => {
    expect(fleetInfoForModel(counts, { key: 'nope' }, 'nope')).toBeNull();
    expect(fleetInfoForModel(null, { key: 'pi::g::m' })).toBeNull();
    expect(fleetInfoForModel(counts, null, null)).toBeNull();
  });

  it('falls through to key forms when the option value misses', () => {
    expect(fleetInfoForModel(counts, { key: 'pi::g::m' }, 'stale-value')).toEqual({
      runnerCount: 1,
      runnerIds: ['r1'],
    });
  });
});

describe('modelOptionWithBadge', () => {
  it('prefers the backend composite key and appends the provider to the label', () => {
    const option = modelOptionWithBadge({
      key: 'ollama-cloud::glm-5.3-flash:cloud',
      id: 'glm-5.3-flash:cloud',
      name: 'GLM 5.3 Flash (Cloud)',
      provider: 'ollama-cloud',
    });
    expect(option.value).toBe('ollama-cloud::glm-5.3-flash:cloud');
    expect(option.label).toBe('GLM 5.3 Flash (Cloud) (ollama-cloud)');
    expect(option.badge).toBeUndefined(); // no status info → no badge property
  });

  it('computes a composite key when the backend key is missing', () => {
    const option = modelOptionWithBadge({ id: 'm1', name: 'M1', provider: 'p1' });
    expect(option.value).toBe('p1::m1');
  });

  it('attaches the badge node when status info exists', () => {
    const option = modelOptionWithBadge({
      id: 'm1',
      provider: 'p1',
      runnable: true,
      statusLabel: 'Ready',
    });
    expect(option.badge).toBeTruthy();
    expect(option.badge.props.children[1]).toBe('Ready');
  });
});

describe('groupModelsByStatus', () => {
  it('groups enriched models by credential status', () => {
    const models = [
      { id: 'a', runnable: true },
      { id: 'b', runnable: false, authConfigured: false },
      { id: 'c', runnable: false, authConfigured: true },
      { id: 'd' },
    ];
    const groups = groupModelsByStatus(models);
    expect(groups.runnable.map((m) => m.id)).toEqual(['a']);
    expect(groups.uncredentialed.map((m) => m.id)).toEqual(['b']);
    expect(groups.unavailable.map((m) => m.id)).toEqual(['c']);
    expect(groups.unknown.map((m) => m.id)).toEqual(['d']);
  });

  it('tolerates non-array input', () => {
    const groups = groupModelsByStatus(undefined);
    expect(groups.runnable).toEqual([]);
    expect(groups.unknown).toEqual([]);
  });
});

describe('fleetSnapshotBadge', () => {
  it('maps an explicit unavailable verdict to an Unavailable badge with the reason', () => {
    const badge = fleetSnapshotBadge({
      available: false,
      unavailableReason: 'No claim-eligible runner serves this model right now.',
    });
    expect(badge.label).toBe('Unavailable');
    expect(badge.dotClass).toBe('bg-amber-400');
    expect(badge.title).toContain('No claim-eligible runner');
  });

  it('falls back to the default reason when none is carried', () => {
    expect(fleetSnapshotBadge({ available: false }).title).toContain('No claim-eligible Runner');
    expect(fleetSnapshotBadge({ available: false, unavailableReason: '' }).title).toContain(
      'No claim-eligible Runner',
    );
  });

  it('stays badge-free for available entries and entries without a verdict', () => {
    expect(fleetSnapshotBadge({ available: true })).toBeNull();
    expect(fleetSnapshotBadge({ id: 'm', provider: 'p' })).toBeNull();
    expect(fleetSnapshotBadge(null)).toBeNull();
    expect(fleetSnapshotBadge(undefined)).toBeNull();
  });

  it('renders the badge node only for unavailable entries', () => {
    const node = fleetSnapshotBadgeNode({ available: false, unavailableReason: 'paused' });
    expect(node).toBeTruthy();
    expect(node.props.title).toBe('paused');
    expect(node.props.children[1]).toBe('Unavailable');
    expect(fleetSnapshotBadgeNode({ available: true })).toBeNull();
    expect(fleetSnapshotBadgeNode({ id: 'm' })).toBeNull();
  });
});

describe('fleetUnverifiedNote', () => {
  it('annotates verified:false entries with declarants and their tooltip', () => {
    const note = fleetUnverifiedNote({ verified: false, declaredBy: ['local-alpha'] });
    expect(note).toBeTruthy();
    expect(note.props.children).toBe('unverified');
    expect(note.props.title).toBe('declared by local-alpha, not found by its discovery');
    const multi = fleetUnverifiedNote({ verified: false, declaredBy: ['a', 'b'] });
    expect(multi.props.title).toBe('declared by a, b, not found by its discovery');
  });

  it('stays null for verified entries, empty declarants, and non-objects', () => {
    expect(fleetUnverifiedNote({ verified: true, declaredBy: ['a'] })).toBeNull();
    expect(fleetUnverifiedNote({ runnerCount: 1 })).toBeNull();
    expect(fleetUnverifiedNote({ verified: false, declaredBy: [] })).toBeNull();
    expect(fleetUnverifiedNote({ verified: false })).toBeNull();
    expect(fleetUnverifiedNote({ verified: false, declaredBy: [null, 42, ''] })).toBeNull();
    expect(fleetUnverifiedNote(null)).toBeNull();
  });

  it('folds long declarant lists in the tooltip after five names', () => {
    const note = fleetUnverifiedNote({
      verified: false,
      declaredBy: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(note.props.title).toBe('declared by a, b, c, d, e, +2 more, not found by its discovery');
    const five = fleetUnverifiedNote({ verified: false, declaredBy: ['a', 'b', 'c', 'd', 'e'] });
    expect(five.props.title).toBe('declared by a, b, c, d, e, not found by its discovery');
  });
});

describe('fleetModelRowBadge', () => {
  it('always renders the count, never the snapshot verdict', () => {
    // A1: {available:false, runnerCount:0} renders "0 runners".
    const zero = fleetModelRowBadge({ available: false, runnerCount: 0 });
    expect(zero.props.children[1]).toBe('0 runners');
    const two = fleetModelRowBadge({ available: false, runnerCount: 2 });
    expect(two.props.children[1]).toBe('2 runners');
    expect(fleetModelRowBadge(null).props.children[1]).toBe('0 runners');
  });

  it('appends the unverified annotation when applicable', () => {
    const node = fleetModelRowBadge({ runnerCount: 0, verified: false, declaredBy: ['x'] });
    expect(node.type).toBe(Symbol.for('react.fragment'));
    const plain = fleetModelRowBadge({ runnerCount: 1 });
    expect(plain.props.children[1]).toBe('1 runner');
  });
});

describe('fleetHarnessBadgeNode', () => {
  it('renders harness counts and null only when unloaded', () => {
    expect(fleetHarnessBadgeNode({ id: 'muse', runnerCount: 1 }).props.children[1]).toBe('1 runner');
    const zero = fleetHarnessBadgeNode({ id: 'pi', runnerCount: 0 });
    expect(zero.props.children[1]).toBe('0 runners');
    expect(zero.props.children[0].props.className).toContain('bg-slate-400');
    expect(fleetHarnessBadgeNode(3).props.children[1]).toBe('3 runners');
    expect(fleetHarnessBadgeNode(null)).toBeNull();
    expect(fleetHarnessBadgeNode(undefined)).toBeNull();
  });

  it('clamps hostile harness counts to an honest zero', () => {
    expect(fleetHarnessBadgeNode({ id: 'x', runnerCount: -2 }).props.children[1]).toBe('0 runners');
    expect(fleetHarnessBadgeNode({ id: 'x' }).props.children[1]).toBe('0 runners');
    expect(fleetHarnessBadgeNode(Number.NaN).props.children[1]).toBe('0 runners');
  });
});

describe('notCurrentlyServedBadge', () => {
  it('marks stored absent/0-runner refs without clearing them', () => {
    const node = notCurrentlyServedBadge();
    expect(node.props.children).toBe('not currently served');
    expect(node.props['data-testid']).toBe('not-currently-served');
  });

  it('returns a fresh marker element on every call', () => {
    expect(notCurrentlyServedBadge()).not.toBe(notCurrentlyServedBadge());
  });
});
