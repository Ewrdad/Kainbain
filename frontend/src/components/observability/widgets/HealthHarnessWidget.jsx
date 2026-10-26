import { HealthStatusCard } from './atoms/HealthStatusCard';

/***
 * MARK: HealthHarnessCard
 * @description The pi harness model-provider probe card, shared by the atomic
 *   widget and the composite System Health widget. When the payload carries no
 *   `checks.harnesses.pi` probe (older backends), the atomic widget renders an
 *   honest neutral "No probe" state; the composite omits the card entirely.
 * @example <HealthHarnessCard healthState={{ checks: { harnesses: { pi: { status: 'ok', checks: { models: { available: 12 } } } } } }} />
 * @param {Object} [props] - Card props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @param {string} [props.className] - Extra classes (e.g. `flex-1`).
 * @returns {ReactElement} The card.
 ***/
export function HealthHarnessCard({ healthState = {}, className = '' }) {
  const piHarness = healthState?.checks?.harnesses?.pi || null;

  if (!piHarness) {
    return (
      <HealthStatusCard
        testId="harness-health-card"
        title="Models (pi harness)"
        status="unconfigured"
        headline="No probe"
        headlineNote="Agent Harness"
        message="No harness probe reported by this build"
        className={className}
      />
    );
  }

  const availableModels = piHarness.checks?.models?.available;
  return (
    <HealthStatusCard
      testId="harness-health-card"
      title="Models (pi harness)"
      status={piHarness.status}
      headline={
        availableModels != null ? `${availableModels} Models` : piHarness.status || 'Standby'
      }
      headlineNote="Agent Harness"
      message={piHarness.message || 'Model providers and credentials'}
      className={className}
    />
  );
}

/***
 * MARK: HealthHarnessWidget
 * @description Atomic monitor widget: the pi harness model-provider probe,
 *   filling its container. Opt-in via the widget menu (unlike the composite,
 *   which hides the card when the probe is absent).
 * @example <HealthHarnessWidget healthState={{ checks: { harnesses: { pi: { status: 'ok' } } } }} />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @returns {ReactElement} The single health card widget.
 ***/
export function HealthHarnessWidget({ healthState = {} }) {
  return (
    <div className="flex flex-col h-full p-3.5 bg-[#080c16] font-mono text-xs">
      <HealthHarnessCard healthState={healthState} className="flex-1" />
    </div>
  );
}

export default HealthHarnessWidget;
