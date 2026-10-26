import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openSystemSettings, SYSTEM_SETTINGS_POPOUT_NAME } from './openSystemSettings';
import { setNarrowViewportOverride } from '../util/viewport';

describe('openSystemSettings', () => {
  beforeEach(() => {
    setNarrowViewportOverride(null);
  });

  afterEach(() => {
    setNarrowViewportOverride(null);
  });

  it('opens in a new window on desktop when window.open succeeds', () => {
    const popout = { closed: false, focus: vi.fn() };
    const mockWin = {
      open: vi.fn().mockReturnValue(popout),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    };
    const setView = vi.fn();

    const result = openSystemSettings({ setView, win: mockWin });

    expect(result).toBe('popout');
    expect(mockWin.open).toHaveBeenCalledWith(
      '#/system-settings',
      SYSTEM_SETTINGS_POPOUT_NAME,
      'width=1200,height=800,menubar=no,toolbar=no,location=no',
    );
    // Drift guard: the literal the popout relies on to identify itself.
    expect(SYSTEM_SETTINGS_POPOUT_NAME).toBe('kainbain_system_settings');
    expect(popout.focus).toHaveBeenCalledTimes(1);
    expect(setView).not.toHaveBeenCalled();
  });

  it('treats a focus that throws as a successful popout, not a failure', () => {
    const popout = {
      closed: false,
      focus: vi.fn().mockImplementation(() => {
        throw new Error('focus denied');
      }),
    };
    const mockWin = {
      open: vi.fn().mockReturnValue(popout),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    };
    const setView = vi.fn();

    expect(openSystemSettings({ setView, win: mockWin })).toBe('popout');
    expect(setView).not.toHaveBeenCalled();
  });

  it('falls back to setView when window.open returns an already-closed (dead) handle', () => {
    const mockWin = {
      open: vi.fn().mockReturnValue({ closed: true, focus: vi.fn() }),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    };
    const setView = vi.fn();

    const result = openSystemSettings({ setView, win: mockWin });

    expect(result).toBe('same-tab');
    expect(setView).toHaveBeenCalledWith('system-settings');
  });

  it('falls back to setView when window.open returns null (blocked popup)', () => {
    const mockWin = {
      open: vi.fn().mockReturnValue(null),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    };
    const setView = vi.fn();

    const result = openSystemSettings({ setView, win: mockWin });

    expect(result).toBe('same-tab');
    expect(mockWin.open).toHaveBeenCalled();
    expect(setView).toHaveBeenCalledWith('system-settings');
  });

  it('falls back to setView when window.open throws', () => {
    const mockWin = {
      open: vi.fn().mockImplementation(() => {
        throw new Error('Blocked');
      }),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    };
    const setView = vi.fn();

    const result = openSystemSettings({ setView, win: mockWin });

    expect(result).toBe('same-tab');
    expect(setView).toHaveBeenCalledWith('system-settings');
  });

  it('navigates same-tab directly without calling window.open on narrow viewports', () => {
    setNarrowViewportOverride(true);
    const mockWin = {
      open: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    };
    const setView = vi.fn();

    const result = openSystemSettings({ setView, win: mockWin });

    expect(result).toBe('same-tab');
    expect(mockWin.open).not.toHaveBeenCalled();
    expect(setView).toHaveBeenCalledWith('system-settings');
  });

  it('falls back to setting hash when setView is not provided', () => {
    const mockWin = {
      open: vi.fn().mockReturnValue(null),
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
      location: { hash: '' },
    };

    const result = openSystemSettings({ win: mockWin });

    expect(result).toBe('same-tab');
    expect(mockWin.location.hash).toBe('#/system-settings');
  });
});
