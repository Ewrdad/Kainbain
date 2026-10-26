// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  modelStatusBadge,
  modelBadgeNode,
  modelOptionWithBadge,
  groupModelsByStatus,
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