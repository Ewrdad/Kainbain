// jsdom pin: this suite needs assignable navigator.clipboard mock (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { LogsPanel, useTaskLogs } from './LogsPanel';
import '@testing-library/jest-dom';

/***
 * MARK: api mock
 * @description Keeps the stuck-check model listing deterministic in LogsPanel
 *   tests (no real network fetch); other api exports stay real.
 ***/
vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      getModels: vi.fn(async () => ({
        models: [
          { key: 'prov-a::model-a', id: 'model-a', name: 'Model A', provider: 'prov-a' },
        ],
      })),
    },
  };
});

/***
 * MARK: HarnessPanel
 * @description Renders LogsPanel through the useTaskLogs hook the same way
 *   the real pages do, so the view-model wiring is covered end to end. The
 *   task flows through to LogsPanel so the "Is it stuck?" control is armed.
 ***/
function HarnessPanel({ task }) {
  const logs = useTaskLogs({ task });
  return <LogsPanel logs={logs} task={task} isActive />;
}

beforeEach(() => {
  window.localStorage.clear();
});

const groupedTask = {
  id: 'task-g1',
  goal: 'Grouped logs',
  currentStageId: 's1',
  status: 'in_stage',
  logEntries: [
    {
      id: 1,
      ts: 't',
      feed: 'main',
      feeds: ['main'],
      kind: 'system',
      turn: 1,
      text: "[AGENT] Working on git branch 'kb/1'",
      meta: {},
    },
    {
      id: 2,
      ts: 't',
      feed: 'thinking',
      feeds: ['thinking'],
      kind: 'thinking',
      turn: 1,
      text: 'hidden model reasoning',
      meta: { charCount: 22 },
    },
    {
      id: 3,
      ts: 't',
      feed: 'main',
      feeds: ['main'],
      kind: 'thinking',
      turn: 1,
      text: '[THINKING] (22 chars)',
      meta: { charCount: 22, collapsed: true, fullTextId: 2 },
    },
    {
      id: 4,
      ts: 't',
      feed: 'main',
      feeds: ['main'],
      kind: 'assistant',
      turn: 1,
      text: 'I will fix the bug now.',
      meta: {},
    },
    {
      id: 5,
      ts: 't',
      feed: 'tools',
      feeds: ['main', 'tools'],
      kind: 'tool',
      turn: 1,
      text: '[TOOL] edit({"path":"src/a.js"})',
      meta: { toolName: 'edit', toolCallId: 'tc-1' },
    },
    {
      id: 6,
      ts: 't',
      feed: 'tools',
      feeds: ['tools'],
      kind: 'tool',
      turn: 1,
      text: '[RESULT] patched',
      meta: { toolName: 'edit', toolCallId: 'tc-1' },
    },
    {
      id: 7,
      ts: 't',
      feed: 'main',
      feeds: ['main'],
      kind: 'assistant',
      turn: 2,
      text: 'Done, tests green.',
      meta: {},
    },
  ],
};

test('renders grouped blocks with turn headers and indented results', () => {
  renderWithKainBain(<HarnessPanel task={groupedTask} />);

  // Turn headers appear per turn.
  expect(screen.getByText('── Turn 1 ──')).toBeInTheDocument();
  expect(screen.getByText('── Turn 2 ──')).toBeInTheDocument();

  // Assistant blocks render complete (not token fragments).
  expect(screen.getByText('I will fix the bug now.')).toBeInTheDocument();
  expect(screen.getByText('Done, tests green.')).toBeInTheDocument();

  // Tool call + indented result.
  expect(screen.getByText('[TOOL] edit({"path":"src/a.js"})')).toBeInTheDocument();
  expect(screen.getByText('[RESULT] patched')).toBeInTheDocument();

  // Thinking is collapsed to a sized marker, never streamed raw.
  expect(screen.queryByText('hidden model reasoning')).not.toBeInTheDocument();
  expect(screen.getByText('[THINKING] (22 chars)')).toBeInTheDocument();
});

