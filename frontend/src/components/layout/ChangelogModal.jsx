import React, { useEffect, useId, useState } from 'react';
import { api } from '../../services/api';
import { Modal } from '../Modal';

/***
 * MARK: ChangelogModal constants
 * @description FETCH_LIMIT matches the generator's baked cap so one on-open
 *   fetch retrieves the whole baked history; INITIAL_VISIBLE caps the first
 *   paint so a 200-entry list stays fast, with "Show more" for the rest.
 ***/
export const CHANGELOG_FETCH_LIMIT = 200;
export const CHANGELOG_INITIAL_VISIBLE = 100;

/***
 * MARK: ChangelogModal
 * @description Dialog showing the Kainbain changelog baked into the live
 *   production build (`$PROD_DIR/changelog.json` via `GET /deploy/changelog`).
 *   Fetches once on open only — never on the header badge's status poll.
 *   Commit text is untrusted input and is rendered as text only, never HTML.
 * @example <ChangelogModal buildNumber={12} onClose={() => setOpen(false)} />
 * @param {number} props.buildNumber - Live build number for the dialog heading.
 * @param {Function} props.onClose - Called when the dialog should close.
 ***/
export function ChangelogModal({ buildNumber, onClose }) {
  const [state, setState] = useState({ status: 'loading' });
  const [visibleCount, setVisibleCount] = useState(CHANGELOG_INITIAL_VISIBLE);
  const [expanded, setExpanded] = useState(() => new Set());
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.deployChangelog(CHANGELOG_FETCH_LIMIT);
        if (!active) return;
        if (data?.changelog && Array.isArray(data.changelog.entries)) {
          setState({ status: 'ready', changelog: data.changelog });
        } else {
          setState({
            status: 'empty',
            reason: data?.reason || 'not-baked',
            detail: data?.detail,
          });
        }
      } catch (err) {
        if (active) setState({ status: 'error', error: err });
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  const toggleExpanded = (sha) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sha)) next.delete(sha);
      else next.add(sha);
      return next;
    });
  };

  const { status } = state;
  const changelog = state.changelog;
  const entries = changelog?.entries ?? [];
  const visible = entries.slice(0, visibleCount);
  const remaining = entries.length - visible.length;

  const subtitle =
    changelog == null
      ? null
      : [
          buildNumber != null ? `#B${buildNumber}` : null,
          changelog.branch ? `branch ${changelog.branch}` : null,
          changelog.totalCount != null
            ? `${changelog.totalCount} commit${changelog.totalCount === 1 ? '' : 's'} total`
            : null,
          changelog.truncated ? `${entries.length} baked` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descId}
      dialogClassName="w-full max-w-2xl max-h-[80vh] flex flex-col bg-surface-container border border-border-standard rounded-md shadow-2xl overflow-hidden"
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border-standard shrink-0">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-bold text-on-surface">
            Kainbain changelog
          </h2>
          {subtitle && (
            <p id={descId} className="text-[11px] font-mono text-text-muted truncate">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close changelog"
          className="px-2 py-1 min-h-[44px] rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface text-xs font-bold transition-colors cursor-pointer shrink-0"
        >
          Close
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-3 grow">
        {status === 'loading' && <p role="status">Loading changelog…</p>}

        {status === 'error' && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-on-surface">
              Could not load the changelog.
            </p>
            <button
              type="button"
              onClick={() => {
                // Reset to loading in the event handler (not the effect) so
                // the retry shows a loading state without a sync setState in
                // an effect (cascading-render lint rule).
                setState({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
              className="px-3 py-1.5 min-h-[44px] rounded-sm bg-primary text-on-primary text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'empty' && (
          <div className="space-y-1">
            {state.reason === 'generation-failed' ? (
              <>
                <p className="text-sm text-on-surface">
                  Changelog generation failed during this deploy.
                </p>
                <p className="text-xs text-text-muted">
                  Check the deploy log for details. Redeploying bakes a fresh changelog.
                </p>
                {state.detail && (
                  <p className="text-[11px] font-mono text-text-muted">{state.detail}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-on-surface">No changelog baked into this build.</p>
                <p className="text-xs text-text-muted">
                  Redeploy to bake the Kainbain history into the build.
                </p>
              </>
            )}
          </div>
        )}

        {status === 'ready' && entries.length === 0 && (
          <p className="text-sm text-on-surface">No commits recorded in this changelog.</p>
        )}

        {status === 'ready' && entries.length > 0 && (
          <ol className="divide-y divide-border-standard">
            {visible.map((entry) => {
              const isOpen = expanded.has(entry.sha);
              const day = typeof entry.date === 'string' ? entry.date.slice(0, 10) : '';
              return (
                <li key={entry.sha} className="py-2 flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className="font-mono text-[11px] text-primary shrink-0"
                      title={entry.sha}
                    >
                      {entry.shortSha}
                    </span>
                    <span className="text-xs text-on-surface font-medium break-words min-w-0 grow">
                      {entry.subject}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <span className="truncate" title={entry.authorEmail || undefined}>
                      {entry.author}
                    </span>
                    {day && (
                      <span className="font-mono shrink-0" title={entry.date}>
                        {day}
                      </span>
                    )}
                    {entry.body && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(entry.sha)}
                        aria-expanded={isOpen}
                        className="ml-auto shrink-0 text-primary hover:underline cursor-pointer font-bold"
                      >
                        {isOpen ? 'Hide details' : 'Show details'}
                      </button>
                    )}
                  </div>
                  {isOpen && entry.body && (
                    <pre className="text-[11px] font-mono text-on-surface-variant whitespace-pre-wrap break-words bg-surface-deep/40 rounded-sm p-2 max-h-40 overflow-y-auto">
                      {entry.body}
                      {entry.bodyTruncated ? '…' : ''}
                    </pre>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {status === 'ready' && remaining > 0 && (
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + CHANGELOG_INITIAL_VISIBLE)}
            className="mt-3 w-full px-3 py-2 min-h-[44px] rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold transition-colors cursor-pointer"
          >
            Show more ({remaining} remaining)
          </button>
        )}
      </div>
    </Modal>
  );
}

export default ChangelogModal;
