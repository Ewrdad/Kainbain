/***
 * MARK: System Settings model-refresh flag
 * @description Config-over-code gate for the "harness Refresh also refreshes
 *   the shared model catalogue" behaviour in System Settings. The toggle is
 *   NEVER a hardcoded boolean: the backend config key
 *   `refreshModelsOnHarnessRefresh` (env
 *   `KAINBAIN_REFRESH_MODELS_ON_HARNESS_REFRESH`, served by
 *   `GET /status/config`) is authoritative at runtime, and the build-time
 *   Vite flag `VITE_ENABLE_SYSTEM_SETTINGS_MODEL_REFRESH` is the offline
 *   fallback (unset means ON). Disabling either one restores the previous
 *   harness-only refresh exactly.
 *
 *   This module is pure (no API import): the runtime value is read from the
 *   already-fetched config-spec entries by the caller, so it stays trivially
 *   unit-testable.
 ***/

/***
 * MARK: MODEL_REFRESH_FLAG_ENV
 * @description Canonical build-time frontend flag read by
 *   `isSystemSettingsModelRefreshEnabled`. Vite inlines the literal at build
 *   time; set it to `0`/`false`/`off` in `frontend/.env` to disable.
 * @example MODEL_REFRESH_FLAG_ENV => 'VITE_ENABLE_SYSTEM_SETTINGS_MODEL_REFRESH'
 ***/
export const MODEL_REFRESH_FLAG_ENV = 'VITE_ENABLE_SYSTEM_SETTINGS_MODEL_REFRESH';

/***
 * MARK: MODEL_REFRESH_CONFIG_KEY
 * @description Backend config key carrying the authoritative runtime toggle
 *   in `GET /status/config` (`api/config/schema.js`).
 * @example MODEL_REFRESH_CONFIG_KEY => 'refreshModelsOnHarnessRefresh'
 ***/
export const MODEL_REFRESH_CONFIG_KEY = 'refreshModelsOnHarnessRefresh';

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on']);
const FALSE_WORDS = new Set(['0', 'false', 'no', 'off']);

/***
 * MARK: parseModelRefreshFlag
 * @description Normalizes one flag value (boolean or string) to a tri-state:
 *   `true`/`false` when explicitly set, `undefined` when absent or
 *   unparseable. An unknown string is treated as absent, never as a silent
 *   `true` — the defaults are applied by the caller.
 * @example parseModelRefreshFlag('0') => false
 * @example parseModelRefreshFlag(undefined) => undefined
 * @param {*} value - Raw config value or env string.
 * @returns {boolean|undefined} The parsed flag, or undefined when unset.
 ***/
export function parseModelRefreshFlag(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (TRUE_WORDS.has(text)) return true;
  if (FALSE_WORDS.has(text)) return false;
  return undefined;
}

/***
 * MARK: runtimeModelRefreshValue
 * @description Reads the authoritative toggle out of a `GET /status/config`
 *   entry list. Returns the parsed boolean when the running backend reports
 *   the key, or `undefined` when it is missing (older backend / mocked
 *   payload) so the caller falls back to the build-time flag.
 * @example runtimeModelRefreshValue([{ key: 'refreshModelsOnHarnessRefresh', value: false }]) => false
 * @param {Array<Object>} entries - `GET /status/config` entries.
 * @returns {boolean|undefined} The parsed runtime flag, or undefined.
 ***/
export function runtimeModelRefreshValue(entries) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.key === MODEL_REFRESH_CONFIG_KEY) {
      return parseModelRefreshFlag(entry.value);
    }
  }
  return undefined;
}

/***
 * MARK: buildTimeModelRefreshValue
 * @description Reads the Vite build-time flag. The literal member access is
 *   deliberate: Vite only inlines statically referenced `import.meta.env`
 *   keys, so a computed lookup would be undefined in production builds.
 * @example buildTimeModelRefreshValue() => undefined
 * @returns {*} The raw env value, or undefined outside a Vite build.
 ***/
function buildTimeModelRefreshValue() {
  try {
    return import.meta.env?.VITE_ENABLE_SYSTEM_SETTINGS_MODEL_REFRESH;
  } catch {
    return undefined;
  }
}

/***
 * MARK: isSystemSettingsModelRefreshEnabled
 * @description Resolves the System Settings model-refresh gate. Precedence:
 *   an explicit runtime config value (from `GET /status/config`) wins; when
 *   the backend does not report the key, the build-time Vite flag decides;
 *   when neither is set the feature defaults ON so it is discoverable.
 * @example isSystemSettingsModelRefreshEnabled(false) => false
 * @example isSystemSettingsModelRefreshEnabled(undefined) => true
 * @param {*} [runtimeConfigValue] - Raw `refreshModelsOnHarnessRefresh` value.
 * @returns {boolean} Whether harness Refresh should also refresh the catalogue.
 ***/
export function isSystemSettingsModelRefreshEnabled(runtimeConfigValue) {
  const runtime = parseModelRefreshFlag(runtimeConfigValue);
  if (runtime !== undefined) return runtime;
  const build = parseModelRefreshFlag(buildTimeModelRefreshValue());
  return build === undefined ? true : build;
}
