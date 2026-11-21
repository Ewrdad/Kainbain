import { useState } from 'react';
import { truncateFailureMessage } from './failureReason';
import { GIT_FAILURE_KINDS } from '../../../../shared/gitFailure.js';

/**
 * MARK: GitFailureDetails
 * @description Structured callout for a runner-reported commit/hook failure
 * (`GitFailureDetails` envelope on `task.lastError.gitDiagnostics`): why the
 * commit failed, which hook and files triggered it, how to fix it, and the
 * full hook output behind the same capped preview + toggle pattern the
 * failure banner uses. Pure and presentational — null-safe on
 * absent/malformed diagnostics, so banners mount it unconditionally and it
 * degrades to nothing when there is no envelope to show.
 * @param {Object} diagnostics - `GitFailureDetails` envelope (or anything else).
 * @param {string} [className] - Box styling passed through from the banner.
 * @example <GitFailureDetails diagnostics={task.lastError.gitDiagnostics} />
 */
export function GitFailureDetails({ diagnostics, className = '' }) {
  const [expanded, setExpanded] = useState(false);
  // Collapse again when different diagnostics arrive: the overlay reuses
  // this instance when switching tasks, so a stale expanded state would leak.
  const [seenDiagnostics, setSeenDiagnostics] = useState(diagnostics);
  if (diagnostics !== seenDiagnostics) {
    setSeenDiagnostics(diagnostics);
    setExpanded(false);
  }
  if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) return null;
  if (typeof diagnostics.kind !== 'string' || !diagnostics.kind.trim()) return null;

  const kind = diagnostics.kind.trim();
  const hookName =
    typeof diagnostics.hookName === 'string' && diagnostics.hookName.trim()
      ? diagnostics.hookName.trim()
      : null;
  const command =
    typeof diagnostics.command === 'string' && diagnostics.command.trim()
      ? diagnostics.command.trim()
      : '';
  const exitCode = Number.isInteger(diagnostics.exitCode) ? diagnostics.exitCode : null;
  const files = Array.isArray(diagnostics.files)
    ? diagnostics.files.filter((file) => typeof file === 'string' && file.trim())
    : [];
  const remedy =
    typeof diagnostics.remedy === 'string' && diagnostics.remedy.trim()
      ? diagnostics.remedy.trim()
      : '';
  const hookOutput =
    typeof diagnostics.hookOutput === 'string' && diagnostics.hookOutput.trim()
      ? diagnostics.hookOutput.trim()
      : '';
  const phase =
    typeof diagnostics.phase === 'string' && diagnostics.phase.trim()
      ? diagnostics.phase.trim()
      : null;

  const title = (() => {
    if (kind === GIT_FAILURE_KINDS.HOOK_REJECTED) {
      return hookName && hookName !== 'unknown'
        ? `Commit blocked by ${hookName} hook`
        : 'Commit blocked by git hook';
    }
    if (kind === GIT_FAILURE_KINDS.COMMIT_FAILED) return 'Commit failed';
    if (kind === GIT_FAILURE_KINDS.MERGE_CONFLICT) return 'Merge conflicts';
    return 'Git operation failed';
  })();

  const { preview, truncated } = truncateFailureMessage(hookOutput);
  const shownOutput = truncated && !expanded ? preview : hookOutput;

  return (
    <div className={className} data-testid="git-failure-details">
      <div className="text-[11px] font-bold uppercase tracking-wider font-mono" data-testid="git-failure-title">
        {title}
      </div>
      {command && (
        <div
          className="font-mono text-[11px] break-words"
          data-testid="git-failure-command"
        >
          {command}
          {exitCode !== null ? ` (exit ${exitCode})` : ''}
          {phase ? ` · ${phase}` : ''}
        </div>
      )}
      {files.length > 0 && (
        <div data-testid="git-failure-files">
          <div className="text-[11px] font-semibold uppercase tracking-wider font-mono opacity-80">
            Affected files ({files.length}
            {diagnostics.truncatedFiles ? ', list capped' : ''})
          </div>
          <ul className="font-mono text-[11px] break-words list-disc list-inside space-y-0.5">
            {files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </div>
      )}
      {remedy && (
        <div data-testid="git-failure-remedy">
          <div className="text-[11px] font-semibold uppercase tracking-wider font-mono opacity-80">
            How to fix
          </div>
          <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">{remedy}</div>
        </div>
      )}
      {hookOutput && (
        <div data-testid="git-failure-output">
          <div className="text-[11px] font-semibold uppercase tracking-wider font-mono opacity-80">
            Hook output
            {diagnostics.truncatedOutput ? ' (capped)' : ''}
          </div>
          <div className="font-mono text-[11px] break-words whitespace-pre-wrap leading-relaxed select-text">
            {shownOutput}
            {truncated && (
              <button
                type="button"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
                className="text-primary underline font-mono text-[11px] cursor-pointer hover:brightness-110 ml-1"
              >
                {expanded ? 'Show less' : 'Show full output'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
