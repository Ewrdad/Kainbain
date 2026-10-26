// Run in the lighter node environment: pure node-model logic, no DOM needs.
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  filterActiveWorkflowTasks,
  filterBoardTasksWithTags,
  isFailedTask,
  isHumanTask,
  resolveEffectiveMobileStageId,
  filterProcessLogs,
  formatLogsForCopy,
} from './nodeModel';

/***
 * MARK: nodeModel tests
 * @description Unit tests for the pure board-derivation selectors extracted
 *   from WorkflowCanvas. No rendering — direct function assertions.
 ***/

const stages = [
  { id: 's-idea', name: 'Idea', type: 'agent' },
  { id: 's-review', name: 'Review', type: 'human' },
];

const tasks = [
  { id: 'KB-1', goal: 'Build login', status: 'active', currentStageId: 's-idea', workflowId: 'wf-1' },
  {
    id: 'KB-2',
    goal: 'Review auth',
    status: 'waiting_human',
    currentStageId: 's-review',
    workflowId: 'wf-1',
  },
  { id: 'KB-3', goal: 'Other pipeline', status: 'active', currentStageId: 's-idea', workflowId: 'wf-2' },
  { id: 'KB-4', goal: 'Legacy task', status: 'active', currentStageId: 's-idea' },
];

describe('filterActiveWorkflowTasks', () => {
  test('keeps tasks of the active workflow only', () => {
    const out = filterActiveWorkflowTasks(tasks, 'wf-1', { id: 'wf-1' });
    expect(out.map((t) => t.id)).toEqual(['KB-1', 'KB-2']);
  });

  test('tasks without workflowId fall back to the default pipeline', () => {
    const out = filterActiveWorkflowTasks(tasks, 'wf-default', { id: 'wf-default', isDefault: true });
    expect(out.map((t) => t.id)).toEqual(['KB-4']);
  });

  test('empty input yields empty output', () => {
    expect(filterActiveWorkflowTasks([], 'wf-1', null)).toEqual([]);
  });

  test('unscoped tasks stay on the default pipeline only (task 8a056fc4)', () => {
    // Genuine default pipeline keeps the legacy fallback.
    expect(
      filterActiveWorkflowTasks(tasks, 'wf-1', { id: 'wf-1', isDefault: true }).map((t) => t.id),
    ).toEqual(['KB-1', 'KB-2', 'KB-4']);
    // A stale selection whose record mismatches the active id leaks nothing.
    expect(
      filterActiveWorkflowTasks(tasks, 'wf-9', { id: 'wf-1', isDefault: true }).map((t) => t.id),
    ).toEqual([]);
    // A non-default pipeline never admits unscoped tasks.
    expect(
      filterActiveWorkflowTasks(tasks, 'wf-2', { id: 'wf-2' }).map((t) => t.id),
    ).toEqual(['KB-3']);
  });
});

