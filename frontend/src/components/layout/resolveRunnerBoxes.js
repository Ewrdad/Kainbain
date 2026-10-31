import { formatTaskTitleFirstLine } from '../tasks/taskFormatters';

/***
 * MARK: resolveRunnerBoxes
 * @description Builds the per-runner box models for the Now Playing bar's
 *   left side. Boxes show for every configured (active) Runner — idle ones
 *   included — so the bar always reads as the fleet roster, never as an
 *   empty "nothing running" state. Live assignments overlay task, stage,
 *   and freshness; a Runner with no assignment renders an honest idle box
 *   (`idle: true`, task "Idle", stage "Waiting for work"). Always returns
 *   an array (empty only when no Runners are configured at all).
 * @example resolveRunnerBoxes({ assignments: [], tasks: [], stages: [], runners: [] }) => []
 ***/
export function resolveRunnerBoxes({ assignments, tasks, stages, runners }) {
  const list = Array.isArray(assignments) ? assignments.filter((a) => a && a.runnerId) : [];
  const byRunner = new Map();
  for (const a of list) {
    const key = String(a.runnerId);
    if (!byRunner.has(key)) byRunner.set(key, a);
  }
  // Union: every configured active Runner in registry order, then any
  // assignment-only ids (registry unknown, e.g. list fetch missed) after.
  const ids = [];
  if (Array.isArray(runners)) {
    for (const r of runners) {
      if (!r || typeof r.runnerId !== 'string' || !r.runnerId) continue;
      if (r.status !== 'active') continue;
      if (!ids.includes(r.runnerId)) ids.push(r.runnerId);
    }
  }
  for (const key of byRunner.keys()) {
    if (!ids.includes(key)) ids.push(key);
  }
  if (ids.length === 0) return [];
  const recordById = new Map(
    (Array.isArray(runners) ? runners : [])
      .filter((r) => r && typeof r.runnerId === 'string')
      .map((r) => [r.runnerId, r]),
  );
  const taskById = new Map(
    (Array.isArray(tasks) ? tasks : [])
      .filter((t) => t && t.id != null)
      .map((t) => [String(t.id), t]),
  );
  const stageById = new Map(
    (Array.isArray(stages) ? stages : [])
      .filter((s) => s && s.id != null)
      .map((s) => [String(s.id), s]),
  );
  const stageNameFor = (stageId, task) => {
    const ids = [stageId, task?.currentStageId];
    for (const id of ids) {
      if (id == null || id === '') continue;
      const stage = stageById.get(String(id));
      const name = stage?.name || stage?.title;
      if (typeof name === 'string' && name.trim()) return name;
      return String(id);
    }
    return '…';
  };
  const taskNameFor = (task, taskId) =>
    formatTaskTitleFirstLine(task || '', '') ||
    (typeof taskId === 'string' || typeof taskId === 'number' ? String(taskId).slice(0, 8) : '…');
  return ids.map((runnerId) => {
    const a = byRunner.get(runnerId) || null;
    const record = recordById.get(runnerId) || null;
    if (!a) {
      // Configured but holding nothing: an honest idle box. The health dot
      // reads the registry heartbeat (grey unknown when never seen).
      return {
        runnerId,
        taskId: null,
        task: null,
        taskName: 'Idle',
        stageName: 'Waiting for work',
        lastSeenAt: record?.lastSeenAt ?? null,
        startedAt: null,
        paused: record?.paused ?? false,
        idle: true,
      };
    }
    const task = taskById.get(String(a.taskId)) || null;
    return {
      runnerId,
      taskId: a.taskId,
      task,
      taskName: taskNameFor(task, a.taskId),
      stageName: stageNameFor(a.stageId, task),
      lastSeenAt: a.lastSeenAt ?? record?.lastSeenAt ?? null,
      startedAt: a.startedAt ?? null,
      paused: a.paused ?? record?.paused ?? false,
      idle: false,
    };
  });
}
