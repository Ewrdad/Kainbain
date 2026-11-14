import { useState } from 'react';
import { api } from '../../services/api';
import { useFleetModelCatalog } from '../../hooks/useFleetModelCatalog';
import { fleetSnapshotBadge, readRunnerCount } from '../../services/modelStatus';

/***
 * MARK: formatFleetAge
 * @description Formats a catalogue timestamp as a short relative age ("just
 *   now", "5m ago", "3h ago", "2d ago"); non-numeric timestamps (entries
 *   never served) read "never".
 * @example formatFleetAge(1790000000000 - 7200000, 1790000000000) => '2h ago'
 * @param {number|null} atMs - Timestamp (ms epoch) or null when never.
 * @param {number} [nowMs] - Clock seam (ms epoch; defaults to `Date.now()`).
 * @returns {string} Short relative age.
 ***/
export const formatFleetAge = (atMs, nowMs = Date.now()) => {
  if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return 'never';
  const diff = Math.max(0, nowMs - atMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
};

// One runner's discovery state in plain words: the provenance `source` when
// the backend names one, plus the first status-like field it carries
// (`status`/`code`/`state`/`discoveryStatus`) rendered verbatim — the WP-B
// vocabulary rides along untouched, whatever it names the field.
const discoveryStateText = (provenance) => {
  if (!provenance || typeof provenance !== 'object') return '';
  const parts = [];
  if (typeof provenance.source === 'string' && provenance.source) parts.push(provenance.source);
  for (const key of ['status', 'code', 'state', 'discoveryStatus']) {
    // eslint-disable-next-line security/detect-object-injection -- fixed key list into our own catalogue payload
    const value = provenance[key];
    if (typeof value === 'string' && value) {
      parts.push(value);
      break;
    }
  }
  if (typeof provenance.atMs === 'number') parts.push(formatFleetAge(provenance.atMs));
  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
};

// Per-runner discovery rows for one catalogue entry: the union of serving,
// declared, claimed, and provenance-seen runner ids (sorted), each tagged
// with its role. Provenance renders verbatim — unknown WP-B discovery
// statuses ride along untouched.
const runnerRowsForEntry = (entry) => {
  const source = entry && typeof entry === 'object' ? entry : {};
  const strings = (value) =>
    Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) : [];
  const serving = new Set(strings(source.runnerIds));
  const declared = new Set(strings(source.declaredBy));
  const claimed = new Set(strings(source.claimedBy));
  const provenance =
    source.provenance && typeof source.provenance === 'object' ? source.provenance : {};
  const seen = new Set([...serving, ...declared, ...claimed, ...Object.keys(provenance)]);
  return [...seen].sort().map((id) => ({
    id,
    role: serving.has(id)
      ? 'serving'
      : declared.has(id)
        ? 'declared'
        : claimed.has(id)
          ? 'claimed'
          : 'seen',
    // eslint-disable-next-line security/detect-object-injection -- runner id key into our own catalogue payload
    provenance: provenance[id] ?? null,
  }));
};

const isoDate = (atMs) => {
  if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return 'never served';
  try {
    return new Date(atMs).toISOString();
  } catch {
    return 'never served';
  }
};

/***
 * MARK: FleetCatalogueSection
 * @description System Settings › Models › Fleet catalogue: the admin view of
 *   `/runners/models/catalogue` — one row per model id (`runnerCount`,
 *   `verified`, `declaredBy`, last-served age, per-runner discovery status
 *   rendered verbatim), a "Remove permanently" action per row (admin only;
 *   the server enforces the admin role too), the quarantine list with
 *   per-row remove, and a per-runner "Re-scan" action queuing model
 *   re-detection. A failed fetch keeps the last-good table with an error
 *   note, never a blank table that reads as "no models".
 * @example <FleetCatalogueSection />
 * @param {Object} [props]
 * @param {boolean} [props.isAdmin=true] - When false, the destructive Remove
 *   buttons hide behind an admin-only note (no frontend role convention
 *   exists to derive this; the default install has access control off).
 * @returns {JSX.Element} The fleet-catalogue admin section.
 ***/
