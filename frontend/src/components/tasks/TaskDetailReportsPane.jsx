import React from 'react';
import { ReportViewer } from '../reports/ReportViewer';

/***
 * MARK: TaskDetailReportsPane
 * @description Reports tab body for the task detail page: composes the existing
 *   report viewer with its loading state. Pure presentation over props owned
 *   by the page shell.
 * @example
 * <TaskDetailReportsPane
 *   reports={uniqueReports}
 *   loading={loadingReports}
 *   activeProject={activeProject}
 *   taskId={task.id}
 * />
 ***/
export function TaskDetailReportsPane({
  reports = [],
  loading = false,
  activeProject = null,
  taskId = null,
  className = 'h-[calc(100vh-280px)] min-h-[480px]',
}) {
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <ReportViewer
        reports={reports}
        loading={loading}
        activeProject={activeProject}
        taskId={taskId}
        className={className}
      />
    </div>
  );
}

export default TaskDetailReportsPane;
