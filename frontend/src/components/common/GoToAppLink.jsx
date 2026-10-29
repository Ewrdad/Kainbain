import { useState } from 'react';
import { resolveAppUrl } from '../../../../shared/appUrl.js';
import { api } from '../../services/api';
import { logger } from '../../services/logger';

/***
 * MARK: appLinkState
 * @description Maps a stored appStatus record to one link state for the
 *   status dot. A failed probe overrides everything with 'down'; otherwise
 *   the lifecycle status wins ('starting' pulses while the app boots).
 * @example appLinkState({ status: 'starting' }) => 'starting'
 * @example appLinkState({ status: 'running', isHealthy: false }) => 'down'
 * @param {Object} appStatus
 * @returns {'running'|'starting'|'degraded'|'stopped'|'down'|'hidden'}
 ***/
export function appLinkState(appStatus) {
  // Fail safe: only a string URL can resolve to a link (resolveAppUrl rejects
  // everything else), so non-string URLs report 'hidden' to match the
  // rendered output (null) instead of claiming a state with no link.
  if (!appStatus || typeof appStatus !== 'object') return 'hidden';
  if (typeof appStatus.url !== 'string' || appStatus.url.trim() === '') return 'hidden';
  if (appStatus.isHealthy === false) return 'down';
  if (appStatus.status === 'starting') return 'starting';
  if (appStatus.status === 'degraded') return 'degraded';
  if (appStatus.status === 'stopped') return 'stopped';
  return 'running';
}

const DOT_STYLES = {
  running: 'bg-green-500',
  starting: 'bg-amber-400 animate-pulse',
  degraded: 'bg-amber-400',
  stopped: 'bg-zinc-500',
  down: 'bg-red-500',
};

const STATE_LABELS = {
  running: 'running',
  starting: 'starting',
  degraded: 'degraded',
  stopped: 'stopped',
  down: 'unreachable',
};

/***
 * MARK: GoToAppLink
 * @description The shared "Go to App" quick-link: rendered as a single
 *   unified button group that combines an external link to the project's
 *   running app with a direct, on-demand refresh affordance. The link and
 *   the refresh control share one border so they read as one button with an
 *   additional refresh option, rather than two separate buttons. Renders
 *   nothing when the project carries no safe link, so link-free projects keep
 *   their exact current layout. Two sizes: 'action' for the Files & Repo
 *   quick-action strip, 'header' for the compact top header (icon-only on
 *   narrow screens, like the Git remote link).
 * @example <GoToAppLink projectId="p1" appStatus={project.appStatus} variant="action" onHealthChange={merge} />
 * @param {Object} props
 * @param {string} props.projectId - Owning project (enables the probe button).
 * @param {Object} props.appStatus - Stored link record ({ url, networkHost, status, ... }).
 * @param {'action'|'header'} [props.variant] - Size preset (default 'action').
 * @param {Function} [props.onHealthChange] - Called with the fresh link record after a probe.
 ***/
export function GoToAppLink({ projectId, appStatus, variant = 'action', onHealthChange }) {
  const [probing, setProbing] = useState(false);
  const pageHost = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
  const href = resolveAppUrl(appStatus?.url, appStatus?.networkHost, pageHost);
  if (!href) return null;
  const state = appLinkState(appStatus);

  const probe = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!projectId || probing) return;
    setProbing(true);
    try {
      const result = await api.checkAppHealth(projectId);
      // Fail safe: only a record-shaped probe result reaches the project
      // merger — a malformed payload is dropped (and logged) instead of
      // corrupting the stored appStatus.
      if (result?.appStatus && typeof result.appStatus === 'object') {
        onHealthChange?.(result.appStatus);
      } else if (result?.appStatus !== undefined) {
        logger.warn('App health probe returned a malformed appStatus; ignoring', result);
      }
    } catch (err) {
      logger.warn('App health probe failed', err);
    } finally {
      setProbing(false);
    }
  };

  const tooltip = [
    `Open ${href}`,
    `Status: ${STATE_LABELS[state] || state}`,
    appStatus?.healthEndpoint ? `Health: ${appStatus.healthEndpoint}` : null,
  ]
    .filter(Boolean)
    .join(' • ');
  const isHeader = variant === 'header';

  return (
    <span className="inline-flex shrink-0 items-stretch whitespace-nowrap rounded-sm border border-border-standard bg-surface-container overflow-hidden">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open app (${STATE_LABELS[state] || state}): ${href}`}
        title={tooltip}
        className={
          isHeader
            ? 'flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] hover:bg-surface-container-high text-text-muted hover:text-on-surface transition-colors text-xs font-mono cursor-pointer'
            : 'px-2.5 py-1 text-[10px] font-mono font-bold uppercase hover:bg-surface-container-high rounded-l-sm text-on-surface hover:text-primary transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap'
        }
      >
        <span
          aria-hidden="true"
          title={`App ${STATE_LABELS[state] || state}`}
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT_STYLES[state] || DOT_STYLES.running}`}
        />
        <span aria-hidden="true">🚀</span>
        <span
          className={
            isHeader
              ? 'font-label-caps text-[10px] uppercase tracking-wider hidden xl:inline'
              : undefined
          }
        >
          {isHeader ? 'Go to App' : 'Open App'}
        </span>
      </a>
      {projectId && (
        <button
          type="button"
          onClick={probe}
          disabled={probing}
          aria-label={probing ? 'Checking app health…' : 'Check app health now'}
          title={probing ? 'Checking app health…' : 'Check app health now'}
          className={
            isHeader
              ? 'px-2 py-1.5 min-h-[44px] min-w-[44px] border-l border-border-standard hover:bg-surface-container-high text-text-muted hover:text-on-surface transition-colors text-xs cursor-pointer disabled:opacity-60 flex items-center justify-center'
              : 'px-1.5 py-1 text-[10px] border-l border-border-standard hover:bg-surface-container-high rounded-r-sm text-text-muted hover:text-on-surface transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center'
          }
        >
          <span aria-hidden="true" className={probing ? 'animate-spin inline-block' : undefined}>
            {probing ? '⏳' : '🔄'}
          </span>
        </button>
      )}
    </span>
  );
}
