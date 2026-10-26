import React from 'react';
import { LogsPanel } from './LogsPanel';

/***
 * MARK: TaskDetailLogsPane
 * @description Pure layout shell around the existing LogsPanel so the logs tab
 *   can be composed declaratively by the page shell. Props are forwarded
 *   unchanged to LogsPanel.
 * @example <TaskDetailLogsPane logs={logs} taskStage={taskStage} task={task} />
 ***/
export function TaskDetailLogsPane(props) {
  return <LogsPanel {...props} />;
}

export default TaskDetailLogsPane;
