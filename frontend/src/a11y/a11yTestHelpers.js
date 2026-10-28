/***
 * MARK: a11yTestHelpers
 * @description Shared accessibility assertions for component suites
 * (Phase 1.1 enablement). Every helper throws a descriptive error naming the
 * WCAG criterion it guards, so a regression fails visibly with the "why"
 * attached. Built on Testing Library queries + jest-dom matchers already in
 * the repo — no new framework.
 */

/***
 * MARK: assertNamed
 * @description Every interactive element exposes an accessible name
 * (WCAG 4.1.2 Name/Role/Value, 2.5.3 Label in Name).
 * @param {HTMLElement} element
 ***/
export function assertNamed(element) {
  const name = accessibleNameOf(element);
  if (!name || name.trim().length === 0) {
    throw new Error(
      `a11y (WCAG 4.1.2): interactive element <${tagOf(element)}> has no accessible name. ` +
        `Add text content, aria-label, or aria-labelledby. Classes: "${element?.className || ''}"`,
    );
  }
  return name;
}

/***
 * MARK: assertAllNamed
 * @description Applies assertNamed to every button/link/input/select/textarea
 * under a container (WCAG 4.1.2 across a whole view).
 * @param {HTMLElement} container
 * @returns {string[]} The collected names (useful for snapshot debugging).
 ***/
export function assertAllNamed(container) {
  const controls = container.querySelectorAll(
    'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="combobox"]',
  );
  return Array.from(controls).map((el) => assertNamed(el));
}

/***
 * MARK: assertDialogLabelled
 * @description A dialog names its title/description via existing ids
 * (WCAG 4.1.2; Modal labelledBy/describedBy contract).
 * @param {HTMLElement} dialog - Element with role dialog/alertdialog.
 ***/
export function assertDialogLabelled(dialog) {
  const labelledBy = dialog.getAttribute('aria-labelledby');
  if (!labelledBy) {
    throw new Error(
      'a11y (WCAG 4.1.2): dialog has no aria-labelledby. Pass labelledBy pointing at the dialog title id.',
    );
  }
  const missing = labelledBy.split(/\s+/).filter((id) => !dialog.ownerDocument.getElementById(id));
  if (missing.length > 0) {
    throw new Error(
      `a11y (WCAG 4.1.2): dialog aria-labelledby points at missing id(s): ${missing.join(', ')}.`,
    );
  }
  return labelledBy;
}

/***
 * MARK: assertLiveRegion
 * @description A container exposes async updates through a live region
 * (WCAG 4.1.3 Status Messages).
 * @param {HTMLElement} container
 * @param {string[]} [roles] - Acceptable live-region roles.
 * @returns {HTMLElement} The live region found.
 ***/
export function assertLiveRegion(container, roles = ['status', 'alert', 'log']) {
  const found = roles.map((role) => container.querySelector(`[role="${role}"]`)).find(Boolean);
  if (!found) {
    throw new Error(
      `a11y (WCAG 4.1.3): no live region (${roles.join('/')}) found. ` +
        `Render status updates inside role="status", role="alert", or role="log".`,
    );
  }
  return found;
}

/***
 * MARK: assertHeadingOrder
 * @description Heading levels under a container never skip down (h1 → h3 with
 * no h2 is disorienting; WCAG 1.3.1 Info and Relationships, 2.4.10).
 * @param {HTMLElement} container
 ***/
export function assertHeadingOrder(container) {
  const levels = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) =>
    Number(h.tagName[1]),
  );
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) {
      throw new Error(
        `a11y (WCAG 1.3.1): heading level jumps from h${levels[i - 1]} to h${levels[i]}. Keep heading order sequential.`,
      );
    }
  }
  return levels;
}

/***
 * MARK: assertSectionHeadings
 * @description Every sectioning landmark under a container opens with a
 * heading (WCAG 2.4.10 Section Headings, AAA): screen-reader users navigate
 * by headings, so a `<section>` or `role="region"` without one is a silent
 * gap in that map. The heading must be the first heading inside the section.
 * @param {HTMLElement} container
 * @returns {string[]} The collected heading texts.
 ***/
export function assertSectionHeadings(container) {
  const sections = Array.from(container.querySelectorAll('section, [role="region"]'));
  return sections.map((section) => {
    const heading = section.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');
    if (!heading) {
      throw new Error(
        'a11y (WCAG 2.4.10): <section> has no heading. ' +
          'Give every section a heading so screen-reader heading navigation stays complete.',
      );
    }
    const text = (heading.textContent || '').trim();
    if (!text) {
      throw new Error('a11y (WCAG 2.4.10): section heading is empty. Give it a descriptive label.');
    }
    return text;
  });
}

function tagOf(el) {
  try {
    return el?.tagName?.toLowerCase?.() || '?';
  } catch {
    return '?';
  }
}

/***
 * MARK: visibleTextOf
 * @description Text content with `aria-hidden` subtrees removed. Per the
 * accessible-name computation, aria-hidden content is never exposed to
 * assistive tech, so it must not count as an element's name either.
 * @param {HTMLElement} el
 ***/
function visibleTextOf(el) {
  try {
    if (typeof el?.cloneNode !== 'function') return (el?.textContent || '').trim();
    const clone = el.cloneNode(true);
    if (typeof clone.querySelectorAll === 'function') {
      clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    }
    if (typeof clone.getAttribute === 'function' && clone.getAttribute('aria-hidden') === 'true') {
      return '';
    }
    return (clone.textContent || '').trim();
  } catch {
    return (el?.textContent || '').trim();
  }
}

function accessibleNameOf(el) {
  if (!el) return '';
  // Prefer the same computation Testing Library/jest-dom uses when available.
  if (typeof el.getAttribute === 'function') {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy && el.ownerDocument) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => el.ownerDocument.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (text) return text;
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    if (el.labels && el.labels.length > 0) {
      const text = Array.from(el.labels)
        .map((l) => l.textContent || '')
        .join(' ')
        .trim();
      if (text) return text;
    }
  }
  return (visibleTextOf(el) || el.value || el.title || '').trim();
}
