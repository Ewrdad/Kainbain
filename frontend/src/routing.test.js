// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { expect, test } from 'vitest';
import { viewToPath, routeToView, normalizeLegacyUrl } from './routing';

/***
 * MARK: routing tests
 * @description Locks the route-table contract: every view has exactly one
 *   canonical path, unknown locations resolve to null (never a view switch),
 *   and legacy entry URLs normalise onto canonical hashes.
 ***/

test.each([
  ['orchestrator', undefined, '/'],
  ['tasks', undefined, '/'],
  ['explorer', undefined, '/explorer'],
  ['settings', undefined, '/settings'],
  ['system-settings', undefined, '/system-settings'],
  ['observability', undefined, '/observability'],
  ['docs', undefined, '/docs'],
  ['task-detail', undefined, '/'],
  ['task-review', undefined, '/'],
  ['task-survey', undefined, '/'],
  ['retrospective', undefined, '/retrospective'],
])('viewToPath(%s) => %s without params', (view, opts, expected) => {
  expect(viewToPath(view, opts)).toBe(expected);
});

test.each([
  ['docs', { slug: 'architecture' }, '/docs/architecture'],
  ['system-settings', { section: 'models' }, '/system-settings/models'],
  ['task-detail', { taskId: 't1' }, '/tasks/t1'],
  ['task', { taskId: 't1' }, '/tasks/t1'],
  ['task-review', { taskId: 't1' }, '/tasks/t1/review'],
  ['task-review', { taskId: 'a b/c' }, '/tasks/a%20b%2Fc/review'],
  ['task-survey', { taskId: 't1' }, '/tasks/t1/survey'],
])('viewToPath(%s, %j) => %s', (view, opts, expected) => {
  expect(viewToPath(view, opts)).toBe(expected);
});

test('viewToPath returns null for unknown views', () => {
  expect(viewToPath('nope')).toBeNull();
  expect(viewToPath('')).toBeNull();
});

test.each([
  ['/', { view: 'orchestrator' }],
  ['/orchestrator', { view: 'orchestrator' }],
  ['/explorer', { view: 'explorer' }],
  ['/settings', { view: 'settings' }],
  ['/system-settings', { view: 'system-settings' }],
  ['/system-settings/models', { view: 'system-settings', section: 'models' }],
  ['/observability', { view: 'observability' }],
  ['/docs', { view: 'docs' }],
  ['/docs/architecture', { view: 'docs', slug: 'architecture' }],
  ['/tasks/t1', { view: 'task-detail', taskId: 't1' }],
  ['/task/t1', { view: 'task-detail', taskId: 't1' }],
  ['/tasks/t1/review', { view: 'task-review', taskId: 't1' }],
  ['/task/t1/review', { view: 'task-review', taskId: 't1' }],
  ['/tasks/t1/survey', { view: 'task-survey', taskId: 't1' }],
  ['/task/t1/survey', { view: 'task-survey', taskId: 't1' }],
  ['/retrospective', { view: 'retrospective' }],
])('routeToView(%s) resolves', (pathname, expected) => {
  expect(routeToView(pathname)).toEqual(expected);
});

test.each([['/main-content'], ['/nope'], ['/docs/a/b'], ['/tasks'], ['/tasks/t1/extra'], ['']])(
  'routeToView(%s) is null so unknown locations never switch the view',
  (pathname) => {
    expect(routeToView(pathname)).toBeNull();
  },
);

test('routeToView round-trips every viewToPath result', () => {
  const cases = [
    ['orchestrator', {}],
    ['explorer', {}],
    ['settings', {}],
    ['system-settings', {}],
    ['system-settings', { section: 'runners' }],
    ['observability', {}],
    ['docs', {}],
    ['docs', { slug: 'install-run' }],
    ['task-detail', { taskId: 'abc-123' }],
    ['task-review', { taskId: 'abc-123' }],
    ['task-survey', { taskId: 'abc-123' }],
    ['retrospective', {}],
  ];
  for (const [view, opts] of cases) {
    const resolved = routeToView(viewToPath(view, opts));
    expect(resolved?.view).toBe(view === 'task' ? 'task-detail' : view);
  }
});

test.each([
  [{ hash: '#/docs/architecture', search: '', pathname: '/' }, null],
  [{ hash: '#/', search: '', pathname: '/' }, null],
  [{ hash: '', search: '', pathname: '/' }, null],
  [{ hash: '#main-content', search: '', pathname: '/' }, null],
  [{ hash: '#docs', search: '', pathname: '/' }, '#/docs'],
  [{ hash: '#/orchestrator', search: '', pathname: '/' }, '#/'],
  [{ hash: '#/task/t1', search: '', pathname: '/' }, '#/tasks/t1'],
  [{ hash: '#/task/t1/review', search: '', pathname: '/' }, '#/tasks/t1/review'],
  [{ hash: '#/task/t1/survey', search: '', pathname: '/' }, '#/tasks/t1/survey'],
  [{ hash: '', search: '?view=task-survey&task=t1', pathname: '/' }, '#/tasks/t1/survey'],
  [{ hash: '', search: '', pathname: '/tasks/t1/survey' }, '#/tasks/t1/survey'],
  [{ hash: '', search: '?view=docs', pathname: '/' }, '#/docs'],
  [{ hash: '', search: '?view=explorer', pathname: '/' }, '#/explorer'],
  [{ hash: '', search: '?view=observability', pathname: '/' }, '#/observability'],
  [{ hash: '', search: '?view=settings', pathname: '/' }, '#/settings'],
  [{ hash: '', search: '?view=system-settings', pathname: '/' }, '#/system-settings'],
  [{ hash: '', search: '?view=orchestrator', pathname: '/' }, '#/'],
  [{ hash: '', search: '?task=t9', pathname: '/' }, '#/tasks/t9'],
  [{ hash: '', search: '?view=task-review&task=t9', pathname: '/' }, '#/tasks/t9/review'],
  [{ hash: '', search: '?view=nope', pathname: '/' }, null],
  [{ hash: '', search: '', pathname: '/docs/faq' }, '#/docs/faq'],
  [{ hash: '', search: '', pathname: '/system-settings' }, '#/system-settings'],
  [{ hash: '', search: '', pathname: '/system-settings/models' }, '#/system-settings/models'],
  [{ hash: '', search: '', pathname: '/observability' }, '#/observability'],
  [{ hash: '', search: '', pathname: '/retrospective' }, '#/retrospective'],
])('normalizeLegacyUrl(%j) => %s', (loc, expected) => {
  expect(normalizeLegacyUrl(loc)).toBe(expected);
});

test('legacy ?view= wins over a conflicting hash, matching the old boot order', () => {
  expect(
    normalizeLegacyUrl({ hash: '#/docs/architecture', search: '?view=explorer', pathname: '/' }),
  ).toBe('#/explorer');
});
