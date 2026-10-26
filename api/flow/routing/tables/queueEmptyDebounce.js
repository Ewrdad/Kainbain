/***
 * MARK: QUEUE_EMPTY_DEBOUNCE_MS
 * @description Debounce delay before firing a queue-empty web push notification.
 *   Prevents push notification storms when tasks quickly transition or arrive
 *   in batches.
 * @example QUEUE_EMPTY_DEBOUNCE_MS => 5000
 ***/
export const QUEUE_EMPTY_DEBOUNCE_MS = 5000;
