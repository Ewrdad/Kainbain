import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCard } from './ToolCard';
import '@testing-library/jest-dom';

/**
 * MARK: ToolCard tests
 * @description Verifies the tool-execution card renders the tool name,
 *   formatted arguments, logs, and execution status.
 */
test('renders tool name, arguments and logs', () => {
  const toolCall = {
    id: 'tool-1',
    toolName: 'bash',
    args: { cmd: 'ls -la' },
    logs: ['line one', 'line two'],
    status: 'completed',
  };
  render(<ToolCard toolCall={toolCall} />);
  expect(screen.getByText(/bash/)).toBeInTheDocument();
  expect(screen.getByText(/cmd="ls -la"/)).toBeInTheDocument();
  expect(screen.getByText('line one')).toBeInTheDocument();
  expect(screen.getByText('line two')).toBeInTheDocument();
  expect(screen.getByText('Completed')).toBeInTheDocument();
});

test('shows executing status with an empty body until output arrives', () => {
  const toolCall = {
    id: 'tool-2',
    toolName: 'read',
    args: {},
    logs: [],
    status: 'executing',
  };
  render(<ToolCard toolCall={toolCall} />);
  expect(screen.getByText(/Executing\.\.\./)).toBeInTheDocument();
  // Survey Q2: show nothing until output arrives — no stuck waiting text.
  expect(screen.queryByText(/Waiting for output\.\.\./)).not.toBeInTheDocument();
  // Header (tool name + args) still renders with empty logs.
  expect(screen.getByText(/read/)).toBeInTheDocument();
  expect(screen.getByText(/no arguments/)).toBeInTheDocument();
});

test('formats no arguments', () => {
  const toolCall = { id: 'tool-3', toolName: 'bash', args: {}, logs: [], status: 'executing' };
  render(<ToolCard toolCall={toolCall} />);
  expect(screen.getByText(/no arguments/)).toBeInTheDocument();
});

test('never crashes when logs or id are missing', () => {
  // In-flight backend payloads may omit logs/id; the card must render its
  // header and an empty body instead of throwing.
  const { unmount } = render(
    <ToolCard toolCall={{ toolName: 'read', args: {}, status: 'executing' }} />,
  );
  expect(screen.getByText(/read/)).toBeInTheDocument();
  expect(screen.queryByText(/Waiting for output\.\.\./)).not.toBeInTheDocument();
  unmount();

  render(<ToolCard toolCall={{ toolName: 'read', args: {}, logs: null, status: 'executing' }} />);
  expect(screen.getByText(/read/)).toBeInTheDocument();
  expect(screen.queryByText(/Waiting for output\.\.\./)).not.toBeInTheDocument();
});

test('never crashes when the whole tool call is missing', () => {
  render(<ToolCard />);
  expect(screen.getByText(/unknown tool/)).toBeInTheDocument();
});

test('renders non-string log lines without crashing', () => {
  // Backend payloads can carry numbers, null, or objects as log lines —
  // rendering them raw would crash React, so the card coerces them to text.
  render(
    <ToolCard
      toolCall={{
        id: 'tool-4',
        toolName: 'read',
        args: {},
        status: 'completed',
        logs: ['ok', 42, null, { text: 'structured' }],
      }}
    />,
  );
  expect(screen.getByText('ok')).toBeInTheDocument();
  expect(screen.getByText('42')).toBeInTheDocument();
  expect(screen.getByText('null')).toBeInTheDocument();
  expect(screen.getByText('{"text":"structured"}')).toBeInTheDocument();
  expect(screen.queryByText(/Waiting for output\.\.\./)).not.toBeInTheDocument();
});

test('formats arguments that JSON cannot stringify', () => {
  // BigInt and circular objects throw in JSON.stringify — one exotic
  // argument must not break the whole card.
  const circularArgs = { name: 'x' };
  circularArgs.self = circularArgs;
  render(
    <ToolCard
      toolCall={{ id: 'tool-5', toolName: 'write', args: circularArgs, logs: [], status: 'executing' }}
    />,
  );
  expect(screen.getByText(/write/)).toBeInTheDocument();
  expect(screen.getByText(/self=/)).toBeInTheDocument();
});
