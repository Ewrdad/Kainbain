import { HealthStatusCard } from './atoms/HealthStatusCard';
import { healthOllamaOnlineLabel } from './healthStatus';

/***
 * MARK: HealthOllamaCard
 * @description The Ollama Cloud bridge card, shared by the atomic widget and
 *   the composite System Health widget so the two cannot drift.
 * @example <HealthOllamaCard healthState={{ checks: { ollamaCloud: { status: 'ok' } } }} />
 * @param {Object} [props] - Card props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @param {string} [props.className] - Extra classes (e.g. `flex-1`).
 * @returns {ReactElement} The card.
 ***/
export function HealthOllamaCard({ healthState = {}, className = '' }) {
  const ollama = healthState?.checks?.ollamaCloud || {};
  return (
    <HealthStatusCard
      testId="health-ollama"
      title="Ollama Cloud"
      status={ollama.status}
      neutral="bg-slate-400"
      headline={healthOllamaOnlineLabel(ollama)}
      headlineNote="Local Inference"
      message={ollama.message || 'Cloud / Local Ollama Bridge'}
      className={className}
    />
  );
}

/***
 * MARK: HealthOllamaWidget
 * @description Atomic monitor widget: Ollama Cloud / local inference bridge
 *   reachability, filling its container.
 * @example <HealthOllamaWidget healthState={{ checks: { ollamaCloud: { status: 'ok' } } }} />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @returns {ReactElement} The single health card widget.
 ***/
export function HealthOllamaWidget({ healthState = {} }) {
  return (
    <div className="flex flex-col h-full p-3.5 bg-[#080c16] font-mono text-xs">
      <HealthOllamaCard healthState={healthState} className="flex-1" />
    </div>
  );
}

export default HealthOllamaWidget;
