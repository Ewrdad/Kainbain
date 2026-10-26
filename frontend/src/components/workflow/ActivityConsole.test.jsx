import { beforeEach, expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { ActivityConsole } from './ActivityConsole';
import { CONSOLE_CHROME } from '../logs/consoleStyles';
import { useActivityConsole } from './hooks/useActivityConsole';
import '@testing-library/jest-dom';

/***
 * MARK: ActivityConsole tests
 * @description Colocated tests for the unified Live Agent Activity Console:
 *   hidden when idle, collapse/expand, category lanes, search input,
 *   auto-scroll lock, copy/clear actions and the empty-filter notice. State
 *   arrives from `useActivityConsole` the same way WorkflowCanvas provides it;
 *   per-test overrides replace individual props.
 ***/

function Harness({ consoleArgs = {}, activityProps = {} }) {
  const consoleUi = useActivityConsole({
    uiPreferences: { activityDrawerDefaultOpen: true },
    updateUiPreference: vi.fn(),
    processLogs: [],
    messages: [],
    toolCalls: [],
    ...consoleArgs,
  });
  return (
    <ActivityConsole
      hasActivity
      showActivityDrawer
      consoleHeight={280}
      isDraggingConsole={false}
      isAgentRunning={false}
      processLogs={consoleArgs.processLogs || []}
      messages={consoleArgs.messages || []}
      toolCalls={consoleArgs.toolCalls || []}
      autoScroll={consoleUi.autoScroll}
      setAutoScroll={consoleUi.setAutoScroll}
      viewer={consoleUi.viewer}
      logRecords={consoleUi.logRecords}
      copiedLogs={consoleUi.copiedLogs}
      clearLogs={vi.fn()}
      toggleActivityDrawer={vi.fn()}
      handleResizeMouseDown={vi.fn()}
      handleResizeTouchStart={vi.fn()}
      handleResizeKeyDown={vi.fn()}
      handleCopyLogs={consoleUi.handleCopyLogs}
      {...activityProps}
    />
  );
}

function renderConsole(consoleArgs, activityProps) {
  return renderWithKainBain(<Harness consoleArgs={consoleArgs} activityProps={activityProps} />);
}

beforeEach(() => {
  window.localStorage.clear();
});

test('renders nothing when there is no activity', () => {
  const { container } = renderConsole({}, { hasActivity: false });
  expect(container).toBeEmptyDOMElement();
});

test('bar renders at drawer height with log count', () => {
  const logs = [
    { id: 'l1', timestamp: '12:00:01', tag: '[AGENT]', text: 'thinking' },
    { id: 'l2', timestamp: '12:00:02', tag: '[ERROR]', text: 'boom' },
  ];
  renderConsole({ processLogs: logs });
  const bar = screen.getByTestId('activity-console-bar');
  expect(bar).toHaveStyle({ height: '280px' });
  expect(bar).toHaveTextContent('2 logs');
  expect(screen.getByLabelText('Live agent activity stream')).toBeInTheDocument();
});

test('collapse toggle calls toggleActivityDrawer exactly once', () => {
  const toggleActivityDrawer = vi.fn();
  renderConsole({}, { toggleActivityDrawer });
  // The header bar div shares the same onClick, but the toggle button stops
  // propagation — one user click must flip the drawer exactly once (a double
  // fire would collapse-then-expand back to the same state).
  fireEvent.click(screen.getByLabelText('Collapse activity stream'));
  expect(toggleActivityDrawer).toHaveBeenCalledTimes(1);
});

test('collapsed drawer shows expand affordance at 36px', () => {
  renderConsole({}, { showActivityDrawer: false });
  expect(screen.getByTestId('activity-console-bar')).toHaveStyle({ height: '36px' });
  expect(screen.getByLabelText('Expand activity stream')).toBeInTheDocument();
});

test('category lanes toggle and filter the stream', () => {
  const logs = [
    { id: 'l1', timestamp: '12:00:01', tag: '[AGENT]', text: 'thinking hard' },
    { id: 'l2', timestamp: '12:00:02', tag: '[ERROR]', text: 'boom' },
  ];
  renderConsole({ processLogs: logs });
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  const errors = screen.getByRole('button', { name: 'Errors' });
  expect(errors).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(errors);
  expect(errors).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText('boom')).not.toBeInTheDocument();
  expect(screen.getByText('thinking hard')).toBeInTheDocument();
});

test('search input filters the stream', () => {
  const logs = [
    { id: 'l1', timestamp: '12:00:01', tag: '[AGENT]', text: 'thinking hard' },
    { id: 'l2', timestamp: '12:00:02', tag: '[ERROR]', text: 'timeout boom' },
  ];
  renderConsole({ processLogs: logs });
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  const input = screen.getByLabelText('Filter logs');
  fireEvent.change(input, { target: { value: 'timeout' } });
  expect(screen.getByText('timeout boom')).toBeInTheDocument();
  expect(screen.queryByText('thinking hard')).not.toBeInTheDocument();
});

