import { useNow } from '../../hooks/useNow';
import { isRetryingTask, retryProgressLabel, retryStateOf, retryWaitLabel } from './taskRetryState';

/***
 * MARK: RetryStatusBlock
 * @description Scheduled-retry status block for the task detail views: the
 *   progress label ("RETRYING (scheduled) 2/5"), the attempt line, and a
 *   collapsible retry ladder. Renders nothing unless the task is actively
 *   retrying, so a parked failed task never shows a retry banner.
 * @param {Object} props
 * @param {Object} props.task - The task record.
 * @param {number} [props.nowMs] - The moment measured against; defaults to the shared board clock.
 * @returns {Object|null} The retry status block, or null when not retrying.
 * @example <RetryStatusBlock task={task} />
 ***/
export function RetryStatusBlock({ task, nowMs }) {
  const sharedNowMs = useNow();
  if (!isRetryingTask(task)) return null;
  const detail = retryStateOf(task);
  const label = retryProgressLabel(task) || 'RETRYING';
  const wait = retryWaitLabel(task, nowMs ?? sharedNowMs);
  const ladder = Array.isArray(task?.transientRetryLadder) ? task.transientRetryLadder : [];
  return (
    <div
      role="status"
      aria-live="polite"
      className="p-4 bg-warning/10 border-2 border-warning/60 rounded-sm space-y-2 shadow-md"
    >
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-warning animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.6)]" />
        <span className="text-xs font-bold uppercase tracking-wider text-warning font-mono">
          {label}
          {detail.maxAttempts > 0 && ` — attempt ${detail.attempt} of ${detail.maxAttempts}`}
          {wait && ` · next attempt ${wait}`}
        </span>
      </div>
      {ladder.length > 0 && (
        <details className="text-xs font-mono text-warning/90">
          <summary className="cursor-pointer uppercase tracking-wider font-bold">
            Retry ladder ({ladder.length})
          </summary>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            {ladder.map((entry, index) => (
              <li key={`${entry?.attempt ?? index}-${entry?.timestamp ?? index}`}>
                attempt {entry?.attempt ?? index + 1}
                {Number.isFinite(Number(entry?.delayMs)) && ` · waited ${entry.delayMs}ms`}
                {entry?.signal && ` [${entry.signal}]`}
                {entry?.error && ` — ${entry.error}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
