// Run in the lighter node environment: pure logic, no DOM needs.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findTaskById } from './findTaskById';

/***
 * MARK: findTaskById tests
 * @description Pins the route-param lookup behind the task detail view,
 *   imported from its own module (not the useRouteTask barrel) so the
 *   extraction stays directly covered: string route params match numeric
 *   stored ids, and bad input resolves to null instead of throwing.
 ***/
describe('findTaskById', () => {
  const tasks = [{ id: 101, goal: 'First' }, { id: 'task-202', goal: 'Second' }];

  it('matches numeric stored ids against string route params', () => {
    expect(findTaskById({ tasks, taskId: '101' })).toEqual({ id: 101, goal: 'First' });
    expect(findTaskById({ tasks, taskId: 'task-202' })).toEqual({ id: 'task-202', goal: 'Second' });
  });

  it('returns null for unknown ids and bad input', () => {
    expect(findTaskById({ tasks, taskId: 'missing' })).toBeNull();
    expect(findTaskById({ tasks, taskId: '' })).toBeNull();
    expect(findTaskById({ tasks })).toBeNull();
    expect(findTaskById({ tasks: null, taskId: '101' })).toBeNull();
    expect(findTaskById()).toBeNull();
  });
});
