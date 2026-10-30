import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { copyToClipboard } from '../../services/clipboard';

/***
 * MARK: storage entry keys
 * @description Config-spec keys rendered by the Storage tab, grouped into the
 *   four locations the operator asked for. Installation directory is derived
 *   from the built-frontend dir (it is not an env knob: relocating the
 *   install at runtime is out of scope, so it is shown, never edited).
 *
 *   Each row also carries its env-var name: the backend contract, stated
 *   statically so `padMissingEntries` can keep a location the payload omits
 *   visible as `(not set)` instead of dropping it without a trace. Values are
 *   ALWAYS read from the payload — env names are the variable names, not the
 *   values, and never a hardcoded path.
 * @example STORAGE_FIELD_GROUPS[0].rows[0].key => 'projectsRoot'
 * @example STORAGE_FIELD_GROUPS[1].rows[0].env => 'NOTES_SPACE_ROOT'
 ***/
export const STORAGE_FIELD_GROUPS = [
  {
    id: 'projects',
    title: 'Projects folder',
    rows: [{ key: 'projectsRoot', label: 'Projects folder', env: 'PROJECTS_ROOT' }],
  },
  {
    id: 'docs',
    title: 'Centralised docs',
    note: 'Notes space new projects link into: <project>/docs is a symlink to a folder under this root. (The in-app Docs tab directory is intentionally not a setting.)',
    rows: [{ key: 'notesSpaceRoot', label: 'Centralised docs location', env: 'NOTES_SPACE_ROOT' }],
  },
  {
    id: 'harness-bins',
    title: 'Default harness check locations',
    note: 'Binary name on PATH or absolute path, per harness. The opencode harness also searches ~/.opencode/bin.',
    rows: [
      { key: 'agyBin', label: 'agy binary (antigravity harness)', env: 'KAINBAIN_AGY_BIN' },
      { key: 'museBin', label: 'muse binary (muse harness)', env: 'KAINBAIN_MUSE_BIN' },
      {
        key: 'opencodeBin',
        label: 'opencode binary (opencode harness)',
        env: 'KAINBAIN_OPENCODE_BIN',
      },
      { key: 'vibeBin', label: 'vibe binary (vibe harness)', env: 'KAINBAIN_VIBE_BIN' },
    ],
  },
  {
    id: 'install',
    title: 'Installation directory',
    note: 'Display-only: set when the app is installed, not while it runs.',
    rows: [
      { key: 'installDir', label: 'Installation directory' },
      { key: 'distDir', label: 'Built frontend served by the API', env: 'KAINBAIN_DIST' },
    ],
  },
];

/***
 * MARK: entryByKey
 * @description Indexes a config-spec entry list by config key for row lookup.
 * @example entryByKey([{ key: 'projectsRoot', value: '/x' }]).projectsRoot.value => '/x'
 * @param {Array} entries - Config-spec entries from `GET /status/config`.
 * @returns {Object} Entries keyed by config key.
 ***/
export function entryByKey(entries) {
  const byKey = {};
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.key) byKey[entry.key] = entry;
  }
  return byKey;
}

/***
 * MARK: deriveInstallDir
 * @description Derives the display-only installation directory from the built
 *   frontend dir: `<repo>/frontend/dist` trims to `<repo>`. A dist value that
 *   does not follow that layout is returned unchanged so the tab never shows
 *   a silently wrong path.
 * @example deriveInstallDir('/repo/frontend/dist') => '/repo'
 * @param {*} distDir - The `distDir` config value.
 * @returns {string} The install dir to display (empty when unknown).
 ***/
export function deriveInstallDir(distDir) {
  if (typeof distDir !== 'string' || distDir === '') return '';
  const normalized = distDir.replace(/\\/g, '/');
  const suffix = '/frontend/dist';
  if (normalized.endsWith(suffix)) {
    const trimmed = normalized.slice(0, -suffix.length);
    return trimmed === '' ? '/' : trimmed;
  }
  return distDir;
}

