/***
 * MARK: harnessPrefs
 * @description Pure helpers for the Harness Integration settings (System
 *   Settings › Harness tab). Preferences are keyed `{ [harnessId]: { enabled,
 *   autoDetect } }` so a newly registered harness simply appears with safe
 *   defaults and a removed one leaves a harmless orphan entry: unknown ids
 *   are ignored at render time, missing ids default to
 *   `{ enabled: true, autoDetect: true }`.
 *
 *   Manual-off always wins: `enabled: false` is never flipped back on by a
 *   probe — probes only feed the *availability* badge, never the prefs.
 * @example prefsForHarness({}, 'pi') => { enabled: true, autoDetect: true }
 * @example isHarnessEnabled({ pi: { enabled: false } }, 'pi') => false
 ***/

/***
 * MARK: HARNESS_PREFS_KEY
 * @description localStorage key backing the harness integration preferences
 *   (see `useHarnessPrefs`). Namespaced like every other `kainbain:` key.
 * @example HARNESS_PREFS_KEY // => 'kainbain:harnessPrefs'
 ***/
export const HARNESS_PREFS_KEY = 'kainbain:harnessPrefs';

/***
 * MARK: defaultHarnessPref
 * @description The safe default for a harness with no stored preference:
 *   visible and auto-detected. New registry entries appear without any
 *   migration step.
 * @example defaultHarnessPref() => { enabled: true, autoDetect: true }
 * @returns {{enabled: boolean, autoDetect: boolean}}
 ***/
export function defaultHarnessPref() {
  return { enabled: true, autoDetect: true };
}

/***
 * MARK: normalizeHarnessPrefs
 * @description Coerces a raw stored value into the prefs shape. Non-objects
 *   become `{}`, and entries without boolean-coercible flags fall back to the
 *   default — a corrupt or partial payload can never crash the settings tab.
 *   Unknown harness ids are kept when well-formed (harmless orphans); they
 *   are ignored at render time by `prefsForHarness` callers that only look up
 *   registered ids.
 * @example normalizeHarnessPrefs(null) => {}
 * @example normalizeHarnessPrefs({ pi: { enabled: false } }) => { pi: { enabled: false, autoDetect: true } }
 * @param {unknown} raw - The raw stored value.
 * @returns {Object} Normalized `{ [id]: { enabled, autoDetect } }`.
 ***/
export function normalizeHarnessPrefs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const prefs = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!id || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    prefs[id] = {
      enabled: entry.enabled === undefined ? true : Boolean(entry.enabled),
      autoDetect: entry.autoDetect === undefined ? true : Boolean(entry.autoDetect),
    };
  }
  return prefs;
}

/***
 * MARK: prefsForHarness
 * @description Reads one harness's preference, defaulting to
 *   `{ enabled: true, autoDetect: true }` when the id has no stored entry
 *   (older payloads, brand-new harnesses).
 * @example prefsForHarness({}, 'antigravity') => { enabled: true, autoDetect: true }
 * @param {Object} [prefs] - Normalized prefs map.
 * @param {string} id - Harness id.
 * @returns {{enabled: boolean, autoDetect: boolean}}
 ***/
export function prefsForHarness(prefs, id) {
  const entry = prefs?.[id];
  if (!entry || typeof entry !== 'object') return defaultHarnessPref();
  return {
    enabled: entry.enabled === undefined ? true : Boolean(entry.enabled),
    autoDetect: entry.autoDetect === undefined ? true : Boolean(entry.autoDetect),
  };
}

/***
 * MARK: isHarnessEnabled
 * @description Reports whether a harness is enabled (defaults to true when
 *   the prefs carry no entry for the id).
 * @example isHarnessEnabled({ pi: { enabled: false } }, 'pi') => false
 * @param {Object} [prefs] - Normalized prefs map.
 * @param {string} id - Harness id.
 * @returns {boolean}
 ***/
