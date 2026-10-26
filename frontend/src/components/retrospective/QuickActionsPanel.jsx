import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import { Announcer } from '../../a11y/Announce';
import { useRetrospective } from './useRetrospective';
import { QUICK_ACTIONS, describeQuickAction } from './quickActions';

/***
 * MARK: QuickActionsPanel
 * @description Renders the quick-action registry as buttons: each action's
 *   enabled state derives from the shared selection, disabled buttons carry
 *   the reason as `title`/`aria-disabled`, and runs announce their outcome.
 * @param {Object} props
 * @param {Array<Object>} [props.tasks] - Summaries (for selection titles).
 * @example <QuickActionsPanel tasks={tasks} />
 ***/
export function QuickActionsPanel({ tasks = [] }) {
  const { activeProjectId } = useKainBain();
  const { selectedIds, seedChat } = useRetrospective();
  const navigate = useNavigate();
  const [runningId, setRunningId] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const [actionError, setActionError] = useState('');

  const selection = useMemo(() => [...selectedIds], [selectedIds]);
  const tasksById = useMemo(() => new Map((tasks || []).map((t) => [t?.id, t])), [tasks]);

  const handleRun = async (action) => {
    const { enabled } = describeQuickAction(action, selection);
    if (!enabled || runningId) return;
    setRunningId(action.id);
    setActionError('');
    try {
      const result = await action.run({
        selection,
        tasksById,
        api,
        navigate,
        seedChat,
        projectId: activeProjectId,
      });
      const created = result?.created;
      setAnnouncement(
        created?.id
          ? `${action.label} created task ${created.title || created.id}.`
          : `${action.label} done.`,
      );
    } catch (err) {
      setActionError(err?.message || `${action.label} failed.`);
      setAnnouncement(`${action.label} failed.`);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <section
      aria-label="Quick actions"
      data-testid="retrospective-quick-actions"
      className="flex flex-col gap-2"
    >
      <Announcer message={announcement} assertive={Boolean(actionError)} />
      <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">Quick actions</h2>
      {selection.length === 0 ? (
        <div className="text-xs text-text-muted">
          <p>Select tasks to enable actions.</p>
          <p className="mt-1">
            No tasks selected. In Task Histories, sort/filter to find recent tasks, then
            tick their checkboxes to pin focused context. For a broader review, leave
            nothing selected and ask the chat; the agent can inspect recent jobs with
            its tools.
          </p>
        </div>
      ) : (
        <p className="text-xs text-text-muted" data-testid="retrospective-action-context">
          {selection.length} task{selection.length === 1 ? '' : 's'} selected.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {QUICK_ACTIONS.map((action) => {
          const { enabled, reason } = describeQuickAction(action, selection);
          const running = runningId === action.id;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleRun(action)}
              disabled={!enabled || running}
              aria-disabled={!enabled || running}
              title={enabled ? action.hint : reason}
              data-testid={`retrospective-action-${action.id}`}
              className={`flex items-center gap-2 px-3 py-2 min-h-[44px] text-left text-sm rounded-sm border transition-colors ${
                enabled && !running
                  ? 'bg-surface-container border-border-standard text-on-surface hover:bg-surface-container-high cursor-pointer'
                  : 'bg-surface-deep border-border-standard text-text-muted cursor-not-allowed opacity-70'
              }`}
            >
              <span aria-hidden="true">{action.icon}</span>
              <span className="flex-1">
                {action.label}
                {running ? '…' : ''}
              </span>
            </button>
          );
        })}
      </div>
      {actionError && (
        <p role="alert" className="text-xs text-error">
          {actionError}
        </p>
      )}
    </section>
  );
}
