// Domain: Retrospective — cross-task review chat turns.
import { NO_REQUEST_TIMEOUT } from '../client/request.js';

/***
 * MARK: retrospectiveRequests
 * @description Describes the retrospective requests using the application's
 *   existing connection. The chat turn posts the frontend-held transcript
 *   plus selected-task ids; the backend resolves the harness and returns the
 *   reply with structured ticket drafts (501 `unsupported_by_harness` when
 *   the harness cannot chat — callers render the degraded notice).
 *
 *   Chat turns run with NO client timeout: a turn settles when the model
 *   answers or when the caller aborts via `signal` (Cancel / Retry /
 *   Clear / project switch). Pass an explicit positive `timeoutMs` to
 *   opt back into a client budget (used by tests, never by the chat UI).
 * @example const requests = retrospectiveRequests(request);
 ***/
export function retrospectiveRequests(request) {
  return {
    retrospectiveChat: (
      projectId,
      { messages, taskIds, harness, model, strictTaskIds, turnId } = {},
      { timeoutMs = NO_REQUEST_TIMEOUT, signal } = {},
    ) =>
      request(
        '/retrospective/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            messages,
            taskIds,
            harness,
            model,
            strictTaskIds,
            ...(turnId ? { turnId } : {}),
          }),
        },
        { timeoutMs, signal },
      ),
  };
}
