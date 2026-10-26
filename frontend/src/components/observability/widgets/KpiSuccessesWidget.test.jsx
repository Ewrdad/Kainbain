import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiSuccessesWidget } from './KpiSuccessesWidget';
import '@testing-library/jest-dom';

/***
 * MARK: KpiSuccessesWidget tests
 * @description Proves the extracted successes card renders its own value and
 *   rate, and keeps the compact ribbon card shape.
 ***/

describe('KpiSuccessesWidget', () => {
  it('renders the completed count and success rate', () => {
    render(<KpiSuccessesWidget stats={{ completed: 7, successRate: 87.5 }} />);

    const card = screen.getByTestId('kpi-successes');
    expect(card).toHaveTextContent('✓ Successes');
    expect(card).toHaveTextContent('7');
    expect(card).toHaveTextContent('(87.5%)');
    expect(card).toHaveTextContent('Completed tasks');
  });

  it('defaults to zero completed and a 100% success rate', () => {
    render(<KpiSuccessesWidget />);

    const card = screen.getByTestId('kpi-successes');
    expect(card).toHaveTextContent('0');
    expect(card).toHaveTextContent('(100%)');
  });

  it('keeps the compact single-row card shape', () => {
    render(<KpiSuccessesWidget stats={{ completed: 1 }} />);

    const card = screen.getByTestId('kpi-successes');
    expect(card.className).toContain('px-2 py-1');
    expect(card.className).toContain('justify-center');
  });
});
