import { useState } from 'react';
import { resolveAppUrl } from '../../../../shared/appUrl.js';
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
 * @description "Application Link & Health" settings card for the Links tab.
 * Edits apply immediately through the same PATCH endpoint scripts and the
 * update-app-status skill use (independent of the main Save button), with a
 * one-click health probe and a live preview of the resolved LAN URL.
 * Pure presentational section — all state lives in `ProjectSettingsForm`.
 * @example <LinksSection project={project} projectId="p1" appUrl="" setAppUrl={fn} networkHost="" setNetworkHost={fn} healthEndpoint="" setHealthEndpoint={fn} status="running" setStatus={fn} clearValidationError={fn} />
 * @param {Object} props
 * @param {string} props.appUrl - Draft app URL.
 * @param {Function} props.setAppUrl - App URL setter.
 * @param {string} props.networkHost - Draft network host override.
 * @param {Function} props.setNetworkHost - Network host setter.
 * @param {string} props.healthEndpoint - Draft health endpoint.
 * @param {Function} props.setHealthEndpoint - Health endpoint setter.
 * @param {string} props.status - Draft app status.
 * @param {Function} props.setStatus - Status setter.
 * @param {Function} props.clearValidationError - Clears validation errors.
 * @param {Object} props.project - The current project object.
 * @param {string} props.projectId - Active project identifier.
 * @param {Function} props.updateProjectInState - Merges updated project into state.
 ***/
export function LinksSection({
  appUrl,
  setAppUrl,
  networkHost,
  setNetworkHost,
  healthEndpoint,
  setHealthEndpoint,
  status,
  setStatus,
  clearValidationError,
  project,
  projectId,
  updateProjectInState,
}) {
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState('');
  const [probeResult, setProbeResult] = useState(null);

  const pageHost = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
  const preview = appUrl.trim()
    ? resolveAppUrl(appUrl.trim(), networkHost.trim() || null, pageHost)
    : '';

  const applySaved = (updated) => {
    const next = updated?.appStatus || {};
    setAppUrl(next.url || '');
    setNetworkHost(next.networkHost || '');
    setHealthEndpoint(next.healthEndpoint || '');
    setStatus(next.status || 'running');
    updateProjectInState?.(updated);
  };

  const handleSave = async () => {
    if (!projectId || saving) return;
    setError('');
    setProbeResult(null);
    if (appUrl.trim() && !validateAppUrl(appUrl.trim())) {
      setError('App URL must be an absolute http(s) URL.');
      return;
    }
    setSaving(true);
    try {
      const payload = appUrl.trim()
        ? {
            url: appUrl.trim(),
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
        updateProjectInState?.({ id: projectId, appStatus: result.appStatus });
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
      <p className="text-[11px] text-text-muted">
        Points the "Go to App" quick-link (Files &amp; Repo header, top bar) at this project&apos;s
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
          value={appUrl}
          onChange={(e) => {
            setAppUrl(e.target.value);
            clearValidationError();
          }}
          placeholder="http://localhost:5173"
          className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
        />
        {preview && (
          <div className="text-[10px] text-text-muted">
            Resolves to:{' '}
            <a
              href={preview}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {preview}
            </a>
          </div>
        )}
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
            onChange={(e) => {
              setNetworkHost(e.target.value);
              clearValidationError();
            }}
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
            onChange={(e) => {
              setHealthEndpoint(e.target.value);
              clearValidationError();
            }}
            placeholder="/health"
            className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs font-mono outline-none focus:border-primary transition-colors text-on-surface"
          />
          <p className="text-[10px] text-text-muted">
            Path appended to App URL for health checks (default: /health).
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
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
          onChange={(value) => {
            setStatus(value);
            clearValidationError();
          }}
          options={STATUS_OPTIONS}
        />
        <p className="text-[10px] text-text-muted">Current operational state of the application.</p>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-surface-container-high text-on-surface rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-surface-container-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Link'}
        </button>
        <button
          onClick={handleProbe}
          disabled={probing}
          className="px-4 py-2 bg-surface-container-high text-on-surface rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-surface-container-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {probing ? 'Probing...' : 'Probe Health'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[11px] font-bold text-red-500">
          {error}
        </p>
      )}

      {probeResult?.ok && (
        <p role="status" className="text-[11px] font-bold text-green-600 dark:text-green-400">
          ✓ Health check passed
        </p>
      )}

      {probeResult?.ok === false && (
        <p role="alert" className="text-[11px] font-bold text-red-500">
          ✗ Health check failed: {probeResult.message || 'Unknown error'}
        </p>
      )}
    </div>
  );
}

function validateAppUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
