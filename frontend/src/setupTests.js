/***
 * MARK: setupTests
 * @description Configures the global test environment, providing a robust mock for window.localStorage
 *   and importing testing-library extensions.
 ***/
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { vi } from 'vitest';

// MARK: Testing Library async budget (overlapped-gate flake fix)
// `waitFor` / `findBy*` / `waitForElementToBeRemoved` do NOT use vitest's
// `testTimeout`; they carry their own 1000ms default (`asyncUtilTimeout` in
// @testing-library/dom). That made every DOM suite a latent flake under the
// overlapped gate: `npm test` runs this suite in the same 4-core window as
// the api suite, lint and build, and a render that settles in ~100ms
// standalone can take seconds when the box is busy (measured: the frontend
// suite 28s standalone vs 120s under overlap). The 2026-10-11 CI failures
// (`Test timed out in 5000ms` on TaskDetailPage/TaskDetailOverlay) were that
// same starvation; the suite timeout was raised to 60s but the async-util
// budget was left at 1s, so the assertion helpers kept failing first.
// 10s is ~10x the measured worst-case slowdown and still far below the 60s
// testTimeout, so a genuinely missing element still fails the suite loudly and
// promptly instead of hanging. Pinned by testSetup.asyncBudget.test.js.
const OVERLAP_ASYNC_UTIL_TIMEOUT_MS = 10_000;
configure({ asyncUtilTimeout: OVERLAP_ASYNC_UTIL_TIMEOUT_MS });

// Provide a reliable mock for window.localStorage across all tests.
// Guarded so files that opt into the lighter `node` environment (pure-logic
// suites with no DOM needs) can still run this setup file without a crash.
const createLocalStorageMock = () => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((idx) => Object.keys(store)[idx] || null),
  };
};

const localStorageMock = createLocalStorageMock();

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
}

if (typeof global !== 'undefined') {
  global.localStorage = localStorageMock;
}
