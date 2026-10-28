import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { RetryTimeoutsSection } from './RetryTimeoutsSection';
import '@testing-library/jest-dom';

/***
 * MARK: RetryTimeoutsSection tests
 * @description Verifies the extracted Retry & Timeouts section renders
 *   prefilled drafts, calls its setters on change, and shows inline errors.
 ***/
describe('RetryTimeoutsSection', () => {
  const baseProps = {
    maxAutoIterations: '3',
    setMaxAutoIterations: vi.fn(),
    maxTransientRetries: '',
    setMaxTransientRetries: vi.fn(),
    autoIterationEnabled: 'disabled',
    setAutoIterationEnabled: vi.fn(),
    agentTimeoutMs: '30',
    setAgentTimeoutMs: vi.fn(),
    ciTimeoutMs: '',
    setCiTimeoutMs: vi.fn(),
    mergeTimeoutMs: '',
    setMergeTimeoutMs: vi.fn(),
    retryErrors: {},
    validationError: '',
  };

  it('renders prefilled drafts and the tri-state switch', () => {
    renderWithKainBain(<RetryTimeoutsSection {...baseProps} />);
    expect(screen.getByText('Retry & Timeouts')).toBeInTheDocument();
    expect(screen.getByLabelText('Max auto-iterations')).toHaveValue(3);
    expect(screen.getByLabelText('Max transient retries')).toHaveValue(null);
    expect(screen.getByLabelText('Automatic iteration')).toHaveValue('disabled');
    expect(screen.getByLabelText('Agent stage timeout (minutes)')).toHaveValue(30);
    expect(screen.getByLabelText('Merge stage timeout (minutes)')).toHaveValue(null);
  });

  it('calls setters on change', () => {
    const props = {
      ...baseProps,
      setMaxAutoIterations: vi.fn(),
      setAutoIterationEnabled: vi.fn(),
      setCiTimeoutMs: vi.fn(),
    };
    renderWithKainBain(<RetryTimeoutsSection {...props} />);
    fireEvent.change(screen.getByLabelText('Max auto-iterations'), {
      target: { value: '5' },
    });
    expect(props.setMaxAutoIterations).toHaveBeenCalledWith('5');
    fireEvent.change(screen.getByLabelText('Automatic iteration'), {
      target: { value: 'enabled' },
    });
    expect(props.setAutoIterationEnabled).toHaveBeenCalledWith('enabled');
    fireEvent.change(screen.getByLabelText('CI stage timeout (minutes)'), {
      target: { value: '1.5' },
    });
    expect(props.setCiTimeoutMs).toHaveBeenCalledWith('1.5');
  });

  it('shows inline field errors and the section-level alert', () => {
    renderWithKainBain(
      <RetryTimeoutsSection
        {...baseProps}
        retryErrors={{ maxAutoIterations: 'Max auto-iterations must be a whole number.' }}
        validationError="Retry & Timeouts: Max auto-iterations must be a whole number."
      />,
    );
    // The message surfaces twice (inline beside the field + once at the
    // section level), so match across every alert on the page.
    const alerts = screen.getAllByRole('alert');
    expect(
      alerts.some((alert) =>
        /Max auto-iterations must be a whole number/.test(alert.textContent || ''),
      ),
    ).toBe(true);
    expect(
      alerts.some((alert) =>
        /Retry & Timeouts: Max auto-iterations must be a whole number/.test(
          alert.textContent || '',
        ),
      ),
    ).toBe(true);
  });
});
