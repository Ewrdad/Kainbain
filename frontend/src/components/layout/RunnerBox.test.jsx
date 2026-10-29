import { expect, test, vi } from 'vitest';
import { screen, fireEvent, within, cleanup } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { renderWithKainBain } from '../../testUtils';
import { RunnerBox } from './RunnerBox';

/***
 * MARK: RunnerBox tests
 * @description The compact box: name/task/stage/status word, colour per
 * status, click opens the inspector, idle boxes are display-only panels,
 * long names truncate with the full value on title.
 ***/

const runningEntry = {
  runnerId: 'bravo',
  runnerLabel: 'Bravo',
  taskId: 't1',
  task: { id: 't1', goal: 'Ship it', title: 'Ship it' },
  taskTitleFirstLine: 'Ship it',
  stageName: 'Plan',
  statusWord: 'running',
};

function renderBox(entry = runningEntry, onOpenTask = () => {}) {
  return renderWithKainBain(<RunnerBox entry={entry} onOpenTask={onOpenTask} />, {});
}

test('renders runner name, task name, stage, and status word with health colour', () => {
  renderBox();
  const box = screen.getByTestId('runner-box-bravo');
  expect(box.tagName).toBe('BUTTON');
  expect(box).toHaveTextContent('Bravo');
  expect(box).toHaveTextContent('Ship it');
  expect(box).toHaveTextContent('Stage: Plan');
  // Colour is never the sole signal: the status word renders as text.
  expect(box).toHaveTextContent('RUNNING');
  expect(box.getAttribute('aria-label')).toBe('Runner Bravo, running, task Ship it, stage Plan');
});

test('failed status renders the error colour and word', () => {
  renderBox({ ...runningEntry, statusWord: 'failed' });
  const box = screen.getByTestId('runner-box-bravo');
  expect(box).toHaveTextContent('FAILED');
  expect(box.innerHTML).toContain('bg-error');
});

test('clicking a task box opens that task in the inspector', () => {
  const onOpenTask = vi.fn();
  renderBox(runningEntry, onOpenTask);
  fireEvent.click(screen.getByTestId('runner-box-bravo'));
  expect(onOpenTask).toHaveBeenCalledTimes(1);
  expect(onOpenTask).toHaveBeenCalledWith(runningEntry.task);
});

test('a box without a task is a greyed-out idle panel, not a button', () => {
  const onOpenTask = vi.fn();
  renderWithKainBain(
    <RunnerBox
      entry={{
        runnerId: 'solo',
        runnerLabel: 'Solo',
        task: null,
        taskId: null,
        taskTitleFirstLine: null,
        stageName: null,
        statusWord: 'idle',
      }}
      onOpenTask={onOpenTask}
    />,
    {},
  );
  const box = screen.getByTestId('runner-box-solo');
  expect(box.tagName).toBe('DIV');
  expect(box).toHaveTextContent('Solo');
  expect(box).toHaveTextContent('idle');
  expect(box.className).toContain('opacity-60');
  // Display-only: no click handler fires.
  fireEvent.click(box);
  expect(onOpenTask).not.toHaveBeenCalled();
});

test('blank runner id and label fail closed to unknown instead of empty', () => {
  renderBox({ ...runningEntry, runnerId: '   ', runnerLabel: '   ' });
  const box = screen.getByTestId('runner-box-unknown');
  expect(box).toHaveTextContent('unknown');
  expect(box.getAttribute('aria-label')).toBe('Runner unknown, running, task Ship it, stage Plan');
});

test('untrimmed and non-string status words normalise so dot, word, and aria agree', () => {
  renderBox({ ...runningEntry, statusWord: '  running  ' });
  const padded = screen.getByTestId('runner-box-bravo');
  expect(padded).toHaveTextContent('RUNNING');
  expect(padded.getAttribute('aria-label')).toBe('Runner Bravo, running, task Ship it, stage Plan');
  expect(padded.innerHTML).toContain('bg-[#7bdb85]');
  cleanup();

  // A non-string status used to miss the colour map while the label read
  // something else — now every channel agrees on idle.
  renderBox({ ...runningEntry, statusWord: 5 });
  const coerced = screen.getByTestId('runner-box-bravo');
  expect(coerced).toHaveTextContent('IDLE');
  expect(coerced.getAttribute('aria-label')).toBe('Runner Bravo, idle, task Ship it, stage Plan');
  expect(coerced.innerHTML).toContain('bg-text-muted');
  cleanup();
});

test('case-variant status words still colour the dot to match the word', () => {
  renderBox({ ...runningEntry, statusWord: 'RUNNING' });
  const box = screen.getByTestId('runner-box-bravo');
  expect(box).toHaveTextContent('RUNNING');
  expect(box.getAttribute('aria-label')).toBe('Runner Bravo, running, task Ship it, stage Plan');
  expect(box.innerHTML).toContain('bg-[#7bdb85]');
  cleanup();
});

test('non-string stage and task values fail closed instead of leaking objects', () => {
  renderBox({ ...runningEntry, taskTitleFirstLine: { text: 'Ship it' }, stageName: 42 });
  const box = screen.getByTestId('runner-box-bravo');
  expect(box).toHaveTextContent('Untitled Task');
  expect(box).toHaveTextContent('—');
  expect(box.innerHTML).not.toContain('[object Object]');
  expect(box.getAttribute('aria-label')).toBe('Runner Bravo, running');
  // A junk stage value leaves no stray tooltip on the dash line.
  expect(within(box).getByText('—').getAttribute('title')).toBeNull();
});

test('missing stage renders an em dash and long names keep full titles', () => {
  const longName = `Runner with a very long name ${'x'.repeat(300)}`;
  const longTask = `Task with a very long title ${'y'.repeat(300)}`;
  renderBox({
    ...runningEntry,
    runnerLabel: longName,
    taskTitleFirstLine: longTask,
    stageName: null,
  });
  const box = screen.getByTestId('runner-box-bravo');
  expect(box).toHaveTextContent('—');
  expect(within(box).queryByText(/Stage:/)).not.toBeInTheDocument();
  // Truncated on screen (CSS) but the full value survives on title.
  const nameLine = screen.getByTitle(longName.slice(0, 239) + '…');
  expect(nameLine).toHaveTextContent(longName.slice(0, 20));
  expect(screen.getByTitle(longTask.slice(0, 239) + '…')).toBeInTheDocument();
});

test('an idle panel never disagrees with its own status word', () => {
  // A hand-injected entry with no task but a non-idle word used to paint a
  // red dot beside the word `idle`: the panel is idle, so every channel
  // (dot, visible word, aria label) must read idle/grey.
  renderBox({
    runnerId: 'solo',
    runnerLabel: 'Solo',
    task: null,
    taskId: null,
    taskTitleFirstLine: null,
    stageName: null,
    statusWord: 'failed',
  });
  const box = screen.getByTestId('runner-box-solo');
  expect(box).toHaveTextContent('idle');
  expect(box.innerHTML).toContain('bg-text-muted');
  expect(box.innerHTML).not.toContain('bg-error');
  expect(box.getAttribute('aria-label')).toBe('Runner Solo, idle');
});

test('a whitespace-only task title falls back to Untitled Task', () => {
  renderBox({ ...runningEntry, taskTitleFirstLine: '   ' });
  const box = screen.getByTestId('runner-box-bravo');
  expect(box).toHaveTextContent('Untitled Task');
});
