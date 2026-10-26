import { HealthStatusCard } from './atoms/HealthStatusCard';
import { healthWebsocketStatus } from './healthStatus';

/***
 * MARK: HealthWebsocketCard
 * @description The live WebSocket stream card, shared by the atomic widget and
 *   the composite System Health widget so the two cannot drift. An unknown
 *   state never reads as healthy: anything but `connected` / `reconnecting`
 *   shows the error dot with an honest headline (`unknown` when nothing was
 *   reported at all).
 * @example <HealthWebsocketCard connectionStatus="connected" />
 * @example <HealthWebsocketCard connectionStatus={undefined} /> // => red dot, "unknown"
 * @param {Object} [props] - Card props.
 * @param {string} [props.connectionStatus] - Live socket state from the app context.
 * @param {string} [props.className] - Extra classes (e.g. `flex-1`).
 * @returns {ReactElement} The card.
 ***/
export function HealthWebsocketCard({ connectionStatus, className = '' }) {
  const headline = connectionStatus || 'unknown';
  const message =
    connectionStatus === 'connected'
      ? 'Real-time telemetry link active'
      : connectionStatus === 'reconnecting'
        ? 'Reconnecting socket link...'
        : 'Telemetry link unavailable';
  return (
    <HealthStatusCard
      testId="health-websocket"
      title="WebSocket Stream"
      status={healthWebsocketStatus(connectionStatus)}
      headline={headline}
      headlineClassName="capitalize"
      headlineNote="Live Bidirectional"
      message={message}
      className={className}
    />
  );
}

/***
 * MARK: HealthWebsocketWidget
 * @description Atomic monitor widget: live bidirectional telemetry socket
 *   connection state, filling its container.
 * @example <HealthWebsocketWidget connectionStatus="connected" />
 * @param {Object} [props] - Widget props.
 * @param {string} [props.connectionStatus] - Live socket state from the app context.
 * @returns {ReactElement} The single health card widget.
 ***/
export function HealthWebsocketWidget({ connectionStatus }) {
  return (
    <div className="flex flex-col h-full p-3.5 bg-[#080c16] font-mono text-xs">
      <HealthWebsocketCard connectionStatus={connectionStatus} className="flex-1" />
    </div>
  );
}

export default HealthWebsocketWidget;
