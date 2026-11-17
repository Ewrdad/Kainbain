import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { UI_VERSION, FRONTEND_API_VERSION, FRONTEND_REQUIRES_BACKEND_API } from '../../version';

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
 * MARK: displayVersionText
 * @description Printable text for one installed/latest version value: the
 *   trimmed string when the payload carries one, otherwise `Unknown`. A
 *   mistyped value (a number or object smuggled through a corrupt
 *   payload) shows as Unknown instead of rendering raw garbage like `42`.
 * @example displayVersionText(' 1.0.0 ') => '1.0.0'
 * @example displayVersionText(42) => 'Unknown'
 * @param {unknown} value - The raw installed/latest value from `GET /status/versions`.
 * @returns {string}
 ***/
export const displayVersionText = (value) => {
  if (typeof value !== 'string') return 'Unknown';
  const trimmed = value.trim();
  return trimmed === '' ? 'Unknown' : trimmed;
};

/***
 * MARK: selectVersionWarnings
 * @description The warning lines worth rendering from a versions payload:
 *   only the non-blank strings. A corrupt payload (a `warnings` array
 *   holding numbers or objects) would otherwise crash the list render —
 *   React cannot print an object child — so anything else is dropped and
 *   the banner simply shows fewer lines.
 * @example selectVersionWarnings({ warnings: ['UI update available', 42] }) => ['UI update available']
 * @param {unknown} info - The raw `GET /status/versions` payload.
 * @returns {string[]}
 ***/
export const selectVersionWarnings = (info) => {
  const warnings = info && typeof info === 'object' && Array.isArray(info.warnings) ? info.warnings : [];
  return warnings.filter((warning) => typeof warning === 'string' && warning.trim() !== '');
};

/***
 * MARK: formatApiRowLabel
 * @description Row label for one API contract entry: `API (<name>)` when
 *   the payload names the contract, otherwise `API (contract)`. A
 *   mistyped name (a number or object) falls back instead of crashing
 *   the `toLowerCase` in the update link or printing `[object Object]`.
 * @example formatApiRowLabel({ name: 'screen-to-server' }) => 'API (screen-to-server)'
 * @example formatApiRowLabel({ name: 42 }) => 'API (contract)'
 * @param {unknown} entry - One API row from `GET /status/versions`.
 * @returns {string}
 ***/
export const formatApiRowLabel = (entry) => {
  const name = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry.name : null;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return `API (${trimmed === '' ? 'contract' : trimmed})`;
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
 * MARK: labelApiCompatibility
 * @description Human verdict for the UI↔backend API compatibility check:
 *   compatible and incompatible are direct, while unknown stays honest
 *   about the check instead of implying the pair was verified.
 * @example labelApiCompatibility('incompatible') => 'Incompatible'
 * @param {string} status - Compatibility status from `GET /status/versions`.
 * @returns {string}
 ***/
export const labelApiCompatibility = (status) => {
  if (status === 'compatible') return 'Compatible';
  if (status === 'incompatible') return 'Incompatible';
  return 'Unknown';
};

/***
 * MARK: describeFrontendContract
 * @description Human line tying the UI side to an API row: which contract
 *   version the running UI speaks and which backend range it requires
 *   (both reported by the UI itself). Missing parts are omitted; empty
 *   when the row carries neither, so callers can skip the line entirely.
 * @example describeFrontendContract({ frontendApiVersion: '1.0.0', requiresBackendApi: '>=1.0.0 <2.0.0' }) => 'UI speaks API 1.0.0 · requires backend API >=1.0.0 <2.0.0'
 * @param {unknown} entry - One API row from `GET /status/versions`.
 * @returns {string}
 ***/
export const describeFrontendContract = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
  const parts = [];
  const apiVersion = entry.frontendApiVersion;
  const requires = entry.requiresBackendApi;
  if (typeof apiVersion === 'string' && apiVersion.trim() !== '') {
    parts.push(`UI speaks API ${apiVersion.trim()}`);
  }
  if (typeof requires === 'string' && requires.trim() !== '') {
    parts.push(`requires backend API ${requires.trim()}`);
  }
  return parts.join(' · ');
};

/***
 * MARK: VersionInfoSection
 * @description System Settings › About: the running build's UI, backend,
 *   and screen-to-server API versions with per-row update-guide links, the
 *   UI↔backend API tie-in (which contract each side speaks plus a
 *   compatibility verdict), a warning banner when a newer release is
 *   known, an incompatibility alert when the two sides cannot talk, and
 *   the latest security report summary with a link to the full report (or
 *   an honest empty state when no report is recorded). Loads on mount and
 *   on demand via "Check for updates". A 404 names the old-backend cause
 *   (the asymmetric-deploy window where the UI is newer than the backend)
 *   with a link to the backend update guide; any other failure shows the
 *   transport message with a retry.
 * @example <VersionInfoSection />
 * @param {Object} [props]
 * @param {Object} [props.client] - API client override (tests); defaults to the app client.
 * @param {string} [props.uiVersion] - UI version override (tests); defaults to the baked build version.
 * @param {Object} [props.frontendApi] - Frontend API contract override (tests); defaults to the baked `frontend/version.json` values.
 ***/
