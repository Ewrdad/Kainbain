// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchWsMessage } from './wsMessageDispatch';

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { logger } from '../services/logger';

function setup() {
  const handlers = {
    handleMsgStart: vi.fn(),
    handleMsgUpdate: vi.fn(),
    handleToolStart: vi.fn(),
    handleToolUpdate: vi.fn(),
    handleToolEnd: vi.fn(),
    handleAgentDone: vi.fn(),
  };
  const refs = {
    onNotificationRef: { current: vi.fn() },
    onTaskUpdatedRef: { current: vi.fn() },
    onTaskDeletedRef: { current: vi.fn() },
    onReviewUpdatedRef: { current: vi.fn() },
  };
  const ctx = {
    handlers,
    setIsAgentRunning: vi.fn(),
    setEngineState: vi.fn(),
    addProcessLog: vi.fn(),
    ...refs,
  };
  return { ctx, handlers, refs };
}

/***
 * MARK: wsMessageDispatch tests
 * @description Pins the inbound frame routing table: stream frames reach
 * their handlers, engine state reconciles the running flag, board/review
 * frames forward via refs, and unknown types warn (never throw).
 ***/
describe('dispatchWsMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes stream frames to their handlers', () => {
    const { ctx, handlers } = setup();
    dispatchWsMessage('MSG_START', { id: 'm1' }, ctx);
    dispatchWsMessage('TOOL_END', { id: 't1' }, ctx);
    dispatchWsMessage('AGENT_DONE', {}, ctx);
    expect(handlers.handleMsgStart).toHaveBeenCalledWith({ id: 'm1' });
    expect(handlers.handleToolEnd).toHaveBeenCalledWith({ id: 't1' });
    expect(handlers.handleAgentDone).toHaveBeenCalled();
  });

  it('ENGINE_STATE sets engine snapshot and derives the running flag', () => {
    const { ctx } = setup();
    dispatchWsMessage('ENGINE_STATE', { status: 'running' }, ctx);
    expect(ctx.setEngineState).toHaveBeenCalledWith({ status: 'running' });
    expect(ctx.setIsAgentRunning).toHaveBeenCalledWith(true);
    dispatchWsMessage('ENGINE_STATE', { status: 'idle' }, ctx);
    expect(ctx.setIsAgentRunning).toHaveBeenCalledWith(false);
  });

  it('forwards board and review frames through the live refs', () => {
    const { ctx, refs } = setup();
    dispatchWsMessage('TASK_UPDATED', { id: 't1' }, ctx);
    dispatchWsMessage('TASK_DELETED', { projectId: 'p1' }, ctx);
    dispatchWsMessage('REVIEW_UPDATED', { id: 'r1' }, ctx);
    expect(refs.onTaskUpdatedRef.current).toHaveBeenCalledWith({ id: 't1' });
    expect(refs.onTaskDeletedRef.current).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(refs.onReviewUpdatedRef.current).toHaveBeenCalledWith({ id: 'r1' });
  });

  it('re-tags system tool mirrors as compact TOOL lines', () => {
    const { ctx } = setup();
    dispatchWsMessage(
      'PROCESS_STDOUT',
      { chunk: '[SYSTEM] Tool invocation: mytool with arguments: {"a":1}', stageType: 'shell' },
      ctx,
    );
    expect(ctx.addProcessLog).toHaveBeenCalledWith(
      '[TOOL]',
      expect.stringContaining('mytool'),
      expect.anything(),
    );
  });

  it('PROCESS_EXIT notifies success vs failure', () => {
    const { ctx, refs } = setup();
    dispatchWsMessage('PROCESS_EXIT', { exitCode: 0, command: 'ci' }, ctx);
    expect(refs.onNotificationRef.current).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
    dispatchWsMessage('PROCESS_EXIT', { exitCode: 1 }, ctx);
    expect(refs.onNotificationRef.current).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    );
  });

  it('forwards CHAT_PROGRESS frames through the optional progress ref', () => {
    const { ctx } = setup();
    const onChatProgressRef = { current: vi.fn() };
    const payload = { turnId: 't1', tail: 'warming up' };
    dispatchWsMessage('CHAT_PROGRESS', payload, { ...ctx, onChatProgressRef });
    expect(onChatProgressRef.current).toHaveBeenCalledWith(payload);
  });

  it('ignores CHAT_PROGRESS frames when no progress ref is wired', () => {
    const { ctx } = setup();
    expect(() => dispatchWsMessage('CHAT_PROGRESS', { turnId: 't1', tail: 'x' }, ctx)).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('forwards APP_STATUS_UPDATED frames through the optional project ref', () => {
    const { ctx } = setup();
    const onProjectUpdatedRef = { current: vi.fn() };
    const payload = { id: 'p1', appStatus: { url: 'http://localhost:3000' } };
    dispatchWsMessage('APP_STATUS_UPDATED', payload, { ...ctx, onProjectUpdatedRef });
    expect(onProjectUpdatedRef.current).toHaveBeenCalledWith(payload);
  });

  it('ignores APP_STATUS_UPDATED frames when no project ref is wired', () => {
    const { ctx } = setup();
    expect(() =>
      dispatchWsMessage('APP_STATUS_UPDATED', { id: 'p1' }, ctx),
    ).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns (never throws) on unknown event types', () => {
    const { ctx } = setup();
    expect(() => dispatchWsMessage('NOPE_UNKNOWN', {}, ctx)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith('Unknown WS event:', 'NOPE_UNKNOWN', {});
  });
});
