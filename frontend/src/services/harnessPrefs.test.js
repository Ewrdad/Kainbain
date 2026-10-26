// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  HARNESS_PREFS_KEY,
  defaultHarnessPref,
  normalizeHarnessPrefs,
  prefsForHarness,
  isHarnessEnabled,
  isHarnessAutoDetect,
  withHarnessPref,
  enabledHarnesses,
  harnessDisabledReason,
  deriveAvailability,
  availabilityBadge,
  availabilityFromEntry,
  availabilityToneClass,
} from './harnessPrefs';

/**
 * MARK: harnessPrefs tests
 * @description Black-box coverage for the Harness Integration preference
 *   helpers: safe defaults for missing ids, unknown ids ignored at render,
 *   manual-off never flipped by probes, and honest availability derivation.
 */

describe('defaultHarnessPref', () => {
  it('defaults to visible and auto-detected', () => {
    expect(defaultHarnessPref()).toEqual({ enabled: true, autoDetect: true });
  });

  it('returns a fresh object per call', () => {
    expect(defaultHarnessPref()).not.toBe(defaultHarnessPref());
  });
});

describe('normalizeHarnessPrefs', () => {
  it('turns null, arrays, and non-objects into empty prefs', () => {
    expect(normalizeHarnessPrefs(null)).toEqual({});
    expect(normalizeHarnessPrefs(undefined)).toEqual({});
    expect(normalizeHarnessPrefs([])).toEqual({});
    expect(normalizeHarnessPrefs('pi')).toEqual({});
  });

  it('fills partial entries with defaults', () => {
    expect(normalizeHarnessPrefs({ pi: { enabled: false } })).toEqual({
      pi: { enabled: false, autoDetect: true },
    });
    expect(normalizeHarnessPrefs({ pi: {} })).toEqual({
      pi: { enabled: true, autoDetect: true },
    });
  });

  it('drops malformed entries instead of crashing', () => {
    expect(normalizeHarnessPrefs({ pi: null, agy: 'yes', ok: { enabled: 1 } })).toEqual({
      ok: { enabled: true, autoDetect: true },
    });
  });

  it('keeps the storage key stable', () => {
    expect(HARNESS_PREFS_KEY).toBe('kainbain:harnessPrefs');
  });
});

describe('prefsForHarness / isHarnessEnabled / isHarnessAutoDetect', () => {
  it('returns safe defaults for missing ids (new harnesses appear enabled)', () => {
    expect(prefsForHarness({}, 'brand-new-harness')).toEqual({
      enabled: true,
      autoDetect: true,
    });
    expect(isHarnessEnabled(undefined, 'pi')).toBe(true);
    expect(isHarnessAutoDetect(null, 'pi')).toBe(true);
  });

  it('reads stored flags verbatim', () => {
    const prefs = { pi: { enabled: false, autoDetect: false } };
    expect(prefsForHarness(prefs, 'pi')).toEqual({ enabled: false, autoDetect: false });
    expect(isHarnessEnabled(prefs, 'pi')).toBe(false);
    expect(isHarnessAutoDetect(prefs, 'pi')).toBe(false);
  });
});

describe('withHarnessPref', () => {
  it('patches one harness without mutating the input', () => {
    const prev = { pi: { enabled: true, autoDetect: true } };
    const next = withHarnessPref(prev, 'pi', { enabled: false });
    expect(next).toEqual({ pi: { enabled: false, autoDetect: true } });
    expect(prev).toEqual({ pi: { enabled: true, autoDetect: true } });
  });

  it('creates an entry for unknown ids (ignored at render until registered)', () => {
    expect(withHarnessPref({}, 'future-harness', { enabled: false })).toEqual({
      'future-harness': { enabled: false, autoDetect: true },
    });
  });
});

describe('enabledHarnesses', () => {
  const LIST = [{ id: 'pi' }, { id: 'antigravity' }, { id: 'custom' }];

  it('keeps every harness when prefs are empty', () => {
    expect(enabledHarnesses(LIST, {})).toEqual(LIST);
  });

  it('drops only the manually disabled ones', () => {
    const prefs = { antigravity: { enabled: false, autoDetect: true } };
    expect(enabledHarnesses(LIST, prefs).map((h) => h.id)).toEqual(['pi', 'custom']);
  });

  it('ignores unknown-id prefs entries', () => {
    const prefs = { 'no-such-harness': { enabled: false, autoDetect: false } };
    expect(enabledHarnesses(LIST, prefs)).toEqual(LIST);
  });

  it('tolerates a non-array list', () => {
    expect(enabledHarnesses(null, {})).toEqual([]);
  });
});

