// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { soundEffects } from './soundEffects';

/***
 * MARK: soundEffects tests
 * @description Covers the Web Audio service with a mocked AudioContext graph:
 *   unsupported environments stay silent, per-event chimes drive the expected
 *   oscillator counts, suspended contexts resume, and constructor failure
 *   degrades to null. No real audio is produced.
 ***/

function makeGainNode() {
  return {
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  };
}

function makeOscillator() {
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    type: '',
    frequency: { setValueAtTime: vi.fn() },
  };
}

function makeContext({ state = 'running', oscillators = [] } = {}) {
  return {
    currentTime: 0,
    destination: {},
    state,
    resume: vi.fn().mockResolvedValue(),
    createGain: vi.fn(() => {
      const node = makeGainNode();
      oscillators.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => {
      const osc = makeOscillator();
      oscillators.push(osc);
      return osc;
    }),
  };
}

describe('soundEffects', () => {
  beforeEach(() => {
    soundEffects.ctx = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    soundEffects.ctx = null;
  });

  it('isSupported() is false and playChime is a silent no-op without window', () => {
    vi.stubGlobal('window', undefined);
    expect(soundEffects.isSupported()).toBe(false);
    expect(soundEffects.getContext()).toBeNull();
    expect(() => soundEffects.playChime('stageAdvance')).not.toThrow();
  });

  it('isSupported() is false when no AudioContext constructor exists', () => {
    vi.stubGlobal('window', {});
    expect(soundEffects.isSupported()).toBe(false);
    expect(soundEffects.getContext()).toBeNull();
    expect(() => soundEffects.playChime('error')).not.toThrow();
  });

  it('uses webkitAudioContext as a fallback constructor', () => {
    const ctx = makeContext();
    const calls = { count: 0 };
    function WebkitAudio() {
      calls.count++;
      return ctx;
    }
    vi.stubGlobal('window', { webkitAudioContext: WebkitAudio });
    expect(soundEffects.isSupported()).toBe(true);
    expect(soundEffects.getContext()).toBe(ctx);
    expect(calls.count).toBe(1);
  });

  it('returns null when the constructor throws', () => {
    const Failing = vi.fn(() => {
      throw new Error('no audio device');
    });
    vi.stubGlobal('window', { AudioContext: Failing });
    expect(soundEffects.getContext()).toBeNull();
    expect(() => soundEffects.playChime('click')).not.toThrow();
  });

  it('resumes a suspended context before playing', () => {
    const ctx = makeContext({ state: 'suspended' });
    function AudioContext() {
      return ctx;
    }
    vi.stubGlobal('window', { AudioContext });
    expect(soundEffects.getContext()).toBe(ctx);
    expect(ctx.resume).toHaveBeenCalled();
  });

  it.each([
    ['stageAdvance', 2],
    ['taskCompleted', 4],
    ['checkpointAlert', 2],
    ['error', 2],
    ['click', 1],
  ])('playChime(%j) drives the oscillator graph', (type, tones) => {
    const created = [];
    const ctx = makeContext({ oscillators: created });
    function AudioContext() {
      return ctx;
    }
    vi.stubGlobal('window', { AudioContext });
    soundEffects.playChime(type);
    const oscs = created.filter((n) => typeof n.start === 'function');
    expect(oscs).toHaveLength(tones);
    for (const osc of oscs) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it('defaults to the stageAdvance chime with default volume', () => {
    const created = [];
    const ctx = makeContext({ oscillators: created });
    function AudioContext() {
      return ctx;
    }
    vi.stubGlobal('window', { AudioContext });
    soundEffects.playChime();
    expect(created.filter((n) => typeof n.start === 'function')).toHaveLength(2);
  });

  it('reuses the cached context across chimes', () => {
    const ctx = makeContext();
    const calls = { count: 0 };
    function AudioContext() {
      calls.count++;
      return ctx;
    }
    vi.stubGlobal('window', { AudioContext });
    soundEffects.playChime('click');
    soundEffects.playChime('click');
    expect(calls.count).toBe(1);
  });
});
