import React from 'react';
import { ReportViewer } from '../reports/ReportViewer';

export function TaskReportsTab({ reports, loading, activeProject, taskId }) {
  return (
    <div className="space-y-4">
      <ReportViewer
        reports={reports}
        loading={loading}
        activeProject={activeProject}
        taskId={taskId}
      />
    </div>
  );
}
