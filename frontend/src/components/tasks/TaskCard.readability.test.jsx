// jsdom pin: matches TaskCard.test.jsx select/option semantics; keep on jsdom.
// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import { renderWithKainBain } from '../../testUtils';
import '@testing-library/jest-dom';

/***
 * MARK: TaskCard readability tests
 * @description Pins the task-list readability pass: the goal title (the
 *   card's key fact) renders larger and semibold, the meta row reads at
 *   10px, and the status renders as a chip carrying both a colour dot and a
 *   text label — never colour alone.
 */
const task = { id: 'abc-1234-def', goal: 'Build the API', timeInStage: '2m' };

const FULL_CARD_PREFS = { uiPreferences: { taskCardDensity: 'default' } };

test('goal title is prominent and still line-clamped', () => {
  renderWithKainBain(<TaskCard task={task} stageName="Idea" role="Agent" />, FULL_CARD_PREFS);
  const title = screen.getByText('Build the API');
  expect(title.className).toContain('text-sm');
  expect(title.className).toContain('font-semibold');
  expect(title.className).toContain('line-clamp-2');
});

test('compact card keeps the prominent title with a one-line clamp', () => {
  renderWithKainBain(<TaskCard task={task} stageName="Idea" role="Agent" />, {
    uiPreferences: { taskCardDensity: 'compact' },
  });
  const title = screen.getByText('Build the API');
  expect(title.className).toContain('text-sm');
  expect(title.className).toContain('font-semibold');
  expect(title.className).toContain('line-clamp-1');
});

test('meta row reads at 10px with the pace age inline', () => {
  renderWithKainBain(<TaskCard task={task} stageName="Idea" role="Agent" />, FULL_CARD_PREFS);
  const age = screen.getByTestId('task-stage-age');
  expect(age.parentElement.className).toContain('text-[10px]');
  expect(age.parentElement.className).toContain('justify-between');
});

test('status renders as a chip with both a colour dot and a text label', () => {
  renderWithKainBain(<TaskCard task={task} stageName="Idea" role="agent" />, FULL_CARD_PREFS);
  const status = screen.getByText('AGENT_READY');
  // Chip container shared with the card's other badges.
  expect(status.className).toContain('rounded-sm');
  expect(status.className).toContain('bg-surface-container-high/50');
  expect(status.className).toContain('border');
  // Colour AND text: the dot carries the hue, the label the words.
  const dot = status.querySelector('span');
  expect(dot).not.toBeNull();
  expect(dot.className).toMatch(/bg-(primary|secondary|error|warning)/);
  expect(status).toHaveTextContent('AGENT_READY');
});

test('failed status keeps its colour and label inside the chip', () => {
  renderWithKainBain(
    <TaskCard
      task={{ ...task, status: 'failed', failureReason: 'boom' }}
      stageName="Idea"
      role="Agent"
    />,
    FULL_CARD_PREFS,
  );
  const status = screen.getByText('FAILED');
  expect(status.className).toContain('rounded-sm');
  expect(status.className).toContain('text-error');
});