test('stream renders process logs, messages and empty notice', () => {
  const logs = [{ id: 'l1', timestamp: '12:00:01', tag: '[INFO]', text: 'dispatch' }];
  const { unmount } = renderConsole({
    processLogs: logs,
    messages: [{ id: 'm1', content: 'hello' }],
  });
  expect(screen.getByText('dispatch')).toBeInTheDocument();
  expect(screen.getByText('hello')).toBeInTheDocument();
  unmount();

  renderConsole();
  expect(screen.getByText('No activity logs matching current filter.')).toBeInTheDocument();
});

test('copy and clear actions fire handlers', () => {
  const handleCopyLogs = vi.fn();
  const clearLogs = vi.fn();
  renderConsole({}, { handleCopyLogs, clearLogs });
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  fireEvent.click(screen.getByLabelText('Copy logs'));
  expect(handleCopyLogs).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByLabelText('Clear logs'));
  expect(clearLogs).toHaveBeenCalledTimes(1);
});

test('copied state shows confirmation label', () => {
  renderConsole({}, { copiedLogs: true });
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  expect(screen.getByLabelText('Copied to clipboard')).toBeInTheDocument();
});

test('streaming indicator shows while the agent runs', () => {
  renderConsole({}, { isAgentRunning: true });
  expect(screen.getByText('Streaming...')).toBeInTheDocument();
});

test('console frame uses the shared dark terminal chrome', () => {
  const logs = [{ id: 'l1', timestamp: '12:00:01', tag: '[INFO]', text: 'dispatch' }];
  renderConsole({ processLogs: logs });
  const bar = screen.getByTestId('activity-console-bar');
  expect(bar.className).toContain(CONSOLE_CHROME.outerBg);
  expect(bar.className).toContain(CONSOLE_CHROME.headerBorder);

  const header = screen
    .getByText('Live Agent Activity Console')
    .closest('div.h-9');
  expect(header.className).toContain(CONSOLE_CHROME.headerBg);
  expect(header.className).toContain(CONSOLE_CHROME.headerBorder);
  expect(screen.getByText('Live Agent Activity Console').className).toContain(
    CONSOLE_CHROME.headerText,
  );
});

test('auto-scroll toggle uses the shared chrome states', () => {
  const logs = [{ id: 'l1', timestamp: '12:00:01', tag: '[INFO]', text: 'dispatch' }];
  renderConsole({ processLogs: logs });
  // autoScroll defaults to on; each shared state token must be present.
  const toggle = screen.getByRole('button', { name: /Auto-scroll ON/i });
  for (const token of CONSOLE_CHROME.autoScrollOn.split(' ')) {
    expect(toggle.className).toContain(token);
  }
  fireEvent.click(toggle);
  const offToggle = screen.getByRole('button', { name: /Auto-scroll OFF/i });
  for (const token of CONSOLE_CHROME.autoScrollOff.split(' ')) {
    expect(offToggle.className).toContain(token);
  }
});

test('footer lane matches the dark terminal chrome', () => {
  // Tool cards and assistant messages sit inside the dark console frame, so
  // their surfaces must be dark too — a light card inside the terminal frame
  // is the "weird interface" this alignment removes.
  renderConsole({
    messages: [{ id: 'm1', content: 'hello' }],
    toolCalls: [{ id: 'tc1', toolName: 'bash', args: {}, logs: [], status: 'executing' }],
  });
  expect(screen.getByText('hello').className).toContain('bg-[#0b0f1a]');
  expect(screen.getByText('hello').className).toContain('text-slate-200');
  const cardLabel = screen.getByText(/bash/);
  expect(cardLabel.closest('div.my-4').className).toContain(CONSOLE_CHROME.headerBg);
  expect(screen.queryByText('No activity logs matching current filter.')).not.toBeInTheDocument();
});

test('renders an empty console when list props are omitted', () => {
  // Callers (and the stream hook before first load) may pass nothing — the
  // console must show the empty notice, never throw.
  renderConsole({}, { processLogs: undefined, messages: undefined, toolCalls: undefined });
  expect(screen.getByText('No activity logs matching current filter.')).toBeInTheDocument();
});

test('legacy board tag migrates to the errors lane', () => {
  window.localStorage.setItem('kainbain:board:logTag', JSON.stringify('ERROR'));
  const logs = [
    { id: 'l1', timestamp: '12:00:01', tag: '[AGENT]', text: 'thinking hard' },
    { id: 'l2', timestamp: '12:00:02', tag: '[ERROR]', text: 'boom' },
  ];
  renderConsole({ processLogs: logs });
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  expect(screen.getByRole('button', { name: 'Errors' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Direct output' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByText('boom')).toBeInTheDocument();
  expect(screen.queryByText('thinking hard')).not.toBeInTheDocument();
});
