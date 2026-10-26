/***
 * MARK: isMonitorRunning
 * @description Whether monitoring is currently active: the engine reports a
 * `running` status or the agent loop is running. Shared by the full
 * observability dashboard, the compact mobile monitor, and the screen
 * wake-lock gate so all three agree on what "monitoring is active" means.
 * @example isMonitorRunning({ status: 'running' }, false) => true
 * @example isMonitorRunning({ status: 'idle' }, false) => false
 * @param {Object} [engineState] - Engine snapshot (status).
 * @param {boolean} [isAgentRunning=false] - Agent loop running flag.
 * @returns {boolean}
 ***/
export function isMonitorRunning(engineState, isAgentRunning = false) {
  return engineState?.status === 'running' || Boolean(isAgentRunning);
}