describe('harnessDisabledReason (ModelSelector contract)', () => {
  it('returns null for enabled and unknown harnesses (selectable)', () => {
    expect(harnessDisabledReason({}, { id: 'pi' })).toBeNull();
    expect(harnessDisabledReason({ pi: { enabled: false } }, { id: 'other' })).toBeNull();
  });

  it('returns a reason for manually disabled harnesses (disabled, never hidden)', () => {
    const reason = harnessDisabledReason(
      { pi: { enabled: false, autoDetect: true } },
      { id: 'pi', label: 'pi' },
    );
    expect(typeof reason).toBe('string');
    expect(reason.length).toBeGreaterThan(0);
  });
});

describe('deriveAvailability', () => {
  const LIST_HARNESS = { id: 'pi', modelSelection: 'list' };
  const NONE_HARNESS = { id: 'custom', modelSelection: 'none' };

  it('reports detected when the probe finds models', () => {
    expect(deriveAvailability(LIST_HARNESS, { models: [{ id: 'm' }] })).toBe('detected');
  });

  it('reports unavailable when a catalogue harness discovers nothing', () => {
    expect(deriveAvailability(LIST_HARNESS, { models: [] })).toBe('unavailable');
  });

  it('reports unknown when not probed or the probe failed', () => {
    expect(deriveAvailability(LIST_HARNESS, null)).toBe('unknown');
    expect(deriveAvailability(LIST_HARNESS, { error: true })).toBe('unknown');
    expect(deriveAvailability(LIST_HARNESS, {})).toBe('unknown');
  });

  it('reports unknown for model-managing harnesses even with an empty catalogue', () => {
    // custom/muse bake the model into the command line: [] says nothing.
    expect(deriveAvailability(NONE_HARNESS, { models: [] })).toBe('unknown');
    expect(deriveAvailability(NONE_HARNESS, { models: [{ id: 'm' }] })).toBe('unknown');
  });

  it('treats a missing modelSelection as a catalogue harness', () => {
    expect(deriveAvailability({ id: 'legacy' }, { models: [] })).toBe('unavailable');
  });
});

describe('availabilityBadge', () => {
  it('shows Disabled first: manual-off wins over any probe result', () => {
    expect(availabilityBadge({ enabled: false, autoDetect: true }, 'detected')).toEqual({
      text: 'Disabled',
      tone: 'muted',
    });
    expect(availabilityBadge({ enabled: false, autoDetect: false }, 'unavailable')).toEqual({
      text: 'Disabled',
      tone: 'muted',
    });
  });

  it('labels the honest probe outcomes', () => {
    expect(availabilityBadge({ enabled: true, autoDetect: true }, 'detected').text).toBe(
      'Detected',
    );
    expect(availabilityBadge({ enabled: true, autoDetect: true }, 'unavailable').text).toBe(
      'Unavailable',
    );
    expect(availabilityBadge({ enabled: true, autoDetect: true }, 'unknown').text).toBe(
      'Unknown',
    );
  });

  it('names auto-detect-off instead of silently showing unknown', () => {
    expect(availabilityBadge({ enabled: true, autoDetect: false }, 'unknown')).toEqual({
      text: 'Auto-detect off',
      tone: 'muted',
    });
  });
});

describe('availabilityFromEntry', () => {
  it('maps the backend discovery projection to badge input', () => {
    expect(availabilityFromEntry({ id: 'pi', available: true })).toBe('detected');
    expect(availabilityFromEntry({ id: 'pi', available: false })).toBe('unavailable');
    expect(availabilityFromEntry({ id: 'pi', available: null })).toBe('unknown');
  });

  it('reads entries without the field as null (older backend, badge-free)', () => {
    expect(availabilityFromEntry({ id: 'pi' })).toBeNull();
    expect(availabilityFromEntry(null)).toBeNull();
  });
});

describe('availabilityToneClass', () => {
  it('maps tones to distinct badge classes', () => {
    const good = availabilityToneClass('good');
    const bad = availabilityToneClass('bad');
    const muted = availabilityToneClass('muted');
    expect(good).toContain('green');
    expect(bad).toContain('red');
    expect(muted).not.toContain('green');
    expect(muted).not.toContain('red');
  });
});
