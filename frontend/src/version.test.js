import { describe, it, expect } from 'vitest';
import packageJson from '../../package.json';
import { UI_VERSION } from './version';

/***
 * MARK: version unit tests
 * @description Locks the single UI-version source of truth: the exported
 *   `UI_VERSION` must equal the frontend `package.json` version and parse
 *   as a release triple, so the About page can never report a drifted build.
 * @example run `npm run test --prefix frontend -- version`
 ***/

describe('UI_VERSION', () => {
  it('matches the frontend package.json version', () => {
    expect(UI_VERSION).toBe(packageJson.version);
  });

  it('parses as a major.minor.patch release', () => {
    expect(UI_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
