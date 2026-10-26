import { useCallback, useMemo, useRef, useState } from 'react';
import { MarkdownViewer } from '../common/MarkdownViewer';
import { ReportViewer } from '../reports/ReportViewer';
import { buildDisplayTimeline, formatTaskKey, formatTaskTitleFirstLine } from './taskFormatters';

/***
 * MARK: SurveyTaskPanel
 * @description Read-only task-context panel for the survey page: on desktop
 *   widths (`md:` and up) it renders to the right of the survey form in a
 *   half-and-half split so screenshots, prior stage reports, and stage
 *   history stay visible while answering. Phones never render it (the parent
 *   hides it with `hidden md:flex`). Three tabs — Description, Reports,
 *   Timeline — all read-only with full keyboard navigation.
 * @param {Object} [props]
 * @param {Object} [props.task] - Task object (id, title, goal, description, currentStageId, timeline, history).
 * @param {Array} [props.reports] - Stage report objects for the Reports tab.
 * @param {boolean} [props.loadingTask] - Task fetch in flight.
 * @param {boolean} [props.loadingReports] - Reports fetch in flight.
 * @param {string} [props.projectId] - Project id for task-image URL resolution.
 * @param {string} [props.taskId] - Task id for task-image URL resolution.
 * @param {Array} [props.stages] - Workflow stage definitions for stage-name labels.
 * @param {Object} [props.activeProject] - Active project for report deep-links; defaults to `{ id: projectId }`.
 * @example <SurveyTaskPanel task={task} reports={reports} projectId="p1" taskId="t1" stages={stages} />
 ***/
