// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { QUICK_ACTIONS, describeQuickAction } from './quickActions';
import { retrospectiveTaskFixtures } from './__fixtures__/index.js';

/***
 * MARK: quickActions tests
 * @description Locks the registry contract: enabled-state rules per
 *   selection size, trends seeding (no backend), detail navigation, and
 *   follow-up creation via plain `POST /tasks` (never the executing
 *   `/follow-up` endpoint).
 ***/
const tasksById = new Map(retrospectiveTaskFixtures.map((t) => [t.id, t]));
const byId = (id) => QUICK_ACTIONS.find((a) => a.id === id);

describe('quickActions registry', () => {
  it('ships the v1 action list', () => {
    expect(QUICK_ACTIONS.map((a) => a.id)).toEqual([
      'find-trends',
      'open-task-detail',
      'create-follow-up',
    ]);
    for (const action of QUICK_ACTIONS) {
      expect(typeof action.label).toBe('string');
      expect(typeof action.describe).toBe('function');
      expect(typeof action.run).toBe('function');
    }
  });

  it('gates enablement on the selection', () => {
    expect(describeQuickAction(byId('find-trends'), [])).toEqual({
      enabled: false,
      reason: expect.stringContaining('at least one'),
    });
    expect(describeQuickAction(byId('find-trends'), ['a', 'b']).enabled).toBe(true);
    expect(describeQuickAction(byId('open-task-detail'), []).enabled).toBe(false);
    expect(describeQuickAction(byId('open-task-detail'), ['a', 'b']).enabled).toBe(false);
    expect(describeQuickAction(byId('open-task-detail'), ['a']).enabled).toBe(true);
    expect(describeQuickAction(byId('create-follow-up'), ['a']).enabled).toBe(true);
    expect(describeQuickAction(byId('create-follow-up'), ['a', 'b']).enabled).toBe(false);
    expect(describeQuickAction(null, ['a']).enabled).toBe(false);
  });

  it('find-trends seeds the chat without touching the backend', () => {
    const seedChat = vi.fn();
    const api = { createTask: vi.fn() };
    const result = byId('find-trends').run({
      selection: ['task-done-1', 'task-failed-2'],
      tasksById,
      seedChat,
      api,
    });
    expect(result).toEqual({ ok: true });
    expect(seedChat).toHaveBeenCalledTimes(1);
    expect(seedChat.mock.calls[0][0]).toContain('Add pagination');
    expect(seedChat.mock.calls[0][0]).toContain('Migrate the session store');
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('open-task-detail navigates to the canonical task path', () => {
    const navigate = vi.fn();
    byId('open-task-detail').run({ selection: ['a b/c'], navigate });
    expect(navigate).toHaveBeenCalledWith('/tasks/a%20b%2Fc');
  });

  it('create-follow-up posts a plain ticket referencing the source task', async () => {
    const api = { createTask: vi.fn().mockResolvedValue({ id: 'new-1' }) };
    const result = await byId('create-follow-up').run({
      selection: ['task-failed-2'],
      tasksById,
      api,
      projectId: 'proj-1',
    });
    expect(api.createTask).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({
        title: expect.stringContaining('Migrate the session store'),
        goal: expect.stringContaining('task-failed-2'),
      }),
    );
    // No execute/followUp steering flags — a plain ticket, not agent work.
    const sent = api.createTask.mock.calls[0][1];
    expect(sent).not.toHaveProperty('execute');
    expect(sent).not.toHaveProperty('followUp');
    expect(result).toEqual({ ok: true, created: { id: 'new-1' } });
  });
});
