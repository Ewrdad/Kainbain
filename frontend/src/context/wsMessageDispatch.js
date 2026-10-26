// Domain: context/websocket — inbound frame dispatch (pure over ctx).
// Routes one parsed {type, payload} to stream handlers, engine snapshot,
// log stream, and the live-sync/review refs owned by useWebSocket.
import { logger } from '../services/logger';
import { compactArgsForLog, parseSystemToolInvocation } from './wsUtils.js';

/***
 * MARK: dispatchWsMessage
 * @description Routes one parsed WebSocket frame to its handler. The ctx
 * carries the stream callbacks, React setters, the log appender, and the
 * callback refs — all owned by useWebSocket, so this table stays testable
 * without rendering a hook.
 * @param {string} type - Frame type (MSG_START, TOOL_END, ...).
 * @param {any} payload - Frame payload.
 * @param {Object} ctx - { handlers, setIsAgentRunning, setEngineState,
 *   addProcessLog, onNotificationRef, onTaskUpdatedRef, onTaskDeletedRef,
 *   onReviewUpdatedRef, onChatProgressRef?, onProjectUpdatedRef? }.
 ***/
export function dispatchWsMessage(type, payload, ctx) {
  const {
    handlers,
    setIsAgentRunning,
    setEngineState,
    addProcessLog,
    onNotificationRef,
    onTaskUpdatedRef,
    onTaskDeletedRef,
    onReviewUpdatedRef,
    onChatProgressRef,
    onProjectUpdatedRef,
  } = ctx;
  switch (type) {
    case 'MSG_START':
      handlers.handleMsgStart(payload);
      break;
    case 'MSG_UPDATE':
      handlers.handleMsgUpdate(payload);
      break;
    case 'TOOL_START':
      handlers.handleToolStart(payload);
      break;
    case 'TOOL_UPDATE':
      handlers.handleToolUpdate(payload);
      break;
    case 'TOOL_END':
      handlers.handleToolEnd(payload);
      break;
    case 'AGENT_DONE':
      handlers.handleAgentDone();
      break;
    case 'STREAMING_UPDATE':
      setIsAgentRunning(payload.isStreaming);
      break;
    case 'ENGINE_STATE':
      setEngineState(payload);
      if (payload.status === 'running') {
        setIsAgentRunning(true);
      } else if (
        payload.status === 'idle' ||
        payload.status === 'checkpoint' ||
        payload.status === 'paused'
      ) {
        setIsAgentRunning(false);
      }
      break;
    case 'PROCESS_START':
      if (payload.stageType === 'agent' || (!payload.command && payload.prompt)) {
        addProcessLog(
          '[AGENT]',
          `Agent reasoning started in stage: ${payload.stageName || payload.stageId || ''}`,
          payload,
        );
      } else {
        addProcessLog('[CI/CMD]', `Starting CI command: ${payload.command || ''}`, payload);
      }
      setIsAgentRunning(true);
      break;
    case 'PROCESS_STDOUT': {
      const defaultTag =
        payload.tag || (payload.stageType === 'agent' ? '[AGENT]' : '[CI/CMD]');
      // The backend mirrors tool invocations globally as "[SYSTEM] Tool
      // invocation: <name> with arguments: <args>" system logs
      // (api/eventBridge.js). Re-tag them as compact, TOOL-chip-filterable
      // [TOOL] lines so tool activity is observable in every project scope
      // (TOOL_START events only reach the session's own subscribers).
      if (typeof payload.chunk === 'string') {
        const invocation = parseSystemToolInvocation(payload.chunk);
        if (invocation) {
          addProcessLog(
            '[TOOL]',
            `⚡ ${invocation.name}(${compactArgsForLog(invocation.args, 120, invocation.name)})`,
            payload,
          );
          break;
        }
      }
      addProcessLog(defaultTag, payload.chunk || '', payload);
      break;
    }
    case 'PROCESS_STDERR':
      addProcessLog('[ERROR]', payload.chunk || '', payload);
      break;
    case 'PROCESS_EXIT':
      addProcessLog(
        payload.exitCode === 0 ? '[CI/CMD]' : '[ERROR]',
        `Process exited with code ${payload.exitCode}`,
        payload,
      );
      setIsAgentRunning(false);
      if (payload.exitCode === 0) {
        onNotificationRef.current?.({
          type: 'success',
          title: 'CI Passed',
          message: `CI command passed (exit 0)${payload.command ? `: ${payload.command}` : ''}`,
        });
      } else {
        onNotificationRef.current?.({
          type: 'error',
          title: 'CI Failed',
          message: `CI command exited with code ${payload.exitCode}${payload.command ? ` (${payload.command})` : ''}`,
        });
      }
      break;
    case 'STAGE_ENTER':
      addProcessLog(
        '[INFO]',
        `Entering stage: ${payload.stageName || payload.stageId || ''} (${payload.stageType || 'agent'})`,
        payload,
      );
      break;
    case 'STAGE_CHECKPOINT_WAIT':
      addProcessLog(
        '[HUMAN]',
        `Checkpoint: ${payload.message || 'Waiting for human approval'}`,
        payload,
      );
      setIsAgentRunning(false);
      onNotificationRef.current?.({
        type: 'info',
        title: 'Review Required',
        message: payload.message || 'Human review checkpoint reached',
      });
      break;
    case 'STAGE_COMPLETE': {
      const stageName = payload.stageName || payload.stageId || 'Stage';
      const nextStageName = payload.nextStageName;
      const logMsg =
        payload.message ||
        (nextStageName
          ? `Stage '${stageName}' complete — advancing to '${nextStageName}'`
          : payload.isTerminal || payload.pipelineFinished
            ? `Stage '${stageName}' complete — pipeline finished`
            : `Stage '${stageName}' complete`);
      addProcessLog('[AGENT]', logMsg, payload);
      break;
    }
    case 'STAGE_FAILBACK':
      addProcessLog(
        '[ERROR]',
        `Stage failback triggered -> target stage: ${payload.targetStageId || 'previous'}${payload.error ? ` (${payload.error})` : ''}`,
        payload,
      );
      onNotificationRef.current?.({
        type: 'error',
        title: 'Stage Failed',
        message: payload.error
          ? `${payload.error}`
          : `Failback to stage: ${payload.targetStageId || 'previous'}`,
      });
      break;
    case 'NOTIFICATION':
      if (payload) {
        onNotificationRef.current?.({
          type: payload.type || 'info',
          title: payload.title || 'Notification',
          message: payload.message || '',
          duration: payload.duration || (payload.type === 'error' ? 8000 : 5000),
        });
      }
      break;
    // Live board sync: a task's board position or status changed elsewhere
    // (drag in another tab, agent stage advance, create, update). Push the
    // change into the task list without requiring a page refresh.
    case 'TASK_UPDATED':
      onTaskUpdatedRef.current?.(payload);
      break;
    case 'TASK_DELETED':
      onTaskDeletedRef.current?.(payload);
      break;
    // PR review: a comment was created/updated/replied/deleted (or a
    // snapshot commit landed) — let the open review view merge it live.
    case 'REVIEW_UPDATED':
      onReviewUpdatedRef.current?.(payload);
      break;
    // Chat progress: a streaming tail for one in-flight chat turn — the
    // ChatTurnProvider matches it to its turn by turnId (optional ref: old
    // callers without chat wiring simply ignore the frame).
    case 'CHAT_PROGRESS':
      onChatProgressRef?.current?.(payload);
      break;
    // App link: the project's "Go to App" record changed (script PATCH,
    // agent skill, or health probe) — merge it so the link appears live.
    // Optional ref: old callers without project wiring ignore the frame.
    case 'APP_STATUS_UPDATED':
      onProjectUpdatedRef?.current?.(payload);
      break;
    case 'CONNECTED':
      // Server-side acknowledgement that the WS connection for this
      // project is established.
      break;
    default:
      logger.warn('Unknown WS event:', type, payload);
  }
}