export function VersionInfoSection({ client, uiVersion, frontendApi }) {
  const http = client || api;
  const runningUiVersion = uiVersion ?? UI_VERSION;
  const runningFrontendApiVersion = frontendApi?.apiVersion ?? FRONTEND_API_VERSION;
  const runningRequiresBackendApi =
    frontendApi?.requiresBackendApi ?? FRONTEND_REQUIRES_BACKEND_API;
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadVersions = useCallback(
    async (isCancelled = () => false) => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await http.getVersions(runningUiVersion, {
          apiVersion: runningFrontendApiVersion,
          requiresBackendApi: runningRequiresBackendApi,
        });
        if (isCancelled()) return;
        setInfo(data && typeof data === 'object' ? data : null);
      } catch (err) {
        if (isCancelled()) return;
        setLoadError({
          message: err?.message || 'Could not load version information',
          status: typeof err?.status === 'number' ? err.status : null,
        });
        setInfo(null);
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [http, runningUiVersion, runningFrontendApiVersion, runningRequiresBackendApi],
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

  const apiEntries = info && Array.isArray(info.apis) ? info.apis : [];
  const rows = info
    ? [
        { label: 'UI', entry: info.ui },
        { label: 'Backend', entry: info.backend },
        ...apiEntries.map((entry) => ({
          label: formatApiRowLabel(entry),
          entry,
          isApi: true,
        })),
      ].map((row) => ({
        ...row,
        acceptsLine: describeAcceptsMap(row.entry?.accepts),
        contractLine: row.isApi ? describeFrontendContract(row.entry) : '',
        compatibility:
          row.isApi && row.entry && typeof row.entry === 'object'
            ? row.entry.compatibility
            : null,
      }))
    : [];

  const warnings = selectVersionWarnings(info);
  const securityRaw =
    info?.security && typeof info.security === 'object' && !Array.isArray(info.security)
      ? info.security
      : null;
  const securityStatus =
    typeof securityRaw?.status === 'string' && securityRaw.status.trim() !== ''
      ? securityRaw.status
      : 'unknown';
  const securityCheckedAt =
    typeof securityRaw?.checkedAt === 'string' && securityRaw.checkedAt !== ''
      ? securityRaw.checkedAt
      : '';
  const securitySummary =
    typeof securityRaw?.summary === 'string' && securityRaw.summary !== ''
      ? securityRaw.summary
      : '';
  const securityReportUrl =
    typeof securityRaw?.reportUrl === 'string' ? securityRaw.reportUrl : null;
  const incompatibleApi = apiEntries.find(
    (entry) => entry?.compatibility?.status === 'incompatible',
  );
  const incompatDetail =
    typeof incompatibleApi?.compatibility?.detail === 'string'
      ? incompatibleApi.compatibility.detail
      : '';

  return (
    <div className="flex flex-col gap-4">
      {!loading && !loadError && info && incompatibleApi && (
        <div
          role="alert"
          className="p-3 bg-surface-container-high border border-warning rounded-sm text-sm text-on-surface"
        >
          <p className="font-bold">The UI and backend API versions are incompatible.</p>
          {incompatDetail !== '' && <p className="mt-1">{incompatDetail}</p>}
        </div>
      )}

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
            Could not check versions: {loadError.message}
          </p>
          {loadError.status === 404 && (
            <p className="text-sm text-on-surface-variant">
              The backend does not expose version information yet — it is older than this UI.
              Update the backend, then retry.{' '}
              <a className="text-primary underline" href="#/docs/update-backend">
                How to update backend
              </a>
            </p>
          )}
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
            {rows.map(({ label, entry, isApi, acceptsLine, contractLine, compatibility }, index) => (
              <div
                key={`${label}-${index}`}
                className="flex flex-col gap-1 py-3 border-b border-border-standard last:border-b-0"
              >
                <span className="text-xs font-bold text-on-surface">{label}</span>
                <span className="text-sm text-on-surface-variant">
                  Installed: {displayVersionText(entry?.installed)}
                  {' · '}Latest: {displayVersionText(entry?.latest)}
                  {' · '}Status: {labelVersionStatus(entry?.status)}
                </span>
                {acceptsLine && (
                  <span className="text-sm text-on-surface-variant">Accepts: {acceptsLine}</span>
                )}
                {contractLine && (
                  <span className="text-sm text-on-surface-variant">{contractLine}</span>
                )}
                {isApi && (
                  <span className="text-sm text-on-surface-variant">
                    Compatibility: {labelApiCompatibility(compatibility?.status)}
                    {typeof compatibility?.detail === 'string' && compatibility.detail !== ''
                      ? ` — ${compatibility.detail}`
                      : ''}
                  </span>
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
            {securityStatus === 'unknown' ? (
              <span className="text-sm text-on-surface-variant">
                No security report recorded for this build. Run the security scans to record one.
              </span>
            ) : (
              <>
                <span className="text-sm text-on-surface-variant">
                  Status: {securityStatus}
                  {securityCheckedAt !== '' ? ` · Checked: ${securityCheckedAt}` : ''}
                </span>
                {securitySummary !== '' && (
                  <span className="text-sm text-on-surface-variant">{securitySummary}</span>
                )}
                {isSafeVersionLink(securityReportUrl) && (
                  <a className="text-sm text-primary underline" href={securityReportUrl}>
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
