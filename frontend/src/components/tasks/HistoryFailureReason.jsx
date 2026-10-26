import React, { useState } from 'react';
import { Modal } from '../Modal';
import { firstLine, hasFailureDetails, getFailureReason } from './failureReason';

/**
 * MARK: HistoryFailureReason
 * @description Shows the first line of a failed timeline entry's reason
 * inline, with a compact button that opens the full reason in the shared
 * accessible Modal. Renders nothing when the entry has no structured
 * reason, so older history entries look exactly as before.
 *
 * @param {Object} entry - Timeline entry, may carry `reason`, `stageId`,
 * `stageName`, `stderr`, `stdout`.
 */
export function HistoryFailureReason({
  entry,
  inlineClassName = 'text-[11px] font-mono text-text-muted break-words',
  buttonClassName = 'text-primary underline font-mono text-[11px] cursor-pointer hover:brightness-110',
}) {
  const [open, setOpen] = useState(false);
  if (!hasFailureDetails(entry)) return null;
  const reason = getFailureReason(entry);
  const stageLabel = entry?.stage || entry?.stageName || 'Failed stage';
  const titleId = `failure-reason-title-${entry?.timestamp || 'unknown'}`;
  const bodyId = `failure-reason-body-${entry?.timestamp || 'unknown'}`;

  return (
    <>
      <div className={inlineClassName}>{firstLine(reason)}</div>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        View full reason
      </button>
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          describedBy={bodyId}
          dialogClassName="bg-surface border border-border-standard rounded-md max-w-lg w-full max-h-[80vh] flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-standard">
            <h2 id={titleId} className="text-sm font-bold text-on-surface">
              Failure reason — {stageLabel}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-primary underline font-mono text-[11px] cursor-pointer hover:brightness-110"
            >
              Close
            </button>
          </div>
          <div className="px-4 py-3 overflow-y-auto space-y-3">
            <p className="text-[10px] font-mono text-text-muted">{entry?.timestamp}</p>
            <pre
              id={bodyId}
              className="text-xs font-mono text-on-surface whitespace-pre-wrap break-words select-text"
            >
              {reason}
            </pre>
            {entry?.stageId && (
              <p className="text-[11px] font-mono text-text-muted">Stage id: {entry.stageId}</p>
            )}
            {typeof entry?.stderr === 'string' && entry.stderr.trim() && (
              <div>
                <h3 className="text-xs font-bold text-on-surface mb-1">stderr</h3>
                <pre className="text-xs font-mono text-on-surface whitespace-pre-wrap break-words select-text max-h-48 overflow-y-auto">
                  {entry.stderr}
                </pre>
              </div>
            )}
            {typeof entry?.stdout === 'string' && entry.stdout.trim() && (
              <div>
                <h3 className="text-xs font-bold text-on-surface mb-1">stdout</h3>
                <pre className="text-xs font-mono text-on-surface whitespace-pre-wrap break-words select-text max-h-48 overflow-y-auto">
                  {entry.stdout}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
