import { describe, it, expect } from 'vitest';

import {
  healthStatusDotClass,
  healthStatusLabel,
  healthOptionalLabel,
  healthOllamaOnlineLabel,
  healthWebsocketStatus,
} from './healthStatus';

/***
 * MARK: healthStatus tests
 * @description Pins the shared health vocabulary so the composite and atomic
 *   health widgets can never describe the same status differently.
 ***/

describe('healthStatusDotClass', () => {
  it('maps ok to green and warning/warn to amber', () => {
    expect(healthStatusDotClass('ok')).toBe('bg-emerald-400');
    expect(healthStatusDotClass('warn')).toBe('bg-amber-400');
    expect(healthStatusDotClass('warning')).toBe('bg-amber-400');
  });

  it('maps optional absent services to grey, never red', () => {
    expect(healthStatusDotClass('disabled')).toBe('bg-slate-500');
    expect(healthStatusDotClass('unconfigured')).toBe('bg-slate-500');
  });

  it('maps real faults to red and unknown statuses to the caller neutral', () => {
    expect(healthStatusDotClass('error')).toBe('bg-rose-400');
    expect(healthStatusDotClass('standby')).toBe('bg-rose-400');
    expect(healthStatusDotClass('standby', 'bg-slate-400')).toBe('bg-slate-400');
    expect(healthStatusDotClass(undefined, 'bg-slate-400')).toBe('bg-slate-400');
  });
});

describe('healthStatusLabel', () => {
  it('gives every dot an unambiguous word (WCAG 1.4.1 / 4.1.2)', () => {
    expect(healthStatusLabel('ok')).toBe('OK');
    expect(healthStatusLabel('warn')).toBe('Warning');
    expect(healthStatusLabel('warning')).toBe('Warning');
    expect(healthStatusLabel('error')).toBe('Error');
    expect(healthStatusLabel('disabled')).toBe('Disabled');
    expect(healthStatusLabel('unconfigured')).toBe('Not configured');
  });

  it('never leaves an unknown status wordless', () => {
    expect(healthStatusLabel(undefined)).toBe('Unknown');
    expect(healthStatusLabel('')).toBe('Unknown');
    expect(healthStatusLabel('standby')).toBe('Unknown');
  });
});

describe('healthOptionalLabel', () => {
  it('reads optional grey states as words and falls back otherwise', () => {
    expect(healthOptionalLabel('disabled')).toBe('Disabled');
    expect(healthOptionalLabel('unconfigured')).toBe('Not configured');
    expect(healthOptionalLabel(undefined, 'OK')).toBe('OK');
    expect(healthOptionalLabel('degraded', 'OK')).toBe('degraded');
  });
});

describe('healthOllamaOnlineLabel', () => {
  it('reads Online when healthy and never turns absence into failure', () => {
    expect(healthOllamaOnlineLabel({ status: 'ok' })).toBe('Online');
    expect(healthOllamaOnlineLabel({ status: 'unconfigured' })).toBe('Not configured');
    expect(healthOllamaOnlineLabel({ status: 'disabled' })).toBe('Disabled');
    expect(healthOllamaOnlineLabel({})).toBe('Standby');
    expect(healthOllamaOnlineLabel()).toBe('Standby');
    expect(healthOllamaOnlineLabel(null)).toBe('Standby');
  });
});

describe('healthWebsocketStatus', () => {
  it('maps socket connection states onto the ok/warn/error vocabulary', () => {
    expect(healthWebsocketStatus('connected')).toBe('ok');
    expect(healthWebsocketStatus('reconnecting')).toBe('warn');
    expect(healthWebsocketStatus('connecting')).toBe('error');
    expect(healthWebsocketStatus(undefined)).toBe('error');
  });
});
