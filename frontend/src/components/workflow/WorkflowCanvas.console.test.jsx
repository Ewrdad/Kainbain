import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { DEFAULT_UI_PREFERENCES } from '../../context/useUiPreferences';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas.console tests
 * @description Live Agent Activity Console cases owned by `ActivityConsole`: expand, resizer, log rendering/filtering, copy/clear and persisted drawer state. Rendered through `WorkflowCanvas` (integration).
 ***/
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const stages = [
  { id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas.' },
  { id: '2', name: 'Review', type: 'human', prompt: 'Human review.' },
];

const tasks = [
  { id: 'task-1', goal: 'Build login page', currentStageId: '1', status: 'in_stage' },
  { id: 'task-2', goal: 'Review API spec', currentStageId: '2', status: 'in_stage' },
  { id: 'task-3', goal: 'Old task', currentStageId: '1', status: 'completed' },
];

test('renders the Live Agent Activity Console header and expands on click (#21)', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    messages: [{ id: 'm1', role: 'assistant', content: 'Processing step 1...', entryId: 'e1' }],
    toolCalls: [],
    isAgentRunning: true,
  });
  expect(screen.getByText(/Live Agent Activity Console/i)).toBeInTheDocument();
  expect(screen.getByText(/Streaming.../i)).toBeInTheDocument();

  // Drawer is collapsed by default to prevent random popups (#21)
  expect(screen.queryByText('Processing step 1...')).not.toBeInTheDocument();

  // Clicking the console header expands the activity stream
  fireEvent.click(screen.getByText(/Live Agent Activity Console/i));
  expect(screen.getByText('Processing step 1...')).toBeInTheDocument();
});

/***
 * MARK: footer-overlap contract tests
 * @description The Configure stage drawer must be positioned relative to its
 *   own stage column so its `absolute inset-0` overlay can never extend
 *   underneath the Live Agent Activity Console or the Now Playing footer.
 *   When the containment is lost the drawer's Delete/Done buttons become
 *   unclickable behind those bars (the reported footer-overlap bug).
 ***/

test('renders resizable splitter handle for Activity Console with drag and keyboard support', () => {
  const updateUiPreference = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    messages: [{ id: 'm1', role: 'assistant', content: 'Activity present' }],
    updateUiPreference,
    uiPreferences: { consoleHeight: 250, activityDrawerDefaultOpen: true },
  });

  const handle = screen.getByRole('separator', { name: /Resize Activity Console/i });
  expect(handle).toBeInTheDocument();

  // Test keyboard resize (ArrowUp increases height)
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  expect(updateUiPreference).toHaveBeenCalledWith('consoleHeight', 270);
});

test('renders global activity logs prefixed with project tag [Project Name]', () => {
  // Survey Q3: drawer starts collapsed; open it via stored preference.
  window.localStorage.setItem('kainbain:showActivityDrawer', 'true');
  const processLogs = [
    {
      id: 'log-1',
      timestamp: '10:00:00',
      tag: '[AGENT]',
      text: 'Reasoning initialized',
      projectName: 'KainBain',
    },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    processLogs,
  });

  expect(screen.getByText('[KainBain]')).toBeInTheDocument();
  expect(screen.getByText('Reasoning initialized')).toBeInTheDocument();
});

test('Copy Logs copies combined stream of process logs, messages, and tool calls (#27)', async () => {
  // Survey Q3: drawer starts collapsed; open it via stored preference.
  window.localStorage.setItem('kainbain:showActivityDrawer', 'true');
  const writeTextMock = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });

  const processLogs = [
    {
      id: 'log-1',
      timestamp: '12:00:00',
      tag: '[CI/CMD]',
      text: 'npm test completed',
      projectName: 'Alpha Project',
    },
  ];
  const messages = [{ id: 'm1', role: 'assistant', content: 'Agent reasoning complete' }];
  const toolCalls = [
    { id: 'tc1', toolName: 'bash', args: { cmd: 'ls' }, status: 'completed', logs: ['file.txt'] },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    processLogs,
    messages,
    toolCalls,
  });

  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  const copyBtn = screen.getByRole('button', { name: /Copy logs/i });
  expect(copyBtn).toBeInTheDocument();

  fireEvent.click(copyBtn);
  await waitFor(() => {
    expect(writeTextMock).toHaveBeenCalled();
  });

  const copiedCall = writeTextMock.mock.calls[0][0];
  expect(copiedCall).toContain('[12:00:00] [Alpha Project] [CI/CMD] npm test completed');
  expect(copiedCall).toContain('[AGENT] Assistant: Agent reasoning complete');
  expect(copiedCall).toContain('[TOOL] bash({"cmd":"ls"}) [completed]');
  expect(copiedCall).toContain('file.txt');

  await waitFor(() => {
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });
});

