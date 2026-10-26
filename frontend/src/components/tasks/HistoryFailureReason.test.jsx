import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryFailureReason } from './HistoryFailureReason';
import '@testing-library/jest-dom';

describe('HistoryFailureReason', () => {
  const failedEntry = {
    stage: 'Implementation',
    status: 'Failed',
    timestamp: '2026-09-21T10:00:00.000Z',
    duration: '12s',
    reason: 'Out of tokens\ntrace line 1\ntrace line 2',
    stageId: 'impl',
    stderr: 'backend exploded',
  };

  test('shows the first reason line inline with a button for the full reason', () => {
    render(<HistoryFailureReason entry={failedEntry} />);
    expect(screen.getByText('Out of tokens')).toBeInTheDocument();
    expect(screen.queryByText(/trace line 1/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View full reason' })).toBeInTheDocument();
  });

  test('opens a modal with the full reason, then closes via Escape', () => {
    render(<HistoryFailureReason entry={failedEntry} />);
    fireEvent.click(screen.getByRole('button', { name: 'View full reason' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText(/trace line 1/)).toBeInTheDocument();
    expect(screen.getByText('backend exploded')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('closes the modal via backdrop click and the close button', () => {
    const { container } = render(<HistoryFailureReason entry={failedEntry} />);
    fireEvent.click(screen.getByRole('button', { name: 'View full reason' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(container.querySelector('.fixed.inset-0'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View full reason' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('renders nothing for legacy entries without a structured reason', () => {
    const { container } = render(
      <HistoryFailureReason entry={{ stage: 'Plan', status: 'Success', timestamp: 't' }} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('renders nothing for empty reasons without crashing', () => {
    const { container } = render(
      <HistoryFailureReason entry={{ stage: 'X', status: 'Failed', reason: '  ' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders a human-rejection timeline entry (rejectTask shape)', () => {
    // The entry shape rejectTask writes: a Failed row for the rejected stage
    // carrying the operator's note as its structured reason.
    render(
      <HistoryFailureReason
        entry={{
          stage: 'Review Plan',
          status: 'Failed',
          duration: '4s',
          durationSeconds: 4,
          durationStageId: '4',
          timestamp: '2026-09-30T10:24:25.523Z',
          reason: 'Validation missing on empty input',
          stageId: '4',
          stageName: 'Review Plan',
        }}
      />,
    );
    expect(screen.getByText('Validation missing on empty input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View full reason' })).toBeInTheDocument();
  });
});
