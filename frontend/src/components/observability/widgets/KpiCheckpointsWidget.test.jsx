import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCheckpointsWidget } from './KpiCheckpointsWidget';
import '@testing-library/jest-dom';

/***
 * MARK: KpiCheckpointsWidget tests
 * @description Proves the extracted human-review card renders awaiting
 *   checkpoints and surfaces paused tasks.
 ***/

describe('KpiCheckpointsWidget', () => {
  it('renders awaiting checkpoints and the pending default', () => {
    render(<KpiCheckpointsWidget stats={{ waitingHuman: 2, paused: 0 }} />);

    const card = screen.getByTestId('kpi-checkpoints');
    expect(card).toHaveTextContent('👤 Human review');
    expect(card).toHaveTextContent('2');
    expect(card).toHaveTextContent('pending');
    expect(card).toHaveTextContent('Checkpoints awaiting human');
  });

  it('surfaces paused tasks beside the checkpoint count', () => {
    render(<KpiCheckpointsWidget stats={{ waitingHuman: 1, paused: 3 }} />);

    expect(screen.getByTestId('kpi-checkpoints')).toHaveTextContent('+3 paused');
  });
});