describe('filterBoardTasksWithTags', () => {
  const taggedStages = [
    { id: 's-po-1', name: 'Idea', type: 'agent', tags: ['PO'] },
    { id: 's-po-2', name: 'Spec', type: 'agent', tags: ['PO'] },
    { id: 's-dev', name: 'Build', type: 'agent', tags: ['Dev'] },
    { id: 's-plain', name: 'Notes', type: 'agent' },
  ];
  const taggedTasks = [
    { id: 'KB-10', goal: 'Draft auth proposal', status: 'active', currentStageId: 's-po-1' },
    { id: 'KB-11', goal: 'Review auth spec', status: 'active', currentStageId: 's-po-2' },
    { id: 'KB-12', goal: 'Implement auth login', status: 'active', currentStageId: 's-dev' },
    { id: 'KB-13', goal: 'Random note', status: 'active', currentStageId: 's-plain' },
  ];
  const base = {
    tasks: taggedTasks,
    stages: taggedStages,
    showCompleted: true,
    textQuery: '',
    selectedTags: [],
    tagMode: 'any',
  };

  test('no tags: every stage visible, tasks filtered by text only', () => {
    const { visibleStageIds, filteredTasks } = filterBoardTasksWithTags({
      ...base,
      textQuery: 'auth',
    });
    expect(visibleStageIds).toEqual(['s-po-1', 's-po-2', 's-dev', 's-plain']);
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-10', 'KB-11', 'KB-12']);
  });

  test('tags: only matching stages visible, hidden-stage tasks excluded', () => {
    const { visibleStageIds, filteredTasks } = filterBoardTasksWithTags({
      ...base,
      selectedTags: ['PO'],
    });
    expect(visibleStageIds).toEqual(['s-po-1', 's-po-2']);
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-10', 'KB-11']);
  });

  test('text query plus tags applies both filters', () => {
    const { visibleStageIds, filteredTasks } = filterBoardTasksWithTags({
      ...base,
      textQuery: 'review',
      selectedTags: ['PO'],
    });
    expect(visibleStageIds).toEqual(['s-po-1', 's-po-2']);
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-11']);
  });

  test('text matching a hidden-stage task still excludes it', () => {
    const { filteredTasks } = filterBoardTasksWithTags({
      ...base,
      textQuery: 'implement',
      selectedTags: ['PO'],
    });
    expect(filteredTasks).toEqual([]);
  });

  test('tagMode all requires every selected tag', () => {
    const both = [
      { id: 's-both', name: 'Both', type: 'agent', tags: ['PO', 'Dev'] },
      ...taggedStages,
    ];
    const any = filterBoardTasksWithTags({
      ...base,
      stages: both,
      selectedTags: ['PO', 'Dev'],
      tagMode: 'any',
    });
    expect(any.visibleStageIds).toEqual(['s-both', 's-po-1', 's-po-2', 's-dev']);
    const all = filterBoardTasksWithTags({
      ...base,
      stages: both,
      selectedTags: ['PO', 'Dev'],
      tagMode: 'all',
    });
    expect(all.visibleStageIds).toEqual(['s-both']);
  });

  test('system filters still apply alongside tags', () => {
    const failed = { ...taggedTasks[0], status: 'failed' };
    const { filteredTasks } = filterBoardTasksWithTags({
      ...base,
      tasks: [failed, taggedTasks[2]],
      selectedTags: ['PO'],
      systemFilters: ['failed'],
    });
    expect(filteredTasks.map((t) => t.id)).toEqual([failed.id]);
  });

  test('showCompleted=false still hides completed tasks alongside tags', () => {
    const done = { ...taggedTasks[0], status: 'completed' };
    const { filteredTasks } = filterBoardTasksWithTags({
      ...base,
      tasks: [done, taggedTasks[1]],
      selectedTags: ['PO'],
      showCompleted: false,
    });
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-11']);
  });

  test('empty tasks yield empty result', () => {
    expect(
      filterBoardTasksWithTags({ ...base, tasks: [], selectedTags: ['PO'] }),
    ).toEqual({ visibleStageIds: ['s-po-1', 's-po-2'], filteredTasks: [] });
  });

  test('untagged stages hide as soon as any tag is selected', () => {
    const { visibleStageIds } = filterBoardTasksWithTags({
      ...base,
      selectedTags: ['Dev'],
    });
    expect(visibleStageIds).toEqual(['s-dev']);
    expect(visibleStageIds).not.toContain('s-plain');
  });

  test('unknown tag matches nothing (stages collapse, tasks empty)', () => {
    const { visibleStageIds, filteredTasks } = filterBoardTasksWithTags({
      ...base,
      selectedTags: ['Nope'],
    });
    expect(visibleStageIds).toEqual([]);
    expect(filteredTasks).toEqual([]);
  });

  test('text query with no matching tasks yields empty filtered tasks', () => {
    const { filteredTasks } = filterBoardTasksWithTags({
      ...base,
      textQuery: 'nonexistent-term',
    });
    expect(filteredTasks).toEqual([]);
  });
});

describe('isFailedTask / isHumanTask', () => {
  test('isFailedTask matches status, failureReason, or lastError', () => {
    expect(isFailedTask({ status: 'failed' })).toBe(true);
    expect(isFailedTask({ status: 'active', failureReason: 'boom' })).toBe(true);
    expect(isFailedTask({ status: 'active', lastError: 'boom' })).toBe(true);
    expect(isFailedTask({ status: 'active' })).toBe(false);
    expect(isFailedTask(null)).toBe(false);
  });

  test('isHumanTask matches checkpoint stage type or waiting_human status', () => {
    const humanStages = [{ id: 's-review', type: 'human' }];
    expect(isHumanTask({ currentStageId: 's-review' }, humanStages)).toBe(true);
    expect(isHumanTask({ status: 'waiting_human' }, [])).toBe(true);
    expect(isHumanTask({ currentStageId: 's-other' }, humanStages)).toBe(false);
    expect(isHumanTask(null, [])).toBe(false);
  });
});

