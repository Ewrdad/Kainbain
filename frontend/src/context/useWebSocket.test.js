import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';

vi.mock('../services/api', () => ({
  api: { sessionHistory: vi.fn(), engineStatus: vi.fn() },
  wsUrl: vi.fn(() => 'ws://localhost/ws?projectId=proj-1'),
}));

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../services/api';
import { logger } from '../services/logger';

/**
 * MARK: useWebSocket tests
 * @description Verifies the WebSocket event bridge: message/tool-call state
 *   transitions from the MSG/TOOL/AGENT_DONE/STREAMING_UPDATE events, history
 *   re-sync on connect, and unknown-event handling.
 */

const mockInstances = [];

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.closed = false;
    mockInstances.push(this);
  }
  static reset() {
    mockInstances.length = 0;
  }
  send() {}
  close() {
    this.closed = true;
    if (this.onclose) this.onclose();
  }
  _open() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }
  _message(data) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }
}

vi.stubGlobal('WebSocket', MockWebSocket);

function currentSocket() {
  return mockInstances[mockInstances.length - 1];
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.reset();
    vi.useRealTimers();
  });

  it('MSG_START appends an assistant message and marks the agent running', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._open();
      ws._message({ type: 'MSG_START', payload: { id: 'm1' } });
    });
    expect(result.current.messages[0]).toMatchObject({
      id: 'm1',
      role: 'assistant',
      isTyping: true,
    });
    expect(result.current.isAgentRunning).toBe(true);
  });

  it('MSG_UPDATE updates an existing message content', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({ type: 'MSG_START', payload: { id: 'm1' } });
      ws._message({ type: 'MSG_UPDATE', payload: { id: 'm1', content: 'hello', isTyping: true } });
    });
    expect(result.current.messages[0].content).toBe('hello');
  });

  it('TOOL_START/TOOL_UPDATE/TOOL_END drive the tool-call lifecycle', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'TOOL_START',
        payload: { id: 't1', toolName: 'bash', args: { cmd: 'ls' } },
      });
      ws._message({ type: 'TOOL_UPDATE', payload: { id: 't1', log: 'line1' } });
      ws._message({ type: 'TOOL_END', payload: { id: 't1', finalOutput: 'done' } });
    });
    const tc = result.current.toolCalls[0];
    expect(tc.toolName).toBe('bash');
    expect(tc.args).toEqual({ cmd: 'ls' });
    expect(tc.logs).toContain('line1');
    expect(tc.logs).toContain('done');
    expect(tc.status).toBe('completed');
  });

  it('re-tags the backend "[SYSTEM] Tool invocation" mirror as a compact [TOOL] line', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._open();
      ws._message({
        type: 'PROCESS_STDOUT',
        payload: {
          chunk: '[SYSTEM] Tool invocation: bash with arguments: {"cmd":"ls"}',
        },
      });
    });
    // The monitor console's TOOL filter chip relies on the [TOOL] tag.
    const toolLogs = result.current.processLogs.filter((l) => l.tag === '[TOOL]');
    expect(toolLogs.length).toBe(1);
    expect(toolLogs[0].text).toContain('⚡');
    expect(toolLogs[0].text).toContain('bash');
    expect(toolLogs[0].text).toContain('"cmd"');
    // No [SYSTEM]-tagged tool line remains in the stream.
    expect(result.current.processLogs.some((l) => l.tag === '[SYSTEM]')).toBe(false);
  });

  it('truncates long tool arguments in the re-tagged [TOOL] line', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    const longArg = 'x'.repeat(500);
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._open();
      ws._message({
        type: 'PROCESS_STDOUT',
        payload: {
          chunk: `[SYSTEM] Tool invocation: write with arguments: {"content":"${longArg}"}`,
        },
      });
    });
    const toolLogs = result.current.processLogs.filter((l) => l.tag === '[TOOL]');
    expect(toolLogs.length).toBe(1);
    // Compact args (≤ ~120 chars + ellipsis), never the full 500-char payload.
    expect(toolLogs[0].text.length).toBeLessThan(200);
    expect(toolLogs[0].text).toContain('…');
    expect(toolLogs[0].text).not.toContain(longArg);
  });

  it('TOOL_END mirrors the completion into the process log stream as a [TOOL] line', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'TOOL_START',
        payload: { id: 't1', toolName: 'bash', args: { cmd: 'ls' } },
      });
      ws._message({
        type: 'PROCESS_STDOUT',
        payload: { chunk: '[SYSTEM] Tool invocation: bash with arguments: {"cmd":"ls"}' },
      });
      ws._message({
        type: 'TOOL_END',
        payload: { id: 't1', finalOutput: 'file.txt' },
      });
    });
    const toolLogs = result.current.processLogs.filter((l) => l.tag === '[TOOL]');
    // One invocation line (re-tagged backend mirror) + one completion line —
    // exactly one line per invocation, never a duplicate.
    expect(toolLogs.length).toBe(2);
    expect(toolLogs[0].text).toContain('⚡ bash');
    expect(toolLogs[1].text).toContain('bash');
    expect(toolLogs[1].text).toContain('completed');
    // Never stream the full tool output — only a short excerpt.
    expect(toolLogs[1].text.length).toBeLessThan(200);
  });

  it('TOOL_END summarizes a harness envelope instead of a severed JSON head', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'TOOL_START',
        payload: { id: 't1', toolName: 'bash', args: { command: 'npm run test:frontend' } },
      });
      ws._message({
        type: 'TOOL_END',
        payload: {
          id: 't1',
          finalOutput:
            '{"chunk_id": "exec-17-1", "command": "npm run test:frontend", ' +
            '"output": "Test Files  12 passed (12)\\n      Tests  148 passed (148)", ' +
            '"exit_code": 0, "description": "Run frontend tests"}',
        },
      });
    });
    const toolLogs = result.current.processLogs.filter((l) => l.tag === '[TOOL]');
    expect(toolLogs.length).toBe(1);
    expect(toolLogs[0].text).toBe(
      '✔ bash completed: $ npm run test:frontend (exit 0): Tests  148 passed (148)',
    );
  });

  it('TOOL_END with failure flags mirrors a failed [TOOL] line', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'TOOL_START',
        payload: { id: 't1', toolName: 'bash', args: { cmd: 'boom' } },
      });
      ws._message({
        type: 'PROCESS_STDOUT',
        payload: { chunk: '[SYSTEM] Tool invocation: bash with arguments: {"cmd":"boom"}' },
      });
      ws._message({
        type: 'TOOL_END',
        payload: { id: 't1', isError: true, finalOutput: 'exit code 1' },
      });
    });
    const toolLogs = result.current.processLogs.filter((l) => l.tag === '[TOOL]');
    expect(toolLogs.length).toBe(2);
    expect(toolLogs[1].text).toContain('failed');
    // The toolCall state still completes (the canvas ToolCard is not affected).
    expect(result.current.toolCalls[0].status).toBe('completed');
  });

  it('TOOL_UPDATE does not spam the log stream with partial chunks', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'TOOL_START',
        payload: { id: 't1', toolName: 'read', args: { path: 'a.js' } },
      });
      ws._message({ type: 'TOOL_UPDATE', payload: { id: 't1', log: 'partial chunk' } });
      ws._message({ type: 'TOOL_UPDATE', payload: { id: 't1', log: 'more chunk' } });
    });
    // No invocation log line is emitted from TOOL events themselves (the
    // backend's global [SYSTEM] mirror is re-tagged in PROCESS_STDOUT), and
    // partial update chunks never stream.
    expect(result.current.processLogs.filter((l) => l.tag === '[TOOL]').length).toBe(0);
  });

  it('AGENT_DONE stops the agent and clears typing state', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({ type: 'MSG_START', payload: { id: 'm1' } });
      ws._message({ type: 'AGENT_DONE', payload: {} });
    });
    expect(result.current.isAgentRunning).toBe(false);
    expect(result.current.messages[0].isTyping).toBe(false);
  });

  it('STREAMING_UPDATE sets the agent-running flag', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({ type: 'STREAMING_UPDATE', payload: { isStreaming: true } });
    });
    expect(result.current.isAgentRunning).toBe(true);
  });

  it('on open re-syncs full history (event-sync protocol)', async () => {
    api.sessionHistory.mockResolvedValue({
      messages: [{ id: 'h1', role: 'user', content: 'old', entryId: null }],
      isStreaming: false,
      tree: [{ id: 'e1' }],
    });
    const { result } = renderHook(() => useWebSocket());
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      currentSocket()._open();
    });
    expect(api.sessionHistory).toHaveBeenCalledWith('proj-1');
    expect(result.current.messages[0].content).toBe('old');
    // Session-tree sync was removed with the Attempt 4 cleanup; history sync
    // still fills the gap but no longer forwards a tree to a separate hook.
    expect(result.current.messages[0]).not.toHaveProperty('entryId');
  });

  it('reconciles engine state and running flag from server status on reconnect (D1)', async () => {
    api.sessionHistory.mockResolvedValue({ messages: [], isStreaming: false });
    api.engineStatus.mockResolvedValue({
      status: 'ok',
      engine: {
        status: 'running',
        activeTaskId: 'task-42',
        activeProjectId: 'proj-1',
        activeProjectName: 'Project A',
        activeStageId: '2',
        activeStageName: 'Review',
      },
    });
    const { result } = renderHook(() => useWebSocket());
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      currentSocket()._open();
    });
    expect(api.engineStatus).toHaveBeenCalled();
    expect(result.current.engineState.status).toBe('running');
    expect(result.current.engineState.activeTaskId).toBe('task-42');
    expect(result.current.engineState.activeStageName).toBe('Review');
    // A running engine on the server must flip isAgentRunning true even after refresh.
    expect(result.current.isAgentRunning).toBe(true);
  });

  it('logs unknown event types', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({ type: 'MYSTERY', payload: {} });
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('captures process and stage lifecycle logs with severity tags and supports combined clearLogs (#26)', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({ type: 'MSG_START', payload: { id: 'm1' } });
      ws._message({ type: 'TOOL_START', payload: { id: 't1', toolName: 'bash', args: {} } });
      ws._message({ type: 'STAGE_ENTER', payload: { stageName: 'CI Check', stageType: 'ci' } });
      ws._message({ type: 'PROCESS_START', payload: { command: 'npm test' } });
      ws._message({ type: 'PROCESS_STDOUT', payload: { chunk: '10 passing' } });
      ws._message({ type: 'PROCESS_STDERR', payload: { chunk: '1 warning' } });
      ws._message({ type: 'PROCESS_EXIT', payload: { exitCode: 0 } });
      ws._message({ type: 'STAGE_CHECKPOINT_WAIT', payload: { message: 'Review needed' } });
    });

    expect(result.current.messages.length).toBeGreaterThan(0);
    expect(result.current.toolCalls.length).toBeGreaterThan(0);
    expect(result.current.processLogs.length).toBeGreaterThanOrEqual(6);
    expect(result.current.processLogs.some((l) => l.tag === '[CI/CMD]')).toBe(true);
    expect(result.current.processLogs.some((l) => l.tag === '[ERROR]')).toBe(true);
    expect(result.current.processLogs.some((l) => l.tag === '[HUMAN]')).toBe(true);
    expect(result.current.processLogs.some((l) => l.tag === '[INFO]')).toBe(true);

    act(() => {
      result.current.clearLogs();
    });
    expect(result.current.processLogs).toEqual([]);
    expect(result.current.messages).toEqual([]);
    expect(result.current.toolCalls).toEqual([]);
  });

  it('does not open a duplicate socket when connectWebSocket is called twice for the same project', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      result.current.connectWebSocket('proj-1');
      currentSocket()._open();
    });
    // Only one socket should ever be created for the same project.
    expect(mockInstances.length).toBe(1);
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('replaces the socket when switching to a different project', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      currentSocket()._open();
      result.current.connectWebSocket('proj-2');
      currentSocket()._open();
    });
    expect(mockInstances.length).toBe(2);
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('does not schedule a reconnect when a stale socket is closed by a replacement', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const first = currentSocket();
      first._open();
      // Replacing the socket closes the first one; its onclose must not
      // schedule a reconnect (the guard checks socketRef.current !== socket).
      result.current.connectWebSocket('proj-2');
      first.close();
    });
    // The stale socket's close must not have flipped us into reconnecting.
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('updates connectionStatus on open and close, and calculates capped backoff with jitter', async () => {
    const { calculateBackoffWithJitter } = await import('./useWebSocket');
    const delay0 = calculateBackoffWithJitter(0, 500, 10000);
    expect(delay0).toBeGreaterThanOrEqual(250);
    expect(delay0).toBeLessThanOrEqual(700);

    const delayMax = calculateBackoffWithJitter(20, 500, 10000);
    expect(delayMax).toBeLessThanOrEqual(12000);

    const { result } = renderHook(() => useWebSocket({}));
    expect(result.current.connectionStatus).toBe('disconnected');

    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._open();
    });
    expect(result.current.connectionStatus).toBe('connected');

    await act(async () => {
      const ws = currentSocket();
      ws.close();
    });
    expect(result.current.connectionStatus).toBe('reconnecting');
  });

  it('handles ENGINE_STATE events and updates engineState and isAgentRunning', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    expect(result.current.engineState.status).toBe('idle');

    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'ENGINE_STATE',
        payload: {
          status: 'running',
          activeTaskId: 'task-99',
          activeProjectId: 'proj-1',
          activeProjectName: 'Project 1',
        },
      });
    });

    expect(result.current.engineState.status).toBe('running');
    expect(result.current.engineState.activeTaskId).toBe('task-99');
    expect(result.current.isAgentRunning).toBe(true);

    await act(async () => {
      const ws = currentSocket();
      ws._message({
        type: 'ENGINE_STATE',
        payload: {
          status: 'checkpoint',
          activeTaskId: 'task-99',
        },
      });
    });

    expect(result.current.engineState.status).toBe('checkpoint');
    expect(result.current.isAgentRunning).toBe(false);
  });

  it('keeps unrelated [SYSTEM] process logs while re-tagging tool invocations', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._open();
      ws._message({
        type: 'PROCESS_STDOUT',
        payload: {
          chunk: '[SYSTEM] Tool invocation: bash with arguments: {"cmd":"ls"}',
        },
      });
      ws._message({
        type: 'PROCESS_STDOUT',
        payload: { chunk: "[SYSTEM] Enqueued task #KB-123 for stage 'Plan'" },
      });
    });
    // The backend tool-invocation copy is re-tagged as [TOOL] (asserted in the
    // re-tagging test); unrelated [SYSTEM] messages must still stream verbatim.
    expect(result.current.processLogs.some((l) => l.text.includes('Enqueued task'))).toBe(true);
  });

  it('attaches projectId and projectName metadata to process logs', async () => {
    const { result } = renderHook(() => useWebSocket({}));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._open();
      ws._message({
        type: 'PROCESS_STDOUT',
        payload: {
          chunk: 'Build successful',
          projectId: 'p-1',
          projectName: 'SuperApp',
        },
      });
    });

    const log = result.current.processLogs[0];
    expect(log.projectName).toBe('SuperApp');
    expect(log.projectId).toBe('p-1');
    expect(log.raw).toContain('[SuperApp]');
  });

  it('forwards TASK_UPDATED / TASK_DELETED to the live-sync callbacks', async () => {
    const onTaskUpdated = vi.fn();
    const onTaskDeleted = vi.fn();
    const { result } = renderHook(() => useWebSocket({ onTaskUpdated, onTaskDeleted }));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'TASK_UPDATED',
        payload: {
          id: 'task-1',
          projectId: 'proj-1',
          currentStageId: '3',
          status: 'in_stage',
        },
      });
      ws._message({ type: 'TASK_DELETED', payload: { projectId: 'proj-1', taskId: 'task-1' } });
    });
    expect(onTaskUpdated).toHaveBeenCalledTimes(1);
    expect(onTaskUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', currentStageId: '3' }),
    );
    expect(onTaskDeleted).toHaveBeenCalledTimes(1);
    expect(onTaskDeleted).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1' }));
  });

  it('forwards REVIEW_UPDATED comment mutations to the review callback', async () => {
    const onReviewUpdated = vi.fn();
    const { result } = renderHook(() => useWebSocket({ onReviewUpdated }));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'REVIEW_UPDATED',
        payload: {
          taskId: 'task-1',
          type: 'comment_added',
          comment: { id: 'rc-1', body: 'line comment' },
        },
      });
    });
    expect(onReviewUpdated).toHaveBeenCalledTimes(1);
    expect(onReviewUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        type: 'comment_added',
        comment: expect.objectContaining({ id: 'rc-1' }),
      }),
    );
  });

  it('forwards CHAT_PROGRESS frames to the chat progress callback', async () => {
    const onChatProgress = vi.fn();
    const { result } = renderHook(() => useWebSocket({ onChatProgress }));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      const ws = currentSocket();
      ws._message({
        type: 'CHAT_PROGRESS',
        payload: { turnId: 'turn-1', tail: 'warming up…', projectId: 'proj-1' },
      });
    });
    expect(onChatProgress).toHaveBeenCalledTimes(1);
    expect(onChatProgress).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'turn-1', tail: 'warming up…' }),
    );
  });

  it('invokes onReconnect with the projectId on (re)connect open', async () => {
    const onReconnect = vi.fn();
    const { result } = renderHook(() => useWebSocket({ onReconnect }));
    await act(async () => {
      result.current.connectWebSocket('proj-1');
      currentSocket()._open();
    });
    expect(onReconnect).toHaveBeenCalledWith('proj-1');
  });

  it('notifies observability listeners on engine/task/process events without leaking prompt payloads', async () => {
    const { subscribeObservability } = await import('../services/observabilityEvents');
    const events = [];
    const unsubscribe = subscribeObservability((event) => events.push(event));
    try {
      const { result } = renderHook(() => useWebSocket({}));
      await act(async () => {
        result.current.connectWebSocket('proj-1');
        const ws = currentSocket();
        ws._open();
        ws._message({
          type: 'PROCESS_START',
          payload: { taskId: 't1', stageId: 's1', prompt: 'Secret dispatched prompt' },
        });
        ws._message({ type: 'ENGINE_STATE', payload: { status: 'running', activeTaskId: 't1' } });
        ws._message({ type: 'TASK_UPDATED', payload: { id: 't1' } });
        ws._message({ type: 'PROCESS_STDOUT', payload: { chunk: 'ignored' } });
      });
      expect(events.map((event) => event.type)).toEqual([
        'PROCESS_START',
        'ENGINE_STATE',
        'TASK_UPDATED',
      ]);
      expect(events.map((event) => event.taskId)).toEqual(['t1', undefined, 't1']);
      expect(JSON.stringify(events)).not.toContain('Secret dispatched prompt');
    } finally {
      unsubscribe();
    }
  });
});