test('tool invocations render once in the activity drawer: raw [TOOL] log lines are filtered out (ToolCard is the representation)', () => {
  // Survey Q3: drawer starts collapsed; open it via stored preference.
  window.localStorage.setItem('kainbain:showActivityDrawer', 'true');
  const toolCalls = [
    { id: 'tc1', toolName: 'frobnicate', args: { cmd: 'unique-arg-value' }, status: 'executing', logs: [] },
  ];
  const processLogs = [
    { id: 'log-1', timestamp: '12:00:01', tag: '[TOOL]', text: '⚡ frobnicate({"cmd":"unique-arg-value"})' },
    { id: 'log-2', timestamp: '12:00:02', tag: '[CI/CMD]', text: 'npm test passed' },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    processLogs,
    messages: [],
    toolCalls,
  });

  // The tool name appears exactly once — in the ToolCard. The mirrored raw
  // [TOOL] processLog line must not duplicate it in the drawer stream.
  const matches = screen.getAllByText(/frobnicate/);
  expect(matches.length).toBe(1);
  expect(matches[0].textContent).toContain('AGENT');
  // Non-tool logs still stream normally.
  expect(screen.getByText('npm test passed')).toBeInTheDocument();
});

test('Clear Logs triggers clearLogs callback to empty log buffer (#26)', () => {
  // Survey Q3: drawer starts collapsed; open it via stored preference.
  window.localStorage.setItem('kainbain:showActivityDrawer', 'true');
  const clearLogs = vi.fn();
  const processLogs = [
    {
      id: 'log-1',
      timestamp: '12:00:00',
      tag: '[AGENT]',
      text: 'Log entry',
    },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    processLogs,
    clearLogs,
  });

  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  const clearBtn = screen.getByRole('button', { name: /Clear logs/i });
  expect(clearBtn).toBeInTheDocument();

  fireEvent.click(clearBtn);
  expect(clearLogs).toHaveBeenCalled();
});

test('resizes console height via mouse drag between 120px and 600px (#13)', () => {
  const updateUiPreference = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    messages: [{ id: 'm1', role: 'assistant', content: 'Console active' }],
    updateUiPreference,
    uiPreferences: { consoleHeight: 250 },
  });

  const handle = screen.getByRole('separator', { name: /Resize Activity Console/i });

  // Start dragging
  fireEvent.mouseDown(handle, { clientY: 500 });

  // Move mouse up by 50px (increasing height)
  fireEvent.mouseMove(window, { clientY: 450 });
  expect(updateUiPreference).toHaveBeenCalledWith('consoleHeight', 300);

  // Release mouse
  fireEvent.mouseUp(window);
});

test('persists activity drawer state to localStorage and restores choice (#21)', () => {
  localStorage.setItem('kainbain:showActivityDrawer', 'false');

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    messages: [{ id: 'm1', role: 'assistant', content: 'Message 1' }],
  });

  // Since localStorage is 'false', drawer content should not be visible
  expect(screen.queryByText('Message 1')).not.toBeInTheDocument();

  // Click header to open
  fireEvent.click(screen.getByText(/Live Agent Activity Console/i));
  expect(localStorage.getItem('kainbain:showActivityDrawer')).toBe('true');
  expect(screen.getByText('Message 1')).toBeInTheDocument();

  // Click collapse button
  fireEvent.click(screen.getByRole('button', { name: /Collapse activity stream/i }));
  expect(localStorage.getItem('kainbain:showActivityDrawer')).toBe('false');
  expect(screen.queryByText('Message 1')).not.toBeInTheDocument();
});

// --- Show Completed persistence (3fe79394) ---

test('activity console tag and search filters restore from localStorage', () => {
  localStorage.setItem('kainbain:board:logTag', JSON.stringify('ERROR'));
  localStorage.setItem('kainbain:board:logSearch', JSON.stringify('timeout'));
  // Survey Q3: drawer starts collapsed; open it via stored preference.
  window.localStorage.setItem('kainbain:showActivityDrawer', 'true');
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    messages: [{ id: 'm1', role: 'assistant', content: 'Activity present' }],
  });

  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  // The legacy single-tag pill migrates once to the Errors lane (no error
  // lines exist here, so the lane reads selected-but-empty).
  expect(screen.getByRole('button', { name: 'Errors' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByLabelText('Filter logs')).toHaveValue('timeout');
});
