import { useEffect, useState } from 'react';
import { api } from '../../services/api';

/***
 * MARK: summarizeHarnessAvailability
 * @description Merges the two harness views the Runners screen shows:
 *   CLIs the Runners themselves advertised from their own hosts
 *   (capabilities, reported on heartbeat) and CLIs detected on this
 *   backend host (`GET /harnesses`). Test-only catalogue entries are
 *   skipped; malformed rows are ignored, never fatal.
 * @example summarizeHarnessAvailability([{ runnerId: 'r1', capabilities: { harnesses: [{ id: 'pi' }] } }], []) => { runnerTools: [...], backendDetected: [], backendMissing: [] }
 * @param {Array} [runners=[]] - Runner records with `capabilities.harnesses`.
 * @param {Array|null} [catalogue=null] - Backend `/harnesses` entries (null = still loading).
 * @returns {Object} `{ runnerTools, backendDetected, backendMissing }`.
 ***/
export const summarizeHarnessAvailability = (runners = [], catalogue = null) => {
  const rows = Array.isArray(runners) ? runners : [];
  const byId = new Map();
  for (const runner of rows) {
    const list = runner?.capabilities?.harnesses;
    if (!Array.isArray(list)) continue;
    for (const h of list) {
      const id = typeof h === 'string' ? h : h?.id;
      if (typeof id !== 'string' || !id) continue;
      const version = typeof h?.version === 'string' && h.version.trim() ? h.version.trim() : null;
      const prev = byId.get(id) || { id, version: null, runnerIds: [] };
      if (!prev.version && version && version !== 'unknown') prev.version = version;
      if (typeof runner?.runnerId === 'string' && !prev.runnerIds.includes(runner.runnerId)) {
        prev.runnerIds.push(runner.runnerId);
      }
      byId.set(id, prev);
    }
  }
  const entries = Array.isArray(catalogue) ? catalogue : [];
  const backendDetected = [];
  const backendMissing = [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entry.testOnly === true) continue;
    const row = {
      id: entry.id,
      name: typeof entry.name === 'string' && entry.name ? entry.name : entry.id,
      binPath: typeof entry.binPath === 'string' && entry.binPath ? entry.binPath : null,
      hint: typeof entry.hint === 'string' && entry.hint ? entry.hint : null,
    };
    if (entry.available === true) backendDetected.push(row);
    else if (entry.available === false) backendMissing.push(row);
  }
  return { runnerTools: [...byId.values()], backendDetected, backendMissing };
};

/***
 * MARK: RunnerHarnessPanel
 * @description Runners-screen panel answering "which agent CLIs can my
 *   fleet actually use": first the CLIs Runners advertised from their own
 *   hosts, then what this backend host detects (native installs only —
 *   Docker backends detect nothing by design). Missing backend CLIs show
 *   the backend's install hint. A failed catalogue fetch hides only the
 *   backend half; the Runner half always renders.
 * @example <RunnerHarnessPanel runners={[]} />
 * @param {Object} [props]
 * @param {Array} [props.runners] - Runner records.
 ***/
export function RunnerHarnessPanel({ runners = [] } = {}) {
  const [catalogue, setCatalogue] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await api.getHarnesses();
        if (!live) return;
        setCatalogue(Array.isArray(res?.harnesses) ? res.harnesses : []);
      } catch {
        if (live) setFailed(true);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, []);

  const { runnerTools, backendDetected, backendMissing } = summarizeHarnessAvailability(
    runners,
    catalogue,
  );

  return (
    <div className="mt-3 px-3 py-2 bg-surface-container border border-border-standard rounded-sm" data-testid="runner-harness-panel">
      <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
        Harness CLIs
      </h3>
      {runnerTools.length === 0 ? (
        <p className="mt-1 text-xs text-text-muted" data-testid="runner-harness-none">
          No Runner has reported its CLIs yet — they appear here after the first heartbeat.
        </p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1.5" data-testid="runner-harness-list">
          {runnerTools.map((tool) => (
            <li
              key={tool.id}
              className="px-2 py-1 bg-surface-container-high rounded-sm text-xs font-mono text-on-surface"
              title={tool.runnerIds.length > 0 ? `Advertised by ${tool.runnerIds.join(', ')}` : undefined}
            >
              <span aria-hidden="true">✅ </span>
              {tool.id}
              {tool.version ? ` ${tool.version}` : ''}
            </li>
          ))}
        </ul>
      )}
      {!failed && catalogue === null && (
        <p className="mt-2 text-[11px] text-text-muted">Checking this backend host…</p>
      )}
      {!failed && catalogue !== null && (backendDetected.length > 0 || backendMissing.length > 0) && (
        <div className="mt-2 border-t border-border-standard pt-2">
          <p className="text-[11px] text-text-muted">
            On this backend host (native installs only — Docker backends detect nothing by design):
          </p>
          <ul className="mt-1 flex flex-col gap-1" data-testid="backend-harness-list">
            {backendDetected.map((h) => (
              <li key={h.id} className="text-xs text-on-surface">
                <span aria-hidden="true">✅ </span>
                <span className="font-mono">{h.id}</span>
                {h.binPath ? <span className="text-text-muted"> — {h.binPath}</span> : null}
              </li>
            ))}
            {backendMissing.map((h) => (
              <li key={h.id} className="text-xs text-on-surface">
                <span aria-hidden="true">❌ </span>
                <span className="font-mono">{h.id}</span>
                {h.hint ? <span className="text-text-muted"> — {h.hint}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
