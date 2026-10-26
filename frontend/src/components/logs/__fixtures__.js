/**
 * MARK: log viewer fixtures
 * @description Real-shaped inputs for the unified LogViewer pipeline, mirroring
 *   production shapes (not simplified mocks): structured `task.logEntries`
 *   with turns/thinking markers/tool results, legacy `processLogs` text,
 *   live WebSocket lines as produced by `useWebSocket.addProcessLog`
 *   (`{id,timestamp,tag,text,raw,projectId,projectName,taskId}`), and
 *   orchestrator console events. Imported by `logCategories`/`adapters`
 *   golden tests.
 */

export const structuredTaskEntries = [
  {
    id: 1,
    ts: '2026-10-16T10:00:01.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'assistant',
    turn: 1,
    text: '[AGENT] Analyzing the failing test suite.',
    meta: {},
  },
  {
    id: 2,
    ts: '2026-10-16T10:00:02.000Z',
    feed: 'thinking',
    feeds: ['thinking'],
    kind: 'thinking',
    turn: 1,
    text: 'The stack trace points at the retry helper, not the parser itself…',
    meta: {},
  },
  {
    id: 3,
    ts: '2026-10-16T10:00:03.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'thinking',
    turn: 1,
    text: '[THINKING] (64 chars)',
    meta: { charCount: 64, collapsed: true, fullTextId: 2 },
  },
  {
    id: 4,
    ts: '2026-10-16T10:00:04.000Z',
    feed: 'tools',
    feeds: ['tools'],
    kind: 'tool',
    turn: 1,
    text: '[TOOL] bash({"cmd":"npm test"})',
    tool: { name: 'bash', result: 'FAIL tests/unit/retry.test.js\n12 passing, 1 failing' },
    meta: { toolName: 'bash', toolCallId: 'tc-1' },
  },
  {
    id: 5,
    ts: '2026-10-16T10:00:05.000Z',
    feed: 'tools',
    feeds: ['tools'],
    kind: 'tool',
    turn: 1,
    text: '[RESULT] exit code 1',
    meta: { toolName: 'bash', toolCallId: 'tc-1' },
  },
  {
    id: 6,
    ts: '2026-10-16T10:00:06.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'error',
    turn: 1,
    text: '[ERROR] npm test failed with exit code 1',
    meta: {},
  },
  {
    id: 7,
    ts: '2026-10-16T10:00:07.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'system',
    turn: 2,
    text: '[CI/CMD] npm test (exit 1)',
    meta: {},
  },
  {
    id: 8,
    ts: '2026-10-16T10:00:08.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'system',
    turn: 2,
    text: 'STAGE_FAILBACK from Review to Idea: tests red',
    meta: {},
  },
  {
    id: 9,
    ts: '2026-10-16T10:00:09.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'assistant',
    turn: 2,
    text: 'Retrying with a fixed backoff.',
    meta: {},
  },
  {
    id: 10,
    ts: '2026-10-16T10:00:10.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'system',
    turn: 2,
    text: '[GIT] on branch kb/fix-retry',
    meta: {},
  },
  {
    id: 11,
    ts: '2026-10-16T10:00:11.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'system',
    turn: 2,
    text: '[HUMAN] checkpoint: approve retry strategy',
    meta: {},
  },
  {
    id: 12,
    ts: '2026-10-16T10:00:12.000Z',
    feed: 'main',
    feeds: ['main'],
    kind: 'system',
    turn: 2,
    text: '[INFO] KainBain debug: dispatch queue depth 3',
    meta: {},
  },
  {
    id: 13,
    ts: '2026-10-16T10:00:13.000Z',
    feed: 'telemetry',
    feeds: ['telemetry'],
    kind: 'telemetry',
    turn: 2,
    text: '[USAGE] {"tokens": 1234}',
    usage: { tokens: 1234 },
    meta: {},
  },
];

export const legacyProcessLogsText =
  '[INFO] Task initialized in stage: Logging CI\n' +
  '[AGENT] AGENT first line\n' +
  '[TOOL] bash("npm test")\n' +
  '[RESULT] ok\n' +
  '[ERROR] canary stderr line';

export const liveProcessLogs = [
  {
    id: 'ws-1',
    timestamp: '10:00:01',
    tag: '[AGENT]',
    text: 'Agent analyzing task requirements',
    raw: '[AGENT] Agent analyzing task requirements',
    projectId: 'proj-1',
    projectName: 'Alpha',
    taskId: 'task-1',
  },
  {
    id: 'ws-2',
    timestamp: '10:00:02',
    tag: '[TOOL]',
    text: '⚡ bash({"cmd":"npm test"})',
    raw: '[TOOL] ⚡ bash({"cmd":"npm test"})',
    projectId: 'proj-1',
    projectName: 'Alpha',
    taskId: 'task-1',
  },
  {
    id: 'ws-3',
    timestamp: '10:00:03',
    tag: '[CI/CMD]',
    text: 'npm test passed',
    raw: '[CI/CMD] npm test passed',
    projectId: 'proj-1',
    projectName: 'Alpha',
    taskId: 'task-1',
  },
  {
    id: 'ws-4',
    timestamp: '10:00:04',
    tag: '[ERROR]',
    text: 'Connection timed out after 30s',
    raw: '[ERROR] Connection timed out after 30s',
    projectId: 'proj-1',
    projectName: 'Alpha',
    taskId: 'task-1',
  },
  {
    id: 'ws-5',
    timestamp: '10:00:05',
    tag: '[HUMAN]',
    text: 'checkpoint approved by reviewer',
    raw: '[HUMAN] checkpoint approved by reviewer',
    projectId: 'proj-1',
    projectName: 'Alpha',
    taskId: 'task-1',
  },
  {
    id: 'ws-6',
    timestamp: '10:00:06',
    tag: '[INFO]',
    text: 'KainBain debug heartbeat ok',
    raw: '[INFO] KainBain debug heartbeat ok',
    projectId: 'proj-1',
    projectName: 'Alpha',
    taskId: 'task-1',
  },
  {
    // CI stage wraps captured stderr: [STDERR]\n[ERROR] …
    id: 'ws-7',
    timestamp: '10:00:07',
    tag: '[STDERR]',
    text: '[STDERR]\n[ERROR] canary stderr line',
    raw: '[STDERR]\n[ERROR] canary stderr line',
    projectId: 'proj-1',
    projectName: 'Alpha',
    taskId: 'task-1',
  },
  {
    // CI stage wraps captured stdout: [STDOUT]\n[AGENT] …
    id: 'ws-8',
    timestamp: '10:00:08',
    tag: '[STDOUT]',
    text: '[STDOUT]\n[AGENT] AGENT first line',
    raw: '[STDOUT]\n[AGENT] AGENT first line',
    projectId: 'proj-1',
    projectName: 'Alpha',
    taskId: 'task-1',
  },
];

export const orchestratorMessages = [
  { id: 'm1', role: 'assistant', content: 'Retrying the suite now.' },
];

export const orchestratorToolCalls = [
  {
    id: 'tc1',
    toolName: 'bash',
    args: { cmd: 'npm test' },
    status: 'completed',
    logs: ['12 passing, 1 failing'],
  },
];

export const orchestratorEvents = {
  processLogs: liveProcessLogs,
  messages: orchestratorMessages,
  toolCalls: orchestratorToolCalls,
};
