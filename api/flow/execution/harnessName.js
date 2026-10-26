import {
	harnessLabel,
} from '../../agent/harnessContract.js';

/***
 * MARK: harnessName
 * @description Returns the display label of the configured agent harness.
 * @example harnessName(store) => "antigravity"
 ***/
export function harnessName(store) {
	try {
		return harnessLabel(store.sessionStore?.getHarness?.());
	} catch {
		return "agent";
	}
}
