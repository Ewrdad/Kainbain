import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiQueueDepthWidget } from './KpiQueueDepthWidget';
import '@testing-library/jest-dom';

/***
 * MARK: KpiQueueDepthWidget tests
 * @description Proves the extracted queue-depth card counts the scheduled
 *   candidates and switches its sub-lines on running / blocked state.
 ***/

describe('KpiQueueDepthWidget', () => {
  it('renders the scheduled candidate count and default sub-lines', () => {
    render(
      <KpiQueueDepthWidget scheduledQueue={[{}, {}, {}]} stats={{ running: 0, blocked: 0 }} />,
    );

    const card = screen.getByTestId('kpi-queue');
    expect(card).toHaveTextContent('⏳ Queue depth');
    expect(card).toHaveTextContent('3');
    expect(card).toHaveTextContent('Ready');
    expect(card).toHaveTextContent('Scheduled candidate order');
  });

  it('shows the active count and blocked-by-deps line when present', () => {
    render(<KpiQueueDepthWidget scheduledQueue={[{}]} stats={{ running: 2, blocked: 1 }} />);

    const card = screen.getByTestId('kpi-queue');
    expect(card).toHaveTextContent('2 active');
    expect(card).toHaveTextContent('1 blocked by deps');
  });
});
