import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import {
  ALIAS_HARNESS_ID,
  aliasPseudoModels,
} from '../../../shared/modelAliases.js';

/***
 * MARK: withAliasEntry
 * @description Appends the virtual `alias` harness entry (per-project model
 *   aliases as catalogue pseudo-models) to a harness view, so every picker
 *   built on this hook offers aliases with zero picker forks. The entry is
 *   appended only when the caller passes a known alias list (an array, even
 *   empty — alias-free projects still list the entry with an empty model
 *   list and the picker's empty note points at Settings); omitted/unknown
 *   (not an array) leaves the view untouched for full back-compat. An
 *   existing server-side `alias` entry is never duplicated.
 * @example withAliasEntry([{ id: 'pi', models: [] }], [{ name: 'small', harness: 'pi', model: 'm' }])
 *   => [{ id: 'pi', … }, { id: 'alias', label: 'Alias', modelSelection: 'list', models: [{ id: 'small', … }] }]
 * @param {Array<Object>} harnesses - Harness view from /compute/models.
 * @param {Array<Object>} [aliases] - Project's modelAliases (array = known).
 * @returns {Array<Object>} Harness view with the virtual entry appended.
 ***/
export function withAliasEntry(harnesses, aliases) {
  const list = Array.isArray(harnesses) ? harnesses : [];
  if (!Array.isArray(aliases)) return list;
  if (list.some((h) => h?.id === ALIAS_HARNESS_ID)) return list;
  return [
    ...list,
    {
      id: ALIAS_HARNESS_ID,
      label: 'Alias',
      description: 'Per-project model aliases (Settings › Model Aliases)',
      modelSelection: 'list',
      modelFlag: null,
      isDefault: false,
      models: aliasPseudoModels(aliases),
    },
  ];
}

/***
 * MARK: useModelCatalog
 * @description Fetches the AI model catalogue (flat models + additive per-harness
 *   view) once on mount, falling back to a caller-provided static list when the
 *   API client is unavailable, the response is empty, or the request fails.
 *   This is the single fetch point shared by every model selector in the app
 *   (ProjectSettings' default model, WorkflowCanvas' per-stage override), so
 *   the fallback semantics live in exactly one place. `refresh()` re-runs
 *   discovery bypassing both caches (backend `?refresh=true`) — the escape
 *   hatch behind the pickers' "no models discovered" empty state.
 * @example const { models, harnesses, loading, refreshing, refresh } = useModelCatalog(FALLBACK_MODELS);
 * @example const { harnesses } = useModelCatalog(FALLBACK_MODELS, { aliases: project?.modelAliases });
 * @example // Fetch only while a lazily-opened surface (e.g. a modal) is visible:
 *   useModelCatalog(FALLBACK_MODELS, { enabled: isOpen });
 * @param {Array<Object>} fallbackModels - Static model list used when fetching is unavailable or fails.
 * @param {Object} [opts]
 * @param {Array<Object>} [opts.aliases] - Project's modelAliases; appends the virtual `alias` harness entry when an array.
 * @param {boolean} [opts.enabled=true] - When false, the mount fetch is skipped entirely (no request) until it flips true. `refresh()` still works while disabled, so a host that lazily opens its surface never pays for a catalogue read on app load.
 * @returns {{models: Array<Object>, harnesses: Array<Object>, loading: boolean, refreshing: boolean, refresh: Function}}
 ***/
export function useModelCatalog(fallbackModels, { aliases, enabled = true } = {}) {
  const [models, setModels] = useState(fallbackModels);
  const [harnesses, setHarnesses] = useState([]);
  // Lazy initializer: only fetch-capable api modules (i.e. not mocked-away
  // test doubles) start in the loading state, so the effect body below never
  // needs to call setState synchronously.
  const [loading, setLoading] = useState(
    () => enabled && typeof api.getModels === 'function',
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled || typeof api.getModels !== 'function') {
      // Disabled hosts (lazily-opened modals) and mocked-away api modules
      // make no request; keep the caller-provided fallback list as the
      // catalogue.
      return undefined;
    }
    let isMounted = true;
    api
      .getModels()
      .then((res) => {
        if (!isMounted) return;
        const list = res?.models;
        if (Array.isArray(list) && list.length > 0) {
          setModels(list);
          setHarnesses(Array.isArray(res.harnesses) ? res.harnesses : []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setModels(fallbackModels);
          setHarnesses([]);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
    // Fetch when enabled (mount, or the first time a lazy host opens): the
    // catalogue is shared cached data (TTL), not reactive to props, and the
    // fallback list never changes at runtime. `enabled` is the only dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (typeof api.getModels !== 'function') return;
    setRefreshing(true);
    try {
      // `true` bypasses the client cache AND asks the backend for a
      // network-free disk refresh past its own TTL.
      const res = await api.getModels(true);
      const list = res?.models;
      if (Array.isArray(list) && list.length > 0) {
        setModels(list);
        setHarnesses(Array.isArray(res.harnesses) ? res.harnesses : []);
      }
    } catch {
      // Keep rendering the current catalogue; the empty state stays with
      // its Refresh action for another try.
    } finally {
      setRefreshing(false);
    }
  }, []);

  // The virtual alias entry is derived at render so it tracks the caller's
  // alias list on every path (fetched, fallback, mocked-away api) without
  // forking the fetch logic above.
  return { models, harnesses: withAliasEntry(harnesses, aliases), loading, refreshing, refresh };
}
