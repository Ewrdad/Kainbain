import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import {
  prefsForHarness,
  enabledHarnesses,
  deriveAvailability,
  availabilityBadge,
  availabilityToneClass,
} from '../../services/harnessPrefs';
import { secsToMinutes, minutesToSecs } from '../../utils/timeoutUnits';
import { isSystemSettingsModelRefreshEnabled } from './modelRefreshFlag';
import { ReliabilityLine } from './ReliabilityLine';

/***
 * MARK: SettingRow
 * @description Label + control row matching the System Settings screen styling.
 * @example <SettingRow label="Default harness" hint="..."><select /></SettingRow>
 ***/
function SettingRow({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-border-standard last:border-b-0">
      <span className="text-xs font-bold text-on-surface">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </div>
  );
}

/***
 * MARK: harnessReliabilityTitles
 * @description Tooltip wording for one harness row's reliability line from
 *   `GET /harnesses/reliability`: what the rate counts (clean runs vs
 *   timeouts/harness errors) plus the honest no-data wording. Passed into
 *   the shared `ReliabilityLine` — the strings stay here so the harness
 *   view keeps owning its own prose.
 * @example harnessReliabilityTitles({ runs: 120, successes: 117, infraFailures: 3 }) => { title: '…', emptyTitle: '…' }
 * @param {Object} [stats] - Reliability entry for the harness, if any.
 * @returns {{title: string, emptyTitle: string}} Tooltip wording.
 ***/
function harnessReliabilityTitles(stats) {
  const runs = stats?.runs || 0;
  const runWord = runs === 1 ? 'run' : 'runs';
  return {
    // Read only when stats exist: the line renders the title solely
    // alongside a rate, and must never crash harnesses without one.
    title: stats
      ? `All-time success rate over ${runs} ${runWord} (${stats.successes} clean, ${stats.infraFailures} timeouts or harness errors). Deliberate agent decisions to fail a stage are excluded.`
      : '',
    emptyTitle: 'No attributed runs yet — reliability appears after this harness completes stages.',
  };
}

/***
 * MARK: HarnessSection
 * @description The System Settings › Harness tab: one row per harness from the
 *   backend registry (`GET /harnesses` — never a hardcoded list), each with an
 *   honest availability badge, a reliability line (success rate over counted
 *   runs, an honest no-data state, or a fetch error with retry), plus Enabled
 *   and Auto-detect toggles.
 *   A manually disabled harness stays disabled: probes only feed the badge,
 *   never the prefs. The Default-harness selector only offers enabled
 *   harnesses; a stored default that became disabled is still shown as a
 *   disabled-with-reason option (never silently rewritten).
 * @example <HarnessSection draft={draft} update={update} inputClass={…} toggleClass={…} prefs={prefs} updatePref={updatePref} resetPrefs={resetPrefs} />
 * @param {Object} props
 * @param {Object} props.draft - The content's local draft (defaultHarness, timeouts, …).
 * @param {Function} props.update - Draft updater `(key, value) => void`.
 * @param {string} props.inputClass - Shared input styling from SystemSettingsContent.
 * @param {string} props.toggleClass - Shared toggle-label styling from SystemSettingsContent.
 * @param {Object} props.prefs - Normalized harness prefs (`{ [id]: { enabled, autoDetect } }`).
 * @param {Function} props.updatePref - Prefs updater `(id, patch) => void` (persists immediately).
 * @param {Function} props.resetPrefs - Resets all harness prefs to defaults.
 * @param {Function} [props.onModelsRefresh] - Refreshes the shared model catalogue (re-runs discovery past both caches); called fire-and-forget after an explicit harness Refresh when the config gate allows it.
 * @param {boolean} [props.modelsRefreshing=false] - Catalogue refresh in flight (drives the subtle status hint).
 * @param {*} [props.modelRefreshRuntimeValue] - Live `refreshModelsOnHarnessRefresh` value from `GET /status/config`; absent falls back to the build-time flag.
 ***/
