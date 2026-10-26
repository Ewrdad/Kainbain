/***
 * MARK: useTapGuard
 * @description Shared mobile tap-guard policy: on touch phones, popups (tooltips,
 *   the task inspector overlay, ...) must only appear when the user taps a
 *   non-button region — a tap on a button, dropdown trigger, input, or link must
 *   actuate that control and never open a popup on top of it.
 *
 *   Two building blocks, no React or framework imports:
 *   - INTERACTIVE_SELECTOR + isInteractiveTarget: answers "did this tap land on
 *     an interactive control?" with one CSS selector as the single definition
 *     of "what counts as a button".
 *   - prefersTouchInput: detects touch-primary (coarse pointer, no hover)
 *     devices. The touch flag is module-injectable (setTouchInputOverride) so
 *     unit tests can force mobile/desktop behaviour without jsdom media-query
 *     support.
 *
 *   Consumers call the helpers from plain event handlers:
 * @example const isTouch = prefersTouchInput();
 *   const handleCardClick = (e) => {
 *     if (isInteractiveTarget(e.target)) return; // buttons actuate themselves
 *     openInspector(task);                       // plain card regions inspect
 *   };
 ***/

/***
 * MARK: INTERACTIVE_SELECTOR
 * @description CSS selector matching every control a tap must never pop a popup
 *   over: buttons, links, form controls, and the ARIA roles that behave like
 *   them. One string, so every consumer shares one definition of "button".
 * @example isInteractiveTarget(document.querySelector('[role="combobox"]')) => true
 ***/
export const INTERACTIVE_SELECTOR = [
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
].join(', ');

/***
 * MARK: isInteractiveTarget
 * @description True when a tap/click event target sits inside (or is) an
 *   interactive control. Pure DOM walk bounded at the target's closest
 *   interactive ancestor, so icons and labels inside a button count too.
 *   Anything that is not an Element (text nodes, null) is never interactive.
 * @example isInteractiveTarget(dropdownTriggerButton) => true
 * @example isInteractiveTarget(cardTitleSpan) => false
 * @param {EventTarget|null} eventTarget - The event.target of the tap/click.
 * @returns {boolean}
 ***/
export function isInteractiveTarget(eventTarget) {
  if (!eventTarget || typeof eventTarget.closest !== 'function') return false;
  return eventTarget.closest(INTERACTIVE_SELECTOR) !== null;
}

// Test override for the touch detection: null = auto-detect via matchMedia,
// true/false = force the answer (jsdom cannot emulate media queries).
let touchInputOverride = null;

/***
 * MARK: setTouchInputOverride
 * @description Forces what prefersTouchInput() reports, for tests and storybook
 *   previews. Pass true to simulate a touch phone, false to simulate a mouse
 *   desktop, or null to restore real detection. Production code never calls
 *   this — the module-level override exists so components can stay prop-free.
 * @example setTouchInputOverride(true);  // tests now behave like a phone
 ***/
export function setTouchInputOverride(value) {
  touchInputOverride = value === true || value === false ? value : null;
}

/***
 * MARK: prefersTouchInput
 * @description True when the primary input is coarse/touch (a phone), via
 *   matchMedia('(hover: none) and (pointer: coarse)'). Deliberately NOT keyed
 *   on viewport width, so hybrid touch+mouse laptops keep desktop behaviour.
 *   Falls back to false (desktop) when matchMedia is unavailable — the safe
 *   default, since popups are only a problem when touch is the primary input.
 * @example prefersTouchInput() => true // on a phone
 * @param {Window} [win=window] - Window to query; injectable for tests.
 * @returns {boolean}
 ***/
export function prefersTouchInput(win = window) {
  if (touchInputOverride !== null) return touchInputOverride;
  try {
    const coarseQuery = win.matchMedia?.('(hover: none) and (pointer: coarse)');
    return Boolean(coarseQuery?.matches);
  } catch {
    return false;
  }
}
