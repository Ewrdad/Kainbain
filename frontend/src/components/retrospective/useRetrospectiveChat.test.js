import { describe, it, expect, beforeEach } from 'vitest';
import {
  readChatError,
  loadStoredChat,
  saveStoredChat,
  clearStoredChat,
  storageKeyForProject,
  legacyStorageKeyForProject,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_MESSAGES,
} from './useRetrospectiveChat.js';
import { NO_REQUEST_TIMEOUT } from '../../services/client/request.js';

/***
 * MARK: useRetrospectiveChat pure-helper tests
 * @description Pins the hook's pure seams without rendering: the transport
 *   error classification matrix, the versioned storage key, and the
 *   defensive persistence round-trip (corrupt state degrades to fresh).
 *   Turn behaviour itself is covered through the component suite.
 ***/
describe('readChatError', () => {
  it('keeps the 501 degraded check first', () => {
    expect(
      readChatError({
        status: 501,
        body: JSON.stringify({
          code: 'unsupported_by_harness',
          capability: 'prompt',
          harness: 'x',
        }),
      }),
    ).toEqual({ kind: 'degraded', capability: 'prompt', harness: 'x' });
  });

  it('maps client aborts to interruptions without naming a budget', () => {
    // No-timeout default: a status-less AbortError means the request was
    // interrupted (proxy abort, navigation race), never a budget expiry.
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const parsed = readChatError(abort);
    expect(parsed.kind).toBe('timeout');
    expect(parsed.source).toBe('client');
    expect(parsed.message).toBe('The request was interrupted before the model answered. Retry?');
    expect(parsed.message).not.toContain('min');
  });

  it('maps server 504 stops with the server-side copy', () => {
    expect(
      readChatError({ status: 504, body: JSON.stringify({ code: 'chat_prompt_timeout' }) }),
    ).toEqual({
      kind: 'timeout',
      source: 'server',
      message: 'The server stopped waiting for the model. Retry?',
    });
  });

  it('maps a bare proxy 504 (no structured code) onto honest proxy copy', () => {
    // A reverse proxy in front of the app (e.g. nginx default 60s
    // proxy_read_timeout) answers 504 with an HTML page, not the app's
    // structured JSON — the turn may still be running server-side, so the
    // copy must not blame the app server. `kind` stays 'timeout' so retry
    // and the partial-output panel behave identically.
    const html504 = readChatError({
      status: 504,
      body: '<html><head><title>504 Gateway Time-out</title></head></html>',
    });
    expect(html504.kind).toBe('timeout');
    expect(html504.source).toBe('proxy');
    expect(html504.message).toContain('proxy');
    expect(html504.message).toContain('still be running');
    expect(html504.message).toContain('Retry?');
    expect(html504.message).not.toBe('The server stopped waiting for the model. Retry?');

    // Code-less variants classify the same way: empty body, unparseable
    // body, and JSON without the chat_prompt_timeout code.
    for (const body of ['', '{oops', JSON.stringify({ error: 'Gateway Time-out' })]) {
      const parsed = readChatError({ status: 504, body });
      expect(parsed.kind).toBe('timeout');
      expect(parsed.source).toBe('proxy');
    }

    // The structured app-server 504 keeps its exact shape (no source drift).
    expect(
      readChatError({ status: 504, body: JSON.stringify({ code: 'chat_prompt_timeout' }) }),
    ).toEqual({
      kind: 'timeout',
      source: 'server',
      message: 'The server stopped waiting for the model. Retry?',
    });
  });

  it('maps a bare 408 (app HTTP ceiling) onto a server timeout, never generic', () => {
    // A mis-ordered server pairing (KAINBAIN_SERVER_REQUEST_TIMEOUT_MS at or
    // below the chat ceiling) kills long turns with a bare 408 instead of a
    // structured 504 — see checkTimeoutPairing. The copy names the server
    // and keeps kind 'timeout' so retry works identically.
    const bare408 = readChatError({ status: 408, body: '' });
    expect(bare408.kind).toBe('timeout');
    expect(bare408.source).toBe('server');
    expect(bare408.message).toContain('server');
    expect(bare408.message).toContain('Retry?');

    // A structured chat-timeout code still wins wherever it appears.
    expect(
      readChatError({ status: 408, body: JSON.stringify({ code: 'chat_prompt_timeout' }) }),
    ).toEqual({
      kind: 'timeout',
      source: 'server',
      message: 'The server stopped waiting for the model. Retry?',
    });

    // The server output tail rides along when present, and stays absent
    // otherwise (exact-shape contracts hold).
    expect(
      readChatError({
        status: 408,
        body: JSON.stringify({ error: 'Request Timeout', output: 'warming up…' }),
      }).output,
    ).toBe('warming up…');
    expect(readChatError({ status: 408, body: '' })).not.toHaveProperty('output');
  });

  it('maps server 502 model failures onto the designed copy', () => {
    expect(
      readChatError({ status: 502, body: JSON.stringify({ code: 'chat_prompt_failed' }) }),
    ).toEqual({
      kind: 'model-failed',
      message: 'The model failed to answer this turn. Retry?',
    });
  });

  it('maps 404 stale ids, passing through the unknown id list', () => {
    expect(
      readChatError({
        status: 404,
        body: JSON.stringify({
          code: 'task_not_found',
          taskId: 'gone',
          unknownTaskIds: ['gone', 'gone-too'],
          error: 'Task gone not found',
        }),
      }),
    ).toEqual({
      kind: 'task_not_found',
      taskId: 'gone',
      unknownTaskIds: ['gone', 'gone-too'],
      message: 'Task gone not found',
    });
    // Legacy single-id shape (no array) degrades to an empty list.
    expect(
      readChatError({
        status: 404,
        body: JSON.stringify({ code: 'task_not_found', taskId: 'gone', error: 'gone' }),
      }).unknownTaskIds,
    ).toEqual([]);
  });

  it('maps 400 input-cap breaches with their detail', () => {
    expect(
      readChatError({
        status: 400,
        body: JSON.stringify({ code: 'chat_input_too_large', detail: 'too big', error: 'over' }),
      }),
    ).toEqual({ kind: 'oversized', message: 'over', detail: 'too big' });
  });

  it('carries the server output tail on timeout, model-failed, and generic errors', () => {
    expect(
      readChatError({
        status: 504,
        body: JSON.stringify({
          code: 'chat_prompt_timeout',
          error: 'timed out',
          output: 'warming up…',
        }),
      }).output,
    ).toBe('warming up…');
    expect(
      readChatError({
        status: 502,
        body: JSON.stringify({
          code: 'chat_prompt_failed',
          error: 'boom',
          output: 'before the boom',
        }),
      }).output,
    ).toBe('before the boom');
    expect(
      readChatError({ status: 500, body: JSON.stringify({ error: 'bad', output: 'trace' }) })
        .output,
    ).toBe('trace');
    // Absent tail adds no key (the exact-shape contracts above stay intact).
    expect(
      readChatError({ status: 504, body: JSON.stringify({ code: 'chat_prompt_timeout' }) }),
    ).not.toHaveProperty('output');
    expect(readChatError(new Error('x'))).not.toHaveProperty('output');
  });

  it('falls back to generic failures and returns null for missing errors', () => {
    expect(readChatError(new Error('boom'))).toEqual({ kind: 'generic', message: 'boom' });
    expect(readChatError({ status: 500, body: '{oops' })).toEqual({
      kind: 'generic',
      message: 'Chat failed. Try again.',
    });
    expect(readChatError(null)).toBeNull();
  });
});

