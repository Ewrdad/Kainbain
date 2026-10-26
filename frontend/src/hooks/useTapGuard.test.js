import { describe, expect, test, afterEach } from 'vitest';
import {
  INTERACTIVE_SELECTOR,
  isInteractiveTarget,
  prefersTouchInput,
  setTouchInputOverride,
} from './useTapGuard';

/***
 * MARK: useTapGuard tests
 * @description Verifies the shared mobile tap-guard policy: taps that land on
 *   (or inside) an interactive control — buttons, form fields, links, ARIA
 *   interactive roles — must never open a popup (tooltip or inspector), while
 *   taps on plain content still may. Also covers the coarse-pointer (touch)
 *   detector and its test override.
 ***/

describe('INTERACTIVE_SELECTOR', () => {
  test('matches every control class a tap must never pop a popup over', () => {
    // Buttons, links, form controls, and labelled/editable regions.
    for (const fragment of [
      'button',
      'a[href]',
      'input',
      'select',
      'textarea',
      'label',
      'summary',
      '[role="button"]',
      '[role="combobox"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[aria-haspopup]',
      '[contenteditable="true"]',
      '[data-interactive]',
    ]) {
      expect(INTERACTIVE_SELECTOR).toContain(fragment);
    }
  });
});

describe('isInteractiveTarget', () => {
  test('returns true for a plain <button>', () => {
    const button = document.createElement('button');
    expect(isInteractiveTarget(button)).toBe(true);
  });

  test('returns true for a dropdown trigger button with aria-haspopup', () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'menu');
    expect(isInteractiveTarget(trigger)).toBe(true);
  });

  test('returns true for form controls (input, select, textarea)', () => {
    for (const tag of ['input', 'select', 'textarea']) {
      expect(isInteractiveTarget(document.createElement(tag))).toBe(true);
    }
  });

  test('returns true for a link with href', () => {
    const link = document.createElement('a');
    link.setAttribute('href', '#/somewhere');
    expect(isInteractiveTarget(link)).toBe(true);
  });

  test('returns true for ARIA-interactive roles (button, combobox, tab, option, menuitem)', () => {
    for (const role of ['button', 'combobox', 'tab', 'option', 'menuitem']) {
      const el = document.createElement('span');
      el.setAttribute('role', role);
      expect(isInteractiveTarget(el)).toBe(true);
    }
  });

  test('returns true for contenteditable and data-interactive elements', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isInteractiveTarget(editable)).toBe(true);

    const flagged = document.createElement('div');
    flagged.setAttribute('data-interactive', '');
    expect(isInteractiveTarget(flagged)).toBe(true);
  });

  test('walks ancestors: a span icon inside a button is still interactive', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);
    expect(isInteractiveTarget(icon)).toBe(true);
  });

  test('walks ancestors: deeply nested text container inside a labelled control', () => {
    const combobox = document.createElement('div');
    combobox.setAttribute('role', 'combobox');
    const inner = document.createElement('div');
    const deepest = document.createElement('span');
    inner.appendChild(deepest);
    combobox.appendChild(inner);
    expect(isInteractiveTarget(deepest)).toBe(true);
  });

  test('returns false for plain content elements (div, span badge, p, h3)', () => {
    for (const tag of ['div', 'span', 'p', 'h3']) {
      expect(isInteractiveTarget(document.createElement(tag))).toBe(false);
    }
  });

  test('returns false for an svg icon with no interactive ancestor', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(isInteractiveTarget(svg)).toBe(false);
  });

  test('returns false for a label-less link (anchor without href)', () => {
    const anchor = document.createElement('a');
    expect(isInteractiveTarget(anchor)).toBe(false);
  });

  test('returns false for null/undefined and non-Element targets (text nodes)', () => {
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget(undefined)).toBe(false);
    const textNode = document.createTextNode('plain text');
    expect(isInteractiveTarget(textNode)).toBe(false);
  });
});

describe('prefersTouchInput', () => {
  afterEach(() => {
    // Always clear the override so later suites get real detection behaviour.
    setTouchInputOverride(null);
  });

  test('is true when the primary input is coarse/touch (hover: none + pointer: coarse)', () => {
    const touchPhone = {
      matchMedia: (query) => ({
        matches:
          query === '(hover: none) and (pointer: coarse)'
            ? true
            : query === '(hover: hover) and (pointer: fine)'
              ? false
              : false,
      }),
    };
    expect(prefersTouchInput(touchPhone)).toBe(true);
  });

  test('is false for mouse-capable media (hover: hover + pointer: fine)', () => {
    const desktop = {
      matchMedia: (query) => ({
        matches: query === '(hover: hover) and (pointer: fine)',
      }),
    };
    expect(prefersTouchInput(desktop)).toBe(false);
  });

  test('is false (safe default) when matchMedia is unavailable', () => {
    expect(prefersTouchInput({})).toBe(false);
    expect(prefersTouchInput({ matchMedia: undefined })).toBe(false);
  });

  test('is false in the jsdom default environment (no media-query emulation)', () => {
    // jsdom reports matches: false for everything; the guard must default to
    // desktop behaviour under unit tests rather than throwing.
    expect(prefersTouchInput()).toBe(false);
  });

  test('test override forces touch mode on and off regardless of detection', () => {
    setTouchInputOverride(true);
    expect(prefersTouchInput()).toBe(true);

    setTouchInputOverride(false);
    expect(prefersTouchInput()).toBe(false);

    // Clearing the override restores detection (jsdom => desktop).
    setTouchInputOverride(null);
    expect(prefersTouchInput()).toBe(false);
  });
});