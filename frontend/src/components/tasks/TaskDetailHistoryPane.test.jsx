import { render, screen } from '@testing-library/react';
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
});
