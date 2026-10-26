import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ReportNavigator } from './ReportNavigator';

/***
 * MARK: ReportNavigator tests
 * @description Verifies the responsive report chooser: both presentations
 *   render, the mobile `<select>` exposes the AUTO/unresolved markers and
 *   dispatches the report path, the desktop list highlights the selected
 *   report across `./` spellings, and empty/malformed inputs fail safe.
 */
const REPORTS = [
  {
    path: './docs/tasks/t-1/IMPLEMENTATION_PLAN.md',
    filename: 'IMPLEMENTATION_PLAN.md',
    stageName: 'Plan',
    auto: true,
    timestamp: '20261012-071931',
  },
  {
    path: './docs/tasks/t-1/REVIEW.md',
    filename: 'REVIEW.md',
    stageName: 'Review',
    auto: false,
    timestamp: '20261012-080000',
  },
];

const counts = new Map([['docs/tasks/t-1/REVIEW.md', 2]]);

describe('ReportNavigator', () => {
  it('renders the mobile picker and the desktop list, one entry per report', () => {
    render(
      <ReportNavigator
        reports={REPORTS}
        activeReportPath={REPORTS[0].path}
        commentCounts={counts}
      />,
    );
    const picker = screen.getByTestId('report-review-picker');
    expect(picker.tagName).toBe('SELECT');
    expect(within(picker).getAllByRole('option')).toHaveLength(2);

    const list = screen.getByTestId('report-review-list');
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    // The mobile picker is labelled for assistive tech (label + aria-label).
    expect(picker.getAttribute('aria-label')).toBe('Select a stage report');
    expect(within(screen.getByTestId('report-review-list')).getByText('Reports (2)')).toBeTruthy();
  });

  it('labels options with the title plus AUTO and unresolved markers', () => {
    render(
      <ReportNavigator
        reports={REPORTS}
        activeReportPath={REPORTS[0].path}
        commentCounts={counts}
      />,
    );
    const options = within(screen.getByTestId('report-review-picker')).getAllByRole('option');
    expect(options[0].textContent).toBe('Plan • AUTO');
    expect(options[1].textContent).toBe('Review • 2 unresolved');
  });

  it('dispatches the report path when the mobile picker changes', () => {
    const onSelect = vi.fn();
    render(
      <ReportNavigator
        reports={REPORTS}
        activeReportPath={REPORTS[0].path}
        commentCounts={counts}
        onSelect={onSelect}
      />,
    );
    fireEvent.change(screen.getByTestId('report-review-picker'), {
      target: { value: REPORTS[1].path },
    });
    expect(onSelect).toHaveBeenCalledWith(REPORTS[1].path);
  });

  it('highlights the desktop entry across ./ and bare spellings', () => {
    render(
      <ReportNavigator
        reports={REPORTS}
        // Selection was stored bare while the report carries the `./` prefix.
        activeReportPath={REPORTS[1].path.replace(/^\.\//, '')}
        commentCounts={counts}
      />,
    );
    const buttons = within(screen.getByTestId('report-review-list')).getAllByRole('button');
    expect(buttons[0].getAttribute('aria-current')).toBeNull();
    expect(buttons[1].getAttribute('aria-current')).toBe('true');
  });

  it('selects the mobile picker option across ./ and bare spellings', () => {
    render(
      <ReportNavigator
        reports={REPORTS}
        activeReportPath={REPORTS[1].path.replace(/^\.\//, '')}
        commentCounts={counts}
      />,
    );
    const picker = screen.getByTestId('report-review-picker');
    expect(picker.value).toBe(REPORTS[1].path);
  });

  it('shows the unresolved count badge on the desktop entry', () => {
    render(
      <ReportNavigator
        reports={REPORTS}
        activeReportPath={REPORTS[0].path}
        commentCounts={counts}
      />,
    );
    expect(screen.getByTitle('2 unresolved comment(s)')).toBeTruthy();
  });

  it('renders nothing when there are no reports', () => {
    const { container } = render(<ReportNavigator reports={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('report-review-picker')).toBeNull();
    expect(screen.queryByTestId('report-review-list')).toBeNull();
  });

  it('still renders a fallback option for a report with no path', () => {
    const { container } = render(
      <ReportNavigator reports={[{ stageName: 'Plan' }]} activeReportPath={null} />,
    );
    expect(within(screen.getByTestId('report-review-picker')).getAllByRole('option')).toHaveLength(
      1,
    );
    expect(screen.getAllByRole('option')[0].textContent).toBe('Plan');
    expect(container).not.toBeEmptyDOMElement();
  });

  it('does not throw when no onSelect handler is supplied', () => {
    render(<ReportNavigator reports={REPORTS} activeReportPath={REPORTS[0].path} />);
    expect(() =>
      fireEvent.change(screen.getByTestId('report-review-picker'), {
        target: { value: REPORTS[1].path },
      }),
    ).not.toThrow();
  });
});
