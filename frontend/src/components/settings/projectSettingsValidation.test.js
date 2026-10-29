import { describe, expect, it } from 'vitest';
import { parseRetrySettings } from './projectSettingsValidation';

/***
 * MARK: projectSettingsValidation tests
 * @description Lowest-level cover for the Retry & Timeouts draft parser:
 *   blank drafts clear to null, valid drafts convert, every invalid shape
 *   (including overflow past finite numbers) reports a per-field error and
 *   never reaches the save payload.
 ***/
describe('parseRetrySettings', () => {
  const blankDrafts = {
    maxAutoIterations: '',
    maxTransientRetries: '',
    autoIterationEnabled: 'default',
    agentTimeoutMs: '',
    ciTimeoutMs: '',
    mergeTimeoutMs: '',
  };

  it('maps blank drafts to null (follow the global default)', () => {
    const { errors, payload } = parseRetrySettings(blankDrafts);
    expect(errors).toEqual({});
    expect(payload).toEqual({
      maxAutoIterations: null,
      maxTransientRetries: null,
      autoIterationEnabled: null,
      agentTimeoutMs: null,
      ciTimeoutMs: null,
      mergeTimeoutMs: null,
    });
  });

  it('parses valid counts and decimal-minute timeouts', () => {
    const { errors, payload } = parseRetrySettings({
      ...blankDrafts,
      maxAutoIterations: '3',
      maxTransientRetries: '0',
      autoIterationEnabled: 'enabled',
      agentTimeoutMs: '30',
      ciTimeoutMs: '1.5',
      mergeTimeoutMs: '0.5',
    });
    expect(errors).toEqual({});
    expect(payload.maxAutoIterations).toBe(3);
    expect(payload.maxTransientRetries).toBe(0);
    expect(payload.autoIterationEnabled).toBe(true);
    expect(payload.agentTimeoutMs).toBe(30 * 60 * 1000);
    expect(payload.ciTimeoutMs).toBe(90 * 1000);
    expect(payload.mergeTimeoutMs).toBe(30 * 1000);
  });

  it('maps the tri-state switch to true/false/null', () => {
    expect(parseRetrySettings({ ...blankDrafts, autoIterationEnabled: 'enabled' }).payload.autoIterationEnabled).toBe(true);
    expect(parseRetrySettings({ ...blankDrafts, autoIterationEnabled: 'disabled' }).payload.autoIterationEnabled).toBe(false);
    expect(parseRetrySettings({ ...blankDrafts, autoIterationEnabled: 'default' }).payload.autoIterationEnabled).toBeNull();
    expect(parseRetrySettings({ ...blankDrafts, autoIterationEnabled: 'bogus' }).payload.autoIterationEnabled).toBeNull();
    expect(parseRetrySettings({ ...blankDrafts, autoIterationEnabled: undefined }).payload.autoIterationEnabled).toBeNull();
  });

  it('rejects non-whole counts with per-field errors', () => {
    for (const bad of ['-1', '2.5', 'many', '1e3', '0x10']) {
      const { errors } = parseRetrySettings({ ...blankDrafts, maxAutoIterations: bad });
      expect(errors.maxAutoIterations).toMatch(/whole number/);
    }
    const { errors } = parseRetrySettings({ ...blankDrafts, maxTransientRetries: '1.5' });
    expect(errors.maxTransientRetries).toMatch(/whole number/);
  });

  it('rejects non-positive or malformed timeouts with per-field errors', () => {
    for (const bad of ['0', '-5', 'soon', '1e3', '3.', '.5', '1.2.3']) {
      const { errors } = parseRetrySettings({ ...blankDrafts, agentTimeoutMs: bad });
      expect(errors.agentTimeoutMs).toMatch(/above 0/);
    }
  });

  it('rejects overflow past finite numbers instead of silently defaulting', () => {
    // A hundreds-of-digits paste parses to Infinity: JSON would serialise
    // that to null and the save would silently mean "follow the default".
    const hugeCount = '9'.repeat(400);
    const countResult = parseRetrySettings({ ...blankDrafts, maxAutoIterations: hugeCount });
    expect(countResult.errors.maxAutoIterations).toMatch(/whole number/);
    expect(countResult.payload).not.toHaveProperty('maxAutoIterations');

    const hugeMinutes = `${'9'.repeat(310)}.5`;
    const timeoutResult = parseRetrySettings({ ...blankDrafts, ciTimeoutMs: hugeMinutes });
    expect(timeoutResult.errors.ciTimeoutMs).toMatch(/above 0/);
    expect(timeoutResult.payload).not.toHaveProperty('ciTimeoutMs');
  });

  it('keeps the payload for valid fields even when another field errors', () => {
    const { errors, payload } = parseRetrySettings({
      ...blankDrafts,
      maxAutoIterations: '4',
      agentTimeoutMs: 'soon',
    });
    expect(errors).toHaveProperty('agentTimeoutMs');
    expect(errors).not.toHaveProperty('maxAutoIterations');
    expect(payload.maxAutoIterations).toBe(4);
    expect(payload).not.toHaveProperty('agentTimeoutMs');
  });

  it('tolerates missing or null drafts (blank semantics)', () => {
    const { errors, payload } = parseRetrySettings({});
    expect(errors).toEqual({});
    expect(payload.maxAutoIterations).toBeNull();
    const { errors: nullErrors } = parseRetrySettings({
      maxAutoIterations: null,
      maxTransientRetries: null,
      autoIterationEnabled: null,
      agentTimeoutMs: null,
      ciTimeoutMs: null,
      mergeTimeoutMs: null,
    });
    expect(nullErrors).toEqual({});
  });
});