export function FleetCatalogueSection({ isAdmin = true }) {
  const { models, quarantined, loading, loaded, error, refresh } = useFleetModelCatalog();
  const [busyKey, setBusyKey] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notice, setNotice] = useState(null);

  const runRemove = async (kind, id) => {
    if (typeof id !== 'string' || !id) return;
    const key = `${kind}:${id}`;
    setBusyKey(key);
    setActionError(null);
    setNotice(null);
    try {
      if (kind === 'model') {
        if (typeof api.deleteFleetCatalogueModel !== 'function') {
          throw new Error('Catalogue removal is unavailable on this backend.');
        }
        await api.deleteFleetCatalogueModel(id);
      } else {
        if (typeof api.deleteFleetQuarantinedModel !== 'function') {
          throw new Error('Quarantine removal is unavailable on this backend.');
        }
        await api.deleteFleetQuarantinedModel(id);
      }
      setNotice(`Removed ${id} permanently.`);
      await refresh();
    } catch (err) {
      // 404 = already gone (a re-advertised id reappears on the next
      // update): refresh to confirm rather than erroring.
      if (err?.status === 404) {
        await refresh();
        return;
      }
      setActionError(err?.message || `Could not remove ${id}.`);
    } finally {
      setBusyKey(null);
    }
  };

  const runRescan = async (runnerId) => {
    if (typeof runnerId !== 'string' || !runnerId) return;
    const key = `rescan:${runnerId}`;
    setBusyKey(key);
    setActionError(null);
    setNotice(null);
    try {
      if (typeof api.requestModelRediscovery !== 'function') {
        throw new Error('Model re-detection is unavailable on this backend.');
      }
      await api.requestModelRediscovery(runnerId);
      setNotice(`Re-scan queued — ${runnerId} will refresh on next heartbeat.`);
    } catch (err) {
      setActionError(err?.message || `Could not queue a re-scan for ${runnerId}.`);
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div data-testid="fleet-catalogue-section" className="flex flex-col gap-2 py-3">
        <span className="text-xs font-bold text-on-surface">Fleet catalogue</span>
        <p data-testid="fleet-catalogue-loading" className="text-[11px] text-text-muted">
          Loading fleet catalogue…
        </p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div data-testid="fleet-catalogue-section" className="flex flex-col gap-2 py-3">
        <span className="text-xs font-bold text-on-surface">Fleet catalogue</span>
        <p data-testid="fleet-catalogue-unavailable" className="text-[11px] text-text-muted">
          Fleet catalogue unavailable — the backend did not serve one (older backend or failed
          fetch).
        </p>
        {error && (
          <p role="alert" data-testid="fleet-catalogue-error" className="text-[11px] text-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="fleet-catalogue-section" className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-on-surface">Fleet catalogue</span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-[11px] font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
        >
          Refresh
        </button>
      </div>
      {notice && (
        <p data-testid="fleet-catalogue-notice" className="text-[11px] text-text-muted">
          {notice}
        </p>
      )}
      {(actionError || error) && (
        <p role="alert" data-testid="fleet-catalogue-error" className="text-[11px] text-error">
          {actionError || error}
        </p>
      )}
      {models.length === 0 ? (
        <p data-testid="fleet-catalogue-empty" className="text-[11px] text-text-muted">
          No fleet models — no Runner has advertised a model id yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-text-muted uppercase tracking-wider">
                <th className="py-1 pr-3 font-bold">Model</th>
                <th className="py-1 pr-3 font-bold">Runners</th>
                <th className="py-1 pr-3 font-bold">Verified</th>
                <th className="py-1 pr-3 font-bold">Declared by</th>
                <th className="py-1 pr-3 font-bold">Last served</th>
                <th className="py-1 pr-3 font-bold">Discovery</th>
                {isAdmin && <th className="py-1 font-bold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {models.map((entry, index) => {
                const id = typeof entry?.id === 'string' ? entry.id : '';
                const count = readRunnerCount(entry);
                const declaredBy = Array.isArray(entry?.declaredBy)
                  ? entry.declaredBy.filter((r) => typeof r === 'string')
                  : [];
                const runners = runnerRowsForEntry(entry);
                const busy = busyKey === `model:${id}`;
                // The snapshot's explicit unavailable verdict renders HERE in
                // admin (never in pickers): the count stays the headline and
                // the verdict + reason ride beside it as health detail (q10).
                const verdict = fleetSnapshotBadge(entry);
                // A blank id is a contract violation the backend never sends:
                // render the row honestly with a placeholder (never hide it,
                // never key two rows the same) and disable its Remove — there
                // is no id to DELETE.
                const displayId = id || `(row ${index + 1}: missing id)`;
                return (
                  <tr
                    key={id ? `model:${id}` : `model-row:${index}`}
                    data-testid="fleet-catalogue-row"
                    className="border-t border-border-standard/40 align-top"
                  >
                    <td className="py-1.5 pr-3 font-mono text-on-surface break-all">{displayId}</td>
                    <td className="py-1.5 pr-3 text-on-surface whitespace-nowrap">
                      <span>
                        {count} runner{count === 1 ? '' : 's'}
                      </span>
                      {verdict && (
                        <span
                          data-testid="fleet-catalogue-verdict"
                          title={verdict.title}
                          className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400"
                        >
                          {verdict.label}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-on-surface">
                      {entry?.verified === false ? 'no' : 'yes'}
                    </td>
                    <td className="py-1.5 pr-3 text-text-muted">
                      {declaredBy.length > 0 ? declaredBy.join(', ') : '—'}
                    </td>
                    <td
                      className="py-1.5 pr-3 text-text-muted whitespace-nowrap"
                      title={isoDate(entry?.lastServedAtMs)}
                    >
                      {formatFleetAge(entry?.lastServedAtMs)}
                    </td>
                    <td className="py-1.5 pr-3 text-text-muted">
                      {runners.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {runners.map((runner) => (
                            <li key={runner.id} className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="font-mono"
                                title={
                                  runner.provenance ? JSON.stringify(runner.provenance) : undefined
                                }
                              >
                                {runner.id} ({runner.role}
                                {discoveryStateText(runner.provenance)})
                              </span>
                              <button
                                type="button"
                                aria-label={`Re-scan ${runner.id}`}
                                onClick={() => void runRescan(runner.id)}
                                disabled={busyKey != null}
                                className="px-2 py-0.5 bg-surface-deep border border-border-standard rounded-sm text-[10px] font-bold uppercase text-text-muted hover:text-on-surface disabled:opacity-50 cursor-pointer"
                              >
                                {busyKey === `rescan:${runner.id}` ? 'Queuing…' : 'Re-scan'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={`Remove ${displayId} permanently`}
                          title={id ? undefined : 'No model id to remove'}
                          onClick={() => void runRemove('model', id)}
                          disabled={busyKey != null || !id}
                          className="px-2 py-0.5 bg-surface-deep border border-error/50 rounded-sm text-[10px] font-bold uppercase text-error hover:brightness-110 disabled:opacity-50 cursor-pointer"
                        >
                          {busy ? 'Removing…' : 'Remove permanently'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!isAdmin && (
        <p data-testid="fleet-catalogue-admin-note" className="text-[11px] text-text-muted">
          Removing catalogue entries needs the admin role.
        </p>
      )}
      <div className="flex flex-col gap-1.5 pt-2">
        <span className="text-xs font-bold text-on-surface">Quarantined ids</span>
        {quarantined.length === 0 ? (
          <p data-testid="fleet-quarantine-empty" className="text-[11px] text-text-muted">
            No quarantined ids — every advertised id is harness-qualified.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {quarantined.map((record, index) => {
              const id = typeof record?.id === 'string' ? record.id : '';
              const busy = busyKey === `quarantine:${id}`;
              const displayId = id || `(row ${index + 1}: missing id)`;
              return (
                <li
                  key={id ? `quarantine:${id}` : `quarantine-row:${index}`}
                  data-testid="fleet-quarantine-row"
                  className="flex items-center gap-2 flex-wrap text-[11px]"
                >
                  <span className="font-mono text-on-surface break-all">{displayId}</span>
                  <span className="text-text-muted" title={record?.reason || ''}>
                    {record?.reason || 'no reason recorded'}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      aria-label={`Remove quarantined ${displayId}`}
                      title={id ? undefined : 'No model id to remove'}
                      onClick={() => void runRemove('quarantine', id)}
                      disabled={busyKey != null || !id}
                      className="px-2 py-0.5 bg-surface-deep border border-error/50 rounded-sm text-[10px] font-bold uppercase text-error hover:brightness-110 disabled:opacity-50 cursor-pointer"
                    >
                      {busy ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
