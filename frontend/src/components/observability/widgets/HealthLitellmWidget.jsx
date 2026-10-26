import { HealthStatusCard } from './atoms/HealthStatusCard';
import { healthOptionalLabel } from './healthStatus';

/***
 * MARK: HealthLitellmCard
 * @description The LiteLLM gateway reachability card, shared by the atomic
 *   widget and the composite System Health widget so the two cannot drift.
 * @example <HealthLitellmCard healthState={{ checks: { litellm: { status: 'ok', latencyMs: 35 } } }} />
 * @param {Object} [props] - Card props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @param {string} [props.className] - Extra classes (e.g. `flex-1`).
 * @returns {ReactElement} The card.
 ***/
export function HealthLitellmCard({ healthState = {}, className = '' }) {
  const litellm = healthState?.checks?.litellm || {};
  return (
    <HealthStatusCard
      testId="health-litellm"
      title="LiteLLM Proxy"
      status={litellm.status}
      headline={
        litellm.latencyMs ? `${litellm.latencyMs} ms` : healthOptionalLabel(litellm.status, 'OK')
      }
      headlineNote="Response Latency"
      message={litellm.message || 'LLM Model Gateway Ready'}
      className={className}
    />
  );
}

/***
 * MARK: HealthLitellmWidget
 * @description Atomic monitor widget: LiteLLM gateway reachability and
 *   latency, filling its container.
 * @example <HealthLitellmWidget healthState={{ checks: { litellm: { status: 'ok' } } }} />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @returns {ReactElement} The single health card widget.
 ***/
export function HealthLitellmWidget({ healthState = {} }) {
  return (
    <div className="flex flex-col h-full p-3.5 bg-[#080c16] font-mono text-xs">
      <HealthLitellmCard healthState={healthState} className="flex-1" />
    </div>
  );
}

export default HealthLitellmWidget;
