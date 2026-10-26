/***
 * MARK: healthStatus
 * @description Shared presentation vocabulary for subsystem health so the
 *   composite System Health widget and every atomic health widget describe a
 *   status in exactly the same words and colours.
 ***/

/***
 * MARK: healthStatusDotClass
 * @description Tailwind background class for a subsystem status dot:
 *   ok=green, warn=amber, disabled/unconfigured=grey (optional services that
 *   are simply absent — never red), anything else uses the caller's neutral
 *   colour (rose by default, so a real fault still reads as red).
 *   Normalizes the HealthChecker `warning` vocabulary to `warn`.
 * @example healthStatusDotClass('ok') => 'bg-emerald-400'
 * @example healthStatusDotClass('disabled') => 'bg-slate-500'
 * @example healthStatusDotClass('error') => 'bg-rose-400'
 * @example healthStatusDotClass('standby', 'bg-slate-400') => 'bg-slate-400'
 * @param {string} [status] - Raw status from the health payload.
 * @param {string} [neutral] - Class for unknown statuses.
 * @returns {string} A Tailwind background-colour class.
 ***/
export function healthStatusDotClass(status, neutral = 'bg-rose-400') {
  const normalized = status === 'warning' ? 'warn' : status;
  if (normalized === 'ok') return 'bg-emerald-400';
  if (normalized === 'warn') return 'bg-amber-400';
  if (normalized === 'disabled' || normalized === 'unconfigured') return 'bg-slate-500';
  return neutral;
}

/***
 * MARK: healthStatusLabel
 * @description The spoken equivalent of a health card's status dot. The dot is
 *   a colour-only signal (WCAG 1.4.1 Use of Colour); every health card pairs
 *   it with this word in a visually-hidden node so the ok/warn/error/unknown
 *   distinction survives without colour and reaches assistive technology
 *   (1.3.1 Info and Relationships / 4.1.2 Name, Role, Value).
 * @example healthStatusLabel('ok') => 'OK'
 * @example healthStatusLabel('warning') => 'Warning'
 * @example healthStatusLabel('disabled') => 'Disabled'
 * @example healthStatusLabel('error') => 'Error'
 * @example healthStatusLabel(undefined) => 'Unknown'
 * @param {string} [status] - Raw status from the health payload.
 * @returns {string} A short, plain-language status word.
 ***/
export function healthStatusLabel(status) {
  const normalized = status === 'warning' ? 'warn' : status;
  if (normalized === 'ok') return 'OK';
  if (normalized === 'warn') return 'Warning';
  if (normalized === 'disabled') return 'Disabled';
  if (normalized === 'unconfigured') return 'Not configured';
  if (normalized === 'error') return 'Error';
  return 'Unknown';
}

/***
 * MARK: healthOptionalLabel
 * @description Human wording for an optional service's status so grey states
 *   read as words, never raw codes.
 * @example healthOptionalLabel('disabled') => 'Disabled'
 * @example healthOptionalLabel('unconfigured') => 'Not configured'
 * @example healthOptionalLabel(undefined, 'OK') => 'OK'
 * @param {string} [status] - Raw status from the health payload.
 * @param {string} [fallback] - Wording when the status is absent.
 * @returns {string} A human-readable status label.
 ***/
export function healthOptionalLabel(status, fallback) {
  if (status === 'disabled') return 'Disabled';
  if (status === 'unconfigured') return 'Not configured';
  return status || fallback;
}

/***
 * MARK: healthOllamaOnlineLabel
 * @description Ollama Cloud's headline: "Online" when healthy, otherwise the
 *   optional-service wording (so an absent optional service never reads as a
 *   failure).
 * @example healthOllamaOnlineLabel({ status: 'ok' }) => 'Online'
 * @example healthOllamaOnlineLabel({ status: 'unconfigured' }) => 'Not configured'
 * @example healthOllamaOnlineLabel({}) => 'Standby'
 * @param {Object} [ollama] - The `checks.ollamaCloud` payload.
 * @returns {string} The headline shown on the Ollama health card.
 ***/
export function healthOllamaOnlineLabel(ollama = {}) {
  const status = ollama?.status;
  if (status === 'ok') return 'Online';
  return healthOptionalLabel(status, 'Standby');
}

/***
 * MARK: healthWebsocketStatus
 * @description Maps the WebSocket connection state onto the ok/warn/error dot
 *   vocabulary shared by every health card.
 * @example healthWebsocketStatus('connected') => 'ok'
 * @example healthWebsocketStatus('reconnecting') => 'warn'
 * @example healthWebsocketStatus('connecting') => 'error'
 * @example healthWebsocketStatus(undefined) => 'error'
 * @param {string} [connectionStatus] - Live socket state from the app context.
 * @returns {'ok'|'warn'|'error'} The dot status.
 ***/
export function healthWebsocketStatus(connectionStatus) {
  if (connectionStatus === 'connected') return 'ok';
  if (connectionStatus === 'reconnecting') return 'warn';
  return 'error';
}
