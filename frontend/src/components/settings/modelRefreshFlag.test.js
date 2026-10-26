import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MODEL_REFRESH_FLAG_ENV,
  MODEL_REFRESH_CONFIG_KEY,
  parseModelRefreshFlag,
  runtimeModelRefreshValue,
  isSystemSettingsModelRefreshEnabled,
} from './modelRefreshFlag';

/***
 * MARK: modelRefreshFlag tests
 * @description Locks the config-over-code gate behind the System Settings
 *   "harness Refresh also refreshes the model catalogue" behaviour: flag
 *   parsing tri-state, runtime config-spec lookup, and the precedence table
 *   (runtime config wins, build flag fallback, default ON). Pure logic only.
 ***/

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('constants', () => {
  it('name the documented build flag and backend config key', () => {
    expect(MODEL_REFRESH_FLAG_ENV).toBe('VITE_ENABLE_SYSTEM_SETTINGS_MODEL_REFRESH');
    expect(MODEL_REFRESH_CONFIG_KEY).toBe('refreshModelsOnHarnessRefresh');
  });
});

describe('parseModelRefreshFlag', () => {
  it.each(['1', 'true', 'TRUE', 'yes', 'on', ' on '])('parses %j as true', (value) => {
    expect(parseModelRefreshFlag(value)).toBe(true);
  });

  it.each(['0', 'false', 'FALSE', 'no', 'off', ' off '])('parses %j as false', (value) => {
    expect(parseModelRefreshFlag(value)).toBe(false);
  });

  it('passes booleans through unchanged', () => {
    expect(parseModelRefreshFlag(true)).toBe(true);
    expect(parseModelRefreshFlag(false)).toBe(false);
  });

  it.each([undefined, null, '', '   ', 'maybe', 7])('treats %j as unset', (value) => {
    expect(parseModelRefreshFlag(value)).toBeUndefined();
  });
});

describe('runtimeModelRefreshValue', () => {
  it('reads the boolean value of the backend config key', () => {
    const entries = [
      { key: 'modelsHarnessTimeoutMs', value: 8000 },
      { key: MODEL_REFRESH_CONFIG_KEY, value: false },
    ];
    expect(runtimeModelRefreshValue(entries)).toBe(false);
  });

  it('returns undefined when the running backend omits the key', () => {
    expect(runtimeModelRefreshValue([{ key: 'modelsHarnessTimeoutMs', value: 8000 }])).toBeUndefined();
    expect(runtimeModelRefreshValue([])).toBeUndefined();
    expect(runtimeModelRefreshValue(undefined)).toBeUndefined();
  });
});

describe('isSystemSettingsModelRefreshEnabled', () => {
  it('is enabled by default (no runtime value, no build flag)', () => {
    expect(isSystemSettingsModelRefreshEnabled()).toBe(true);
    expect(isSystemSettingsModelRefreshEnabled(undefined)).toBe(true);
  });

  it.each(['0', 'false', 'FALSE', 'off', ' off '])(
    'is disabled by build flag value %j when the backend reports nothing',
    (value) => {
      vi.stubEnv(MODEL_REFRESH_FLAG_ENV, value);
      expect(isSystemSettingsModelRefreshEnabled()).toBe(false);
    },
  );

  it.each(['1', 'true', 'yes', 'anything'])(
    'stays enabled for build flag value %j',
    (value) => {
      vi.stubEnv(MODEL_REFRESH_FLAG_ENV, value);
      expect(isSystemSettingsModelRefreshEnabled()).toBe(true);
    },
  );

  it('lets an explicit runtime config value win over the build flag', () => {
    vi.stubEnv(MODEL_REFRESH_FLAG_ENV, '0');
    expect(isSystemSettingsModelRefreshEnabled(true)).toBe(true);

    vi.stubEnv(MODEL_REFRESH_FLAG_ENV, '1');
    expect(isSystemSettingsModelRefreshEnabled(false)).toBe(false);
  });

  it('falls back to the build flag when the runtime value is absent or unparseable', () => {
    vi.stubEnv(MODEL_REFRESH_FLAG_ENV, '0');
    expect(isSystemSettingsModelRefreshEnabled(undefined)).toBe(false);
    expect(isSystemSettingsModelRefreshEnabled('maybe')).toBe(false);
  });
});
