import { describe, it, expect } from 'vitest';
import packageJson from '../package.json';
import frontendContract from '../version.json';
import { UI_VERSION, FRONTEND_API_VERSION, FRONTEND_REQUIRES_BACKEND_API } from './version';

/***
 * MARK: version unit tests
 * @description Locks the single UI-version sources of truth: the exported
 *   `UI_VERSION` must equal the frontend `package.json` version and the
 *   API contract exports must equal `frontend/version.json`, all parsing
 *   as release triples, so the About page can never report a drifted
 *   build or a drifted contract.
 * @example run `npm run test --prefix frontend -- version`
 ***/

describe('UI_VERSION', () => {
  it('matches the frontend package.json version', () => {
    // Pins the source file itself: the UI version must come from the
    // frontend manifest, never the repo-root one (both are 1.0.0 today,
    // so a version-only assertion cannot tell them apart).
    expect(packageJson.name).toBe('frontend');
    expect(UI_VERSION).toBe(packageJson.version);
  });

  it('parses as a major.minor.patch release', () => {
    expect(UI_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('frontend API contract', () => {
  it('matches frontend/version.json exactly', () => {
    expect(frontendContract.component).toBe('frontend');
    expect(FRONTEND_API_VERSION).toBe(frontendContract.apiVersion);
    expect(FRONTEND_REQUIRES_BACKEND_API).toBe(frontendContract.requires.backendApi);
  });

  it('parses as a major.minor.patch release', () => {
    expect(FRONTEND_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
