// jsdom pin: this suite needs assignable navigator.clipboard mock (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi, beforeEach, afterEach, describe } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportViewer } from './ReportViewer';
import '@testing-library/jest-dom';

describe('ReportViewer component', () => {
  const mockReports = [
    {
      stageName: 'Plan',
      stageSlug: 'plan',
      path: './docs/tasks/task-1/plan-20260824T100000.md',
      filename: 'plan-20260824T100000.md',
      content: '# Plan Stage Report\n\n- Step 1: Design\n- Step 2: Implement',
      timestamp: '2026-08-24 10:00:00',
    },
    {
      stageName: 'Implementation',
      stageSlug: 'implementation',
      path: './docs/tasks/task-1/implementation-20260824T100500.md',
      filename: 'implementation-20260824T100500.md',
      content: '# Implementation Stage Report\n\nCode written in `src/app.js`.',
      timestamp: '2026-08-24 10:05:00',
    },
    {
      stageName: 'Review',
      stageSlug: 'review',
      path: './docs/tasks/task-1/review-20260824T101000.md',
      filename: 'review-20260824T101000.md',
      content: '# Review Report\n\nAll acceptance criteria met.',
      timestamp: '2026-08-24 10:10:00',
    },
  ];

  const mockProject = {
    name: 'KainBain',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('renders loading state when loading is true', () => {
    render(<ReportViewer loading={true} reports={[]} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading stage reports...')).toBeInTheDocument();
  });

  test('renders empty state cleanly when no reports exist', () => {
    render(<ReportViewer reports={[]} taskId="task-123" />);
    expect(screen.getByText('No markdown reports generated yet.')).toBeInTheDocument();
    expect(screen.getByText(/docs\/tasks\/task-123/)).toBeInTheDocument();
  });

  test('renders custom empty state message when provided', () => {
    render(
      <ReportViewer
        reports={[]}
        emptyStateMessage="Custom empty notice for this task."
        taskId="task-123"
      />,
    );
    expect(screen.getByText('Custom empty notice for this task.')).toBeInTheDocument();
  });

  test('renders sidebar list of all reports with count badge and initial report in main pane', () => {
    render(
      <ReportViewer
        reports={mockReports}
        activeProject={mockProject}
        taskId="task-1"
      />,
    );

    // Sidebar reports count
    expect(screen.getByText('3')).toBeInTheDocument();

    // Sidebar list buttons
    expect(screen.getByRole('tab', { name: /Plan/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Implementation/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Review/i })).toBeInTheDocument();

    // Timestamps shown (getAllByText for items that appear in sidebar & header)
    expect(screen.getAllByText('2026-08-24 10:00:00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2026-08-24 10:05:00')).toBeInTheDocument();
    expect(screen.getByText('2026-08-24 10:10:00')).toBeInTheDocument();

    // Initial reading pane content (Plan report)
    expect(screen.getByText('Plan Stage Report')).toBeInTheDocument();
    expect(screen.getByText(/Step 1: Design/i)).toBeInTheDocument();
    expect(screen.getByText('./docs/tasks/task-1/plan-20260824T100000.md')).toBeInTheDocument();

    // Navigation indicator: 1 / 3
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  test('clicking sidebar item selects report and updates reading pane', () => {
    const onSelectReport = vi.fn();
    render(
      <ReportViewer
        reports={mockReports}
        activeProject={mockProject}
        taskId="task-1"
        onSelectReport={onSelectReport}
      />,
    );

    // Click on Implementation tab
    fireEvent.click(screen.getByRole('tab', { name: /Implementation/i }));

    expect(screen.getByText('Implementation Stage Report')).toBeInTheDocument();
    expect(screen.getByText(/Code written in/i)).toBeInTheDocument();
    expect(
      screen.getByText('./docs/tasks/task-1/implementation-20260824T100500.md'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(onSelectReport).toHaveBeenCalledWith(mockReports[1], 1);
  });

  test('prev and next buttons navigate between reports and disable appropriately', () => {
    render(
      <ReportViewer
        reports={mockReports}
        activeProject={mockProject}
        taskId="task-1"
      />,
    );

    const prevBtn = screen.getByRole('button', { name: 'Previous report' });
    const nextBtn = screen.getByRole('button', { name: 'Next report' });

    // Initially at index 0: prev is disabled, next is enabled
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    // Click Next -> moves to index 1
    fireEvent.click(nextBtn);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Implementation Stage Report')).toBeInTheDocument();
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Click Next -> moves to index 2 (last)
    fireEvent.click(nextBtn);
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByText('Review Report')).toBeInTheDocument();
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).toBeDisabled();

    // Click Prev -> moves back to index 1
    fireEvent.click(prevBtn);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Implementation Stage Report')).toBeInTheDocument();
  });

  test('Copy Path button writes path to clipboard and shows visual feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(
      <ReportViewer
        reports={mockReports}
        activeProject={mockProject}
        taskId="task-1"
      />,
    );

    const copyBtn = screen.getByRole('button', { name: 'Copy report path' });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith('./docs/tasks/task-1/plan-20260824T100000.md');
    await waitFor(() => {
      expect(screen.getByText('Copied ✓')).toBeInTheDocument();
    });
  });

  test('Copy Markdown button writes content to clipboard and shows feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(
      <ReportViewer
        reports={mockReports}
        activeProject={mockProject}
        taskId="task-1"
      />,
    );

    const copyMarkdownBtn = screen.getByRole('button', { name: 'Copy markdown content' });
    fireEvent.click(copyMarkdownBtn);

    expect(writeTextMock).toHaveBeenCalledWith(
      '# Plan Stage Report\n\n- Step 1: Design\n- Step 2: Implement',
    );
    await waitFor(() => {
      expect(screen.getByText('Copied ✓')).toBeInTheDocument();
    });
  });

  test('no external notes link is rendered (SilverBullet removed)', () => {
    vi.stubEnv('VITE_NOTES_VIEWER_URL', 'http://notes.example.com');
    render(
      <ReportViewer
        reports={mockReports}
        activeProject={mockProject}
        taskId="task-1"
      />,
    );

    expect(screen.queryByRole('link', { name: /Open in Notes/i })).not.toBeInTheDocument();
    expect(screen.queryByText('SilverBullet')).not.toBeInTheDocument();
    // In-app actions stay: path copy keeps working.
    expect(screen.getByRole('button', { name: /Copy report path/i })).toBeInTheDocument();
  });
});
