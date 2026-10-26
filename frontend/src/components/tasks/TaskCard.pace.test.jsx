import { expect, test, vi, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import { renderWithKainBain } from '../../testUtils';
import '@testing-library/jest-dom';

/***
 * MARK: TaskCard pace tests
 * @description Verifies the per-stage age readout and the green/amber/red
 * pace signal: each band in both card densities, the neutral no-average
 * state, excluded error statuses, and the tooltip that keeps colour from
 * being the only signal. Kept in its own file so parallel branches
 * extending TaskCard.test.jsx do not conflict.
 ***/

const NOW = Date.parse('2026-09-30T12:00:00Z');
const at = (secondsBeforeNow) => new Date(NOW - secondsBeforeNow * 1000).toISOString();

const COMPACT_PREFS = { uiPreferences: { taskCardDensity: 'compact', showTimeInStage: true } };
const FULL_PREFS = { uiPreferences: { taskCardDensity: 'default', showTimeInStage: true } };

function renderPace(task, role, prefs, extra = {}) {
  return renderWithKainBain(
    <TaskCard
      task={task}
      stageName={role === 'human' ? 'Review' : 'Work'}
      role={role}
      nowMs={NOW}
      {...extra}
    />,
    prefs,
  );
}

function age() {
  return screen.getByTestId('task-stage-age');
}

afterEach(() => {
  vi.useRealTimers();
});

test('compact running card shows short age tinted green when under average', () => {
  renderPace(
    { id: 't1', goal: 'Do work', enteredStageAt: at(10) },
    'agent',
    COMPACT_PREFS,
    { isActive: true, avgDurationSeconds: 100 },
  );
  expect(age()).toHaveTextContent('10s');
  expect(age()).toHaveAttribute('data-pace', 'under');
  expect(age().className).toMatch(/text-primary/);
});

test('full-density review card shows full timestamp tinted amber when near average', () => {
  renderPace(
    { id: 't2', goal: 'Needs review', enteredStageAt: at(80) },
    'human',
    FULL_PREFS,
    { avgDurationSeconds: 100 },
  );
  expect(age()).toHaveAttribute('data-pace', 'near');
  expect(age().className).toMatch(/text-warning/);
  expect(age().textContent).toMatch(/in stage/);
});

test('compact review card shows short age tinted red when over average', () => {
  const { container } = renderPace(
    { id: 't3', goal: 'Stuck in review', enteredStageAt: at(150) },
    'human',
    COMPACT_PREFS,
    { avgDurationSeconds: 100 },
  );
  expect(age()).toHaveTextContent('2m');
  expect(age()).toHaveAttribute('data-pace', 'over');
  expect(age().className).toMatch(/text-error/);
  const dot = container.querySelector('span.rounded-full.bg-error');
  expect(dot).not.toBeNull();
});

test('running task without a usable average renders neutral, never coloured', () => {
  for (const avg of [undefined, 0, -5]) {
    const { unmount } = renderPace(
      { id: 't4', goal: 'No samples yet', enteredStageAt: at(50) },
      'agent',
      COMPACT_PREFS,
      { isActive: true, avgDurationSeconds: avg },
    );
    expect(age()).toHaveAttribute('data-pace', 'unknown');
    expect(age().className).toMatch(/text-text-muted/);
    expect(age().className).not.toMatch(/text-warning|text-error/);
    unmount();
  }
});

test('failed and blocked tasks keep their error signals with no pace colour', () => {
  const { unmount } = renderPace(
    { id: 't5', goal: 'Failed run', status: 'failed', enteredStageAt: at(200) },
    'agent',
    COMPACT_PREFS,
    { isActive: true, avgDurationSeconds: 100 },
  );
  expect(age()).toHaveAttribute('data-pace', 'unknown');
  expect(screen.getByText('FAILED')).toBeInTheDocument();
  unmount();

  renderPace(
    { id: 't6', goal: 'Blocked run', isBlocked: true, enteredStageAt: at(200) },
    'agent',
    COMPACT_PREFS,
    { isActive: true, avgDurationSeconds: 100 },
  );
  expect(age()).toHaveAttribute('data-pace', 'unknown');
});

test('idle tasks show a neutral age with no tooltip wrapper', () => {
  const { container } = renderPace(
    { id: 't7', goal: 'Waiting work', enteredStageAt: at(300) },
    'agent',
    COMPACT_PREFS,
    { avgDurationSeconds: 100 },
  );
  expect(age()).toHaveTextContent('5m');
  expect(age()).toHaveAttribute('data-pace', 'unknown');
  // No InfoTooltip wrapper: the age span sits directly in the meta row.
  expect(age().parentElement.className).toMatch(/justify-between/);
  expect(container.textContent).not.toMatch(/stage average/);
});

test('pace tooltip explains elapsed versus average on hover', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  renderPace(
    { id: 't8', goal: 'Slow review', enteredStageAt: at(150) },
    'human',
    COMPACT_PREFS,
    { avgDurationSeconds: 100 },
  );
  // Hover the tooltip trigger (the age span's wrapper), then let the delayed
  // reveal fire.
  fireEvent.mouseEnter(age().parentElement);
  act(() => {
    vi.advanceTimersByTime(1100);
  });
  expect(screen.getByText('Over stage average')).toBeInTheDocument();
  expect(screen.getByText(/2m 30s in stage vs 1m 40s average/)).toBeInTheDocument();
});

test('compact card hides the age when the time-in-stage preference is off', () => {
  renderPace({ id: 't9', goal: 'Hidden age', enteredStageAt: at(60) }, 'agent', {
    uiPreferences: { taskCardDensity: 'compact', showTimeInStage: false },
  });
  expect(screen.queryByTestId('task-stage-age')).not.toBeInTheDocument();
});
