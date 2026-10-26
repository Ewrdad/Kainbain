/***
 * MARK: setupTests async-budget guard
 * @description Fail-loud guard for the Testing Library async budget pinned in
 *   `setupTests.js` (`asyncUtilTimeout`). That default is 1000ms in
 *   @testing-library/dom and is independent of vitest's `testTimeout`: if it
 *   ever slips back to 1s, every `waitFor`/`findBy*` in the DOM suites goes
 *   back to racing the overlapped gate under load. The second test proves the
 *   raise behaviourally — a condition that only becomes true after 1200ms must
 *   still be awaited successfully (the legacy default would reject first).
 * @example run `npm run test:frontend -- setupTests.asyncBudget`
 ***/

import { describe, it, expect } from 'vitest';
import { configure, getConfig, waitFor } from '@testing-library/react';

const EXPECTED_ASYNC_UTIL_TIMEOUT_MS = 10_000;

describe('Testing Library async budget (overlapped-gate flake guard)', () => {
	it('pins asyncUtilTimeout above the 1000ms library default', () => {
		expect(getConfig().asyncUtilTimeout).toBe(EXPECTED_ASYNC_UTIL_TIMEOUT_MS);
		expect(getConfig().asyncUtilTimeout).toBeGreaterThan(1000);
	});

	it('honours a budget longer than the legacy 1000ms default', async () => {
		let ready = false;
		const timer = setTimeout(() => {
			ready = true;
		}, 1200);
		try {
			await waitFor(() => expect(ready).toBe(true));
		} finally {
			clearTimeout(timer);
		}
	});

	it('still lets configure be re-pinned idempotently', () => {
		configure({ asyncUtilTimeout: EXPECTED_ASYNC_UTIL_TIMEOUT_MS });
		expect(getConfig().asyncUtilTimeout).toBe(EXPECTED_ASYNC_UTIL_TIMEOUT_MS);
	});
});
