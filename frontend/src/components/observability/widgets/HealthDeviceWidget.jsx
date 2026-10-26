import { HealthStatusCard } from './atoms/HealthStatusCard';

/***
 * MARK: HealthDeviceCard
 * @description The host memory / CPU card, shared by the atomic widget and the
 *   composite System Health widget so the two cannot drift.
 * @example <HealthDeviceCard healthState={{ checks: { device: { status: 'ok', memoryUsagePct: 40, cpuCount: 8 } } }} />
 * @param {Object} [props] - Card props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @param {string} [props.className] - Extra classes (e.g. `flex-1`).
 * @returns {ReactElement} The card.
 ***/
export function HealthDeviceCard({ healthState = {}, className = '' }) {
  const device = healthState?.checks?.device || {};
  const memoryLine =
    device.freeMemMb && device.totalMemMb
      ? `${Math.round(device.freeMemMb / 1024)}GB Free / ${Math.round(device.totalMemMb / 1024)}GB Total`
      : device.message || 'Host System Healthy';

  return (
    <HealthStatusCard
      testId="health-device"
      title="Host Memory & CPU"
      status={device.status === 'ok' ? 'ok' : 'warn'}
      headline={device.memoryUsagePct ? `${device.memoryUsagePct}% RAM` : 'Normal'}
      headlineNote={device.cpuCount ? `${device.cpuCount} Cores` : 'CPU Active'}
      message={memoryLine}
      className={className}
    />
  );
}

/***
 * MARK: HealthDeviceWidget
 * @description Atomic monitor widget: host memory pressure, free / total RAM,
 *   and CPU core count, filling its container.
 * @example <HealthDeviceWidget healthState={{ checks: { device: { status: 'ok' } } }} />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @returns {ReactElement} The single health card widget.
 ***/
export function HealthDeviceWidget({ healthState = {} }) {
  return (
    <div className="flex flex-col h-full p-3.5 bg-[#080c16] font-mono text-xs">
      <HealthDeviceCard healthState={healthState} className="flex-1" />
    </div>
  );
}

export default HealthDeviceWidget;
