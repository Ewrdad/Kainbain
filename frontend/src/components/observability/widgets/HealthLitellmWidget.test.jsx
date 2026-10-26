import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthLitellmWidget } from './HealthLitellmWidget';
import '@testing-library/jest-dom';

/***
 * MARK: HealthLitellmWidget tests
 * @description Proves the extracted LiteLLM card renders latency, the honest
 *   optional-service wording, and the right dot colour.
 ***/

describe('HealthLitellmWidget', () => {
  it('renders latency and the gateway message', () => {
    render(
      <HealthLitellmWidget
        healthState={{
          checks: { litellm: { status: 'ok', latencyMs: 35, message: 'LiteLLM reachable' } },
        }}
      />,
    );

    const card = screen.getByTestId('health-litellm');
    expect(card).toHaveTextContent('LiteLLM Proxy');
    expect(card).toHaveTextContent('35 ms');
    expect(card).toHaveTextContent('Response Latency');
    expect(card).toHaveTextContent('LiteLLM reachable');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-emerald-400');
  });

  it('renders an optional disabled proxy as grey wording, never red', () => {
    render(
      <HealthLitellmWidget
        healthState={{
          checks: { litellm: { status: 'disabled', latencyMs: null, message: 'Not detected' } },
        }}
      />,
    );

    const card = screen.getByTestId('health-litellm');
    expect(card).toHaveTextContent('Disabled');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-slate-500');
  });

  it('renders an error probe with a red dot', () => {
    render(<HealthLitellmWidget healthState={{ checks: { litellm: { status: 'error' } } }} />);
    expect(screen.getByTestId('health-litellm').querySelector('.rounded-full')).toHaveClass(
      'bg-rose-400',
    );
  });
});
