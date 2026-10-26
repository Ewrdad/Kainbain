// node env pin: pure filesystem scan of the static service-worker asset
// (no DOM needs); keeps `node:` imports native per the mobileCss precedent.
// @vitest-environment node
// MARK: push service-worker lifecycle tests
// @description Guards the /sw.js update contract that stale devices depend
//   on: a repeat-tested mobile browser keeps its previously registered
//   worker active while any tab stays open, so without skipWaiting +
//   clients.claim a refreshed worker never takes over and server-accepted
//   test pushes route to a worker with no 'push' listener — permission
//   granted, delivery reported, nothing displayed.
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function swSource() {
  // Vitest runs with cwd set to the frontend package root.
  return readFileSync(resolve('public/sw.js'), 'utf8');
}

test('service worker activates updates immediately (skipWaiting + claim)', () => {
  const source = swSource();
  expect(source).toMatch(/\.skipWaiting\s*\(\s*\)/);
  expect(source).toMatch(/clients\.claim\s*\(\s*\)/);
});

test('service worker still handles push display and notification clicks', () => {
  const source = swSource();
  expect(source).toMatch(/addEventListener\s*\(\s*['"]push['"]/);
  expect(source).toMatch(/showNotification/);
  expect(source).toMatch(/addEventListener\s*\(\s*['"]notificationclick['"]/);
});
