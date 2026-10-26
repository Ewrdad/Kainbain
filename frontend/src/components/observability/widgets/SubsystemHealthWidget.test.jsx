import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubsystemHealthWidget } from './SubsystemHealthWidget';
import '@testing-library/jest-dom';

/***
 * MARK: SubsystemHealthWidget tests
 * @description Verifies the observability health cards, including the
 *   optional Models (pi harness) card that renders only when the payload
 *   carries `checks.harnesses.pi` (older payloads unaffected).
 ***/

const baseHealth = {
  checks: {
    litellm: { status: 'ok', latencyMs: 35, message: 'LiteLLM reachable' },
    device: { status: 'ok', memoryUsagePct: 40, cpuCount: 8, freeMemMb: 8192, totalMemMb: 16384 },
    ollamaCloud: { status: 'ok', latencyMs: 110, message: 'Ollama Cloud reachable' },
  },
};

describe('SubsystemHealthWidget', () => {
  it('renders the four baseline subsystem cards', () => {
    render(<SubsystemHealthWidget healthState={baseHealth} connectionStatus="connected" />);

    expect(screen.getByText('LiteLLM Proxy')).toBeInTheDocument();
    expect(screen.getByText('Host Memory & CPU')).toBeInTheDocument();
    expect(screen.getByText('Ollama Cloud')).toBeInTheDocument();
    expect(screen.getByText('WebSocket Stream')).toBeInTheDocument();
    expect(screen.queryByTestId('harness-health-card')).not.toBeInTheDocument();
  });

  it('renders the Models (pi harness) card when the payload includes the probe', () => {
    render(
      <SubsystemHealthWidget
        healthState={{
          checks: {
            ...baseHealth.checks,
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
        connectionStatus="connected"
      />,
    );

    expect(screen.getByTestId('harness-health-card')).toBeInTheDocument();
    expect(screen.getByText('Models (pi harness)')).toBeInTheDocument();
    expect(screen.getByText('12 Models')).toBeInTheDocument();
    expect(screen.getByText('2 provider(s) configured, 12 models available')).toBeInTheDocument();
  });

  it('hides the Models (pi harness) card when the probe is absent', () => {
    render(<SubsystemHealthWidget healthState={baseHealth} connectionStatus="connected" />);
    expect(screen.queryByTestId('harness-health-card')).not.toBeInTheDocument();
  });

  it('renders optional disabled/unconfigured probes as grey, never red', () => {
    const { container } = render(
      <SubsystemHealthWidget
        healthState={{
          checks: {
            ...baseHealth.checks,
            litellm: { status: 'disabled', latencyMs: null, message: 'LiteLLM not detected (optional)' },
            ollamaCloud: { status: 'unconfigured', latencyMs: null, message: 'Ollama Cloud unreachable (optional)' },
          },
        }}
        connectionStatus="connected"
      />,
    );

    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText('LiteLLM not detected (optional)')).toBeInTheDocument();
    const dots = [...container.querySelectorAll('.rounded-full')];
    expect(dots.some((dot) => dot.classList.contains('bg-slate-500'))).toBe(true);
    expect(dots.some((dot) => dot.classList.contains('bg-rose-400'))).toBe(false);
  });

  it('marks the harness card with an error dot when the probe reports an error', () => {
    const { container } = render(
      <SubsystemHealthWidget
        healthState={{
          checks: {
            ...baseHealth.checks,
            harnesses: {
              pi: {
                name: 'pi',
                status: 'error',
                message: 'No model providers have configured credentials',
                checks: { models: { status: 'warning', available: 0, total: 0 } },
              },
            },
          },
        }}
        connectionStatus="connected"
      />,
    );

    const card = screen.getByTestId('harness-health-card');
    const dot = card.querySelector('.rounded-full');
    expect(dot).toHaveClass('bg-rose-400');
    expect(container).toBeTruthy();
  });
});