import { isTaskCompleted } from '../tasks/taskFormatters';
import { normalizeSelectedTagTokens, stageMatchesTags } from './stageTagFilter';
import { normalizeSystemFilterTokens, systemFilterMatches } from './systemFilters';
export { isFailedTask, isHumanTask } from './systemFilters';
import { adaptProcessLogLines, excludeToolMirrorLinesWhenToolCardsShown } from '../logs/adapters';
import { filterLogRecords, legacyTagToCategories } from '../logs/logCategories';

/***
 * MARK: nodeModel
 * @description Pure board-derivation selectors extracted from WorkflowCanvas.
 *   Every function is a total function of (state, props) with no JSX, no
 *   hooks and no context — independently unit-testable without rendering.
 *   WorkflowCanvas wraps each one in a `useMemo`; the logic here is the
 *   single source of truth.
 ***/

/***
 * MARK: filterActiveWorkflowTasks
 * @description Isolates tasks strictly to the active workflow (#6, #24, #26).
 *   Tasks without an explicit workflowId belong to the default pipeline.
 * @example filterActiveWorkflowTasks(tasks, 'wf-1', { id: 'wf-1' })
 ***/
export function filterActiveWorkflowTasks(tasks, activeWfId, activeWorkflow) {
  return (tasks || []).filter((t) => {
    if (t.workflowId) return t.workflowId === activeWfId;
    // Unscoped (legacy) tasks belong to the default pipeline only — and only
    // when the resolved active workflow really is that default pipeline
    // (task 8a056fc4). A stale activeWorkflowId falling back to
    // `projectWorkflows[0]` must not leak foreign tasks into the new pipeline.
    if (activeWfId === 'wf-default') return true;
    return Boolean(activeWorkflow?.isDefault) && String(activeWorkflow?.id) === String(activeWfId);
  });
}

/***
 * MARK: filterBoardTasksWithTags
 * @description Combined filter for the unified search bar: stages are filtered
 *   by the selected stage tags (collapsing non-matching runs), and tasks within
 *   the surviving stages are filtered by the remaining text query, the `!`
 *   system filters (registry predicates under the tagMode any/all logic), and
 *   the completed toggle. Returns `{ visibleStageIds, filteredTasks }`.
 * @example filterBoardTasksWithTags({ tasks, stages, showCompleted: false, textQuery: 'auth', selectedTags: ['Dev'], tagMode: 'any', systemFilters: ['failed'] })
 ***/
export function filterBoardTasksWithTags({
  tasks,
  stages,
  showCompleted,
  textQuery,
  selectedTags,
  tagMode = 'any',
  systemFilters,
}) {
  const normalizedTags = normalizeSelectedTagTokens(selectedTags);
  const visibleStageIds =
    normalizedTags.length === 0
      ? (stages || []).map((stage) => stage.id)
      : (stages || [])
          .filter((stage) => stageMatchesTags(stage, normalizedTags, tagMode))
          .map((stage) => stage.id);
  const visibleStageSet = new Set(visibleStageIds);

  const filteredTasks = (tasks || []).filter((task) => {
    if (isTaskCompleted(task) && !showCompleted) return false;

    const stageId = task.currentStageId || task.stageId;
    if (!visibleStageSet.has(stageId)) return false;

    if (textQuery && String(textQuery).trim()) {
      const query = String(textQuery).toLowerCase().trim();
      const matchesGoal = task.goal?.toLowerCase().includes(query);
      const matchesTitle = task.title?.toLowerCase().includes(query);
      const matchesId = task.id?.toLowerCase().includes(query);
      const matchesKeywords = task.keywords?.some((k) => String(k).toLowerCase().includes(query));
      if (!matchesGoal && !matchesTitle && !matchesId && !matchesKeywords) return false;
    }

    const normalizedSystemFilters = normalizeSystemFilterTokens(systemFilters);
    if (normalizedSystemFilters.length > 0) {
      const matchers = normalizedSystemFilters.map((id) => () =>
        systemFilterMatches(id, task, stages),
      );
      const passes =
        tagMode === 'all'
          ? matchers.every((match) => match())
          : matchers.some((match) => match());
      if (!passes) return false;
    }

    return true;
  });

  return { visibleStageIds, filteredTasks };
}

/***
 * MARK: resolveEffectiveMobileStageId
 * @description Mobile shows one stage column at a time. Default to the
 *   explicitly selected tab, then the current stage; when neither resolves,
 *   park on the first stage that actually has visible tasks instead of an
 *   empty first column.
 * @example resolveEffectiveMobileStageId({ selectedMobileStageId: null, currentStageId: 's1', stages, filteredTasks })
 ***/
