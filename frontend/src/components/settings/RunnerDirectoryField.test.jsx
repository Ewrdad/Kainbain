import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunnerDirectoryField } from './RunnerDirectoryField';

const baseProps = () => ({
  label: 'Master directory:',
  testId: 'runner-masterdir-r1',
  value: '/srv/kb',
  hint: '/srv/kb',
  isDefault: false,
  isUnknown: false,
  error: null,
  busy: false,
  onChange: () => {},
  onSave: () => {},
});

/***
 * MARK: RunnerDirectoryField tests
 * @description Covers the extracted directory row: value/hint rendering,
 *   the Runner-default label (including the unknown-folders suffix),
 *   inline error reporting, and the save/change wiring.
 ***/
describe('RunnerDirectoryField', () => {
  it('renders the current value with the effective folder as hint', () => {
    render(<RunnerDirectoryField {...baseProps()} />);
    const input = screen.getByTestId('runner-masterdir-r1');
    expect(input).toHaveValue('/srv/kb');
    expect(input).toHaveAttribute('placeholder', '/srv/kb');
    expect(screen.queryByText(/Runner default/)).toBeNull();
  });

  it('labels the Runner default and flags unknown Runner folders', () => {
    const { rerender } = render(<RunnerDirectoryField {...baseProps()} isDefault />);
    expect(screen.getByText(/Runner default/)).toBeTruthy();
    expect(screen.queryByText(/unknown/)).toBeNull();
    rerender(<RunnerDirectoryField {...baseProps()} isDefault isUnknown />);
    expect(screen.getByText(/unknown/)).toBeTruthy();
  });

  it('reports an inline error with an alert role', () => {
    render(<RunnerDirectoryField {...baseProps()} error="Enter a directory path." />);
    const error = screen.getByTestId('runner-masterdir-r1-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('Enter a directory path.');
  });

  it('saves on click and forwards typed values', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<RunnerDirectoryField {...baseProps()} onChange={onChange} onSave={onSave} />);
    fireEvent.change(screen.getByTestId('runner-masterdir-r1'), {
      target: { value: '/srv/new-master' },
    });
    expect(onChange).toHaveBeenCalledWith('/srv/new-master');
    fireEvent.click(screen.getByTestId('runner-masterdir-r1-save'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('disables save while busy', () => {
    render(<RunnerDirectoryField {...baseProps()} busy />);
    expect(screen.getByTestId('runner-masterdir-r1-save')).toBeDisabled();
  });
});