describe('filterBoardTasksWithTags system filters', () => {
  const reviewStages = [
    { id: 's-agent', name: 'Build', type: 'agent' },
    { id: 's-review', name: 'Review', type: 'human' },
  ];
  const mixedTasks = [
    { id: 'KB-20', goal: 'Build login', status: 'failed', currentStageId: 's-agent' },
    { id: 'KB-21', goal: 'Review auth', status: 'waiting_human', currentStageId: 's-review' },
    { id: 'KB-22', goal: 'Build search', status: 'active', currentStageId: 's-agent' },
  ];
  const baseFilters = {
    tasks: mixedTasks,
    stages: reviewStages,
    showCompleted: true,
    textQuery: '',
    selectedTags: [],
    tagMode: 'any',
  };

  test('!failed keeps only failed tasks', () => {
    const { filteredTasks } = filterBoardTasksWithTags({
      ...baseFilters,
      systemFilters: ['failed'],
    });
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-20']);
  });

  test('!human keeps only human-checkpoint tasks', () => {
    const { filteredTasks } = filterBoardTasksWithTags({
      ...baseFilters,
      systemFilters: ['human'],
    });
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-21']);
  });

  test('text query ANDs with system filters', () => {
    const { filteredTasks } = filterBoardTasksWithTags({
      ...baseFilters,
      textQuery: 'build',
      systemFilters: ['failed'],
    });
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-20']);
  });

  test('!failed + !human under any needs only one match', () => {
    const { filteredTasks } = filterBoardTasksWithTags({
      ...baseFilters,
      systemFilters: ['failed', 'human'],
      tagMode: 'any',
    });
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-20', 'KB-21']);
  });

  test('!failed + !human under all needs every match (usually empty)', () => {
    const { filteredTasks } = filterBoardTasksWithTags({
      ...baseFilters,
      systemFilters: ['failed', 'human'],
      tagMode: 'all',
    });
    expect(filteredTasks).toEqual([]);
  });

  test('a task matching both passes under all', () => {
    const both = {
      id: 'KB-23',
      goal: 'Failed review',
      status: 'failed',
      currentStageId: 's-review',
    };
    const { filteredTasks } = filterBoardTasksWithTags({
      ...baseFilters,
      tasks: [...mixedTasks, both],
      systemFilters: ['failed', 'human'],
      tagMode: 'all',
    });
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-23']);
  });

  test('unknown filter ids match nothing', () => {
    const { filteredTasks } = filterBoardTasksWithTags({
      ...baseFilters,
      systemFilters: ['bogus'],
    });
    expect(filteredTasks).toEqual([]);
  });

  test('no system filters returns every visible task', () => {
    const { filteredTasks } = filterBoardTasksWithTags({ ...baseFilters });
    expect(filteredTasks.map((t) => t.id)).toEqual(['KB-20', 'KB-21', 'KB-22']);
  });
});

describe('resolveEffectiveMobileStageId', () => {
  const filteredTasks = [tasks[1]]; // only Review has visible tasks

  test('explicit selection wins when it exists', () => {
    expect(
      resolveEffectiveMobileStageId({
        selectedMobileStageId: 's-idea',
        currentStageId: 's-review',
        stages,
        filteredTasks,
      }),
    ).toBe('s-idea');
  });

  test('falls back to the first stage with visible tasks', () => {
    expect(
      resolveEffectiveMobileStageId({
        selectedMobileStageId: null,
        currentStageId: 'missing',
        stages,
        filteredTasks,
      }),
    ).toBe('s-review');
  });

  test('falls back to the first stage when nothing matches', () => {
    expect(
      resolveEffectiveMobileStageId({
        selectedMobileStageId: null,
        currentStageId: null,
        stages,
        filteredTasks: [],
      }),
    ).toBe('s-idea');
  });
});

describe('filterProcessLogs', () => {
  const logs = [
    { id: 'l1', tag: '[AGENT]', text: 'thinking hard' },
    { id: 'l2', tag: '[TOOL]', text: 'mirrored tool line' },
    { id: 'l3', tag: '[CI]', text: 'npm run test:unit passed' },
    { id: 'l4', tag: '[ERROR]', text: 'boom' },
  ];

  test('always excludes raw [TOOL] mirror lines', () => {
    const out = filterProcessLogs(logs, 'ALL', '');
    expect(out.map((l) => l.id)).toEqual(['l1', 'l3', 'l4']);
  });

  test('tag filter narrows the stream', () => {
    expect(filterProcessLogs(logs, 'ERROR', '').map((l) => l.id)).toEqual(['l4']);
  });

  test('CI/CMD matches both CI and CI/CMD tags', () => {
    const withCmd = [...logs, { id: 'l5', tag: '[CI/CMD]', text: 'deploy' }];
    expect(filterProcessLogs(withCmd, 'CI/CMD', '').map((l) => l.id)).toEqual(['l3', 'l5']);
  });

  test('free-text query matches text and tag', () => {
    expect(filterProcessLogs(logs, 'ALL', 'boom').map((l) => l.id)).toEqual(['l4']);
  });

  test('excludes bare TOOL mirrors without brackets too', () => {
    const bare = [...logs, { id: 'l6', tag: 'TOOL', text: 'mirrored bare line' }];
    expect(filterProcessLogs(bare, 'ALL', '').map((l) => l.id)).toEqual(['l1', 'l3', 'l4']);
  });
});

describe('formatLogsForCopy', () => {
  test('combines logs, messages and tool calls as plain text', () => {
    const text = formatLogsForCopy({
      filteredProcessLogs: [{ timestamp: 't', tag: '[AGENT]', text: 'hi' }],
      messages: [{ content: 'hello' }],
      toolCalls: [{ toolName: 'bash', args: 'ls', status: 'completed', logs: ['ok'] }],
    });
    expect(text).toContain('[AGENT] hi');
    expect(text).toContain('[AGENT] Assistant: hello');
    expect(text).toContain('[TOOL] bash(ls) [completed]');
  });

  test('empty streams yield empty text', () => {
    expect(formatLogsForCopy({ filteredProcessLogs: [], messages: [], toolCalls: [] })).toBe('');
  });
});

