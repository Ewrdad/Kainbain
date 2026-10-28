import { describe, expect, test, vi } from 'vitest';
import { extractModelHarnessInfo } from './TaskCard';

describe('extractModelHarnessInfo', () => {
  test('returns the last stage run choice from persisted report metadata', () => {
    expect(
      extractModelHarnessInfo({
        reportMetadata: JSON.stringify([
          { harnessId: 'pi', modelRef: 'glm-old', aliasName: 'utility' },
          { harnessId: 'pi', modelRef: 'mistral::large', aliasName: 'worker' },
        ]),
      }),
    ).toEqual({ harnessId: 'pi', modelRef: 'mistral::large', aliasName: 'worker' });
  });

  test('trims blank fields to null instead of wording them', () => {
    expect(
      extractModelHarnessInfo({
        reportMetadata: JSON.stringify([{ harnessId: 'pi', modelRef: '   ' }]),
      }),
    ).toEqual({ harnessId: 'pi', modelRef: null, aliasName: null });
  });

  test('returns null when no run choice is recorded', () => {
    expect(extractModelHarnessInfo({})).toBeNull();
    expect(extractModelHarnessInfo(null)).toBeNull();
    expect(extractModelHarnessInfo({ reportMetadata: '' })).toBeNull();
    expect(extractModelHarnessInfo({ reportMetadata: '[]' })).toBeNull();
    expect(extractModelHarnessInfo({ reportMetadata: '{"harnessId":"pi"}' })).toBeNull();
    expect(extractModelHarnessInfo({ reportMetadata: '[null]' })).toBeNull();
  });

  test('fails safe and silent on corrupt metadata (never throws, never logs)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(extractModelHarnessInfo({ reportMetadata: 'not-json{{{' })).toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
