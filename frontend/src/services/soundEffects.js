/**
 * MARK: Sound Effects Service
 * @description Synthesizes subtle, pleasant UI sound cues using the Web Audio API
 * (no external audio files or network requests required).
 */

class SoundEffectsService {
  constructor() {
    this.ctx = null;
  }

  getContext() {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioContextClass();
      } catch {
        return null;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  isSupported() {
    return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
  }

  /**
   * Play a pleasant synthesized chime based on event type.
   * @param {'stageAdvance' | 'taskCompleted' | 'checkpointAlert' | 'error' | 'click'} type
   * @param {number} [volume=0.15]
   */
  playChime(type = 'stageAdvance', volume = 0.15) {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      gainNode.gain.setValueAtTime(volume, now);

      if (type === 'stageAdvance') {
        // Two ascending notes: E5 (659Hz) -> A5 (880Hz)
        this.playTone(ctx, gainNode, 659.25, now, 0.1, 'sine');
        this.playTone(ctx, gainNode, 880.0, now + 0.08, 0.2, 'sine');
      } else if (type === 'taskCompleted') {
        // Triumph chord: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz) -> C6 (1046Hz)
        this.playTone(ctx, gainNode, 523.25, now, 0.08, 'triangle');
        this.playTone(ctx, gainNode, 659.25, now + 0.06, 0.08, 'triangle');
        this.playTone(ctx, gainNode, 783.99, now + 0.12, 0.08, 'triangle');
        this.playTone(ctx, gainNode, 1046.5, now + 0.18, 0.3, 'sine');
      } else if (type === 'checkpointAlert') {
        // Gentle double ping: A4 (440Hz) -> D5 (587Hz)
        this.playTone(ctx, gainNode, 440.0, now, 0.12, 'sine');
        this.playTone(ctx, gainNode, 587.33, now + 0.12, 0.25, 'sine');
      } else if (type === 'error') {
        // Descending low tone: E4 (330Hz) -> C4 (261Hz)
        this.playTone(ctx, gainNode, 329.63, now, 0.15, 'sawtooth');
        this.playTone(ctx, gainNode, 261.63, now + 0.1, 0.25, 'sawtooth');
      } else {
        // Soft subtle click: 1200Hz
        this.playTone(ctx, gainNode, 1200, now, 0.03, 'sine');
      }
    } catch {
      // Audio playback errors are non-fatal
    }
  }

  playTone(ctx, destinationGain, frequency, startTime, duration, type = 'sine') {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    env.gain.setValueAtTime(0.001, startTime);
    env.gain.exponentialRampToValueAtTime(1, startTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(env);
    env.connect(destinationGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

export const soundEffects = new SoundEffectsService();
