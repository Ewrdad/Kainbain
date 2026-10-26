import { isTaskCompleted } from '../tasks/taskFormatters';
import { collectStageDurations, matchesDurationStage } from './stageDurations';

/***
 * MARK: formatDuration
 * @description Formats numeric seconds into clean human-readable duration strings (e.g. 1.2s, 45s, 3m 12s).
 * @example formatDuration(45.2) => '45.2s'
 * @param {number} seconds
 * @returns {string}
 ***/
export function formatDuration(seconds) {
  // Return placeholder for invalid or negative values
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds <= 0) {
    return '--';
  }
  // Explicitly handle zero duration as "0s" instead of placeholder
  if (seconds === 0) {
    return '0s';
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const remSecs = rounded % 60;
  return `${mins}m ${remSecs}s`;
}

/***
 * MARK: computeStageAnalytics
 * @description Computes stage throughput, average duration, and pass/fail efficiency rates from task history and reports.
 * Duration samples prefer structured report seconds, report markdown, timeline, then bounded
 * history entry/exit deltas, without counting the same visit's fallback twice.
 * Each stage's activeTasksCount reflects only ACTIVE (non-completed) work currently parked in the
 * stage, so collapsed rail badges stay consistent with the 'Human only' / 'Show Completed' filters
 * (completed tasks hidden by a filter must not inflate the badge). History metrics (throughput,
 * passedCount, failedCount) intentionally always include completed tasks.
 * @example computeStageAnalytics(stages, tasks) => { byStage: {}, overall: {} }
 * @param {Array<Object>} stages - Array of stage configuration objects.
 * @param {Array<Object>} tasks - Array of task entities for the active workflow (unfiltered).
 * @returns {{ byStage: Record<string, Object>, overall: Object }}
 ***/
export function computeStageAnalytics(stages = [], tasks = []) {
  const byStage = {};
  let totalPasses = 0;
  let totalFails = 0;
  let totalDurations = [];

  for (const stage of stages) {
    const stageIdStr = String(stage.id);
    const stageNameLower = (stage.name || '').toLowerCase();

    const tasksInStage = tasks.filter((t) => String(t.currentStageId) === stageIdStr);
    const activeTasksInStage = tasksInStage.filter((t) => !isTaskCompleted(t));
    let stagePassCount = 0;
    let stageFailCount = 0;
    const stageDurations = [];
    let stageThroughputCount = 0;

    for (const task of tasks) {
      const history = Array.isArray(task.history) ? task.history : [];
      const reports = Array.isArray(task.reports) ? task.reports : [];

      let taskTouchedStage = String(task.currentStageId) === stageIdStr;

      const durations = collectStageDurations(task, stage);
      stageDurations.push(...durations);
      totalDurations.push(...durations);
      if (durations.length) taskTouchedStage = true;

      // Check task reports for this stage
      for (const report of reports) {
        if (matchesDurationStage(stage, report.stageName || report.stageSlug, report.stageId)) {
          taskTouchedStage = true;
          if (report.status === 'FAILED') {
            stageFailCount += 1;
            totalFails += 1;
          } else {
            stagePassCount += 1;
            totalPasses += 1;
          }
        }
      }

      // Check task history entries for approvals, advances, and rejections
      for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        const actionLower = (entry.action || '').toLowerCase();

        if (actionLower.includes(`stage ${stageIdStr}`) || actionLower.includes(stageNameLower)) {
          taskTouchedStage = true;

          if (
            actionLower.includes('rejected') ||
            actionLower.includes('fail') ||
            actionLower.includes('failback')
          ) {
            stageFailCount += 1;
            totalFails += 1;
          } else if (
            actionLower.includes('advanced') ||
            actionLower.includes('completed') ||
            actionLower.includes('passed') ||
            actionLower.includes('approved')
          ) {
            stagePassCount += 1;
            totalPasses += 1;
          }
        }
      }

      if (taskTouchedStage) {
        stageThroughputCount += 1;
      }
    }

    const totalStageEvents = stagePassCount + stageFailCount;
    const passRate =
      totalStageEvents > 0
        ? Math.round((stagePassCount / totalStageEvents) * 100)
        : stageThroughputCount > 0
          ? 100
          : 100;

    const hasDurations = stageDurations.length > 0;
    const avgStageDurationNum = hasDurations
      ? stageDurations.reduce((acc, v) => acc + v, 0) / stageDurations.length
      : 0;

    byStage[stage.id] = {
      stageId: stage.id,
      stageName: stage.name,
      stageType: stage.type,
      activeTasksCount: activeTasksInStage.length,
      throughput: stageThroughputCount,
      passedCount: stagePassCount,
      failedCount: stageFailCount,
      passRate,
      avgDuration: hasDurations ? formatDuration(avgStageDurationNum) : '--',
      avgDurationSeconds: avgStageDurationNum,
    };
  }

  const completedTasks = tasks.filter((t) => isTaskCompleted(t)).length;
  const activeTasks = tasks.filter((t) => !isTaskCompleted(t)).length;
  const totalEvents = totalPasses + totalFails;
  const overallEfficiency = totalEvents > 0 ? Math.round((totalPasses / totalEvents) * 100) : 100;

  const avgPipelineDurationNum =
    totalDurations.length > 0
      ? totalDurations.reduce((acc, v) => acc + v, 0) / totalDurations.length
      : 0;

  return {
    byStage,
    overall: {
      totalTasks: tasks.length,
      activeTasks,
      completedTasks,
      overallEfficiency,
      totalPasses,
      totalFails,
      avgDuration: formatDuration(avgPipelineDurationNum),
    },
  };
}
