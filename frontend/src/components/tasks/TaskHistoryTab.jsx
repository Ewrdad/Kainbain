import React from 'react';
import { DiffStatBadge } from './DiffStatBadge';
import { RunAttributionBadge } from './RunAttributionBadge';
import { HistoryFailureReason } from './HistoryFailureReason';
import { formatAvgDuration } from './stagePace';

export function TaskHistoryTab({
  timelineData,
  auditEvents,
  timelineDotClass,
  timelineTextClass,
  avgSecondsByStage = {},
  onOpenReport,
}) {
  return (
    <div className="space-y-5">
      {/* Timeline */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-high mb-3 font-mono">
          Stage Transition Timeline
        </h3>
        <div className="flex flex-col gap-4 ml-2 border-l border-border-standard pl-4">
          {timelineData.map((item, i) => {
            const stageAverage = avgSecondsByStage[String(item.stage || '').toLowerCase()];
            return (
              <div key={i} className="relative flex flex-col gap-0.5">
                <div
                  className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ${timelineDotClass(
                    item.status,
                  )}`}
                />
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs text-on-surface">{item.stage}</span>
                  <span
                    className={`font-mono text-[10px] font-bold uppercase ${timelineTextClass(
                      item.status,
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-text-muted">
                  {item.timestamp} • {item.duration || '0m'}
                  {stageAverage > 0 && (
                    <span
                      title={`Stage average across active-workflow tasks: ${formatAvgDuration(
                        stageAverage,
                      )}`}
                    >
                      {' '}
                      • avg {formatAvgDuration(stageAverage)}
                    </span>
                  )}
                  <DiffStatBadge entry={item} />
                  <RunAttributionBadge entry={item} />
                </span>
                <HistoryFailureReason entry={item} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed History Audit Events */}
      <div className="border-t border-border-standard pt-4 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-high mb-2 font-mono">
          Audit Log Events
        </h3>
        {auditEvents.map((event, i) => {
          const reportMatch = event.action && event.action.match(/Stage report generated: (.*)$/);
          return (
            <div
              key={i}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs space-y-0.5"
            >
              <div className="text-[10px] font-mono text-text-muted">{event.timestamp}</div>
              <div className="text-on-surface font-medium">
                {reportMatch ? (
                  <span>
                    Stage report generated:{' '}
                    <button
                      type="button"
                      onClick={() => onOpenReport?.()}
                      className="text-primary underline font-mono text-[11px] cursor-pointer hover:brightness-110"
                    >
                      {reportMatch[1]}
                    </button>
                  </span>
                ) : (
                  event.action
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
