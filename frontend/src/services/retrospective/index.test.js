// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { NO_REQUEST_TIMEOUT } from '../client/request.js';
import { retrospectiveRequests } from './index.js';

/***
 * MARK: retrospectiveRequests tests
 * @description Locks the retrospective service shape: one chat-turn POST
 *   carrying the transcript, selection, and harness/model choice.
 ***/
describe('retrospectiveRequests', () => {
  it('posts the chat turn to /retrospective/chat', async () => {
    const request = vi.fn().mockResolvedValue({ reply: 'hi' });
    const { retrospectiveChat } = retrospectiveRequests(request);
    const payload = {
      messages: [{ role: 'user', content: 'Any trends?' }],
      taskIds: ['t1'],
      harness: 'pi',
      model: 'm1',
    };
    await retrospectiveChat('proj-1', payload);
    // No-timeout default: the turn runs until the model answers or the
    // caller aborts via signal (Cancel) — never a client budget.
    expect(NO_REQUEST_TIMEOUT).toBe(0);
    expect(request).toHaveBeenCalledWith(
      '/retrospective/chat',
      expect.objectContaining({ method: 'POST' }),
      expect.objectContaining({ timeoutMs: NO_REQUEST_TIMEOUT }),
    );
    const sent = JSON.parse(request.mock.calls[0][1].body);
    expect(sent).toEqual({ projectId: 'proj-1', ...payload });
  });

  it('forwards custom timeoutMs and signal options to transport', async () => {
    const request = vi.fn().mockResolvedValue({ reply: 'hi' });
    const { retrospectiveChat } = retrospectiveRequests(request);
    const controller = new AbortController();
    await retrospectiveChat(
      'proj-1',
      { messages: [{ role: 'user', content: 'hi' }] },
      {
        timeoutMs: 60000,
        signal: controller.signal,
      },
    );
    expect(request).toHaveBeenCalledWith('/retrospective/chat', expect.any(Object), {
      timeoutMs: 60000,
      signal: controller.signal,
    });
  });
});
