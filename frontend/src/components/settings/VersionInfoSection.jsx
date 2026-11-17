import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { UI_VERSION } from '../../version';

/***
 * MARK: labelVersionStatus
 * @description Human status for one version row: update-available and
 *   up-to-date are direct, while unknown stays honest about the check
 *   instead of implying the install is current.
 * @example labelVersionStatus('unknown') => 'Unknown'
 * @param {string} status - Row status from `GET /status/versions`.
 * @returns {string}
 ***/
export const labelVersionStatus = (status) => {
  if (status === 'update-available') return 'Update available';
  if (status === 'up-to-date') return 'Up to date';
  return 'Unknown';
};

/***
 * MARK: isSafeVersionLink
 * @description Whether a version-info URL is safe to render as a clickable
 *   link: the page's own `#/docs/...` hash guides, absolute http(s) report
 *   links, and site-relative `/...` paths. Anything else (notably a
 *   `javascript:` URL smuggled in through a hand-edited report file) is not
 *   rendered as a link at all, so a bad report file can never turn the
 *   About page into a script launcher.
 * @example isSafeVersionLink('#/docs/update-ui') => true
 * @example isSafeVersionLink('javascript:alert(1)') => false
 * @param {unknown} href - The raw URL from `GET /status/versions`.
 * @returns {boolean}
 ***/
export const isSafeVersionLink = (href) => {
  if (typeof href !== 'string') return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#/')) return true;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  return /^https?:\/\//i.test(trimmed);
};

/***
 * MARK: describeAcceptsMap
 * @description Human line for an API row's compatibility map (the `accepts`
 *   ranges from `api/version.json`): who must satisfy which range. Empty
 *   when the row carries no map, so callers can skip the line entirely.
 * @example describeAcceptsMap({ frontend: '>=1.0.0 <2.0.0' }) => 'frontend >=1.0.0 <2.0.0'
 * @param {unknown} accepts - The raw `accepts` value from `GET /status/versions`.
 * @returns {string}
 ***/
export const describeAcceptsMap = (accepts) => {
  if (!accepts || typeof accepts !== 'object' || Array.isArray(accepts)) return '';
  return Object.entries(accepts)
    .filter(([, range]) => typeof range === 'string' && range.trim() !== '')
    .map(([who, range]) => `${who} ${range.trim()}`)
    .join(', ');
};

/***
 * MARK: VersionInfoSection
 * @description System Settings › About: the running build's UI, backend,
 *   and screen-to-server API versions with per-row update-guide links, a
 *   warning banner when a newer release is known, and the latest security
 *   report summary with a link to the full report (or an honest empty
 *   state when no report is recorded). Loads on mount and on demand via
 *   "Check for updates" — never a fake "up to date".
 * @example <VersionInfoSection />
 * @param {Object} [props]
 * @param {Object} [props.client] - API client override (tests); defaults to the app client.
 * @param {string} [props.uiVersion] - UI version override (tests); defaults to the baked build version.
 ***/
export function VersionInfoSection({ client, uiVersion }) {
  const http = client || api;
  const runningUiVersion = uiVersion ?? UI_VERSION;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadVersions = useCallback(
    async (isCancelled = () => false) => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await http.getVersions(runningUiVersion);
        if (isCancelled()) return;
        setInfo(data && typeof data === 'object' ? data : null);
      } catch (err) {
        if (isCancelled()) return;
        setLoadError(err?.message || 'Could not load version information');
        setInfo(null);
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [http, runningUiVersion],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await loadVersions(() => cancelled);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadVersions]);

  const rows = info
    ? [
        { label: 'UI', entry: info.ui },
        { label: 'Backend', entry: info.backend },
        ...(Array.isArray(info.apis) ? info.apis : []).map((entry) => ({
          label: `API (${entry?.name || 'contract'})`,
          entry,
        })),
      ].map((row) => ({ ...row, acceptsLine: describeAcceptsMap(row.entry?.accepts) }))
    : [];

  const warnings = Array.isArray(info?.warnings) ? info.warnings : [];
  const security = info?.security && typeof info.security === 'object' ? info.security : null;

  return (
    <div className="flex flex-col gap-4">
      {warnings.length > 0 && (
        <div
          role="alert"
          className="p-3 bg-surface-container-high border border-warning rounded-sm text-sm text-on-surface"
        >
          <p className="font-bold">A newer version is available.</p>
          <ul className="list-disc list-inside mt-1">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {loading && <p className="text-sm text-text-muted">Loading version information…</p>}

      {!loading && loadError && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-on-surface">
            Could not check versions: {loadError}
          </p>
          <button
            type="button"
            onClick={() => loadVersions()}
            className="self-start px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && info && (
        <>
          <div aria-label="Installed versions">
            {rows.map(({ label, entry, acceptsLine }) => (
              <div
                key={label}
                className="flex flex-col gap-1 py-3 border-b border-border-standard last:border-b-0"
              >
                <span className="text-xs font-bold text-on-surface">{label}</span>
                <span className="text-sm text-on-surface-variant">
                  Installed: {entry?.installed || 'Unknown'}
                  {' · '}Latest: {entry?.latest || 'Unknown'}
                  {' · '}Status: {labelVersionStatus(entry?.status)}
                </span>
                {acceptsLine && (
                  <span className="text-sm text-on-surface-variant">Accepts: {acceptsLine}</span>
                )}
                {isSafeVersionLink(entry?.updateUrl) && (
                  <a className="text-sm text-primary underline" href={entry.updateUrl}>
                    How to update {label.toLowerCase()}
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1 py-3 border-b border-border-standard last:border-b-0">
            <span className="text-xs font-bold text-on-surface">Security report</span>
            {!security || security.status === 'unknown' ? (
              <span className="text-sm text-on-surface-variant">
                No security report recorded for this build. Run the security scans to record one.
              </span>
            ) : (
              <>
                <span className="text-sm text-on-surface-variant">
                  Status: {security.status}
                  {security.checkedAt ? ` · Checked: ${security.checkedAt}` : ''}
                </span>
                {security.summary && (
                  <span className="text-sm text-on-surface-variant">{security.summary}</span>
                )}
                {isSafeVersionLink(security.reportUrl) && (
                  <a className="text-sm text-primary underline" href={security.reportUrl}>
                    Open the full report
                  </a>
                )}
              </>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => loadVersions()}
              className="px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer"
            >
              Check for updates
            </button>
          </div>
        </>
      )}
    </div>
  );
}