export function HarnessSection({
  draft,
  update,
  inputClass,
  toggleClass,
  prefs,
  updatePref,
  resetPrefs,
  onModelsRefresh,
  modelsRefreshing = false,
  modelRefreshRuntimeValue,
}) {
  // Harness discovery is a fixed capability of the api module (mocked away
  // in some component tests): lazy initializers carry the unavailable-build
  // state so the mount effect below never needs a synchronous setState
  // (react-hooks/set-state-in-effect) — same pattern as useModelCatalog.
  const [harnessList, setHarnessList] = useState([]);
  const [loading, setLoading] = useState(() => typeof api.getHarnesses === 'function');
  const [loadError, setLoadError] = useState(() =>
    typeof api.getHarnesses === 'function'
      ? ''
      : 'Harness discovery is unavailable in this build.',
  );
  // Probe results per harness id: { models, discoveryError? } on success,
  // { error: true } on failure, absent when not probed yet. Feeds the badge
  // (+ the discovery-reason line) only — never prefs.
  const [probes, setProbes] = useState({});
  const [refreshingIds, setRefreshingIds] = useState([]);
  // Reliability entries keyed by harness id (null until the one-shot fetch
  // lands; a failed fetch flips reliabilityError instead of faking zeros).
  const [reliabilityById, setReliabilityById] = useState(null);
  const [reliabilityError, setReliabilityError] = useState(false);

  /***
   * MARK: probeHarness
   * @description Runs one on-demand availability probe (`GET
   *   /harnesses/:id/models`, cached read unless `refresh`) and records the
   *   result for the badge. Never touches prefs: manual-off always wins.
   *   Called only from event handlers and async fetch continuations (never
   *   synchronously from an effect) so the refreshing flag never triggers a
   *   cascading render (react-hooks/set-state-in-effect). When the row's
   *   Refresh button triggered the probe, the shared model catalogue is also
   *   refreshed past both caches — but only when the config gate
   *   (`refreshModelsOnHarnessRefresh` / `VITE_ENABLE_SYSTEM_SETTINGS_MODEL_REFRESH`)
   *   allows it. Fire-and-forget: a catalogue failure never fails the probe.
   ***/
  const probeHarness = useCallback(
    async (id, { refresh = false } = {}) => {
      if (!id || typeof api.getHarnessModels !== 'function') return;
      setRefreshingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      try {
        const res = await api.getHarnessModels(id, refresh);
        const models = Array.isArray(res?.models) ? res.models : [];
        const discoveryError =
          res?.discoveryError?.message ? res.discoveryError : null;
        setProbes((prev) => ({ ...prev, [id]: { models, discoveryError } }));
      } catch {
        setProbes((prev) => ({ ...prev, [id]: { error: true } }));
      } finally {
        setRefreshingIds((prev) => prev.filter((entry) => entry !== id));
      }
      if (
        refresh &&
        isSystemSettingsModelRefreshEnabled(modelRefreshRuntimeValue) &&
        typeof onModelsRefresh === 'function'
      ) {
        // Defer into the promise chain so even a synchronous throw from the
        // callback is caught: the catalogue refresh must never surface as a
        // harness-probe failure.
        void Promise.resolve()
          .then(() => onModelsRefresh())
          .catch(() => {});
      }
    },
    [modelRefreshRuntimeValue, onModelsRefresh],
  );

  /***
   * MARK: probeAutoDetectHarnesses
   * @description Probes every not-yet-probed harness whose prefs leave
   *   auto-detect on. Harnesses with auto-detect off stay `unknown` until the
   *   user hits Refresh — an explicit action, never an override of their
   *   choice. Async continuation only (see probeHarness).
   ***/
  const probeAutoDetectHarnesses = useCallback(
    (rows, currentPrefs, currentProbes) => {
      for (const harness of rows) {
        const id = harness?.id;
        if (!id || currentProbes[id]) continue;
        if (prefsForHarness(currentPrefs, id).autoDetect) {
          void probeHarness(id);
        }
      }
    },
    [probeHarness],
  );

  const loadHarnesses = useCallback(async () => {
    if (typeof api.getHarnesses !== 'function') return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.getHarnesses();
      const rows = Array.isArray(res?.harnesses) ? res.harnesses : [];
      setHarnessList(rows);
      probeAutoDetectHarnesses(rows, prefs, {});
    } catch {
      setLoadError('Could not load harnesses — check the connection and retry.');
      setHarnessList([]);
    } finally {
      setLoading(false);
    }
    // `prefs` is read for the first auto-detect pass only; later pref edits
    // probe through handlePrefChange below, so this callback stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeAutoDetectHarnesses]);

  /***
   * MARK: loadReliability
   * @description (Re)fetches `GET /harnesses/reliability` into the per-id map.
   *   Event-handler only (the Retry button): the mount effect below inlines
   *   its own fetch so no synchronous setState runs inside an effect.
   ***/
  const loadReliability = useCallback(async () => {
    if (typeof api.getHarnessReliability !== 'function') return;
    setReliabilityError(false);
    try {
      const res = await api.getHarnessReliability();
      const list = Array.isArray(res?.reliability) ? res.reliability : [];
      const byId = {};
      for (const entry of list) {
        if (entry?.harnessId) byId[entry.harnessId] = entry;
      }
      setReliabilityById(byId);
    } catch {
      setReliabilityError(true);
    }
  }, []);

  useEffect(() => {
    if (typeof api.getHarnessReliability !== 'function') return undefined;
    let cancelled = false;
    api
      .getHarnessReliability()
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.reliability) ? res.reliability : [];
        const byId = {};
        for (const entry of list) {
          if (entry?.harnessId) byId[entry.harnessId] = entry;
        }
        setReliabilityById(byId);
      })
      .catch(() => {
        if (!cancelled) setReliabilityError(true);
      });
    return () => {
      cancelled = true;
    };
    // One-shot fetch on mount (same pattern as the harness list below). No
    // exhaustive-deps disable: the effect references no reactive values.
  }, []);

  useEffect(() => {
    if (typeof api.getHarnesses !== 'function') return undefined;
    let cancelled = false;
    api
      .getHarnesses()
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.harnesses) ? res.harnesses : [];
        setHarnessList(rows);
        probeAutoDetectHarnesses(rows, prefs, {});
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Could not load harnesses — check the connection and retry.');
        setHarnessList([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount-time fetch only (same pattern as useModelCatalog): prefs are read
    // for the first auto-detect pass, later edits probe via handlePrefChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /***
   * MARK: handlePrefChange
   * @description Persists one toggle and, when auto-detect was just switched
   *   on for a never-probed harness, probes it now (event handler, so the
   *   probe's state updates are render-safe).
   ***/
  const handlePrefChange = (id, patch) => {
    updatePref(id, patch);
    if (patch?.autoDetect && !probes[id]) {
      void probeHarness(id);
    }
  };

  const selectableHarnesses = enabledHarnesses(harnessList, prefs);
  const defaultHarnessId = draft?.defaultHarness || '';
  const defaultIsSelectable = selectableHarnesses.some((h) => h.id === defaultHarnessId);
  const staleDefaultEntry = !defaultIsSelectable
    ? harnessList.find((h) => h.id === defaultHarnessId)
    : null;

  if (loading) {
    return (
      <div className="py-6 text-xs text-text-muted" data-testid="harness-section-loading">
        Loading harnesses…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-6 flex flex-col gap-3" data-testid="harness-section-error">
        <p className="text-xs text-text-muted">{loadError}</p>
        <button
          type="button"
          onClick={loadHarnesses}
          className="self-start px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div data-testid="harness-section">
      <p className="mt-3 px-3 py-2 text-[11px] font-mono text-text-muted bg-surface-container-high border border-border-standard rounded-sm">
        Enabled and auto-detect choices save automatically. Enabled controls which
        harnesses are offered; auto-detect probes availability without ever overriding
        an explicit off. The default-harness selector and the timeout / bypass controls
        below are draft-only until backend persistence lands.
      </p>
      <p data-testid="harness-reliability-note" className="mt-2 text-[11px] text-text-muted">
        Reliability counts timeouts and harness errors as failures; deliberate agent
        decisions to fail a stage are excluded from the rate.
      </p>
      <p data-testid="harness-tier-legend" className="mt-2 text-[11px] text-text-muted">
        Support tiers describe integration depth, not model quality — Tier 1 direct
        in-KainBain integration → Tier 4 separate invocation. See
        docs/EngineDetails/HarnessSupportTeirs.md.
      </p>
      {modelsRefreshing && (
        <p
          data-testid="models-refresh-status"
          role="status"
          className="mt-2 text-[11px] text-text-muted"
        >
          Models refreshing…
        </p>
      )}
      {reliabilityError && (
        <div data-testid="harness-reliability-error" className="mt-2 flex items-center gap-3">
          <p className="text-[11px] text-text-muted">
            Could not load harness reliability.
          </p>
          <button
            type="button"
            onClick={loadReliability}
            className="text-[11px] underline text-primary cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <SettingRow
        label="Default harness"
        hint="Which agent harness new stages run on. Only enabled harnesses are offered."
      >
        <select
          aria-label="Default harness"
          value={defaultHarnessId}
          onChange={(e) => update('defaultHarness', e.target.value)}
          className={inputClass}
        >
          {selectableHarnesses.map((harness) => (
            <option key={harness.id} value={harness.id}>
              {harness.name || harness.id}
              {harness.isDefault ? ' (default)' : ''}
            </option>
          ))}
          {!defaultIsSelectable && defaultHarnessId && (
            <option value={defaultHarnessId} disabled>
              {staleDefaultEntry
                ? `${staleDefaultEntry.name || staleDefaultEntry.id} (disabled)`
                : `${defaultHarnessId} (unavailable)`}
            </option>
          )}
          {selectableHarnesses.length === 0 && !defaultHarnessId && (
            <option value="">No harnesses available</option>
          )}
        </select>
      </SettingRow>

      {harnessList.length === 0 ? (
        <p className="py-6 text-xs text-text-muted" data-testid="harness-section-empty">
          No harnesses registered — the backend reported an empty registry.
        </p>
      ) : (
        <ul className="flex flex-col" data-testid="harness-list">
          {harnessList.map((harness) => {
            const pref = prefsForHarness(prefs, harness.id);
            const availability = deriveAvailability(harness, probes[harness.id]);
            const badge = availabilityBadge(pref, availability);
            const refreshing = refreshingIds.includes(harness.id);
            return (
              <li
                key={harness.id}
                data-testid={`harness-row-${harness.id}`}
                className="flex flex-col gap-2 py-3 border-b border-border-standard last:border-b-0"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-on-surface">
                    {harness.name || harness.id}
                  </span>
                  <span
                    data-testid={`harness-status-${harness.id}`}
                    className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${availabilityToneClass(badge.tone)}`}
                  >
                    {badge.text}
                  </span>
                  {harness.supportTier && (
                    <span
                      data-testid={`harness-tier-${harness.id}`}
                      title={harness.supportTierSummary || undefined}
                      className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border border-border-standard text-text-muted"
                    >
                      {harness.supportTierLabel || `Tier ${harness.supportTier}`}
                      {harness.testOnly ? ' · test-only' : ''}
                    </span>
                  )}
                </div>
                {probes[harness.id]?.discoveryError?.message ? (
                  <span
                    data-testid={`harness-status-detail-${harness.id}`}
                    className="text-[11px] text-text-muted"
                  >
                    {probes[harness.id].discoveryError.message}{' '}
                    {probes[harness.id].discoveryError.hint}
                  </span>
                ) : harness.hint ? (
                  <span
                    data-testid={`harness-status-detail-${harness.id}`}
                    className="text-[11px] text-text-muted"
                  >
                    {harness.hint}
                  </span>
                ) : null}
                {harness.description && (
                  <span className="text-[11px] text-text-muted">{harness.description}</span>
                )}
                {!reliabilityError && reliabilityById && (
                  <ReliabilityLine
                    testId={`harness-reliability-${harness.id}`}
                    stats={reliabilityById[harness.id]}
                    showRecent
                    {...harnessReliabilityTitles(reliabilityById[harness.id])}
                  />
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  <label className={toggleClass}>
                    <input
                      type="checkbox"
                      aria-label={`Enable ${harness.name || harness.id} harness`}
                      checked={pref.enabled}
                      onChange={(e) => handlePrefChange(harness.id, { enabled: e.target.checked })}
                      className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                    />
                    <span>Enabled</span>
                  </label>
                  <label className={toggleClass}>
                    <input
                      type="checkbox"
                      aria-label={`Auto-detect ${harness.name || harness.id} harness`}
                      checked={pref.autoDetect}
                      onChange={(e) =>
                        handlePrefChange(harness.id, { autoDetect: e.target.checked })
                      }
                      className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
                    />
                    <span>Auto-detect</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Refresh ${harness.name || harness.id} availability`}
                    onClick={() => probeHarness(harness.id, { refresh: true })}
                    disabled={refreshing}
                    className="text-[11px] underline text-primary disabled:opacity-50 cursor-pointer disabled:cursor-default"
                  >
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
                {(harness.modelSelection || 'list') === 'none' && (
                  <span className="text-[11px] text-text-muted">
                    This harness manages its own model — availability can&apos;t be probed
                    automatically.
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 py-3">
        <span className="text-[11px] text-text-muted">
          {selectableHarnesses.length} of {harnessList.length} enabled
        </span>
        <button
          type="button"
          onClick={resetPrefs}
          className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
        >
          Reset harness preferences
        </button>
      </div>

      <SettingRow
        label="Stage timeout (minutes)"
        hint="How long a stage may run before it is marked timed out."
      >
        <input
          type="number"
          aria-label="Stage timeout in minutes"
          min={1}
          step={0.5}
          value={secsToMinutes(draft?.stageTimeoutSecs)}
          onChange={(e) => update('stageTimeoutSecs', minutesToSecs(e.target.value))}
          className={inputClass}
        />
      </SettingRow>
      <SettingRow
        label="Permission bypass"
        hint="Allow the harness to skip permission prompts (operator-controlled)."
      >
        <label className={toggleClass}>
          <input
            type="checkbox"
            checked={!!draft?.allowPermissionBypass}
            onChange={(e) => update('allowPermissionBypass', e.target.checked)}
            className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
          />
          <span>Allow permission bypass</span>
        </label>
      </SettingRow>
    </div>
  );
}

export default HarnessSection;