/***
 * MARK: padMissingEntries
 * @description Pads an indexed entry map so every requested storage location
 *   keeps rendering even when the payload does not report it (schema drift /
 *   older backend): a missing key becomes an honest `(not set)` placeholder
 *   carrying the row's static env name, never a silently vanished row. Pure:
 *   the input map is copied, existing entries are never overwritten.
 * @example padMissingEntries({}).notesSpaceRoot.env => 'NOTES_SPACE_ROOT'
 * @param {Object} byKey - Config-spec entries indexed by key.
 * @returns {Object} A map with every known storage key present.
 ***/
export function padMissingEntries(byKey) {
  const padded = { ...(byKey || {}) };
  for (const row of STORAGE_FIELD_GROUPS.flatMap((group) => group.rows)) {
    // installDir is synthetic and derived from distDir below, so it is
    // excluded here — padding it would overwrite the live-derived entry.
    if (row.key === 'installDir' || padded[row.key]) continue;
    padded[row.key] = {
      key: row.key,
      env: row.env || 'unknown variable',
      value: null,
      default: null,
      type: 'path',
      group: 'storage',
      doc: `Not reported by the running backend — ${row.env || 'its variable'} is missing from the config spec.`,
      source: 'missing',
      secret: false,
    };
  }
  return padded;
}

/***
 * MARK: withInstallDir
 * @description Adds the synthetic `installDir` display entry (derived from
 *   `distDir`) to an indexed entry map. Pure: the backend never serves this
 *   key, so the tab builds it client-side from the live `distDir` value.
 * @example withInstallDir({ distDir: { value: '/r/frontend/dist' } }).installDir.value => '/r'
 * @param {Object} byKey - Config-spec entries indexed by key.
 * @returns {Object} The same map plus the synthetic `installDir` entry.
 ***/
export function withInstallDir(byKey) {
  const dist = byKey?.distDir;
  return {
    ...(byKey || {}),
    installDir: {
      key: 'installDir',
      env: dist?.env ? `${dist.env} (derived)` : 'derived from KAINBAIN_DIST',
      value: deriveInstallDir(dist?.value),
      default: deriveInstallDir(dist?.default),
      type: 'path',
      group: 'storage',
      doc: 'Repo checkout the app runs from (parent of frontend/dist). Display-only: set at install time.',
      source: dist?.source || 'default',
      secret: false,
    },
  };
}

/***
 * MARK: displayValue
 * @description Human text for one storage value. Empty/unset values render as
 *   an honest placeholder, never a blank row that looks broken.
 * @example displayValue('opencode') => 'opencode'
 * @param {*} value - The config-spec value.
 * @returns {string} Text to show in the row.
 ***/
export function displayValue(value) {
  if (value === null || value === undefined || value === '') return '(not set)';
  return String(value);
}

/***
 * MARK: StorageRow
 * @description One read-only storage row: label, read-only value, env-var
 *   name, source badge, schema doc hint, and a copy button (the agreed
 *   write-path fallback: values are env-driven and restart-applied, so the
 *   tab copies values out instead of editing them in place).
 * @example <StorageRow entry={{ key: 'projectsRoot', … }} label="Projects folder" />
 ***/
function StorageRow({ entry, label }) {
  const [copied, setCopied] = useState(false);
  const value = displayValue(entry?.value);
  const copyable = entry?.value !== null && entry?.value !== undefined && entry?.value !== '';

  const copyValue = async () => {
    const ok = await copyToClipboard(String(entry.value));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div
      data-testid={`storage-row-${entry?.key || 'unknown'}`}
      className="flex flex-col gap-1.5 py-3 border-b border-border-standard last:border-b-0"
    >
      <span className="text-xs font-bold text-on-surface">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={label}
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="w-full max-w-sm p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors"
        />
        <button
          type="button"
          aria-label={`Copy ${label}`}
          disabled={!copyable}
          onClick={copyValue}
          className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:cursor-default whitespace-nowrap"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className="text-[11px] text-text-muted font-mono">
        {entry?.env || 'unknown variable'}
        {entry?.source ? ` · ${entry.source}` : ''}
      </span>
      {entry?.doc && <span className="text-[11px] text-text-muted">{entry.doc}</span>}
    </div>
  );
}

