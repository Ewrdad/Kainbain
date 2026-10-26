import { useCallback, useEffect, useRef, useState } from 'react';
import { api, wsUrl } from '../services/api';
import { logger } from '../services/logger';
import { invalidateObservability } from '../services/observabilityEvents';
import { calculateBackoffWithJitter } from './wsUtils.js';
import { dispatchWsMessage } from './wsMessageDispatch.js';
import { summarizeToolResult } from '../../../shared/toolLogFormat.js';

// Re-exported so existing importers (`useWebSocket.test.js`) keep working;
// the implementation lives in wsUtils.js beside the other pure helpers.
export { calculateBackoffWithJitter };

/**
 * MARK: useWebSocket
 * @description Owns the WebSocket connection to the backend and the streaming
 * UI state it drives (messages, tool calls, agent-running flag). Reconnects
 * automatically with capped exponential backoff and jitter, and re-syncs full history
 * after a reconnect so no events are lost during the gap. Inbound frames are
 * routed by wsMessageDispatch.js; pure helpers live in wsUtils.js.
 * @param {Object} [opts]
 * @param {Function} [opts.onNotification] - Callback for toast notifications.
 * @param {Function} [opts.onChatProgress] - Callback for CHAT_PROGRESS frames.
 * @param {Function} [opts.onProjectUpdated] - Callback for APP_STATUS_UPDATED frames.
 */
