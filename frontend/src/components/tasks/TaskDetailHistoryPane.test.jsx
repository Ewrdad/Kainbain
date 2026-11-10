import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { TaskDetailHistoryPane } from './TaskDetailHistoryPane';
import '@testing-library/jest-dom';

describe('TaskDetailHistoryPane', () => {
  it('renders empty state sections', () => {
    render(<TaskDetailHistoryPane timelineData={[]} auditEvents={[]} />);
    expect(screen.getByText(/Stage Transition Timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Audit Log Events/i)).toBeInTheDocument();
  });

  it('renders timeline entries and audit events', () => {
    render(
      <TaskDetailHistoryPane
        timelineData={[{ stage: 'Idea', status: 'Success', timestamp: '12:00', duration: '2m' }]}
        auditEvents={[{ timestamp: '12:00', action: 'Created' }]}
      />,
    );
    expect(screen.getByText('Idea')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('shows every audit event with no toggle when the log is short', () => {
    const auditEvents = Array.from({ length: 5 }, (_, i) => ({
      timestamp: `12:0${i}`,
      action: `Event ${i + 1}`,
    }));
    render(<TaskDetailHistoryPane timelineData={[]} auditEvents={auditEvents} />);
    auditEvents.forEach((event) => {
      expect(screen.getByText(event.action)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('previews long audit logs behind a Show all disclosure', () => {
    const timelineData = [
      { stage: 'Idea', status: 'Success', timestamp: '12:00', duration: '2m' },
      { stage: 'Build', status: 'Running', timestamp: '12:05', duration: '1m' },
    ];
    const auditEvents = Array.from({ length: 7 }, (_, i) => ({
      timestamp: `12:0${i}`,
      action: `Event ${i + 1}`,
    }));
    render(<TaskDetailHistoryPane timelineData={timelineData} auditEvents={auditEvents} />);
    // The timeline (key facts) always shows in full.
    expect(screen.getByText('Idea')).toBeInTheDocument();
    expect(screen.getByText('Build')).toBeInTheDocument();
    // Only the first five audit events preview.
    expect(screen.getByText('Event 5')).toBeInTheDocument();
    expect(screen.queryByText('Event 6')).not.toBeInTheDocument();
    expect(screen.queryByText('Event 7')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Show all 7 events \(2 more\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Expanding reveals the rest; collapsing hides them again.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Event 6')).toBeInTheDocument();
    expect(screen.getByText('Event 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.queryByText('Event 6')).not.toBeInTheDocument();
  });
});
