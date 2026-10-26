import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiFailuresWidget } from './KpiFailuresWidget';
import '@testing-library/jest-dom';

/***
 * MARK: KpiFailuresWidget tests
 * @description Proves the extracted failures card renders its own value and
 *   rate.
 ***/

describe('KpiFailuresWidget', () => {
  it('renders the failed count and failure rate', () => {
    render(<KpiFailuresWidget stats={{ failed: 3, failureRate: 25 }} />);

    const card = screen.getByTestId('kpi-failures');
    expect(card).toHaveTextContent('✕ Failures');
    expect(card).toHaveTextContent('3');
    expect(card).toHaveTextContent('(25%)');
    expect(card).toHaveTextContent('Handled via failback');
  });

  it('defaults to zero failed and a 0% failure rate', () => {
    render(<KpiFailuresWidget />);

    const card = screen.getByTestId('kpi-failures');
    expect(card).toHaveTextContent('0');
    expect(card).toHaveTextContent('(0%)');
  });
});
