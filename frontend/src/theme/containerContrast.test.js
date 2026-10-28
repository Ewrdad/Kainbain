import { describe, expect, it } from 'vitest';

import { contrastOfPair, mixHexTowards } from './accentTokens.js';

/***
 * MARK: theme contrast floors
 * @description WCAG 2.2 AAA contrast regression gate for the design-system
 * palette (criterion 1.4.6 Contrast Enhanced: normal text >= 7:1;
 * criterion 1.4.11 Non-text Contrast: UI boundaries >= 3:1). Every pair is
 * recomputed from the literal hexes with the same relative-luminance math
 * the theme helpers use, so a token edit that drops a pair below its floor
 * fails here at unit level instead of regressing silently in production.
 * Large-text pairs (>= 18pt / 14pt bold) need only 4.5:1 under 1.4.6 and are
 * asserted at that floor where noted.
 ***/

// [description, foreground, background, minimum ratio]
const TEXT_PAIRS_AAA = [
  ['on-surface on surface', '#e5e2e1', '#131313', 7],
  ['on-surface-variant on surface', '#becaba', '#131313', 7],
  ['text-high on surface', '#ededed', '#131313', 7],
  ['text-muted on surface', '#d1d5db', '#131313', 7],
  ['body text on surface-deep', '#e5e2e1', '#0a0a0a', 7],
  ['placeholder text-muted on surface-deep', '#d1d5db', '#0a0a0a', 7],
  ['accent text on dark surface', '#7bdb85', '#131313', 7],
  ['secondary text on dark surface', '#9acbff', '#131313', 7],
  ['tertiary text on dark surface', '#ffb77f', '#131313', 7],
  ['error text on dark surface', '#ffb4ab', '#131313', 7],
  ['warning text on dark surface', '#ffd54f', '#131313', 7],
  ['ochre text on dark surface', '#ffb74d', '#131313', 7],
  ['error-red text on dark surface', '#ff8383', '#131313', 7],
  ['black on default accent', '#000000', '#7bdb85', 7],
  ['on-primary-container on primary-container', '#00320e', '#c9e8cd', 7],
  ['on-secondary-container on secondary-container', '#ffffff', '#005a8c', 7],
  ['on-tertiary-container on tertiary-container', '#2a1200', '#e8a04c', 7],
  ['on-secondary on secondary', '#003355', '#9acbff', 7],
  ['on-tertiary on tertiary', '#4e2600', '#ffb77f', 7],
  ['on-error on error', '#690005', '#ffb4ab', 7],
  ['on-warning on warning', '#3a2e00', '#ffd54f', 7],
  ['on-primary-fixed on primary-fixed', '#002107', '#97f89e', 7],
  ['on-primary-fixed-variant on primary-fixed', '#00531c', '#97f89e', 7],
  ['on-secondary-fixed on secondary-fixed', '#001d34', '#d0e4ff', 7],
  ['on-tertiary-fixed on tertiary-fixed', '#2f1500', '#ffdcc4', 7],
  ['inverse-on-surface on inverse-surface', '#313030', '#e5e2e1', 7],
  ['inverse-primary on inverse-surface', '#004d1c', '#e5e2e1', 7],
  ['on-error-container on error-container', '#ffdad6', '#93000a', 7],
  ['on-warning-container on warning-container', '#ffe082', '#4a3c00', 7],
  ['on-surface on agent-fill', '#e5e2e1', '#043b0c', 7],
  ['on-surface on human-fill', '#e5e2e1', '#0d2b45', 7],
  ['on-surface on stage-fill', '#e5e2e1', '#362600', 7],
  // Light theme.
  ['light on-surface on white', '#0f172a', '#ffffff', 7],
  ['light text-muted on white', '#475569', '#ffffff', 7],
  ['light text-muted on subtle', '#475569', '#f8fafc', 7],
  // Midnight theme.
  ['midnight on-surface on deep', '#e2e8f0', '#070c14', 7],
  // Collapsed error badge (WCAG 1.4.6 AAA >= 7:1 across themes)
  [
    'error badge text on surface with bg-error/10',
    '#ffb4ab',
    mixHexTowards('#131313', '#ffb4ab', 0.1),
    7,
  ],
  [
    'error badge text on container with bg-error/10',
    '#ffb4ab',
    mixHexTowards('#201f1f', '#ffb4ab', 0.1),
    7,
  ],
  [
    'error badge text on surface-deep with bg-error/10',
    '#ffb4ab',
    mixHexTowards('#0a0a0a', '#ffb4ab', 0.1),
    7,
  ],
  [
    'light error badge text on white with bg-error/10',
    '#991b1b',
    mixHexTowards('#ffffff', '#ffb4ab', 0.1),
    7,
  ],
  [
    'midnight error badge text on container with bg-error/10',
    '#ffb4ab',
    mixHexTowards('#131f33', '#ffb4ab', 0.1),
    7,
  ],
];

// [description, foreground, background] — floor is 3:1 per 1.4.11.
const UI_PAIRS = [
  ['dark border-standard on surface', '#757575', '#131313'],
  ['dark scrollbar thumb on track', '#757575', '#131313'],
  ['outline on surface', '#899486', '#131313'],
  ['light border-standard on white', '#64748b', '#ffffff'],
  ['light scrollbar thumb on track', '#64748b', '#f1f5f9'],
  ['midnight border-standard on container', '#5a7bab', '#131f33'],
  ['midnight scrollbar thumb on track', '#5a7bab', '#070c14'],
  ['high-contrast border on panel', '#ffffff', '#0a0a0a'],
  // Collapsed error badge border (WCAG 1.4.11 >= 3:1 non-text boundary)
  ['error badge border on surface', mixHexTowards('#131313', '#ffb4ab', 0.5), '#131313'],
  ['error badge border on container', mixHexTowards('#201f1f', '#ffb4ab', 0.5), '#201f1f'],
];

describe('theme AAA contrast floors (WCAG 1.4.6 / 1.4.11)', () => {
  it.each(TEXT_PAIRS_AAA)('%s holds >= 7:1', (_label, fg, bg, min) => {
    expect(contrastOfPair(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it.each(UI_PAIRS)('%s holds >= 3:1 (non-text)', (_label, fg, bg) => {
    expect(contrastOfPair(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
