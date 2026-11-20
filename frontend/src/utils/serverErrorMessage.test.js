import { describe, it, expect } from 'vitest';
import { serverErrorMessage } from './serverErrorMessage';

describe('serverErrorMessage', () => {
  it('prefers the JSON error, then raw text, then the message', () => {
    expect(serverErrorMessage({ body: '{"error":"Taken"}' })).toBe('Taken');
    expect(serverErrorMessage({ body: 'plain failure' })).toBe('plain failure');
    expect(serverErrorMessage(new Error('down'), 'Fallback')).toBe('down');
  });

  it('falls back when nothing usable is attached', () => {
    expect(serverErrorMessage(null, 'Fallback')).toBe('Fallback');
    expect(serverErrorMessage({}, 'Fallback')).toBe('Fallback');
    expect(serverErrorMessage({ body: '{"ok":false}' }, 'Fallback')).toBe('Fallback');
  });

  it('surfaces server validation sentences for docs-repo failures', () => {
    expect(
      serverErrorMessage({ body: '{"error":"docsRepo.url must be a git remote URL"}' }),
    ).toBe('docsRepo.url must be a git remote URL');
    expect(
      serverErrorMessage({
        body: '{"error":"Docs repo path \'/srv/kb\' is already claimed by project \'Other\' — one docs repo per project (v1)"}',
      }),
    ).toMatch(/already claimed/);
  });
});
