import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const engineStateMock = vi.fn().mockResolvedValue({ circuit: { tripped: false } });
const engineResetMock = vi.fn().mockResolvedValue({ tripped: false });
const engineTripMock = vi.fn().mockResolvedValue({ tripped: true });

vi.mock('../../services/api', () => ({
  api: {
    engineState: (...args) => engineStateMock(...args),
    engineReset: (...args) => engineResetMock(...args),
    engineTrip: (...args) => engineTripMock(...args),
  },
}));

let mockEngineState = { status: 'idle' };
vi.mock('../../context/KainBainContext', () => ({
  useKainBain: () => ({ engineState: mockEngineState }),
}));

const { CircuitBreakerBanner } = await import('./CircuitBreakerBanner.jsx');

beforeEach(() => {
  engineStateMock.mockClear();
  engineResetMock.mockClear();
  mockEngineState = { status: 'idle' };
});

test('renders nothing while the engine is healthy', async () => {
  const { container } = render(<CircuitBreakerBanner />);
  await waitFor(() => expect(engineStateMock).toHaveBeenCalled());
  expect(screen.queryByTestId('circuit-breaker-banner')).not.toBeInTheDocument();
  expect(container).toBeEmptyDOMElement();
});

test('shows the banner, reason and source when the engine is tripped', async () => {
  mockEngineState = {
    status: 'idle',
    tripped: true,
    circuit: {
      tripped: true,
      reason: 'Host disk free 0 B is below the 1.0 GiB safety floor',
      source: 'auto:disk',
      trippedAt: '2026-10-09T10:00:00.000Z',
    },
  };
  render(<CircuitBreakerBanner />);
  const banner = await screen.findByTestId('circuit-breaker-banner');
  expect(banner).toHaveAttribute('role', 'alert');
  expect(banner).toHaveTextContent('Host disk free 0 B');
  expect(banner).toHaveTextContent('auto:disk');
});

test('reset is disabled until a reason is typed, then posts the reason', async () => {
  mockEngineState = {
    status: 'idle',
    tripped: true,
    circuit: { tripped: true, reason: 'provider outage', source: 'auto:auth' },
  };
  render(<CircuitBreakerBanner />);
  const button = await screen.findByRole('button', { name: /reset engine/i });
  expect(button).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/reset reason/i), {
    target: { value: 'provider recovered' },
  });
  expect(button).toBeEnabled();
  fireEvent.click(button);

  await waitFor(() => expect(engineResetMock).toHaveBeenCalledWith('provider recovered'));
});

test('the banner disappears once the WebSocket reports a reset', async () => {
  mockEngineState = {
    status: 'idle',
    tripped: true,
    circuit: { tripped: true, reason: 'outage', source: 'auto:infra' },
  };
  const { rerender } = render(<CircuitBreakerBanner />);
  expect(await screen.findByTestId('circuit-breaker-banner')).toBeInTheDocument();

  mockEngineState = { status: 'idle', tripped: false, circuit: { tripped: false } };
  rerender(<CircuitBreakerBanner />);
  await waitFor(() =>
    expect(screen.queryByTestId('circuit-breaker-banner')).not.toBeInTheDocument(),
  );
});