test('thinking expander reveals the full block via aria-expanded', () => {
  renderWithKainBain(<HarnessPanel task={groupedTask} />);

  const expander = screen.getByRole('button', { name: 'Show thinking (22 chars)' });
  expect(expander).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('hidden model reasoning')).not.toBeInTheDocument();

  fireEvent.click(expander);
  expect(expander).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('hidden model reasoning')).toBeInTheDocument();
});

test('category chips carry counts and aria-pressed selection state', () => {
  renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  const all = screen.getByRole('button', { name: 'All' });
  const tools = screen.getByRole('button', { name: 'Tool calls' });
  expect(all).toHaveAttribute('aria-pressed', 'true');
  expect(tools).toHaveAttribute('aria-pressed', 'true');

  // Multi-select: toggling one lane off narrows without switching feeds.
  fireEvent.click(tools);
  expect(all).toHaveAttribute('aria-pressed', 'false');
  expect(tools).toHaveAttribute('aria-pressed', 'false');
  // Full thinking blocks need the thinking lane; the marker rides along.
  expect(screen.getByRole('button', { name: 'Thinking traces' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('toggling the tools lane hides tool calls but keeps the narrative', () => {
  renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  fireEvent.click(screen.getByRole('button', { name: 'Tool calls' }));
  expect(screen.queryByText('[TOOL] edit({"path":"src/a.js"})')).not.toBeInTheDocument();
  expect(screen.queryByText('[RESULT] patched')).not.toBeInTheDocument();
  expect(screen.getByText('I will fix the bug now.')).toBeInTheDocument();
});

test('selecting the thinking lane reveals full thinking blocks', () => {
  renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  expect(screen.queryByText('hidden model reasoning')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thinking traces' }));
  expect(screen.getByText('hidden model reasoning')).toBeInTheDocument();
});

test('search filters entries by rendered text', () => {
  renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  fireEvent.change(screen.getByLabelText('Search logs'), {
    target: { value: 'tests green' },
  });
  expect(screen.getByText('Done, tests green.')).toBeInTheDocument();
  expect(screen.queryByText('I will fix the bug now.')).not.toBeInTheDocument();
});

test('copy emits the rendered text of the filtered entries', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  fireEvent.click(screen.getByRole('button', { name: 'Copy logs' }));
  await vi.waitFor(() => {
    expect(writeText).toHaveBeenCalledTimes(1);
  });
  const copied = writeText.mock.calls[0][0];
  expect(copied).toContain("[AGENT] Working on git branch 'kb/1'");
  expect(copied).toContain('[THINKING] (22 chars)');
  // The raw thinking never leaks into the copied main view.
  expect(copied).not.toContain('hidden model reasoning');
});

test('legacy tasks without logEntries render the flat line view as today', () => {
  const legacyTask = {
    id: 'task-legacy',
    goal: 'Legacy logs',
    currentStageId: 's1',
    status: 'in_stage',
    processLogs: '[INFO] Initialized\n[AGENT] Model thinking\n[TOOL] bash("ls")\n[RESULT] ok',
  };

  renderWithKainBain(<HarnessPanel task={legacyTask} />);

  // No turn headers for legacy (turnless) entries.
  expect(screen.queryByText(/── Turn/)).not.toBeInTheDocument();
  expect(screen.getByText('[INFO] Initialized')).toBeInTheDocument();
  expect(screen.getByText('[AGENT] Model thinking')).toBeInTheDocument();
  expect(screen.getByText('[RESULT] ok')).toBeInTheDocument();
});

test('renders the "Is it stuck?" toggle in the status bar when a task is present', () => {
  renderWithKainBain(<HarnessPanel task={groupedTask} />);

  const button = screen.getByRole('button', { name: /is it stuck\?/i });
  expect(button).toBeInTheDocument();
  expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: /stuck check/i })).not.toBeInTheDocument();
});

test('stuck check runs end to end through the panel', async () => {
  const checkTaskStuck = vi.fn(async () => ({
    taskId: groupedTask.id,
    verdict: 'stuck',
    summary: 'The same npm test command repeats 6 times.',
    model: { key: 'prov-a::model-a', id: 'model-a', name: 'Model A', provider: 'prov-a' },
  }));

  renderWithKainBain(<HarnessPanel task={groupedTask} />, { checkTaskStuck });

  fireEvent.click(screen.getByRole('button', { name: /is it stuck\?/i }));
  const panel = screen.getByRole('region', { name: /stuck check/i });
  expect(panel).toBeInTheDocument();

  const runButton = await screen.findByRole('button', { name: /run check/i });
  await waitFor(() => expect(runButton).not.toBeDisabled());
  fireEvent.click(runButton);

  const result = await screen.findByTestId('stuck-check-result');
  expect(result).toHaveTextContent(/looks stuck/i);
  expect(result).toHaveTextContent('The same npm test command repeats 6 times.');
  expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', groupedTask.id, {
    model: 'prov-a::model-a',
    harness: undefined,
  });
});
/***
 * MARK: log filter persistence tests
 * @description Contract for persistent Logs-tab filters: per-task categories
 *   and search restore after refresh, never bleed across tasks, corrupt
 *   values fall back to defaults, and the legacy feed key migrates once.
 ***/
