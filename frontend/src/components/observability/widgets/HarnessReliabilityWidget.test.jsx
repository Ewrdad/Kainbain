import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { HarnessReliabilityWidget } from './HarnessReliabilityWidget';
import '@testing-library/jest-dom';

/***
 * MARK: HarnessReliabilityWidget tests
 * @description Verifies the monitor reliability widget: worst-first rows
 *   with rates and run counts, the "Needs attention" flag, honest
 *   no-data rows, and the pending / error / empty states.
 ***/

const healthyEntry = {
  harnessId: 'pi',
  runs: 40,
  successes: 40,
  infraFailures: 0,
  excludedRejected: 0,
  successRate: 100,
  lastRunAt: '2026-10-14T08:30:00Z',
  recent: { runs: 40, successes: 40, infraFailures: 0, excludedRejected: 0, successRate: 100 },
};

const failingEntry = {
  harnessId: 'custom',
  runs: 12,
  successes: 8,
  infraFailures: 4,
  excludedRejected: 1,
  successRate: 66.7,
  lastRunAt: '2026-10-14T09:00:00Z',
  recent: { runs: 12, successes: 8, infraFailures: 4, excludedRejected: 0, successRate: 66.7 },
};

const noDataEntry = {
  harnessId: 'muse',
  runs: 0,
  successes: 0,
  infraFailures: 0,
  excludedRejected: 3,
  successRate: null,
  lastRunAt: '2026-10-13T22:00:00Z',
  recent: { runs: 0, successes: 0, infraFailures: 0, excludedRejected: 3, successRate: null },
};

describe('HarnessReliabilityWidget', () => {
  it('renders one row per harness with rates, run counts, infra failures and last run', () => {
    render(<HarnessReliabilityWidget reliability={[healthyEntry, failingEntry]} />);

    const healthy = within(screen.getByTestId('reliability-row-pi'));
    expect(healthy.getByTestId('reliability-line-pi')).toHaveTextContent('All-time 100% · 40 runs');
    expect(healthy.getByText(/Last 10 runs/)).toHaveTextContent('100%');
    expect(healthy.getByText(/Infra fails/)).toHaveTextContent('0');

    const failing = within(screen.getByTestId('reliability-row-custom'));
    expect(failing.getByTestId('reliability-line-custom')).toHaveTextContent(
      'All-time 66.7% · 12 runs',
    );
    expect(failing.getByText(/Infra fails/)).toHaveTextContent('4');
    expect(failing.getByText(/Last run/)).not.toHaveTextContent('—');
  });

  it('shows a dash for a harness with no counted runs and never flags it', () => {
    render(<HarnessReliabilityWidget reliability={[noDataEntry]} />);

    const row = within(screen.getByTestId('reliability-row-muse'));
    // The consolidated line collapses both windows into the single honest
    // no-data wording for zero-run subjects (never a fake 0%).
    expect(row.getByTestId('reliability-line-muse')).toHaveTextContent('No reliability data yet');
    expect(row.getByTestId('reliability-line-muse')).not.toHaveTextContent('0%');
    expect(row.queryByTestId('reliability-flag-muse')).not.toBeInTheDocument();
  });

  it('sorts flagged harnesses worst-first and badges them as needing attention', () => {
    render(<HarnessReliabilityWidget reliability={[healthyEntry, failingEntry]} />);

    const rows = screen.getAllByTestId(/^reliability-row-/).map((node) => node.dataset.testid);
    expect(rows).toEqual(['reliability-row-custom', 'reliability-row-pi']);
    expect(screen.getByTestId('reliability-flag-custom')).toHaveTextContent('Needs attention');
    expect(screen.queryByTestId('reliability-flag-pi')).not.toBeInTheDocument();
  });

  it('shows the honest empty state when there is no reliability data at all', () => {
    render(<HarnessReliabilityWidget reliability={[]} />);

    expect(screen.getByTestId('harness-reliability-empty')).toHaveTextContent(
      'No reliability data yet',
    );
    expect(screen.queryByTestId('harness-reliability-error')).not.toBeInTheDocument();
  });

  it('shows a loading state while the first fetch is pending', () => {
    render(<HarnessReliabilityWidget reliability={[]} pending />);

    expect(screen.getByTestId('harness-reliability-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-reliability-empty')).not.toBeInTheDocument();
  });

  it('keeps showing rows while a refresh is pending', () => {
    render(<HarnessReliabilityWidget reliability={[healthyEntry]} pending />);

    expect(screen.getByTestId('reliability-row-pi')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-reliability-loading')).not.toBeInTheDocument();
  });

  it('skips malformed payload rows instead of crashing the widget', () => {
    render(
      <HarnessReliabilityWidget
        reliability={[null, undefined, 'oops', 42, healthyEntry, { runs: 10, successRate: 50 }]}
      />,
    );

    expect(screen.getByTestId('reliability-row-pi')).toBeInTheDocument();
    // A row without an id still renders once, under a stable fallback id.
    expect(screen.getByTestId('reliability-row-unknown-0')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-reliability-empty')).not.toBeInTheDocument();
  });

  it('defaults missing counts to zero in the row tooltip', () => {
    render(
      <HarnessReliabilityWidget
        reliability={[{ harnessId: 'sparse', runs: 6, successRate: 83.3 }]}
      />,
    );

    // The all-time tooltip lives on the all-time segment of the
    // consolidated line; missing counts still default to zero there.
    expect(screen.getByTestId('reliability-line-sparse-all-time')).toHaveAttribute(
      'title',
      expect.stringContaining('0 clean, 0 timeouts'),
    );
  });

  it('shows the fetch error with a retry button, keeping the last good rows', () => {
    const onRetry = vi.fn();
    render(
      <HarnessReliabilityWidget
        reliability={[healthyEntry]}
        error="Could not load harness reliability — check the connection."
        onRetry={onRetry}
      />,
    );

    const banner = screen.getByTestId('harness-reliability-error');
    expect(banner).toHaveTextContent('Could not load harness reliability');
    expect(screen.getByTestId('reliability-row-pi')).toBeInTheDocument();

    fireEvent.click(within(banner).getByRole('button', { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

/***
 * MARK: HarnessReliabilityWidget scroll region
 * @description The scrollable widget body is a keyboard-focusable, labelled
 *   group so keyboard users can scroll it (WCAG 2.1.1; axe
 *   scrollable-region-focusable).
 ***/
describe('HarnessReliabilityWidget scroll region', () => {
  it('exposes a focusable labelled group around the scrollable body', () => {
    render(<HarnessReliabilityWidget harnesses={[healthyEntry]} />);
    const widget = screen.getByTestId('harness-reliability-widget');
    expect(widget).toHaveAttribute('tabindex', '0');
    expect(widget).toHaveAttribute('role', 'group');
    expect(widget).toHaveAttribute('aria-label', 'Harness reliability list');
    expect(widget.className).toContain('overflow-y-auto');
  });
});
