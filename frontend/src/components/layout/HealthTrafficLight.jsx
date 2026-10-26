import React, { useState } from 'react';

import { useKainBain } from '../../context/KainBainContext';

/***
 * MARK: HealthTrafficLight
 * @description Compact traffic light display on the Now Playing bar.
 * Runs minimal health checks from the engine for:
 *   1. LiteLLM host connection
 *   2. Host device health (memory / load)
 *   3. Ollama Cloud access
 *
 * @example <HealthTrafficLight />
 ***/
export function HealthTrafficLight() {
  const { healthState, fetchHealth, isHealthRefreshing } = useKainBain();
  const [showDetails, setShowDetails] = useState(false);

  const checks = healthState?.checks || {};
  const litellm = checks.litellm || { status: 'unknown', message: 'Checking LiteLLM...' };
  const device = checks.device || { status: 'unknown', message: 'Checking Host Device...' };
  const ollamaCloud = checks.ollamaCloud || {
    status: 'unknown',
    message: 'Checking Ollama Cloud...',
  };
  // Optional per-harness probe result (checks.harnesses.pi): hidden entirely
  // when the payload does not carry it (older backends).
  const piHarness = checks.harnesses?.pi || null;

  /***
   * MARK: getStatusStyle
   * @description Returns indicator dot colors based on subsystem status.
   * @param {string} status - 'ok' | 'warning' | 'error' | 'disabled' | 'unconfigured' | 'unknown'
   * @returns {{ dot: string, border: string, text: string, label: string }}
   ***/
  const getStatusStyle = (status) => {
    switch (status) {
      case 'ok':
        return {
          dot: 'bg-[#7bdb85] shadow-[0_0_6px_rgba(123,219,133,0.7)]',
          border: 'border-[#7bdb85]/30',
          text: 'text-[#7bdb85]',
          label: 'Healthy',
        };
      case 'warning':
        return {
          dot: 'bg-[#ffd54f] shadow-[0_0_6px_rgba(255,213,79,0.7)]',
          border: 'border-[#ffd54f]/30',
          text: 'text-[#ffd54f]',
          label: 'Warning',
        };
      case 'error':
        return {
          dot: 'bg-[#ffb4ab] shadow-[0_0_6px_rgba(255,180,171,0.7)] animate-pulse',
          border: 'border-[#ffb4ab]/30',
          text: 'text-[#ffb4ab]',
          label: 'Error',
        };
      // Optional probes (LiteLLM / Ollama Cloud when the box has no gateway):
      // muted grey like the unknown state, but honestly labeled — never red,
      // never "Checking" for a service that simply is not configured.
      case 'disabled':
        return {
          dot: 'bg-text-muted/40',
          border: 'border-border-standard',
          text: 'text-text-muted',
          label: 'Disabled',
        };
      case 'unconfigured':
        return {
          dot: 'bg-text-muted/40',
          border: 'border-border-standard',
          text: 'text-text-muted',
          label: 'Not configured',
        };
      default:
        return {
          dot: 'bg-text-muted/40',
          border: 'border-border-standard',
          text: 'text-text-muted',
          label: 'Checking',
        };
    }
  };

  const litellmStyle = getStatusStyle(litellm.status);
  const deviceStyle = getStatusStyle(device.status);
  const ollamaCloudStyle = getStatusStyle(ollamaCloud.status);
  const piHarnessStyle = piHarness ? getStatusStyle(piHarness.status) : null;

  const overallAriaLabel = `Subsystem Health: LiteLLM ${litellmStyle.label}, Device ${deviceStyle.label}, Ollama Cloud ${ollamaCloudStyle.label}${piHarness ? `, Models (pi) ${piHarnessStyle.label}` : ''}. Click to refresh.`;

  const handleRefresh = (e) => {
    e.stopPropagation();
    fetchHealth?.(true);
  };

  return (
    <div className="relative inline-flex items-center">
      {/* Polite live region as a sibling (not nested in the labelled button).
          Explicit aria-label: this toolchain only computes `status` names from
          labelling attributes, never from content, so content alone queries as
          name "". Content stays identical so announcements are unchanged. */}
      <span role="status" aria-label={overallAriaLabel} className="sr-only">
        {overallAriaLabel}
      </span>
      {/* Native button (WCAG 4.1.2 Name/Role/Value, 2.1.1 Keyboard): carries
          the refresh action name; the sibling status above announces changes. */}
      <button
        type="button"
        aria-label={overallAriaLabel}
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
        onFocus={() => setShowDetails(true)}
        onBlur={() => setShowDetails(false)}
        onClick={handleRefresh}
        title="Subsystem health (LiteLLM, Host Device, Ollama Cloud) — Click to refresh"
        className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 min-h-[44px] min-w-[44px] rounded bg-surface-container/90 border border-border-standard/80 hover:border-outline transition-colors cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {/* LiteLLM Traffic Light */}
        <div
          className="flex items-center gap-1"
          title={`LiteLLM: ${litellm.message || litellmStyle.label}`}
        >
          <span
            data-testid="traffic-dot-litellm"
            className={`w-2 h-2 rounded-full shrink-0 ${litellmStyle.dot}`}
            aria-hidden="true"
          />
          <span className="text-[9px] font-mono font-medium text-text-muted hidden sm:inline">
            LLM
          </span>
        </div>

        <span className="text-border-standard text-[9px] select-none" aria-hidden="true">
          |
        </span>

        {/* Host Device Traffic Light */}
        <div
          className="flex items-center gap-1"
          title={`Host Device: ${device.message || deviceStyle.label}`}
        >
          <span
            data-testid="traffic-dot-device"
            className={`w-2 h-2 rounded-full shrink-0 ${deviceStyle.dot}`}
            aria-hidden="true"
          />
          <span className="text-[9px] font-mono font-medium text-text-muted hidden sm:inline">
            Host
          </span>
        </div>

        <span className="text-border-standard text-[9px] select-none" aria-hidden="true">
          |
        </span>

        {/* Ollama Cloud Traffic Light */}
        <div
          className="flex items-center gap-1"
          title={`Ollama Cloud: ${ollamaCloud.message || ollamaCloudStyle.label}`}
        >
          <span
            data-testid="traffic-dot-ollama"
            className={`w-2 h-2 rounded-full shrink-0 ${ollamaCloudStyle.dot}`}
            aria-hidden="true"
          />
          <span className="text-[9px] font-mono font-medium text-text-muted hidden sm:inline">
            Cloud
          </span>
        </div>

        {/* Models (pi harness) Traffic Light - only when the probe is present. */}
        {piHarness && (
          <>
            <span className="text-border-standard text-[9px] select-none" aria-hidden="true">
              |
            </span>
            <div
              className="flex items-center gap-1"
              title={`Models (pi harness): ${piHarness.message || piHarnessStyle.label}`}
            >
              <span
                data-testid="traffic-dot-harness"
                className={`w-2 h-2 rounded-full shrink-0 ${piHarnessStyle.dot}`}
                aria-hidden="true"
              />
              <span className="text-[9px] font-mono font-medium text-text-muted hidden sm:inline">
                Models
              </span>
            </div>
          </>
        )}

        {/* Refresh Indicator Icon */}
        <span
          data-testid="traffic-refresh-icon"
          className={`material-symbols-outlined text-[13px] text-text-high transition-transform ml-0.5 ${
            isHealthRefreshing ? 'animate-spin text-primary' : ''
          }`}
          aria-hidden="true"
        >
          sync
        </span>
      </button>

      {/* Floating Detailed Popover / Tooltip */}
      {showDetails && (
        <div
          role="tooltip"
          className="absolute bottom-full mb-2 right-0 sm:left-1/2 sm:-translate-x-1/2 w-64 p-2.5 rounded-md bg-surface-container-highest border border-border-standard shadow-2xl z-50 pointer-events-none text-left"
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-border-standard/50 text-[10px] font-mono font-bold text-on-surface">
            <span className="uppercase">Engine health checks</span>
            <span className="text-[9px] font-normal text-text-muted">
              {healthState?.timestamp
                ? new Date(healthState.timestamp).toLocaleTimeString()
                : 'Just now'}
            </span>
          </div>

          <div className="space-y-1.5 text-[11px] font-mono">
            {/* LiteLLM Row */}
            <div className="flex items-start justify-between gap-1">
              <span className="text-text-muted shrink-0">LiteLLM:</span>
              <span className={`text-right truncate font-medium ${litellmStyle.text}`}>
                {litellm.status === 'ok'
                  ? `OK (${litellm.latencyMs != null ? `${litellm.latencyMs}ms` : 'online'})`
                  : litellm.message || litellm.status}
              </span>
            </div>

            {/* Device Row */}
            <div className="flex items-start justify-between gap-1">
              <span className="text-text-muted shrink-0">Host Device:</span>
              <span className={`text-right truncate font-medium ${deviceStyle.text}`}>
                {device.memoryUsagePct != null
                  ? `OK (Mem: ${device.memoryUsagePct}%, Load: ${device.loadAvg?.[0] ?? 0})`
                  : device.message || device.status}
              </span>
            </div>

            {/* Ollama Cloud Row */}
            <div className="flex items-start justify-between gap-1">
              <span className="text-text-muted shrink-0">Ollama Cloud:</span>
              <span className={`text-right truncate font-medium ${ollamaCloudStyle.text}`}>
                {ollamaCloud.status === 'ok'
                  ? `OK (${ollamaCloud.latencyMs != null ? `${ollamaCloud.latencyMs}ms` : 'reachable'})`
                  : ollamaCloud.message || ollamaCloud.status}
              </span>
            </div>

            {/* Models (pi harness) Row - only when the probe is present. */}
            {piHarness && (
              <div className="flex items-start justify-between gap-1">
                <span className="text-text-muted shrink-0">Models (pi):</span>
                <span className={`text-right truncate font-medium ${piHarnessStyle.text}`}>
                  {piHarness.status === 'ok'
                    ? `OK (${piHarness.checks?.models?.available ?? '?'} models)`
                    : piHarness.message || piHarness.status}
                </span>
              </div>
            )}
          </div>

          <div className="mt-2 pt-1 border-t border-border-standard/40 text-[9px] text-text-muted/80 text-center">
            Click to refresh checks
          </div>
        </div>
      )}
    </div>
  );
}