test('task log categories and search restore from per-task localStorage after refresh', () => {
  window.localStorage.setItem(
    'kainbain:logViewer:task:task-g1:categories',
    JSON.stringify(['tools']),
  );
  window.localStorage.setItem(
    'kainbain:logViewer:task:task-g1:search',
    JSON.stringify('patched'),
  );
  renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  expect(screen.getByRole('button', { name: 'Tool calls' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Direct output' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByLabelText('Search logs')).toHaveValue('patched');
});

test('legacy task feed key migrates once to categories', () => {
  window.localStorage.setItem('kainbain:taskLogs:task-g1:feed', JSON.stringify('TOOLS'));
  renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  expect(screen.getByRole('button', { name: 'Tool calls' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Direct output' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('task log filters never bleed into another task', () => {
  const { unmount } = renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  fireEvent.change(screen.getByLabelText('Search logs'), {
    target: { value: 'task-a-only-text' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Tool calls' }));
  unmount();

  const otherTask = { ...groupedTask, id: 'task-other' };
  renderWithKainBain(<HarnessPanel task={otherTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  expect(screen.getByLabelText('Search logs')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
});

test('corrupt task log filter values fall back to defaults', () => {
  window.localStorage.setItem(
    'kainbain:logViewer:task:task-g1:categories',
    'not-json{{{',
  );
  window.localStorage.setItem('kainbain:taskLogs:task-g1:feed', JSON.stringify('BOGUS'));
  renderWithKainBain(<HarnessPanel task={groupedTask} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Search logs')).toHaveValue('');
});

test('error and [STDERR]-wrapped entries are classified without displaying an intervention strip', () => {
  const taskWithErrors = {
    id: 'task-err',
    goal: 'Error logs',
    currentStageId: 's1',
    status: 'in_stage',
    logEntries: [
      {
        id: 1,
        ts: 't',
        feed: 'main',
        feeds: ['main'],
        kind: 'assistant',
        turn: 1,
        text: '[AGENT] AGENT first line',
        meta: {},
      },
      {
        id: 2,
        ts: 't',
        feed: 'main',
        feeds: ['main'],
        kind: 'error',
        turn: 1,
        text: '[STDERR]\n[ERROR] canary stderr line',
        meta: { source: 'process-log' },
      },
    ],
  };

  renderWithKainBain(<HarnessPanel task={taskWithErrors} />);
  fireEvent.click(screen.getByTestId('log-filter-toggle'));

  // Verify the strip is NOT present to save log space
  expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  // Verify error entry is still classified under the Errors chip and visible in logs
  expect(screen.getByRole('button', { name: 'Errors' })).toBeInTheDocument();
  expect(screen.getByText(/canary stderr line/)).toBeInTheDocument();
});
