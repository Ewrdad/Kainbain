import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RetryStatusBlock } from './RetryStatusBlock';
import '@testing-library/jest-dom';

describe('RetryStatusBlock', () => {
  test('renders the scheduled label with attempt counts and countdown', () => {
    const nextRetryAt = new Date(Date.now() + 12000).toISOString();
    render(
      <RetryStatusBlock
        task={{
          status: 'in_stage',
          retryState: 'scheduled',
          retryAttempt: 2,
          retryMaxAttempts: 5,
          nextRetryAt,
          transientRetryLadder: [
            {
              attempt: 1,
              delayMs: 1000,
              signal: 'socket hang up',
              error: 'socket hang up',
              timestamp: new Date().toISOString(),
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('RETRYING (scheduled) 2/5');
    expect(screen.getByRole('status')).toHaveTextContent(/attempt 2 of 5/);
    expect(screen.getByText(/Retry ladder \(1\)/)).toBeInTheDocument();
  });

  test('renders nothing for a parked failed task with a lingering retry flag', () => {
    const { container } = render(
      <RetryStatusBlock task={{ status: 'failed', autoRetrying: true, failureReason: 'boom' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when no retry is scheduled', () => {
    const { container } = render(<RetryStatusBlock task={{ status: 'in_stage' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
