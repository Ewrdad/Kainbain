// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FAILURE_MESSAGE_PREVIEW_MAX,
  FAILURE_REASON_PREVIEW_MAX,
  firstLine,
  getFailureKind,
  getFailureReason,
  hasFailureDetails,
  isRejectedTask,
  truncateFailureMessage,
} from './failureReason';

describe('failureReason helpers', () => {
  it('reads the structured reason and trims it', () => {
    expect(getFailureReason({ reason: '  boom  ' })).toBe('boom');
    expect(getFailureReason({ reason: 'boom\ntrace' })).toBe('boom\ntrace');
  });

  it('returns null when there is no structured reason', () => {
    expect(getFailureReason({ stage: 'Plan' })).toBeNull();
    expect(getFailureReason({})).toBeNull();
    expect(getFailureReason(null)).toBeNull();
    expect(getFailureReason(undefined)).toBeNull();
    expect(getFailureReason({ reason: 42 })).toBeNull();
  });

  it('treats empty or whitespace reasons as missing', () => {
    expect(getFailureReason({ reason: '' })).toBeNull();
    expect(getFailureReason({ reason: '   \n  ' })).toBeNull();
    expect(hasFailureDetails({ reason: '' })).toBe(false);
    expect(hasFailureDetails({ reason: '  ' })).toBe(false);
    expect(hasFailureDetails({ reason: 'boom' })).toBe(true);
    expect(hasFailureDetails({})).toBe(false);
  });

  it('shortens a reason to its first line', () => {
    expect(firstLine('boom\nsecond line')).toBe('boom');
    expect(firstLine('  spaced  \nmore')).toBe('spaced');
    expect(firstLine('single')).toBe('single');
  });

  it('truncates very long single lines with an ellipsis', () => {
    const long = `x${'o'.repeat(FAILURE_REASON_PREVIEW_MAX + 50)}`;
    const preview = firstLine(long);
    expect(preview.length).toBeLessThanOrEqual(FAILURE_REASON_PREVIEW_MAX);
    expect(preview.endsWith('…')).toBe(true);
    expect(firstLine('short', 120)).toBe('short');
  });

  it('returns an empty preview for missing reasons', () => {
    expect(firstLine('')).toBe('');
    expect(firstLine('   ')).toBe('');
    expect(firstLine(null)).toBe('');
    expect(firstLine(undefined)).toBe('');
  });

  it('leaves short failure messages untouched', () => {
    expect(truncateFailureMessage('boom')).toEqual({ preview: 'boom', truncated: false });
    expect(truncateFailureMessage('short', 120)).toEqual({ preview: 'short', truncated: false });
  });

  it('does not truncate a message exactly at the cap', () => {
    const exact = 'x'.repeat(FAILURE_MESSAGE_PREVIEW_MAX);
    expect(truncateFailureMessage(exact)).toEqual({ preview: exact, truncated: false });
  });

  it('caps long failure messages with an ellipsis', () => {
    const long = `x${'o'.repeat(FAILURE_MESSAGE_PREVIEW_MAX + 50)}`;
    const { preview, truncated } = truncateFailureMessage(long);
    expect(truncated).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(FAILURE_MESSAGE_PREVIEW_MAX);
    expect(preview.endsWith('…')).toBe(true);
    expect(long.startsWith(preview.slice(0, -1).trimEnd())).toBe(true);
  });

  it('keeps newlines in the preview up to the cap', () => {
    const multi = `first line\n${'y'.repeat(FAILURE_MESSAGE_PREVIEW_MAX + 50)}`;
    const { preview, truncated } = truncateFailureMessage(multi);
    expect(truncated).toBe(true);
    expect(preview).toContain('first line\n');
  });

  it('trims trailing whitespace before appending the ellipsis', () => {
    const padded = `${'z'.repeat(FAILURE_MESSAGE_PREVIEW_MAX)}   trailing words`;
    const { preview, truncated } = truncateFailureMessage(padded);
    expect(truncated).toBe(true);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.slice(0, -1)).not.toMatch(/\s$/);
  });

  it('returns an empty untruncated preview for missing messages', () => {
    expect(truncateFailureMessage('')).toEqual({ preview: '', truncated: false });
    expect(truncateFailureMessage(null)).toEqual({ preview: '', truncated: false });
    expect(truncateFailureMessage(undefined)).toEqual({ preview: '', truncated: false });
    expect(truncateFailureMessage(42)).toEqual({ preview: '', truncated: false });
  });

  it('reads the recorded failure kind', () => {
    expect(getFailureKind({ lastError: { failureKind: 'rejected' } })).toBe('rejected');
    expect(getFailureKind({ lastError: { failureKind: '  infrastructure ' } })).toBe(
      'infrastructure',
    );
  });

  it('returns null when no failure kind was recorded', () => {
    expect(getFailureKind({ status: 'failed' })).toBeNull();
    expect(getFailureKind({ lastError: { message: 'boom' } })).toBeNull();
    expect(getFailureKind({ lastError: { failureKind: '   ' } })).toBeNull();
    expect(getFailureKind({ lastError: { failureKind: 42 } })).toBeNull();
    expect(getFailureKind({})).toBeNull();
    expect(getFailureKind(null)).toBeNull();
    expect(getFailureKind(undefined)).toBeNull();
  });

  it('flags only deliberate rejections', () => {
    expect(isRejectedTask({ lastError: { failureKind: 'rejected' } })).toBe(true);
    expect(isRejectedTask({ lastError: { failureKind: 'infrastructure' } })).toBe(false);
    expect(isRejectedTask({ status: 'failed' })).toBe(false);
    expect(isRejectedTask(null)).toBe(false);
  });
});
