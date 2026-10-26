const listeners = new Set();

/***
 * MARK: invalidateObservability
 * @description Notifies monitor readers that authoritative REST data changed; never forwards prompt content.
 * @example invalidateObservability('PROCESS_START', { taskId: 'task' })
 ***/
export function invalidateObservability(type, payload) {
  const event = { type, taskId: payload?.taskId || payload?.id, projectId: payload?.projectId };
  for (const listener of listeners) listener(event);
}

/***
 * MARK: subscribeObservability
 * @description Subscribes mounted monitors to existing socket invalidations, returning cleanup.
 * @example const unsubscribe = subscribeObservability(refresh)
 ***/
export function subscribeObservability(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
