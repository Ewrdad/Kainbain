import React, { useState } from 'react';
import { resolveAppUrl, validateAppUrl } from '../../../../shared/appUrl.js';
import { api } from '../../services/api';
import { logger } from '../../services/logger';
import { SelectDropdown } from '../common/SelectDropdown';

const STATUS_OPTIONS = [
  { value: 'running', label: 'Running' },
  { value: 'starting', label: 'Starting' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'stopped', label: 'Stopped' },
];

/***
 * MARK: LinksSection
 * @description "Application Link & Health" settings card: the operator-visible
 *   editor for the project's "Go to App" link. Edits apply immediately
 *   through the same PATCH endpoint scripts and the update-app-status skill
 *   use (independent of the main Save button), with a one-click health probe
 *   and a live preview of the resolved LAN URL.
 * @example <LinksSection project={project} projectId="p1" onChanged={merge} />
 * @param {Object} props
 * @param {Object} props.project - The current project object.
 * @param {string} props.projectId - Active project identifier.
 * @param {Function} [props.onChanged] - Called with the updated project after save/probe/clear.
 */
export function LinksSection({ project, projectId, onChanged }) {
  const stored = project?.appStatus || {};
  const [url, setUrl] = useState(stored.url || '');
  const [networkHost, setNetworkHost] = useState(stored.networkHost || '');
  const [healthEndpoint, setHealthEndpoint] = useState(stored.healthEndpoint || '');
  const [status, setStatus] = useState(stored.status || 'running');
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState('');
  const [probeResult, setProbeResult] = useState(null);

  const pageHost = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
  const preview = url.trim() ? resolveAppUrl(url.trim(), networkHost.trim() || null, pageHost) : '';

  const applySaved = (updated) => {
    const next = updated?.appStatus || {};
    setUrl(next.url || '');
    setNetworkHost(next.networkHost || '');
    setHealthEndpoint(next.healthEndpoint || '');
    setStatus(next.status || 'running');
    onChanged?.(updated);
  };

  const handleSave = async () => {
    if (!projectId || saving) return;
    setError('');
    setProbeResult(null);
    if (url.trim() && !validateAppUrl(url.trim())) {
      setError('App URL must be an absolute http(s) URL.');
      return;
    }
    setSaving(true);
    try {
      const payload = url.trim()
        ? {
            url: url.trim(),
            networkHost: networkHost.trim() || null,
            healthEndpoint: healthEndpoint.trim() || null,
            status,
          }
        : { url: null };
      const updated = await api.updateAppStatus(projectId, payload);
      applySaved(updated);
    } catch (err) {
      logger.error('Failed to save app link', err);
      setError(err?.message || 'Failed to save app link.');
    } finally {
      setSaving(false);
    }
  };

  const handleProbe = async () => {
    if (!projectId || probing) return;
    setError('');
    setProbing(true);
    try {
      const result = await api.checkAppHealth(projectId);
      setProbeResult(result);
      if (result?.appStatus) {
        onChanged?.({ id: projectId, appStatus: result.appStatus });
      }
    } catch (err) {
      logger.error('App health probe failed', err);
      setError(err?.message || 'Health probe failed.');
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h3 className="text-sm font-bold uppercase tracking-wide text-text-high flex items-center gap-2">
        <span className="text-primary">🚀</span> Application Link & Health
      </h3>
      <p className="text-[11px] text-text-muted">
        Points the “Go to App” quick-link (Files &amp; Repo header, top bar) at this project&apos;s
        running app. Agents set it via the update-app-status skill; scripts PATCH the same endpoint
        directly.
      </p>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="project-applink-url-input"
          className="text-xs font-bold uppercase text-text-muted tracking-wider"
        >
          App URL
        </label>
        <input
          id="project-applink-url-input"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:5173"
          className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="project-applink-network-input"
            className="text-xs font-bold uppercase text-text-muted tracking-wider"
          >
            Network Host Override
          </label>
          <input
            id="project-applink-network-input"
            type="text"
            value={networkHost}
            onChange={(e) => setNetworkHost(e.target.value)}
            placeholder="home.home"
            className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
          />
          <p className="text-[10px] text-text-muted">
            Replaces localhost/127.0.0.1 so phones and LAN hosts reach the app.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="project-applink-health-input"
            className="text-xs font-bold uppercase text-text-muted tracking-wider"
          >
            Health Endpoint
          </label>
          <input
            id="project-applink-health-input"
            type="text"
            value={healthEndpoint}
            onChange={(e) => setHealthEndpoint(e.target.value)}
            placeholder="/health"
            className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
          />
          <p className="text-[10px] text-text-muted">
            Optional path the backend probes (blank probes the app root).
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 max-w-xs">
        <label
          htmlFor="project-applink-status-select"
          className="text-xs font-bold uppercase text-text-muted tracking-wider"
        >
          App Status
        </label>
        <SelectDropdown
          id="project-applink-status-select"
          ariaLabel="App Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
        />
      </div>

      {preview ? (
        <p className="text-[11px] font-mono text-text-muted break-all">
          Resolves to:{' '}
          <a
            href={preview}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            {preview}
          </a>
        </p>
      ) : (
        url.trim() !== '' && (
          <p className="text-[11px] text-text-muted">
            Enter a valid http(s) URL to preview the resolved link.
          </p>
        )
      )}

      {error && (
        <p role="alert" className="text-[11px] font-bold text-red-500">
          {error}
        </p>
      )}

      {probeResult && (
        <p
          data-testid="applink-probe-result"
          className={`text-[11px] font-mono ${probeResult.healthy ? 'text-green-500' : 'text-red-500'}`}
        >
          {probeResult.healthy ? '✓ Healthy' : '✗ Unhealthy'}
          {` — HTTP ${probeResult.statusCode} in ${probeResult.latencyMs}ms`}
          {probeResult.error ? ` (${probeResult.error})` : ''}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 min-h-[44px] text-[11px] font-bold uppercase tracking-wider rounded-sm bg-primary text-on-primary hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save Link'}
        </button>
        <button
          type="button"
          onClick={handleProbe}
          disabled={probing || !stored.url}
          title={stored.url ? 'Probe the app health endpoint now' : 'Save a link before probing'}
          className="px-3 py-1.5 min-h-[44px] text-[11px] font-bold uppercase tracking-wider rounded-sm bg-surface-container-high text-on-surface border border-border-standard hover:border-primary transition-colors disabled:opacity-60 cursor-pointer"
        >
          {probing ? 'Probing…' : 'Test Health'}
        </button>
      </div>
    </div>
  );
}
