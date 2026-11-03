import { useId } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { Modal } from '../Modal';
import { QueueOrderList } from '../observability/widgets/QueueOrderList';
import { useScheduledQueue } from '../../hooks/useScheduledQueue';

/***
 * MARK: QueuePopupModal
 * @description Dialog listing the execution queue in its current dispatch order.
 * Backed by the shared `useScheduledQueue` hook (global scope) and the shared
 * `QueueOrderList` rendering, so it never forks the monitor's queue markup.
 * Loading, empty, and error + Retry states mirror `ChangelogModal`, except a
 * failed refresh keeps the last known rows visible under the alert (a stale
 * queue is more useful operationally than a blank panel). Row click
 * opens the task in the Slide-Over Inspector via the context's
 * `setSelectedTask`. Footer reconciles the chip's open-task count with the
 * dispatchable queue length so a silent mismatch never masquerades as a bug.
 * @example <QueuePopupModal counted={3} onClose={() => setOpen(false)} />
 * @param {Function} props.onClose - Called when the dialog should close.
 * @param {number} [props.counted] - Open-task count shown by the chip.
 * @param {number} [props.openQueueDepth] - Alias for `counted`.
 * @param {Object} [props.engineState] - Optional engine state carrying openQueueDepth.
 ***/
export function QueuePopupModal({ onClose, counted, openQueueDepth, engineState }) {
  const context = useKainBain();
  const setSelectedTask = context?.setSelectedTask;
  const contextEngineState = context?.engineState;
  const stateForCount = engineState || contextEngineState || {};
  const titleId = useId();
  const descId = useId();

  const countedValue =
    typeof counted === 'number'
      ? counted
      : typeof openQueueDepth === 'number'
        ? openQueueDepth
        : typeof stateForCount?.openQueueDepth === 'number'
          ? stateForCount.openQueueDepth
          : null;

  const { items, loading, error, refresh } = useScheduledQueue({
    projectScope: 'all',
    enabled: true,
  });

  const shown = Array.isArray(items) ? items.length : 0;
  const countedDisplay = countedValue == null ? shown : countedValue;
  const countsDiffer = countedValue != null && countedValue !== shown;

  const handleSelect = (item) => {
    if (typeof setSelectedTask === 'function') {
      setSelectedTask(item);
    }
    // Keep the modal open so the operator can keep debugging; the inspector
    // rides on top via its own slide-over. (No auto-close: preserves evidence.)
  };

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
            Queue — all projects
          </h2>
          <p id={descId} className="text-[11px] font-mono text-text-muted">
            {/* "#1 runs next" tracks the listed queue, not the chip count:
                when every counted task is failed/waiting-human the list is
                empty and nothing runs next. */}
            #{shown >= 1 ? '1' : '—'} runs next · {countedDisplay} open
            {countedDisplay === 1 ? ' task' : ' tasks'} counted
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close queue"
          className="px-2 py-1 min-h-[44px] rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface text-xs font-bold transition-colors cursor-pointer shrink-0"
        >
          Close
        </button>
      </div>

      <div className="overflow-y-auto px-2 py-2 grow min-h-[120px]">
        {loading && items.length === 0 && (
          <p role="status" className="px-4 py-6 text-sm text-text-muted">
            Loading queue…
          </p>
        )}
        {error && (
          <div className="space-y-2 px-4 py-4">
            <p role="alert" className="text-sm text-on-surface">
              Could not refresh the queue.
              {items.length > 0 ? ' Showing the last known queue below.' : ''}
            </p>
            <p className="text-[11px] font-mono text-text-muted">{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="px-3 py-1.5 min-h-[44px] rounded-sm bg-primary text-on-primary text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
        {/* Fail-safe: a failed refresh never blanks a previously loaded
            queue — rows stay visible under the alert until a fetch succeeds.
            The empty state renders only after a clean load of zero items. */}
        {(items.length > 0 || (!loading && !error)) && (
          <QueueOrderList
            items={items}
            engineState={stateForCount}
            schedulerRunning={stateForCount?.schedulerRunning}
            onSelectTask={handleSelect}
          />
        )}
      </div>

      <div className="px-4 py-2 border-t border-border-standard text-[10px] font-mono text-text-muted">
        <span data-testid="queue-reconciliation">
          {countedDisplay} open tasks counted · {shown} shown in the dispatch queue
        </span>
        {countsDiffer && (
          <span className="block mt-1">
            Failed, cancelled, waiting-human, and human-stage tasks count toward the number but
            never dispatch. Blocked and paused tasks do list — sorted last with their reason.
          </span>
        )}
      </div>
    </Modal>
  );
}

/***
 * MARK: QueuePopupModal default
 * @description Default export alias for QueuePopupModal.
 * @example <QueuePopupModal onClose={() => {}} />
 ***/
export default QueuePopupModal;
