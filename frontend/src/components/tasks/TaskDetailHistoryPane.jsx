import React, { useState } from 'react';
import { DiffStatBadge } from './DiffStatBadge';
import { RunAttributionBadge } from './RunAttributionBadge';
import { HistoryFailureReason } from './HistoryFailureReason';
import { formatTryCount } from './taskFormatters';

/***
 * MARK: TaskDetailHistoryPane
 * @description History tab body for the task detail page: stage transition
 *   timeline plus the deduplicated audit log. Pure presentation over props
 *   owned by the page shell — it fetches nothing itself. The timeline always
 *   shows in full; the audit log previews the first few events and hides the
 *   rest behind a "Show all" disclosure so long histories stay scannable.
 * @example
 * <TaskDetailHistoryPane
 *   timelineData={timelineData}
 *   auditEvents={auditEvents}
 *   timelineDotClass={timelineDotClass}
 *   timelineTextClass={timelineTextClass}
 * />
 ***/
export function TaskDetailHistoryPane({
  timelineData = [],
  auditEvents = [],
  timelineDotClass = () => '',
  timelineTextClass = () => '',
}) {
  // Long audit logs collapse past the preview count; the toggle only renders
  // when there is actually more to show.
  const [showAllAuditEvents, setShowAllAuditEvents] = useState(false);
  const auditPreviewCount = 5;
  const hasMoreAuditEvents = auditEvents.length > auditPreviewCount;
  const visibleAuditEvents =
    showAllAuditEvents || !hasMoreAuditEvents
      ? auditEvents
      : auditEvents.slice(0, auditPreviewCount);
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-high mb-4 font-mono">
          Stage Transition Timeline
        </h2>
        <div className="flex flex-col gap-4 ml-3 border-l-2 border-border-standard pl-5">
          {timelineData.map((item, i) => {
            const tryLabel = formatTryCount(item);
            return (
              <div key={i} className="relative flex flex-col gap-1">
                <div
                  className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ${timelineDotClass(
                    item.status,
                  )}`}
                />
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-on-surface">{item.stage}</span>
                  <span
                    className={`font-mono text-xs font-bold uppercase ${timelineTextClass(item.status)}`}
                  >
                    {item.status}
                  </span>
                </div>
                <span className="text-xs font-mono text-text-muted">
                  {item.timestamp} • {item.duration || '0m'}
                  {tryLabel ? ` • ${tryLabel}` : ''}
                  <DiffStatBadge entry={item} />
                  <RunAttributionBadge entry={item} />
                </span>
                <HistoryFailureReason entry={item} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border-standard pt-6 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-high mb-3 font-mono">
          Audit Log Events
        </h2>
        {visibleAuditEvents.map((event, i) => (
          <div
            key={i}
            className="p-3 bg-surface-container border border-border-standard rounded-sm text-xs space-y-1"
          >
            <div className="text-[11px] font-mono text-text-muted">{event.timestamp}</div>
            <div className="text-on-surface font-medium">{event.action}</div>
          </div>
        ))}
        {hasMoreAuditEvents && (
          <button
            type="button"
            aria-expanded={showAllAuditEvents}
            onClick={() => setShowAllAuditEvents((show) => !show)}
            className="px-3 py-1.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-[11px] font-mono font-bold uppercase tracking-wider text-text-muted hover:text-on-surface transition-all cursor-pointer"
          >
            {showAllAuditEvents
              ? 'Show fewer'
              : `Show all ${auditEvents.length} events (${auditEvents.length - auditPreviewCount} more)`}
          </button>
        )}
      </section>
    </div>
  );
}

export default TaskDetailHistoryPane;
