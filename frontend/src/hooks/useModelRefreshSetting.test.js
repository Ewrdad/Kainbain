import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useModelRefreshSetting } from './useModelRefreshSetting';
import {
  MODEL_REFRESH_FLAG_ENV,
  MODEL_REFRESH_CONFIG_KEY,
} from '../components/settings/modelRefreshFlag';

/***
 * MARK: useModelRefreshSetting tests
 * @description Verifies the runtime config resolution behind the System
 *   Settings model-refresh gate: the live `/status/config` value wins, an
 *   absent key falls back to the Vite flag, a mocked-away API keeps the
 *   build-time default, and a failed fetch never flips the feature off.
 ***/

vi.mock('../services/api', () => ({
  api: { getConfigSpec: vi.fn() },
}));

import { api } from '../services/api';

beforeEach(() => {
  api.getConfigSpec.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('useModelRefreshSetting', () => {
  it('is enabled by default when the backend omits the key', async () => {
    api.getConfigSpec.mockResolvedValue({
      entries: [{ key: 'modelsHarnessTimeoutMs', value: 8000 }],
    });
    const { result } = renderHook(() => useModelRefreshSetting());

    await waitFor(() => {
      expect(api.getConfigSpec).toHaveBeenCalled();
    });
    expect(result.current.runtimeValue).toBeUndefined();
    expect(result.current.enabled).toBe(true);
  });

  it('adopts an explicit false from the running backend', async () => {
    api.getConfigSpec.mockResolvedValue({
      entries: [{ key: MODEL_REFRESH_CONFIG_KEY, value: false }],
    });
    const { result } = renderHook(() => useModelRefreshSetting());

    await waitFor(() => {
      expect(result.current.runtimeValue).toBe(false);
    });
    expect(result.current.enabled).toBe(false);
  });

  it('lets the runtime value win over a build flag that disables it', async () => {
    vi.stubEnv(MODEL_REFRESH_FLAG_ENV, '0');
    api.getConfigSpec.mockResolvedValue({
      entries: [{ key: MODEL_REFRESH_CONFIG_KEY, value: true }],
    });
    const { result } = renderHook(() => useModelRefreshSetting());

    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
    });
    expect(result.current.runtimeValue).toBe(true);
  });

  it('falls back to the build flag when the API client is unavailable', () => {
    const original = api.getConfigSpec;
    delete api.getConfigSpec;
    try {
      vi.stubEnv(MODEL_REFRESH_FLAG_ENV, '0');
      const { result } = renderHook(() => useModelRefreshSetting());
      expect(result.current.runtimeValue).toBeUndefined();
      expect(result.current.enabled).toBe(false);
    } finally {
      api.getConfigSpec = original;
    }
  });

  it('keeps the build-time default when the config-spec fetch rejects', async () => {
    api.getConfigSpec.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useModelRefreshSetting());

    await waitFor(() => {
      expect(api.getConfigSpec).toHaveBeenCalled();
    });
    expect(result.current.runtimeValue).toBeUndefined();
    expect(result.current.enabled).toBe(true);
  });

  it('makes no config request while disabled and resolves once enabled', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useModelRefreshSetting(enabled), {
      initialProps: { enabled: false },
    });

    // A closed always-mounted dialog pays no /status/config read on app load.
    expect(api.getConfigSpec).not.toHaveBeenCalled();
    expect(result.current.runtimeValue).toBeUndefined();
    expect(result.current.enabled).toBe(true);

    api.getConfigSpec.mockResolvedValue({
      entries: [{ key: MODEL_REFRESH_CONFIG_KEY, value: false }],
    });
    rerender({ enabled: true });
    await waitFor(() => {
      expect(result.current.runtimeValue).toBe(false);
    });
    expect(result.current.enabled).toBe(false);
  });
});
