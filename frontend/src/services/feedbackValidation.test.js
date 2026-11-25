import { describe, it, expect } from 'vitest';
import { parseFeedbackValidationError } from './feedbackValidation';

/***
 * MARK: parseFeedbackValidationError tests
 * @description Verifies the 422 feedback-validation refusal reader: only the
 *   exact code + status shape resolves to a recovery finding, everything
 *   else reads as null (existing handling untouched).
 ***/
describe('parseFeedbackValidationError', () => {
  it('parses the server refusal with entry objects', () => {
    const err = {
      status: 422,
      body: JSON.stringify({
        error: 'Feedback references 1 file…: assets/gone.png',
        code: 'FEEDBACK_VALIDATION_FAILED',
        missing: [
          {
            ref: 'assets/gone.png',
            name: 'gone.png',
            expectedPath: 'docs/tasks/t1/assets/gone.png',
          },
        ],
        imageOnly: false,
      }),
    };
    expect(parseFeedbackValidationError(err)).toEqual({
      missing: ['assets/gone.png'],
      imageOnly: false,
    });
  });

  it('parses image-only refusals and plain-string missing lists', () => {
    expect(
      parseFeedbackValidationError({
        status: 422,
        body: JSON.stringify({
          code: 'FEEDBACK_VALIDATION_FAILED',
          missing: ['assets/a.png'],
          imageOnly: true,
        }),
      }),
    ).toEqual({ missing: ['assets/a.png'], imageOnly: true });
  });

  it('accepts an already-parsed body object', () => {
    expect(
      parseFeedbackValidationError({
        status: 422,
        body: { code: 'FEEDBACK_VALIDATION_FAILED', missing: [], imageOnly: true },
      }),
    ).toEqual({ missing: [], imageOnly: true });
  });

  it('returns null for any other failure shape', () => {
    expect(parseFeedbackValidationError(null)).toBe(null);
    expect(parseFeedbackValidationError(undefined)).toBe(null);
    expect(parseFeedbackValidationError({ status: 409, body: '{}' })).toBe(null);
    expect(parseFeedbackValidationError({ status: 500 })).toBe(null);
    expect(
      parseFeedbackValidationError({ status: 422, body: '{"code":"OTHER"}' }),
    ).toBe(null);
    expect(parseFeedbackValidationError({ status: 422, body: 'not-json' })).toBe(null);
    expect(parseFeedbackValidationError({ status: 422 })).toBe(null);
  });
});