export function isHarnessEnabled(prefs, id) {
  return prefsForHarness(prefs, id).enabled;
}

/***
 * MARK: isHarnessAutoDetect
 * @description Reports whether auto-detection is on for a harness (defaults
 *   to true when the prefs carry no entry for the id).
 * @example isHarnessAutoDetect({}, 'pi') => true
 * @param {Object} [prefs] - Normalized prefs map.
 * @param {string} id - Harness id.
 * @returns {boolean}
 ***/
export function isHarnessAutoDetect(prefs, id) {
  return prefsForHarness(prefs, id).autoDetect;
}

/***
 * MARK: withHarnessPref
 * @description Returns a new prefs map with one harness's flags patched
 *   (never mutates the input). Unknown ids are stored verbatim — they stay
 *   invisible until a harness registers under that id.
 * @example withHarnessPref({}, 'pi', { enabled: false }) => { pi: { enabled: false, autoDetect: true } }
 * @param {Object} [prefs] - Normalized prefs map.
 * @param {string} id - Harness id.
 * @param {Object} [patch] - Partial flags (`{ enabled }`, `{ autoDetect }`).
 * @returns {Object} New prefs map.
 ***/
export function withHarnessPref(prefs, id, patch = {}) {
  const current = prefsForHarness(prefs, id);
  return { ...(prefs || {}), [id]: { ...current, ...patch } };
}

/***
 * MARK: enabledHarnesses
 * @description Filters a harness list down to the enabled entries. Disabled
 *   harnesses are NOT hidden by this helper's callers in pickers — they
 *   render disabled-with-reason (the `ModelSelector` contract) — but the
 *   *default-harness* selector only offers enabled ones.
 * @example enabledHarnesses([{ id: 'pi' }, { id: 'agy' }], { agy: { enabled: false } }) => [{ id: 'pi' }]
 * @param {Array<Object>} harnesses - Harness entries (`{ id, … }`).
 * @param {Object} [prefs] - Normalized prefs map.
 * @returns {Array<Object>} Enabled entries in list order.
 ***/
export function enabledHarnesses(harnesses, prefs) {
  return (Array.isArray(harnesses) ? harnesses : []).filter((h) => isHarnessEnabled(prefs, h?.id));
}

/***
 * MARK: harnessDisabledReason
 * @description The disabled-with-reason string for the `ModelSelector`
 *   `isHarnessDisabled` contract: null when the harness stays selectable, a
 *   human reason when the user disabled it in System Settings › Harness.
 *   Never hides — the caller renders the option disabled with this text.
 * @example harnessDisabledReason({ pi: { enabled: false } }, { id: 'pi', label: 'pi' }) => 'Disabled in System Settings › Harness'
 * @example harnessDisabledReason({}, { id: 'pi' }) => null
 * @param {Object} [prefs] - Normalized prefs map.
 * @param {Object} harness - Harness entry (`{ id, label? }`).
 * @returns {string|null} Reason string, or null when selectable.
 ***/
export function harnessDisabledReason(prefs, harness) {
  if (!harness || isHarnessEnabled(prefs, harness.id)) return null;
  return 'Disabled in System Settings › Harness';
}

/***
 * MARK: deriveAvailability
 * @description Derives one harness's honest availability from a models probe
 *   (`GET /harnesses/:id/models`): `'detected'` (usable signal), `'unavailable'`
 *   (a catalogue harness that discovered nothing), or `'unknown'` (not probed
 *   yet, probe failed, or the harness manages its own model so an empty
 *   catalogue says nothing — e.g. `custom`, `muse`). Manual-off never reaches
 *   this function: the caller renders `Disabled` first so a probe can never
 *   override an explicit off.
 * @example deriveAvailability({ id: 'pi', modelSelection: 'list' }, { models: [{ id: 'm' }] }) => 'detected'
 * @example deriveAvailability({ id: 'custom', modelSelection: 'none' }, { models: [] }) => 'unknown'
 * @param {Object} harness - Harness entry (`{ id, modelSelection? }`).
 * @param {Object|null} probe - Probe result (`{ models }`), `{ error }` on failure, or null when not probed.
 * @returns {string} 'detected' | 'unavailable' | 'unknown'.
 ***/