export function useWebSocket({
  onNotification,
  onTaskUpdated,
  onTaskDeleted,
  onReviewUpdated,
  onChatProgress,
  onProjectUpdated,
  onReconnect,
} = {}) {
  const [messages, setMessages] = useState([]);
  const [toolCalls, setToolCalls] = useState([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [processLogs, setProcessLogs] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected' | 'reconnecting' | 'disconnected'
  const [engineState, setEngineState] = useState({
    status: 'idle',
    activeTaskId: null,
    activeProjectId: null,
    activeProjectName: null,
    activeStageId: null,
    activeStageName: null,
    activeStageType: null,
  });

  const socketRef = useRef(null);
  const socketProjectRef = useRef(null); // projectId the current socket is bound to
  // Tool id -> toolName map so TOOL_END (which may omit toolName) can label
  // its mirrored [TOOL] completion line synchronously.
  const toolNamesRef = useRef({});
  const connectWebSocketRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);
  const onNotificationRef = useRef(onNotification);
  const onTaskUpdatedRef = useRef(onTaskUpdated);
  const onTaskDeletedRef = useRef(onTaskDeleted);
  const onReviewUpdatedRef = useRef(onReviewUpdated);
  const onChatProgressRef = useRef(onChatProgress);
  const onProjectUpdatedRef = useRef(onProjectUpdated);
  const onReconnectRef = useRef(onReconnect);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    onTaskUpdatedRef.current = onTaskUpdated;
  }, [onTaskUpdated]);

  useEffect(() => {
    onTaskDeletedRef.current = onTaskDeleted;
  }, [onTaskDeleted]);

  useEffect(() => {
    onReviewUpdatedRef.current = onReviewUpdated;
  }, [onReviewUpdated]);

  useEffect(() => {
    onChatProgressRef.current = onChatProgress;
  }, [onChatProgress]);

  useEffect(() => {
    onProjectUpdatedRef.current = onProjectUpdated;
  }, [onProjectUpdated]);

  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

  /***
   * MARK: addProcessLog
   * @description Appends a structured log entry with a severity tag and optional project/task metadata.
   * @param {string} tag - Severity tag ([AGENT], [HUMAN], [CI/CMD], [INFO], [ERROR]).
   * @param {string} text - Log text or chunk.
   * @param {Object} [meta] - Optional metadata containing projectId, projectName, and taskId.
   ***/
  const addProcessLog = useCallback((tag, text, meta = {}) => {
    if (!text) return;
    const str = String(text).trim();
    if (!str) return;

    // Detect if text already has a severity prefix like [TOOL], [RESULT], [AGENT], [INFO], [ERROR], [CI/CMD], [SYSTEM]
    let effectiveTag = meta?.tag || tag;
    let cleanText = str;
    const match = str.match(/^\[([A-Z0-9_/]+)\]\s*(.*)$/);
    if (match) {
      effectiveTag = `[${match[1]}]`;
      cleanText = match[2] || '';
    }

    const ts = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const projectId = meta?.projectId || null;
    const projectName = meta?.projectName || null;
    const taskId = meta?.taskId || null;
    setProcessLogs((prev) => [
      ...prev.slice(-499), // Retain latest 500 lines
      {
        id,
        timestamp: ts,
        tag: effectiveTag,
        text: cleanText || str,
        raw: `${projectName ? `[${projectName}] ` : ''}${effectiveTag} ${cleanText || str}`,
        projectId,
        projectName,
        taskId,
      },
    ]);
  }, []);

  const clearLogs = useCallback(() => {
    setProcessLogs([]);
    setMessages([]);
    setToolCalls([]);
    toolNamesRef.current = {};
  }, []);

  // ---- WebSocket event handlers ----
  const handleMsgStart = useCallback((payload) => {
    setMessages((prev) => [
      ...prev,
      { id: payload.id, role: 'assistant', content: '', isTyping: true },
    ]);
    setIsAgentRunning(true);
    // Agent reasoning is rendered as a grouped assistant message block in the
    // activity console. Do NOT also append it to processLogs — that would
    // duplicate every token as a raw line.
  }, []);

  const handleMsgUpdate = useCallback((payload) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === payload.id
          ? { ...msg, content: payload.content, isTyping: payload.isTyping }
          : msg,
      ),
    );
  }, []);

  const handleToolStart = useCallback((payload) => {
    setToolCalls((prev) => [
      ...prev,
      {
        id: payload.id,
        toolName: payload.toolName,
        args: payload.args,
        logs: [],
        status: 'executing',
      },
    ]);
    setIsAgentRunning(true);
    toolNamesRef.current[payload.id] = payload.toolName || 'tool';
    // No [TOOL] log line here: the backend broadcasts tool invocations globally
    // as "[SYSTEM] Tool invocation: …" process logs, which the PROCESS_STDOUT
    // handler re-tags into compact [TOOL] lines below. That keeps tool activity
    // visible (and TOOL-chip filterable) in every project scope without a
    // duplicate line for the subscribed session (whose TOOL_START also arrives).
  }, []);

  const handleToolUpdate = useCallback((payload) => {
    if (!payload.log) return;
    setToolCalls((prev) =>
      prev.map((tc) => {
        if (tc.id !== payload.id) return tc;
        return { ...tc, logs: [...tc.logs, payload.log] };
      }),
    );
  }, []);

  const handleToolEnd = useCallback(
    (payload) => {
      setToolCalls((prev) =>
        prev.map((tc) => {
          if (tc.id !== payload.id) return tc;
          const updated = {
            ...tc,
            status: 'completed',
          };
          if (payload.finalOutput) updated.logs = [...tc.logs, payload.finalOutput];
          return updated;
        }),
      );
      // Mirror the completion into the log stream (one line, never the full
      // output). toolName falls back to the id captured at TOOL_START.
      const toolName = payload.toolName || toolNamesRef.current[payload.id] || 'tool';
      delete toolNamesRef.current[payload.id];
      const failed = Boolean(
        payload.isError || payload.error || payload.result?.isError || payload.result?.error,
      );
      const excerpt = summarizeToolResult(toolName, payload.finalOutput, {
        failed,
        maxLength: 80,
      });
      addProcessLog(
        '[TOOL]',
        `✔ ${toolName} ${failed ? 'failed' : 'completed'}${excerpt ? `: ${excerpt}` : ''}`,
        payload,
      );
    },
    [addProcessLog],
  );

  const handleAgentDone = useCallback(
    (payload) => {
      setIsAgentRunning(false);
      setMessages((prev) => prev.map((msg) => ({ ...msg, isTyping: false })));
      addProcessLog('[AGENT]', 'Agent stage execution completed.', payload);
    },
    [addProcessLog],
  );

  // ---- Event sync: fetch full history to fill the gap after a reconnect or
  // page refresh so the session view is never wiped. Also reconcile the global
  // engine snapshot (status + active task) so the Now Playing bar and console
  // reflect reality on load even while a task is genuinely mid-run (D1).
  const fetchHistory = useCallback(async (projectId) => {
    try {
      const data = await api.sessionHistory(projectId);
      setMessages(
        (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          isTyping: false,
        })),
      );
      setToolCalls([]);
      toolNamesRef.current = {};
      setIsAgentRunning(data.isStreaming === true);
    } catch (e) {
      logger.error('Failed to fetch session history', e);
    }

    // Reconcile engine state from the server snapshot so a refresh mid-run
    // does not leave the Now Playing bar showing IDLE while the agent runs.
    try {
      const status = await api.engineStatus();
      const engine = status?.engine;
      if (engine && typeof engine === 'object') {
        setEngineState((prev) => ({
          ...prev,
          ...engine,
        }));
        if (engine.status === 'running') {
          setIsAgentRunning(true);
        } else if (
          engine.status === 'idle' ||
          engine.status === 'checkpoint' ||
          engine.status === 'waiting_human' ||
          engine.status === 'paused'
        ) {
          setIsAgentRunning(false);
        }
      }
    } catch (e) {
      logger.error('Failed to fetch engine status', e);
    }
  }, []);

  // ---- WebSocket connection ----
  const connectWebSocket = useCallback(
    (projectId) => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // Idempotency guard: connectWebSocket is invoked from both
      // loadProjectData and the activeProjectId effect, so it can be called
      // twice in quick succession for the same project. If we already have a
      // live (or connecting) socket, reuse it instead of opening a duplicate.
      // Without this, the second call closes the first socket and the stale
      // socket's async onclose schedules a reconnect, producing the
      // reconnect/connect spam seen in the UI.
      const existing = socketRef.current;
      // Reuse an existing live/connecting socket only when it is already bound
      // to the requested project. This makes connectWebSocket idempotent for
      // the same project (it is invoked from both loadProjectData and the
      // activeProjectId effect) while still reconnecting when the project
      // actually changes.
      if (
        existing &&
        socketProjectRef.current === projectId &&
        // WebSocket readyState constants: CONNECTING=0, OPEN=1. Numeric
        // literals are used so the guard also works under test mocks that do
        // not define the static constants.
        (existing.readyState === 1 || existing.readyState === 0)
      ) {
        return;
      }

      // Create the new socket and make it current BEFORE closing the old one.
      // The old socket's onclose (whether it fires synchronously or async)
      // then sees socketRef.current !== oldSocket and returns early instead of
      // scheduling a reconnect — this is what stops the reconnect/connect spam.
      const socket = new WebSocket(wsUrl(projectId));
      socketRef.current = socket;
      socketProjectRef.current = projectId;

      if (existing) {
        intentionalCloseRef.current = true;
        existing.close();
      }

      intentionalCloseRef.current = false;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { type, payload } = data;
          if (
            ['ENGINE_STATE', 'TASK_UPDATED', 'PROCESS_START', 'MSG_START', 'CONNECTED'].includes(
              type,
            )
          ) {
            invalidateObservability(type, payload);
          }
          dispatchWsMessage(type, payload, {
            handlers: {
              handleMsgStart,
              handleMsgUpdate,
              handleToolStart,
              handleToolUpdate,
              handleToolEnd,
              handleAgentDone,
            },
            setIsAgentRunning,
            setEngineState,
            addProcessLog,
            onNotificationRef,
            onTaskUpdatedRef,
            onTaskDeletedRef,
            onReviewUpdatedRef,
            onChatProgressRef,
            onProjectUpdatedRef,
          });
        } catch (e) {
          logger.error('Failed to parse WebSocket message:', e, event.data);
        }
      };

      socket.onclose = () => {
        // Only the current socket may drive reconnection. A stale socket that
        // was replaced by a newer connection (or closed on unmount) must not
        // schedule a reconnect — otherwise every replacement triggers a
        // reconnect loop that spams the UI with connect/disconnect events.
        if (socketRef.current !== socket) return;

        if (intentionalCloseRef.current) {
          setConnectionStatus('disconnected');
          return;
        }

        setConnectionStatus('reconnecting');
        const delay = calculateBackoffWithJitter(reconnectAttemptsRef.current);
        if (reconnectAttemptsRef.current === 0) {
          onNotificationRef.current?.({
            type: 'warning',
            title: 'WebSocket Disconnected',
            message: 'Connection dropped. Reconnecting...',
          });
        }
        reconnectAttemptsRef.current += 1;

        if (reconnectAttemptsRef.current === 1) {
          logger.warn(`WebSocket closed. Reconnecting in ${delay}ms...`);
        }

        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocketRef.current?.(projectId);
        }, delay);
      };

      socket.onopen = () => {
        // Ignore opens from stale sockets that were replaced before they
        // finished connecting.
        if (socketRef.current !== socket) return;
        setConnectionStatus('connected');
        if (reconnectAttemptsRef.current > 0) {
          onNotificationRef.current?.({
            type: 'success',
            title: 'WebSocket Connected',
            message: 'Live connection restored.',
          });
        }
        reconnectAttemptsRef.current = 0;
        // On (re)connect, sync the full history so no events are lost during
        // the gap between disconnect and reconnect.
        fetchHistory(projectId);
        // Also refresh the task board so any board-position changes that
        // happened while disconnected (or in a throttled background tab) are
        // caught up immediately, not just on the next poll.
        onReconnectRef.current?.(projectId);
      };

      socket.onerror = () => {
        // Quiet expected connection drop errors to avoid terminal / console spam
      };
    },
    [
      handleMsgStart,
      handleMsgUpdate,
      handleToolStart,
      handleToolUpdate,
      handleToolEnd,
      handleAgentDone,
      fetchHistory,
      addProcessLog,
    ],
  );

  // Keep the latest connectWebSocket in a ref so the reconnect timer can call it.
  useEffect(() => {
    connectWebSocketRef.current = connectWebSocket;
  }, [connectWebSocket]);

  // Cleanup socket and timers on unmount.
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
        socketProjectRef.current = null;
      }
    };
  }, []);

  return {
    messages,
    setMessages,
    toolCalls,
    setToolCalls,
    processLogs,
    setProcessLogs,
    addProcessLog,
    clearLogs,
    isAgentRunning,
    setIsAgentRunning,
    engineState,
    setEngineState,
    connectionStatus,
    connectWebSocket,
  };
}