/***
 * MARK: StorageSection
 * @description The System Settings › Storage tab: the four global storage
 *   locations with real backend-backed values from `GET /status/config`
 *   (never the old `~/.kainbain` wireframe constants). Every row is
 *   read-only with an honest loading / error + retry / empty state (the
 *   Harness tab contract) and a "set via environment · restart required"
 *   note, because every knob here is env-driven and applied at boot. A
 *   requested location the payload omits is padded in as `(not set)`
 *   (padMissingEntries) so the four locations never disappear silently.
 * @example <StorageSection />
 ***/
export function StorageSection() {
  // Config-spec fetch is a fixed capability of the api module (mocked away
  // in some component tests): lazy initializers carry the unavailable-build
  // state so the mount effect below never needs a synchronous setState
  // (react-hooks/set-state-in-effect) — same pattern as the other settings sections.
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(() => typeof api.getConfigSpec === 'function');
  const [loadError, setLoadError] = useState(() =>
    typeof api.getConfigSpec === 'function'
      ? ''
      : 'Storage settings are unavailable in this build.',
  );

  const loadConfigSpec = async () => {
    if (typeof api.getConfigSpec !== 'function') return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.getConfigSpec();
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
    } catch {
      setLoadError('Could not load storage settings — check the connection and retry.');
      setEntries(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof api.getConfigSpec !== 'function') return undefined;
    let cancelled = false;
    api
      .getConfigSpec()
      .then((res) => {
        if (cancelled) return;
        setEntries(Array.isArray(res?.entries) ? res.entries : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Could not load storage settings — check the connection and retry.');
        setEntries(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount-time fetch only (same pattern as the other settings sections).
  }, []);

  if (loading) {
    return (
      <div className="py-6 text-xs text-text-muted" data-testid="storage-section-loading">
        Loading storage settings…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-6 flex flex-col gap-3" data-testid="storage-section-error">
        <p className="text-xs text-text-muted">{loadError}</p>
        <button
          type="button"
          onClick={loadConfigSpec}
          className="self-start px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  // No known storage key reported: either the backend returned no config at
  // all, or none of its entries is a storage knob. (The synthetic install row
  // derives from distDir, so it is built only after this check to avoid
  // masking the empty state.) A payload that reports SOME known keys takes the
  // padded render below, where every requested location stays visible.
  const knownKeys = STORAGE_FIELD_GROUPS.flatMap((group) => group.rows.map((row) => row.key));
  const storedKeys = new Set(Object.keys(entryByKey(entries)));
  const matchedKeys = knownKeys.filter((key) => key !== 'installDir' && storedKeys.has(key));
  if (matchedKeys.length === 0) {
    return (
      <p className="py-6 text-xs text-text-muted" data-testid="storage-section-empty">
        No storage locations reported — the backend returned an empty config.
      </p>
    );
  }

  const byKey = withInstallDir(padMissingEntries(entryByKey(entries)));

  return (
    <div data-testid="storage-section">
      <p className="mt-3 px-3 py-2 text-[11px] font-mono text-text-muted bg-surface-container-high border border-border-standard rounded-sm">
        Live values from the running backend — read-only here. To change one, set its environment
        variable and restart the app. Use Copy to grab a value.
      </p>
      {STORAGE_FIELD_GROUPS.map((group) => {
        // Every row is rendered: padMissingEntries guarantees all known keys
        // exist in byKey, so a location never silently disappears.
        const rows = group.rows;
        return (
          <section key={group.id} data-testid={`storage-group-${group.id}`}>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-on-surface">
              {group.title}
            </h3>
            {group.note && <p className="mt-1 text-[11px] text-text-muted">{group.note}</p>}
            <div className="flex flex-col">
              {rows.map((row) => (
                <StorageRow key={row.key} entry={byKey[row.key]} label={row.label} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default StorageSection;
