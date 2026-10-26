import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { SurveyTaskPanel } from './SurveyTaskPanel';
import '@testing-library/jest-dom';

/***
 * MARK: SurveyTaskPanel tests
 * @description Verifies the read-only task-context panel for the survey
 *   split view: header, tab switching (mouse + keyboard), description
 *   markdown with task-image resolution, full reports, timeline/history,
 *   and loading/empty states.
 ***/

const stages = [
  { id: 's-1', name: 'Plan' },
  { id: 's-2', name: 'In Progress' },
];

const task = {
  id: 'd7767ec9-task',
  goal: '# Fix the survey panel\n\nSee the layout in ![screenshot](assets/shot.png).',
  currentStageId: 's-2',
  timeline: [
    { stage: 'Plan', status: 'Moved', duration: '9s', timestamp: '2026-10-20T15:00:00Z' },
  ],
  history: [{ timestamp: '2026-10-20T15:00:00Z', action: 'Stage report generated: plan.md' }],
};

const reports = [
  {
    filename: 'plan-20261020-150000.md',
    stageName: 'Plan',
    timestamp: '2026-10-20T15:00:00Z',
    content: '# Plan report\n\nThe plan is complete.',
  },
  {
    filename: 'idea-20261020-140000.md',
    stageName: 'Idea',
    timestamp: '2026-10-20T14:00:00Z',
    content: '# Idea report\n\nThe idea is sound.',
  },
];

const renderPanel = (props = {}) =>
  renderWithKainBain(
    <SurveyTaskPanel
      task={task}
      reports={reports}
      projectId="p1"
      taskId="t1"
      stages={stages}
      {...props}
    />,
  );

describe('SurveyTaskPanel', () => {
  it('renders the task header with key, title first line, and current stage', () => {
    renderPanel();
    expect(screen.getByRole('region', { name: 'Task context' })).toBeInTheDocument();
    // Task key badge derived from the task id.
    expect(screen.getByText('#KB-D776')).toBeInTheDocument();
    // Only the first goal line is the title; the body stays in the tab.
    // The title renders twice: the panel header plus the markdown heading.
    expect(screen.getAllByRole('heading', { name: 'Fix the survey panel' })).toHaveLength(2);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders description markdown and resolves task images to the task endpoint', () => {
    renderPanel({ reports: [] });
    expect(screen.getByText('See the layout in', { exact: false })).toBeInTheDocument();
    const img = document.querySelector('#survey-panel-tabpanel-description img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('/projects/p1/tasks/t1/images/shot.png');
  });

  it('switches between Description, Reports, and Timeline tabs', () => {
    renderPanel();
    const tablist = screen.getByRole('tablist', { name: 'Task context views' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Description',
      'Reports (2)',
      'Timeline',
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /reports/i }));
    expect(screen.getByText('The plan is complete.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
    expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
    expect(screen.queryByText('The plan is complete.')).not.toBeInTheDocument();
  });

  it('moves between tabs with arrow keys', () => {
    renderPanel();
    const descriptionTab = screen.getByRole('tab', { name: 'Description' });
    descriptionTab.focus();
    fireEvent.keyDown(descriptionTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /reports/i })).toHaveFocus();
    expect(screen.getByText('The plan is complete.')).toBeInTheDocument();
  });

  it('renders full reports in the Reports tab', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /reports/i }));
    expect(screen.getByText('The plan is complete.')).toBeInTheDocument();
    // The second report is selectable through the report switcher.
    fireEvent.click(screen.getByRole('tab', { name: /idea/i }));
    expect(screen.getByText('The idea is sound.')).toBeInTheDocument();
  });

  it('renders the stage timeline and audit events in the Timeline tab', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Moved')).toBeInTheDocument();
    expect(screen.getByText('Audit Log Events')).toBeInTheDocument();
    expect(screen.getByText(/Stage report generated: plan.md/)).toBeInTheDocument();
  });

  it('shows loading and empty states gracefully', () => {
    const { unmount } = renderPanel({ task: null, reports: [], loadingTask: true });
    expect(screen.getByRole('status')).toHaveTextContent(/loading task details/i);
    unmount();

    renderPanel({ task: null, reports: [] });
    expect(screen.getByText('Task details are unavailable.')).toBeInTheDocument();
    expect(screen.getByText('No task description available.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /reports/i }));
    expect(screen.getByText('No stage reports generated yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
    expect(screen.getByText('No stage history recorded yet.')).toBeInTheDocument();
  });

  it('shows the reports loading state inside the Reports tab', () => {
    renderPanel({ reports: [], loadingReports: true });
    fireEvent.click(screen.getByRole('tab', { name: /reports/i }));
    expect(screen.getByText(/loading stage reports/i)).toBeInTheDocument();
  });

  it('keeps every tab reachable by keyboard with 44px touch targets', () => {
    renderPanel();
    const tabs = screen.getAllByRole('tab');
    // Panel tabs plus the report switcher tabs inside the Reports tab panel.
    expect(tabs.length).toBeGreaterThanOrEqual(3);
    for (const tab of screen.getByRole('tablist', { name: 'Task context views' }).children) {
      expect(tab.getAttribute('aria-controls')).toMatch(/^survey-panel-tabpanel-/);
      expect(tab.className).toContain('min-h-[44px]');
    }
  });
});
