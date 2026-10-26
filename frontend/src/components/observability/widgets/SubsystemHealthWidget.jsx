import { HealthLitellmCard } from './HealthLitellmWidget';
import { HealthDeviceCard } from './HealthDeviceWidget';
import { HealthOllamaCard } from './HealthOllamaWidget';
import { HealthWebsocketCard } from './HealthWebsocketWidget';
import { HealthHarnessCard } from './HealthHarnessWidget';

/***
 * MARK: SubsystemHealthWidget
 * @description One-click composite of every subsystem health card (LiteLLM
 *   proxy, host device, Ollama Cloud, WebSocket stream, pi harness models).
 *   Each card is the same shared component its atomic widget renders, so the
 *   composite is just a different arrangement — never a second implementation.
 *   The pi harness card renders only when the payload carries
 *   `checks.harnesses.pi`, so older backends are unaffected.
 * @example <SubsystemHealthWidget healthState={{ checks: {} }} connectionStatus="connected" />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.healthState] - Health payload from the app context.
 * @param {string} [props.connectionStatus] - Live socket state from the app context.
 *   Passed straight to the WebSocket card, which renders an unknown state as
 *   an honest fault rather than a healthy link.
 * @returns {ReactElement} The system health grid.
 ***/
export function SubsystemHealthWidget({ healthState = {}, connectionStatus }) {
  const piHarness = healthState?.checks?.harnesses?.pi || null;

  return (
    <div
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable widget body (WCAG 2.1.1)
      tabIndex={0}
      role="group"
      aria-label="Subsystem health checks"
      className="flex-1 p-3.5 space-y-3 overflow-y-auto custom-scrollbar font-mono text-xs bg-[#080c16]"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <HealthLitellmCard healthState={healthState} />
        <HealthDeviceCard healthState={healthState} />
        <HealthOllamaCard healthState={healthState} />
        <HealthWebsocketCard connectionStatus={connectionStatus} />
        {piHarness && <HealthHarnessCard healthState={healthState} />}
      </div>
    </div>
  );
}

export default SubsystemHealthWidget;