export function deriveAvailability(harness, probe) {
  if (!probe || probe.error || !Array.isArray(probe.models)) return 'unknown';
  if ((harness?.modelSelection || 'list') === 'none') return 'unknown';
  return probe.models.length > 0 ? 'detected' : 'unavailable';
}

/***
 * MARK: availabilityBadge
 * @description Presentation for one harness row's status: the honest probe
 *   outcome, with manual-off taking precedence over everything (a disabled
 *   harness shows `Disabled`, never its last probe result).
 * @example availabilityBadge({ enabled: false }, 'detected') => { text: 'Disabled', tone: 'muted' }
 * @param {{enabled: boolean, autoDetect: boolean}} pref - The harness's pref entry.
 * @param {string} availability - 'detected' | 'unavailable' | 'unknown'.
 * @returns {{text: string, tone: string}} Label + tone ('good' | 'bad' | 'muted').
 ***/
export function availabilityBadge(pref, availability) {
  if (pref && pref.enabled === false) return { text: 'Disabled', tone: 'muted' };
  if (pref && pref.autoDetect === false && availability === 'unknown') {
    return { text: 'Auto-detect off', tone: 'muted' };
  }
  if (availability === 'detected') return { text: 'Detected', tone: 'good' };
  if (availability === 'unavailable') return { text: 'Unavailable', tone: 'bad' };
  return { text: 'Unknown', tone: 'muted' };
}

/***
 * MARK: availabilityFromEntry
 * @description Derives one harness's availability from a backend catalogue
 *   entry's discovery projection (`available: true | false | null`): the
 *   badge input for pickers that render straight from `/compute/models`
 *   (no on-demand probe). Entries from older backends carry no `available`
 *   field at all — those read as null (badge-free, never mislead) rather
 *   than 'unknown'.
 * @example availabilityFromEntry({ id: 'pi', available: true }) => 'detected'
 * @example availabilityFromEntry({ id: 'pi', available: false }) => 'unavailable'
 * @example availabilityFromEntry({ id: 'pi', available: null }) => 'unknown'
 * @example availabilityFromEntry({ id: 'pi' }) => null
 * @param {Object} entry - Harness view entry (`{ available? }`).
 * @returns {string|null} 'detected' | 'unavailable' | 'unknown' | null (predates availability).
 ***/
export function availabilityFromEntry(entry) {
  if (!entry || entry.available === undefined) return null;
  if (entry.available === true) return 'detected';
  if (entry.available === false) return 'unavailable';
  return 'unknown';
}

/***
 * MARK: availabilityToneClass
 * @description Tailwind classes for one availability badge tone. Shared by
 *   the System Settings harness list and the model pickers so tones can
 *   never drift apart between surfaces. Colors follow the DiffView badge
 *   recipe exactly (dark 900-step translucent fill + 300-step text): 10px
 *   bold badge text is WCAG normal text and the settings-view axe gate
 *   enforces AAA enhanced contrast (1.4.6, 7:1) — the lighter 500/15 fill
 *   only reaches ~5.8:1 with 300-step text, while the 900/30 fill clears
 *   7:1 on the same dark backdrops.
 * @example availabilityToneClass('good') => 'bg-green-…'
 * @param {string} tone - 'good' | 'bad' | 'muted'.
 * @returns {string} Class names for the badge pill.
 ***/
export function availabilityToneClass(tone) {
  if (tone === 'good') {
    return 'bg-green-900/30 text-green-300 border-green-700/50';
  }
  if (tone === 'bad') {
    return 'bg-red-900/30 text-red-300 border-red-700/60';
  }
  return 'bg-surface-container-high text-text-muted border-border-standard';
}
