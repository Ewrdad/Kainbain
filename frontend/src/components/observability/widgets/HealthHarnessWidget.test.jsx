import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthHarnessWidget } from './HealthHarnessWidget';
import '@testing-library/jest-dom';

/***
 * MARK: HealthHarnessWidget tests
 * @description Proves the extracted pi-harness model card renders the probe
 *   when present, and an honest neutral "No probe" state (never an error) when
 *   the backend does not report one.
 ***/

describe('HealthHarnessWidget', () => {
  it('renders the available model count and probe message', () => {
    render(
      <HealthHarnessWidget
        healthState={{
          checks: {
            harnesses: {
              pi: {
                name: 'pi',
                status: 'ok',
                message: '2 provider(s) configured, 12 models available',
                checks: { models: { status: 'ok', available: 12, total: 12 } },
              },
            },
          },
        }}
      />,
    );

    const card = screen.getByTestId('harness-health-card');
    expect(card).toHaveTextContent('Models (pi harness)');
    expect(card).toHaveTextContent('12 Models');
    expect(card).toHaveTextContent('2 provider(s) configured, 12 models available');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-emerald-400');
  });

  it('renders a neutral No probe state when the harness probe is absent', () => {
    render(<HealthHarnessWidget healthState={{ checks: {} }} />);

    const card = screen.getByTestId('harness-health-card');
    expect(card).toHaveTextContent('No probe');
    expect(card).toHaveTextContent('No harness probe reported by this build');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-slate-500');
  });

  it('marks an error probe with a red dot', () => {
    render(
      <HealthHarnessWidget
        healthState={{
          checks: {
            harnesses: {
              pi: { status: 'error', message: 'No model providers have configured credentials' },
            },
          },
        }}
      />,
    );

    const card = screen.getByTestId('harness-health-card');
    expect(card).toHaveTextContent('No model providers have configured credentials');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-rose-400');
  });
});
