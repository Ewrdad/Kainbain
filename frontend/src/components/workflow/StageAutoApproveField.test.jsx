import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StageAutoApproveField } from './StageAutoApproveField';
import { StageTypeConfig } from './StageTypeConfig';
import '@testing-library/jest-dom';

const DAY_MS = 24 * 60 * 60 * 1000;

/***
 * MARK: StageAutoApproveField tests
 * @description Pins the human-stage auto-approve timer row: off by default,
 *   enable commits a 7-day hold, disable clears it, stored milliseconds
 *   render as an amount + unit split, edits commit whole milliseconds
 *   rounded up (never shortened), and invalid or out-of-range input warns
 *   without corrupting the stored hold.
 ***/

function setup(props = {}) {
  const onChange = vi.fn();
  render(<StageAutoApproveField stageName="Legal review" value={undefined} onChange={onChange} {...props} />);
  return { onChange };
}

function checkbox() {
  return screen.getByLabelText('Automatically approve tasks in Legal review after a hold');
}

function amountInput() {
  return screen.getByLabelText('Auto-approve hold amount for Legal review');
}

function unitTrigger() {
  return screen.getByRole('combobox', { name: 'Auto-approve hold unit for Legal review' });
}

describe('StageAutoApproveField', () => {
  test('is off by default: unchecked, no amount input, off copy shown', () => {
    setup();
    expect(checkbox()).not.toBeChecked();
    expect(screen.queryByLabelText('Auto-approve hold amount for Legal review')).not.toBeInTheDocument();
    expect(screen.getByText(/Off — tasks wait here until a person approves or rejects\./)).toBeInTheDocument();
  });

  test('a zero hold reads as off', () => {
    setup({ value: 0 });
    expect(checkbox()).not.toBeChecked();
    expect(screen.queryByLabelText('Auto-approve hold amount for Legal review')).not.toBeInTheDocument();
  });

  test('enabling commits a 7-day hold', () => {
    const { onChange } = setup();
    fireEvent.click(checkbox());
    expect(onChange).toHaveBeenCalledWith(7 * DAY_MS);
  });

  test('disabling commits undefined (off)', () => {
    const { onChange } = setup({ value: DAY_MS });
    fireEvent.click(checkbox());
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test('stored milliseconds render as an amount + unit split', () => {
    setup({ value: DAY_MS });
    expect(checkbox()).toBeChecked();
    expect(amountInput()).toHaveValue(1);
    expect(unitTrigger()).toHaveTextContent('Days');
  });

  test('a 90-minute hold renders as 90 minutes, not fractional hours', () => {
    setup({ value: 90 * 60000 });
    expect(amountInput()).toHaveValue(90);
    expect(unitTrigger()).toHaveTextContent('Minutes');
  });

  test('a human string hold renders split too', () => {
    setup({ value: '10 days' });
    expect(checkbox()).toBeChecked();
    expect(amountInput()).toHaveValue(10);
    expect(unitTrigger()).toHaveTextContent('Days');
  });

  test('editing the amount commits whole milliseconds', () => {
    const { onChange } = setup({ value: DAY_MS });
    fireEvent.change(amountInput(), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(2 * DAY_MS);
  });

  test('switching the unit keeps the amount and commits the converted hold', () => {
    const { onChange } = setup({ value: DAY_MS });
    fireEvent.click(unitTrigger());
    fireEvent.click(screen.getByRole('option', { name: 'Hours' }));
    expect(onChange).toHaveBeenCalledWith(3600000);
  });

  test('fractional input rounds UP so the hold never shortens', () => {
    const { onChange } = setup({ value: 3600000 });
    fireEvent.click(unitTrigger());
    fireEvent.click(screen.getByRole('option', { name: 'Hours' }));
    fireEvent.change(amountInput(), { target: { value: '1.1' } });
    // 1.1h is 3960000.0000000005ms in floating point — ceil keeps it whole
    // and never below the typed hold.
    expect(onChange).toHaveBeenCalledWith(3960001);
  });

  test('invalid input warns and leaves the stored hold unchanged', () => {
    const { onChange } = setup({ value: DAY_MS });
    fireEvent.change(amountInput(), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter a positive number — the stored hold is unchanged\./)).toBeInTheDocument();
  });

  test('a sub-minute hold warns that saving will be rejected', () => {
    setup({ value: 30000 });
    expect(checkbox()).toBeChecked();
    expect(screen.getByText(/Shorter than the 1 minute minimum/)).toBeInTheDocument();
  });

  test('an over-maximum hold warns that saving will be rejected', () => {
    setup({ value: 400 * DAY_MS });
    expect(screen.getByText(/Longer than the 365 day maximum/)).toBeInTheDocument();
  });

  test('a valid hold summarizes the wait in words', () => {
    setup({ value: 10 * DAY_MS });
    expect(screen.getByText(/Tasks waiting here auto-approve after 10 days\./)).toBeInTheDocument();
  });
});

describe('StageTypeConfig - human auto-approve timer', () => {
  const humanStage = { id: 'h-1', name: 'Legal review', type: 'human', prompt: 'Check' };
  const agentStage = { id: 'a-1', name: 'Elaborate', type: 'agent', prompt: 'Do' };

  test('human stages render the auto-approve timer', () => {
    render(<StageTypeConfig stage={humanStage} onUpdateStage={vi.fn()} />);
    expect(
      screen.getByLabelText('Automatically approve tasks in Legal review after a hold'),
    ).toBeInTheDocument();
  });

  test('human timer commits through onUpdateStage as autoApproveAfterMs', () => {
    const onUpdate = vi.fn();
    render(<StageTypeConfig stage={humanStage} onUpdateStage={onUpdate} />);
    fireEvent.click(screen.getByLabelText('Automatically approve tasks in Legal review after a hold'));
    expect(onUpdate).toHaveBeenCalledWith('h-1', { autoApproveAfterMs: 7 * DAY_MS });
  });

  test('non-human stages do not render the auto-approve timer', () => {
    render(<StageTypeConfig stage={agentStage} onUpdateStage={vi.fn()} />);
    expect(
      screen.queryByLabelText('Automatically approve tasks in Elaborate after a hold'),
    ).not.toBeInTheDocument();
  });
});
