import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HealthTrafficLight } from './HealthTrafficLight';
import * as KainBainContextModule from '../../context/KainBainContext';

describe('HealthTrafficLight', () => {
  const mockContext = {
    healthState: {
      status: 'ok',
      timestamp: '2026-08-22T14:30:00.000Z',
      checks: {
        litellm: {
          status: 'ok',
          latencyMs: 35,
          endpoint: 'https://litellm.home',
          message: 'LiteLLM reachable (35ms)',
        },
        device: {
          status: 'ok',
          memoryUsagePct: 40,
          loadAvg: [0.5, 0.4, 0.3],
          message: 'Device healthy (Mem: 40%, Load: 0.5)',
        },
        ollamaCloud: {
          status: 'ok',
          latencyMs: 110,
          endpoint: 'https://ollama.com',
          message: 'Ollama Cloud reachable (110ms)',
        },
      },
    },
    fetchHealth: vi.fn(),
    isHealthRefreshing: false,
  };

  it('renders all three traffic light indicators with ok status', () => {
    vi.spyOn(KainBainContextModule, 'useKainBain').mockReturnValue(mockContext);

    render(<HealthTrafficLight />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    // Refresh is a native button named with the overall health summary.
    expect(
      screen.getByRole('button', { name: /Subsystem Health: LiteLLM Healthy/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('traffic-dot-litellm')).toHaveClass('bg-[#7bdb85]');
    expect(screen.getByTestId('traffic-dot-device')).toHaveClass('bg-[#7bdb85]');
    expect(screen.getByTestId('traffic-dot-ollama')).toHaveClass('bg-[#7bdb85]');
  });

  it('renders warning and error status dots when subsystem is degraded or down', () => {
    const degradedContext = {
      ...mockContext,
      healthState: {
        status: 'degraded',
        checks: {
          litellm: { status: 'error', message: 'LiteLLM unreachable: ECONNREFUSED' },
          device: { status: 'warning', memoryUsagePct: 88, loadAvg: [3.2, 2.8, 2.1], message: 'High memory' },
          ollamaCloud: { status: 'ok', latencyMs: 95 },
        },
      },
    };
    vi.spyOn(KainBainContextModule, 'useKainBain').mockReturnValue(degradedContext);

    render(<HealthTrafficLight />);

    expect(screen.getByTestId('traffic-dot-litellm')).toHaveClass('bg-[#ffb4ab]');
    expect(screen.getByTestId('traffic-dot-device')).toHaveClass('bg-[#ffd54f]');
    expect(screen.getByTestId('traffic-dot-ollama')).toHaveClass('bg-[#7bdb85]');
  });

  it('reveals detailed metrics tooltip on mouse enter and hides on mouse leave', () => {
    vi.spyOn(KainBainContextModule, 'useKainBain').mockReturnValue(mockContext);

    render(<HealthTrafficLight />);

    const trigger = screen.getByRole('button', { name: /Subsystem Health/i });
    fireEvent.mouseEnter(trigger);

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText(/ENGINE HEALTH CHECKS/i)).toBeInTheDocument();
    expect(screen.getByText(/LiteLLM:/i)).toBeInTheDocument();
    expect(screen.getByText(/Host Device:/i)).toBeInTheDocument();
    expect(screen.getByText(/Ollama Cloud:/i)).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the Models (pi harness) dot only when the payload includes the harness probe', () => {
    const withHarness = {
      ...mockContext,
      healthState: {
        ...mockContext.healthState,
        checks: {
          ...mockContext.healthState.checks,
          harnesses: {
            pi: {
              name: 'pi',
              status: 'warning',
              message: 'google configured but not in the availability snapshot',
              checks: { models: { status: 'warning', available: 12, total: 15 } },
            },
          },
        },
      },
    };
    vi.spyOn(KainBainContextModule, 'useKainBain').mockReturnValue(withHarness);

    render(<HealthTrafficLight />);

    expect(screen.getByTestId('traffic-dot-harness')).toHaveClass('bg-[#ffd54f]');
  });

  it('hides the Models (pi harness) dot for payloads without harness probes', () => {
    vi.spyOn(KainBainContextModule, 'useKainBain').mockReturnValue(mockContext);

    render(<HealthTrafficLight />);

    expect(screen.queryByTestId('traffic-dot-harness')).not.toBeInTheDocument();
  });

  it('lists the Models (pi) row in the detail tooltip when the probe is present', () => {
    const withHarness = {
      ...mockContext,
      healthState: {
        status: 'ok',
        checks: {
          ...mockContext.healthState.checks,
          harnesses: {
            pi: {
              name: 'pi',
              status: 'ok',
              message: '2 provider(s) configured, 12 models available',
              checks: { models: { status: 'ok', available: 12, total: 12 } },
            },
          },
        },
      },
    };
    vi.spyOn(KainBainContextModule, 'useKainBain').mockReturnValue(withHarness);

    render(<HealthTrafficLight />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Subsystem Health/i }));
    expect(screen.getByText(/Models \(pi\):/i)).toBeInTheDocument();
    expect(screen.getByText(/OK \(12 models\)/i)).toBeInTheDocument();
  });

  it('triggers manual health refresh from a named button (native keyboard activation)', () => {
    const fetchHealthMock = vi.fn();
    vi.spyOn(KainBainContextModule, 'useKainBain').mockReturnValue({
      ...mockContext,
      fetchHealth: fetchHealthMock,
    });

    render(<HealthTrafficLight />);

    // Native <button>: operable by pointer, Enter, and Space without a
    // synthetic key handler (WCAG 2.1.1, 4.1.2).
    const trigger = screen.getByRole('button', { name: /Subsystem Health/i });
    expect(trigger).toHaveAccessibleName(/Click to refresh/i);
    fireEvent.click(trigger);
    expect(fetchHealthMock).toHaveBeenCalledWith(true);
  });

  it('renders optional probes (disabled/unconfigured) as muted grey, never red', () => {
    const optionalContext = {
      ...mockContext,
      healthState: {
        status: 'ok',
        checks: {
          litellm: { status: 'disabled', message: 'LiteLLM not configured (optional)' },
          device: { status: 'ok', memoryUsagePct: 40, loadAvg: [0.5, 0.4, 0.3], message: 'Device healthy' },
          ollamaCloud: { status: 'unconfigured', message: 'Ollama Cloud unreachable (optional)' },
        },
      },
    };
    vi.spyOn(KainBainContextModule, 'useKainBain').mockReturnValue(optionalContext);

    render(<HealthTrafficLight />);

    expect(screen.getByTestId('traffic-dot-litellm')).toHaveClass('bg-text-muted/40');
    expect(screen.getByTestId('traffic-dot-ollama')).toHaveClass('bg-text-muted/40');
    expect(
      screen.getByRole('button', { name: /Subsystem Health: LiteLLM Disabled/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Ollama Cloud Not configured/i }),
    ).toBeInTheDocument();
  });
});
