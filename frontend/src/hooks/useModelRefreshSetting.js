import { useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  isSystemSettingsModelRefreshEnabled,
  runtimeModelRefreshValue,
} from '../components/settings/modelRefreshFlag';

/***
 * MARK: useModelRefreshSetting
 * @description Resolves the System Settings model-refresh gate from live
 *   config: fetches `GET /status/config` once on mount, reads the
 *   authoritative `refreshModelsOnHarnessRefresh` entry, and falls back to
 *   the build-time Vite flag when the running backend does not report it
 *   (older backend, mocked-away API). The fetch is a fixed capability of the
 *   api module, so a mocked-away client simply keeps the build-time default —
 *   the same pattern as `useModelCatalog`.
 * @example const { enabled, runtimeValue } = useModelRefreshSetting();
 * @example // Fetch only while the System Settings screen is mounted:
 *   const { enabled } = useModelRefreshSetting(isSystemSettingsMounted);
 * @param {boolean} [enabled=true] - When false, no `/status/config` request is made and the build-time flag decides until it flips true (a lazily-opened settings screen never pays for a config read on app load).
 * @returns {{enabled: boolean, runtimeValue: boolean|undefined}} The gate and the raw runtime value.
 ***/
export function useModelRefreshSetting(enabled = true) {
  const [runtimeValue, setRuntimeValue] = useState(undefined);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof api.getConfigSpec !== 'function') return undefined;
    let cancelled = false;
    api
      .getConfigSpec()
      .then((res) => {
        if (!cancelled) setRuntimeValue(runtimeModelRefreshValue(res?.entries));
      })
      .catch(() => {
        // Keep the build-time default; a config-spec hiccup must never make
        // the model catalogue unusable.
      });
    return () => {
      cancelled = true;
    };
    // Fetch when enabled (mount, or the first time a lazy host opens).
  }, [enabled]);

  return {
    runtimeValue,
    enabled: isSystemSettingsModelRefreshEnabled(runtimeValue),
  };
}

export default useModelRefreshSetting;
