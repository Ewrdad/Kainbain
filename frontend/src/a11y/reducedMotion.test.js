import { describe, it, expect, vi, afterEach } from 'vitest';
import { prefersReducedMotion, scrollIntoViewRespectingMotion } from './reducedMotion';

afterEach(() => {
  document.documentElement.removeAttribute('data-reduce-motion');
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('returns false when no signals are present', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('honours the in-app reduce-motion preference', () => {
    document.documentElement.setAttribute('data-reduce-motion', 'true');
    expect(prefersReducedMotion()).toBe(true);
  });

  it('honours the OS media query', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe('scrollIntoViewRespectingMotion', () => {
  it('is a no-op for missing elements', () => {
    expect(() => scrollIntoViewRespectingMotion(null, { behavior: 'smooth' })).not.toThrow();
    expect(() => scrollIntoViewRespectingMotion({}, { behavior: 'smooth' })).not.toThrow();
  });

  it('passes smooth through when motion is allowed', () => {
    const el = { scrollIntoView: vi.fn() };
    scrollIntoViewRespectingMotion(el, { behavior: 'smooth', block: 'start' });
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('degrades smooth to instant when reduced motion is requested', () => {
    document.documentElement.setAttribute('data-reduce-motion', 'true');
    const el = { scrollIntoView: vi.fn() };
    scrollIntoViewRespectingMotion(el, { behavior: 'smooth', block: 'start' });
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });
});
