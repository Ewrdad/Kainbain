import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthDeviceWidget } from './HealthDeviceWidget';
import '@testing-library/jest-dom';

/***
 * MARK: HealthDeviceWidget tests
 * @description Proves the extracted host memory / CPU card formats memory,
 *   free / total RAM, cores, and the healthy / warning dot.
 ***/

describe('HealthDeviceWidget', () => {
  it('renders RAM pressure, cores, and free / total memory', () => {
    render(
      <HealthDeviceWidget
        healthState={{
          checks: {
            device: {
              status: 'ok',
              memoryUsagePct: 40,
              cpuCount: 8,
              freeMemMb: 8192,
              totalMemMb: 16384,
            },
          },
        }}
      />,
    );

    const card = screen.getByTestId('health-device');
    expect(card).toHaveTextContent('Host Memory & CPU');
    expect(card).toHaveTextContent('40% RAM');
    expect(card).toHaveTextContent('8 Cores');
    expect(card).toHaveTextContent('8GB Free / 16GB Total');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-emerald-400');
  });

  it('falls back to healthy wording when telemetry is absent', () => {
    render(<HealthDeviceWidget healthState={{ checks: { device: { status: 'ok' } } }} />);

    const card = screen.getByTestId('health-device');
    expect(card).toHaveTextContent('Normal');
    expect(card).toHaveTextContent('CPU Active');
    expect(card).toHaveTextContent('Host System Healthy');
  });

  it('marks a non-ok device amber', () => {
    render(<HealthDeviceWidget healthState={{ checks: { device: { status: 'warn' } } }} />);
    expect(screen.getByTestId('health-device').querySelector('.rounded-full')).toHaveClass(
      'bg-amber-400',
    );
  });
});
