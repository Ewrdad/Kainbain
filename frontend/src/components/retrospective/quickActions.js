/***
 * MARK: quickActions registry
 * @description Registry of retrospective quick-action descriptors. Each entry
 *   is `{ id, label, icon, hint, describe(selection) -> { enabled, reason },
 *   run(ctx) }` where `ctx = { selection, tasksById, api, navigate, seedChat }`
 *   and `selection` is the array of selected task ids. New actions land as
 *   one-object additions — no switch to extend.
 *
 *   v1 list (Spike B): "Find trends in selection" (seeds chat, no backend),
 *   "Open task detail" (navigates), "Create follow-up task" (plain ticket
 *   creation via `POST /tasks` — NOT the executing `/follow-up` endpoint).
 *   "Undo" stays deferred: no safe rollback primitive exists.
 ***/

/***
 * MARK: QUICK_ACTIONS
 * @description The v1 quick-action descriptors in display order.
 ***/
export const QUICK_ACTIONS = [
  {
    id: 'find-trends',
    label: 'Find trends in selection',
    icon: '📈',
    hint: 'Seeds the chat with a trends prompt over the selected tasks.',
    describe: (selection) =>
      selection.length > 0
        ? { enabled: true, reason: '' }
        : { enabled: false, reason: 'Select at least one task to find trends.' },
    run: ({ selection, tasksById, seedChat }) => {
      const titles = selection.map((id) => tasksById?.get(id)?.title || id);
      seedChat(
        `What trends, failure patterns, or efficiency wins do you see across these ${selection.length} selected task(s)?\n${titles.map((t) => `- ${t}`).join('\n')}`,
      );
      return { ok: true };
    },
  },
  {
    id: 'open-task-detail',
    label: 'Open task detail',
    icon: '↗',
    hint: 'Opens the full task view for the selected task.',
    describe: (selection) =>
      selection.length === 1
        ? { enabled: true, reason: '' }
        : {
            enabled: false,
            reason:
              selection.length === 0
                ? 'Select exactly one task to open it.'
                : 'Open works with exactly one task — narrow the selection to one.',
          },
    run: ({ selection, navigate }) => {
      navigate(`/tasks/${encodeURIComponent(selection[0])}`);
      return { ok: true };
    },
  },
  {
    id: 'create-follow-up',
    label: 'Create follow-up task',
    icon: '＋',
    hint: 'Creates a plain follow-up ticket referencing the selected task.',
    describe: (selection) =>
      selection.length === 1
        ? { enabled: true, reason: '' }
        : {
            enabled: false,
            reason:
              selection.length === 0
                ? 'Select exactly one task to follow up on.'
                : 'Follow-up works with exactly one task — narrow the selection to one.',
          },
    run: async ({ selection, tasksById, api, projectId }) => {
      const source = tasksById?.get(selection[0]);
      const title = source?.title ? `Follow up: ${source.title}` : 'Follow-up task';
      const goal = source
        ? `Follow-up to task ${selection[0]} ("${source.title || 'untitled'}", status ${source.status || 'unknown'}): describe the improvement or fix to make here.`
        : 'Follow-up task: describe the improvement or fix to make here.';
      // Plain ticket creation (POST /tasks {title, goal}) — deliberately NOT
      // the executing POST /tasks/:id/follow-up endpoint (Spike B).
      const created = await api.createTask(projectId, { title, goal });
      return { ok: true, created };
    },
  },
];

/***
 * MARK: describeQuickAction
 * @description Resolves one action's enabled state for a selection.
 * @example describeQuickAction(QUICK_ACTIONS[0], ['t1']) => { enabled: true, reason: '' }
 * @param {Object} action - Registry descriptor.
 * @param {Array<string>} [selection=[]] - Selected task ids.
 * @returns {{enabled: boolean, reason: string}} Enabled state + disabled reason.
 ***/
export function describeQuickAction(action, selection = []) {
  if (!action || typeof action.describe !== 'function') {
    return { enabled: false, reason: 'Unknown action.' };
  }
  return action.describe(Array.isArray(selection) ? selection : []);
}