export function SurveyTaskPanel({
  task,
  reports = [],
  loadingTask = false,
  loadingReports = false,
  projectId,
  taskId,
  stages = [],
  activeProject,
}) {
  const [activeTab, setActiveTab] = useState('description');
  const tabRefs = useRef({});

  // Tab state resets automatically when the parent remounts this panel via
  // key={taskId} in SurveyPage, so no effect is needed here. The remount
  // also resets ReportViewer's internal selected index.

  const tabs = useMemo(() => {
    const list = [
      { id: 'description', label: 'Description' },
      {
        id: 'reports',
        label: reports?.length > 0 ? `Reports (${reports.length})` : 'Reports',
      },
      { id: 'timeline', label: 'Timeline' },
    ];
    return list;
  }, [reports]);

  const currentStageName = useMemo(() => {
    const stage = (Array.isArray(stages) ? stages : []).find((s) => s?.id === task?.currentStageId);
    return stage?.name || null;
  }, [stages, task]);

  const timelineData = useMemo(
    () =>
      buildDisplayTimeline({
        storedTimeline: task?.timeline,
        stages: Array.isArray(stages) ? stages : [],
        currentStageName: currentStageName || undefined,
        includeLiveRow: false,
      }),
    [task, stages, currentStageName],
  );

  const auditEvents = useMemo(() => {
    const raw = Array.isArray(task?.history) ? task.history : [];
    const seen = new Set();
    return raw.filter((event) => {
      const key = `${event?.timestamp || ''}::${event?.action || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [task]);

  const taskDescription = task?.goal || task?.description || '';
  const reportProject = activeProject || (projectId ? { id: projectId } : undefined);

  // WAI-ARIA tab keyboard support: arrows move between tabs, Home/End jump.
  const focusTab = useCallback((id) => {
    tabRefs.current[id]?.focus();
    setActiveTab(id);
  }, []);

  const handleTabKeyDown = useCallback(
    (event, index) => {
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next !== null) {
        event.preventDefault();
        focusTab(tabs[next].id);
      }
    },
    [focusTab, tabs],
  );

  const panelStatusMessage = loadingTask
    ? 'Loading task details…'
    : 'Task details are unavailable.';

  const taskHeader = task ? (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-mono text-text-muted shrink-0">{formatTaskKey(task.id)}</span>
        <h2 className="text-sm font-bold text-on-surface font-headline-sm truncate">
          {formatTaskTitleFirstLine(task)}
        </h2>
      </div>
      {currentStageName && (
        <div className="mt-1 text-xs text-text-muted">
          Stage: <span className="font-mono text-on-surface">{currentStageName}</span>
        </div>
      )}
    </>
  ) : (
    <p className="text-xs text-text-muted">{panelStatusMessage}</p>
  );

  const descriptionContent = taskDescription ? (
    <MarkdownViewer content={taskDescription} projectId={projectId} taskId={taskId} />
  ) : (
    <p className="text-xs text-text-muted">No task description available.</p>
  );

  const timelineContent = !task ? (
    <p className="text-xs text-text-muted">No stage history recorded yet.</p>
  ) : (
    <div className="space-y-5">
      {timelineData.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-high mb-3 font-mono">
            Stage Transition Timeline
          </h3>
          <div className="flex flex-col gap-4 ml-2 border-l border-border-standard pl-4">
            {timelineData.map((item, i) => (
              <div key={i} className="relative flex flex-col gap-0.5">
                <div
                  aria-hidden="true"
                  className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ${timelineDotClass(item?.status)}`}
                />
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-xs text-on-surface">{item?.stage}</span>
                  <span
                    className={`font-mono text-[10px] font-bold uppercase ${timelineTextClass(item?.status)}`}
                  >
                    {item?.status}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-text-muted">
                  {item?.timestamp}
                  {item?.duration ? ` • ${item.duration}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {auditEvents.length > 0 && (
        <div className="border-t border-border-standard pt-4 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-high mb-2 font-mono">
            Audit Log Events
          </h3>
          {auditEvents.map((event, i) => (
            <div
              key={i}
              className="p-2.5 bg-surface-container border border-border-standard rounded-sm text-xs space-y-0.5"
            >
              {event?.timestamp && (
                <div className="text-[10px] font-mono text-text-muted">{event.timestamp}</div>
              )}
              <div className="text-on-surface font-medium">{event?.action || 'Event recorded'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div role="region" aria-label="Task context" className="flex flex-col h-full w-full bg-surface">
      <div className="p-4 border-b border-border-standard">{taskHeader}</div>

      <div className="border-b border-border-standard">
        <div role="tablist" aria-label="Task context views" className="flex">
          {tabs.map((tab, index) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                id={`survey-panel-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`survey-panel-tabpanel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`flex-1 min-h-[44px] py-2 px-2 text-xs font-bold uppercase text-on-surface cursor-pointer font-mono border-b-2 transition-colors ${
                  selected ? 'border-primary' : 'border-transparent hover:border-border-standard'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {loadingTask ? (
          <div role="status" className="py-8 text-center">
            <p className="text-xs text-text-muted">Loading task details…</p>
          </div>
        ) : (
          <>
            {activeTab === 'description' && (
              <div
                role="tabpanel"
                id="survey-panel-tabpanel-description"
                aria-labelledby="survey-panel-tab-description"
              >
                {descriptionContent}
              </div>
            )}

            {activeTab === 'reports' && (
              <div
                role="tabpanel"
                id="survey-panel-tabpanel-reports"
                aria-labelledby="survey-panel-tab-reports"
              >
                <ReportViewer
                  reports={Array.isArray(reports) ? reports : []}
                  loading={loadingReports}
                  activeProject={reportProject}
                  taskId={taskId || task?.id || ''}
                  emptyStateMessage="No stage reports generated yet."
                />
              </div>
            )}

            {activeTab === 'timeline' && (
              <div
                role="tabpanel"
                id="survey-panel-tabpanel-timeline"
                aria-labelledby="survey-panel-tab-timeline"
              >
                {timelineContent}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/***
 * MARK: timelineDotClass
 * @description Status-dot color for a timeline entry; mirrors the task detail page.
 ***/
function timelineDotClass(status) {
  if (status === 'Success' || status === 'SUCCESS' || status === 'completed') {
    return 'bg-primary';
  }
  if (status === 'Fail' || status === 'FAIL' || status === 'Failed') {
    return 'bg-error';
  }
  return 'bg-secondary';
}

/***
 * MARK: timelineTextClass
 * @description Status-label color for a timeline entry; mirrors the task detail page.
 ***/
function timelineTextClass(status) {
  if (status === 'Success' || status === 'SUCCESS' || status === 'completed') return 'text-primary';
  if (status === 'Fail' || status === 'FAIL' || status === 'Failed') return 'text-error';
  return 'text-secondary';
}

export default SurveyTaskPanel;