describe('chat storage helpers', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('scopes the versioned key per project', () => {
    expect(storageKeyForProject('proj-1')).toBe('kb.retroChat.v2.proj-1');
    expect(storageKeyForProject(null)).toBe('kb.retroChat.v2.default');
    expect(legacyStorageKeyForProject('proj-1')).toBe('kb.retroChat.v1.proj-1');
  });

  it('round-trips state and caps the stored transcript', () => {
    const messages = Array.from({ length: MAX_CHAT_MESSAGES + 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));
    saveStoredChat('proj-1', { messages, chatTaskIds: ['t1'], harnessId: 'pi', model: 'm1' });
    const restored = loadStoredChat('proj-1');
    expect(restored.messages).toHaveLength(MAX_CHAT_MESSAGES);
    expect(restored.messages.at(-1).content).toBe(`m${MAX_CHAT_MESSAGES + 9}`);
    expect(restored.chatTaskIds).toEqual(['t1']);
    expect(restored.harnessId).toBe('pi');
    expect(restored.model).toBe('m1');
  });

  it('returns null for missing or corrupt state', () => {
    expect(loadStoredChat('proj-1')).toBeNull();
    window.sessionStorage.setItem('kb.retroChat.v2.proj-1', '{oops');
    expect(loadStoredChat('proj-1')).toBeNull();
    window.sessionStorage.setItem('kb.retroChat.v2.proj-1', JSON.stringify({ messages: 'nope' }));
    expect(loadStoredChat('proj-1').messages).toEqual([]);
  });

  it('filters foreign item shapes instead of trusting them', () => {
    saveStoredChat('proj-1', {
      messages: [
        { role: 'user', content: 'keep me' },
        { role: 'user' },
        { role: 'system', content: 'not a chat role' },
        null,
      ],
      chatTaskIds: ['t1', 42, null],
      harnessId: 'pi',
      model: 'm1',
    });
    const restored = loadStoredChat('proj-1');
    expect(restored.messages).toEqual([{ role: 'user', content: 'keep me' }]);
    expect(restored.chatTaskIds).toEqual(['t1']);
  });

  it('persists the per-message output tail and drops non-string tails', () => {
    saveStoredChat('proj-1', {
      messages: [
        { role: 'assistant', content: 'hi', output: 'trace tail' },
        { role: 'assistant', content: 'no tail', output: 42 },
      ],
      chatTaskIds: [],
      harnessId: 'pi',
      model: '',
    });
    expect(loadStoredChat('proj-1').messages).toEqual([
      { role: 'assistant', content: 'hi', output: 'trace tail' },
      { role: 'assistant', content: 'no tail' },
    ]);
  });

  it('purges one project without touching others', () => {
    saveStoredChat('proj-1', { messages: [], chatTaskIds: [], harnessId: 'pi', model: '' });
    saveStoredChat('proj-2', { messages: [], chatTaskIds: ['t9'], harnessId: 'pi', model: '' });
    clearStoredChat('proj-1');
    expect(window.sessionStorage.getItem('kb.retroChat.v2.proj-1')).toBeNull();
    expect(loadStoredChat('proj-2').chatTaskIds).toEqual(['t9']);
  });

  it('drops the legacy key on clear so cleared chats never resurrect', () => {
    window.sessionStorage.setItem(
      'kb.retroChat.v1.proj-1',
      JSON.stringify({ messages: [{ role: 'user', content: 'old' }] }),
    );
    clearStoredChat('proj-1');
    expect(window.sessionStorage.getItem('kb.retroChat.v1.proj-1')).toBeNull();
    expect(loadStoredChat('proj-1')).toBeNull();
  });

  it('migrates a v1 payload to v2 on read and removes the v1 key', () => {
    window.sessionStorage.setItem(
      'kb.retroChat.v1.proj-1',
      JSON.stringify({
        messages: [{ role: 'user', content: 'migrate me' }],
        chatTaskIds: ['t1'],
        harnessId: 'pi',
        model: 'm1',
      }),
    );
    const restored = loadStoredChat('proj-1');
    expect(restored.messages).toEqual([{ role: 'user', content: 'migrate me' }]);
    expect(restored.chatTaskIds).toEqual(['t1']);
    expect(restored.harnessId).toBe('pi');
    expect(restored.model).toBe('m1');
    expect(restored.interrupted).toBeNull();
    expect(window.sessionStorage.getItem('kb.retroChat.v1.proj-1')).toBeNull();
    expect(window.sessionStorage.getItem('kb.retroChat.v2.proj-1')).not.toBeNull();
  });

  it('prefers v2 over a stale v1 payload', () => {
    window.sessionStorage.setItem(
      'kb.retroChat.v1.proj-1',
      JSON.stringify({ messages: [{ role: 'user', content: 'stale' }] }),
    );
    saveStoredChat('proj-1', {
      messages: [{ role: 'user', content: 'fresh' }],
      chatTaskIds: [],
      harnessId: 'pi',
      model: '',
    });
    expect(loadStoredChat('proj-1').messages).toEqual([{ role: 'user', content: 'fresh' }]);
  });

  it('round-trips the in-flight-turn descriptor for reload recovery', () => {
    const pendingTurn = {
      turnId: 'turn-1',
      turnMessages: [{ role: 'user', content: 'long question' }],
      taskIds: ['t1', 42],
      userText: 'long question',
      startedAt: 1234567890,
      progressTail: 'warming up…',
    };
    saveStoredChat('proj-1', {
      messages: [{ role: 'user', content: 'long question' }],
      chatTaskIds: ['t1'],
      harnessId: 'pi',
      model: '',
      pendingTurn,
    });
    expect(loadStoredChat('proj-1').interrupted).toEqual({
      turnId: 'turn-1',
      turnMessages: [{ role: 'user', content: 'long question' }],
      taskIds: ['t1'],
      userText: 'long question',
      startedAt: 1234567890,
      progressTail: 'warming up…',
    });
  });

  it('drops corrupt in-flight descriptors but keeps the transcript', () => {
    saveStoredChat('proj-1', {
      messages: [{ role: 'user', content: 'kept' }],
      chatTaskIds: [],
      pendingTurn: { turnId: '', turnMessages: [], userText: '' },
    });
    const restored = loadStoredChat('proj-1');
    expect(restored.messages).toEqual([{ role: 'user', content: 'kept' }]);
    expect(restored.interrupted).toBeNull();
  });

  it('stays fail-soft when storage throws (quota or security)', () => {
    const throwingSet = () => {
      throw new Error('quota exceeded');
    };
    const original = window.sessionStorage.setItem;
    window.sessionStorage.setItem = throwingSet;
    try {
      expect(() => saveStoredChat('proj-1', { messages: [], chatTaskIds: [] })).not.toThrow();
    } finally {
      window.sessionStorage.setItem = original;
    }
  });
});

describe('chat budgets', () => {
  // No-timeout default: chat turns run until the model answers or the
  // caller cancels — there is deliberately no client budget to pair with
  // the (also disabled) server ceiling. These pins stop a future timeout
  // from being reintroduced as a bare number.
  it('sends chat turns with the no-timeout sentinel, not a budget', () => {
    expect(NO_REQUEST_TIMEOUT).toBe(0);
    expect(MAX_CHAT_MESSAGE_CHARS).toBe(8000);
    expect(MAX_CHAT_MESSAGES).toBe(50);
  });
});