export function resolveEffectiveMobileStageId({
  selectedMobileStageId,
  currentStageId,
  stages,
  filteredTasks,
}) {
  if (selectedMobileStageId && (stages || []).some((s) => s.id === selectedMobileStageId)) {
    return selectedMobileStageId;
  }
  if (currentStageId && (stages || []).some((s) => s.id === currentStageId)) {
    return currentStageId;
  }
  const withTasks = (stages || []).find((s) =>
    (filteredTasks || []).some((t) => String(t.currentStageId) === String(s.id)),
  );
  return withTasks?.id || stages?.[0]?.id;
}

export { excludeToolMirrorLinesWhenToolCardsShown };

/***
 * MARK: filterProcessLogs
 * @description Compatibility facade over the unified log taxonomy: the legacy
 *   single-tag filter maps once to category sets, raw `[TOOL]` mirror lines
 *   stay excluded (the canvas renders tool calls as ToolCards below, so
 *   including them would show every tool call twice), and the ORIGINAL line
 *   objects come back (never the adapted records) so copy formatting is
 *   byte-identical to before.
 * @example filterProcessLogs(processLogs, 'ALL', '')
 ***/
export function filterProcessLogs(processLogs, logTagFilter, logSearchQuery) {
  const records = excludeToolMirrorLinesWhenToolCardsShown(adaptProcessLogLines(processLogs), {
    showToolCards: true,
  });
  // Legacy ALL means literally everything (except tool mirrors, dropped
  // above) — not the compact density defaults, which suppress debug/raw.
  const categories =
    !logTagFilter || logTagFilter === 'ALL'
      ? new Set(['ALL'])
      : legacyTagToCategories(logTagFilter, 'compact');
  const visible = new Set(
    filterLogRecords(records, { categories, search: logSearchQuery }).map((record) => record.id),
  );
  // Index by source identity once (O(n), not O(n^2)): repeat references to
  // the same line object resolve to the same record.
  const byRawLine = new Map();
  for (const record of records) {
    const rawLine = record.meta?.rawLine;
    if (rawLine && !byRawLine.has(rawLine)) byRawLine.set(rawLine, record);
  }
  const cleanTag = (tag) =>
    String(tag || '')
      .replace(/[[\]]/g, '')
      .trim()
      .toUpperCase();
  return (processLogs || []).filter((log) => {
    // Bracketed or bare — a TOOL mirror is a TOOL mirror either way.
    if (cleanTag(log?.tag) === 'TOOL') return false;
    const adapted = (log && byRawLine.get(log)) || null;
    if (!adapted) {
      // Falsy entries never adapt; defensive keep-out rather than a leak.
      return false;
    }
    return visible.has(adapted.id);
  });
}

/***
 * MARK: formatLogsForCopy
 * @description Formats the combined activity stream (filtered process logs,
 *   agent messages, tool calls) as plain text for the Copy Logs action.
 * @example formatLogsForCopy({ filteredProcessLogs, messages, toolCalls })
 ***/
export function formatLogsForCopy({ filteredProcessLogs, messages, toolCalls }) {
  const parts = [];

  if ((filteredProcessLogs || []).length > 0) {
    const processLines = filteredProcessLogs.map(
      (l) =>
        `[${l.timestamp || ''}] ${l.projectName ? `[${l.projectName}] ` : ''}${l.tag || '[INFO]'} ${l.text || l.raw || ''}`,
    );
    parts.push(...processLines);
  }

  if ((messages || []).length > 0) {
    const messageLines = messages.map((m) => `[AGENT] Assistant: ${m.content || ''}`);
    parts.push(...messageLines);
  }

  if ((toolCalls || []).length > 0) {
    const toolLines = toolCalls.map((tc) => {
      const argsStr = tc.args
        ? typeof tc.args === 'string'
          ? tc.args
          : JSON.stringify(tc.args)
        : '';
      const toolHeader = `[TOOL] ${tc.toolName || 'tool'}(${argsStr}) [${tc.status || 'completed'}]`;
      const logLines =
        Array.isArray(tc.logs) && tc.logs.length > 0
          ? '\n' +
            tc.logs
              .map((log) => `  ${typeof log === 'string' ? log : JSON.stringify(log)}`)
              .join('\n')
          : '';
      return toolHeader + logLines;
    });
    parts.push(...toolLines);
  }

  return parts.join('\n');
}
