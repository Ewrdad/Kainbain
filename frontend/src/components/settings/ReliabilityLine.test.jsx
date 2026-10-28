import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReliabilityLine, recentReliabilityTitle } from './ReliabilityLine';
import '@testing-library/jest-dom';

/***
 * MARK: ReliabilityLine tests
 * @description Focused coverage for the shared all-time + last-10 line:
 *   the temporary-blip vs structural-issue contrast, honest no-data states,
 *   pending precedence, and fail-safe handling of malformed payloads.
 ***/

const titles = { title: 'all-time tooltip', emptyTitle: 'empty tooltip' };

describe('ReliabilityLine', () => {
  it('renders all-time and last-10 figures side by side when showRecent', () => {
    // Temporary blip: healthy all-time, degraded recent.
    render(
      <ReliabilityLine
        testId="rel-blip"
        stats={{
          runs: 20,
          successes: 18,
          successRate: 90,
          recent: { runs: 10, successes: 7, infraFailures: 3, successRate: 70 },
        }}
        showRecent
        {...titles}
      />,
    );
    const line = screen.getByTestId('rel-blip');
    expect(line).toHaveTextContent('All-time 90% · 20 runs');
    expect(line).toHaveTextContent('Last 10 runs 70% · 10 runs');
    expect(screen.getByTestId('rel-blip-all-time')).toHaveAttribute('title', 'all-time tooltip');
    expect(screen.getByTestId('rel-blip-recent').getAttribute('title')).toMatch(/last 10 runs/i);
  });

  it('renders an honest recent placeholder when the recent window is empty', () => {
    render(
      <ReliabilityLine
        testId="rel-fresh"
        stats={{
          runs: 3,
          successes: 3,
          successRate: 100,
          recent: { runs: 0, successes: 0, infraFailures: 0, successRate: null },
        }}
        showRecent
        {...titles}
      />,
    );
    expect(screen.getByTestId('rel-fresh')).toHaveTextContent('All-time 100% · 3 runs');
    expect(screen.getByTestId('rel-fresh-recent')).toHaveTextContent('Last 10 runs: —');
  });

  it('never renders a fake 0% for subjects with no counted runs', () => {
    const { rerender } = render(
      <ReliabilityLine testId="rel-empty" stats={undefined} showRecent {...titles} />,
    );
    expect(screen.getByTestId('rel-empty')).toHaveTextContent('No reliability data yet');

    rerender(
      <ReliabilityLine
        testId="rel-empty"
        stats={{ runs: 0, successes: 0, successRate: null, recent: null }}
        showRecent
        {...titles}
      />,
    );
    expect(screen.getByTestId('rel-empty')).toHaveTextContent('No reliability data yet');
  });

  it('shows loading while pending and yields to real stats once present', () => {
    const { rerender } = render(
      <ReliabilityLine testId="rel-pending" stats={undefined} pending {...titles} />,
    );
    expect(screen.getByTestId('rel-pending')).toHaveTextContent('Loading reliability…');

    rerender(
      <ReliabilityLine
        testId="rel-pending"
        stats={{ runs: 5, successes: 5, successRate: 100 }}
        pending
        {...titles}
      />,
    );
    expect(screen.getByTestId('rel-pending')).toHaveTextContent('All-time 100% · 5 runs');
  });

  it('fails safe on malformed stats instead of crashing', () => {
    render(
      <ReliabilityLine
        testId="rel-malformed"
        stats={{ runs: 'many', successRate: 'high', recent: 'soon' }}
        showRecent
        {...titles}
      />,
    );
    // Non-numeric runs cannot form a rate: honest no-data, never NaN text.
    expect(screen.getByTestId('rel-malformed')).toHaveTextContent('No reliability data yet');
    expect(screen.getByTestId('rel-malformed')).not.toHaveTextContent('NaN');
  });

  it('falls back to canonical labels when overrides are blank', () => {
    render(
      <ReliabilityLine
        testId="rel-labels"
        stats={{
          runs: 10,
          successes: 9,
          successRate: 90,
          recent: { runs: 10, successes: 9, infraFailures: 1, successRate: 90 },
        }}
        showRecent
        label="   "
        recentLabel=""
        {...titles}
      />,
    );
    expect(screen.getByTestId('rel-labels')).toHaveTextContent('All-time 90% · 10 runs');
    expect(screen.getByTestId('rel-labels')).toHaveTextContent('Last 10 runs 90% · 10 runs');
  });
});

describe('recentReliabilityTitle', () => {
  it('describes the window counts and degrades to no-data wording', () => {
    expect(
      recentReliabilityTitle({ runs: 10, successes: 8, infraFailures: 2, successRate: 80 }),
    ).toMatch(/last 10 runs/i);
    expect(recentReliabilityTitle(null)).toBe('No runs recorded in the last 10 runs window yet.');
    expect(recentReliabilityTitle({ runs: 0, successRate: null })).toBe(
      'No runs recorded in the last 10 runs window yet.',
    );
  });
});
