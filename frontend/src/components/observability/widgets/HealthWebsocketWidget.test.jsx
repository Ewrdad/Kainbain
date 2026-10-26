import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthWebsocketWidget } from './HealthWebsocketWidget';
import '@testing-library/jest-dom';

/***
 * MARK: HealthWebsocketWidget tests
 * @description Proves the extracted WebSocket card maps connection states onto
 *   the shared ok/warn/error dots and messages.
 ***/

describe('HealthWebsocketWidget', () => {
  it('renders a connected socket as ok and active', () => {
    render(<HealthWebsocketWidget connectionStatus="connected" />);

    const card = screen.getByTestId('health-websocket');
    expect(card).toHaveTextContent('WebSocket Stream');
    expect(card).toHaveTextContent('connected');
    expect(card).toHaveTextContent('Real-time telemetry link active');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-emerald-400');
  });

  it('renders a reconnecting socket as a warning with a reconnect message', () => {
    render(<HealthWebsocketWidget connectionStatus="reconnecting" />);

    const card = screen.getByTestId('health-websocket');
    expect(card).toHaveTextContent('reconnecting');
    expect(card).toHaveTextContent('Reconnecting socket link...');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-amber-400');
  });

  it('renders a failed socket as an error dot', () => {
    render(<HealthWebsocketWidget connectionStatus="connecting" />);
    expect(screen.getByTestId('health-websocket').querySelector('.rounded-full')).toHaveClass(
      'bg-rose-400',
    );
  });

  it('never reads an unknown socket as healthy', () => {
    render(<HealthWebsocketWidget connectionStatus={undefined} />);

    const card = screen.getByTestId('health-websocket');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-rose-400');
    expect(card).toHaveTextContent('unknown');
    expect(card).toHaveTextContent('Telemetry link unavailable');
    expect(card).not.toHaveTextContent('Real-time telemetry link active');
  });

  it('names a dropped link unavailable instead of reconnecting', () => {
    render(<HealthWebsocketWidget connectionStatus="disconnected" />);

    const card = screen.getByTestId('health-websocket');
    expect(card.querySelector('.rounded-full')).toHaveClass('bg-rose-400');
    expect(card).toHaveTextContent('disconnected');
    expect(card).toHaveTextContent('Telemetry link unavailable');
  });
});
