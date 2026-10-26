import { expect, test } from 'vitest';
import { getHeaderLayout, HEADER_BREAKPOINTS } from './headerLayout';

/***
 * MARK: headerLayout tests
 * @description Pins the pure header layout contract at both sides of every
 *   breakpoint threshold, with the app link and git remote on and off. The
 *   thresholds mirror the Tailwind classes in Header.jsx — change both sides
 *   together.
 ***/

const FEATURE_SETS = [
  [{}, 'bare'],
  [{ hasAppLink: true }, 'app link'],
  [{ hasUpstreamRepo: true }, 'git remote'],
  [{ hasAppLink: true, hasUpstreamRepo: true }, 'app link + git remote'],
];

test.each(FEATURE_SETS)('stacks below sm regardless of features (%s)', (features) => {
  for (const width of [300, 320, 375, 430, 639]) {
    expect(getHeaderLayout(width, features).stacked, `width ${width}`).toBe(true);
  }
  for (const width of [640, 768, 1024, 1280]) {
    expect(getHeaderLayout(width, features).stacked, `width ${width}`).toBe(false);
  }
});

test.each(FEATURE_SETS)('labels wait for xl, not sm or lg (%s)', (features) => {
  for (const width of [640, 767, 768, 859, 1023, 1024, 1279]) {
    expect(getHeaderLayout(width, features).showLabels, `width ${width}`).toBe(false);
  }
  expect(getHeaderLayout(1280, features).showLabels).toBe(true);
});

test('git remote icon appears at md, its label waits for xl', () => {
  const withRepo = { hasUpstreamRepo: true };
  for (const width of [320, 640, 767]) {
    expect(getHeaderLayout(width, withRepo).showGitRemoteIcon, `icon ${width}`).toBe(false);
  }
  for (const width of [768, 1024, 1279]) {
    expect(getHeaderLayout(width, withRepo).showGitRemoteIcon, `icon ${width}`).toBe(true);
    expect(getHeaderLayout(width, withRepo).showGitRemoteLabel, `label ${width}`).toBe(false);
  }
  expect(getHeaderLayout(1280, withRepo).showGitRemoteLabel).toBe(true);
});

test('no git remote UI without an upstream repo, at any width', () => {
  for (const width of [320, 768, 1024, 1280]) {
    const layout = getHeaderLayout(width, {});
    expect(layout.showGitRemoteIcon).toBe(false);
    expect(layout.showGitRemoteLabel).toBe(false);
  }
});

test('build badge waits for xl, and for 2xl when an app link crowds the row', () => {
  for (const width of [320, 640, 768, 1023, 1024, 1279]) {
    expect(getHeaderLayout(width, {}).showBuildBadge, `width ${width}`).toBe(false);
  }
  expect(getHeaderLayout(1280, {}).showBuildBadge).toBe(true);
  for (const width of [1280, 1366, 1440]) {
    expect(getHeaderLayout(width, { hasAppLink: true }).showBuildBadge, `width ${width}`).toBe(
      false,
    );
  }
  expect(getHeaderLayout(1536, { hasAppLink: true }).showBuildBadge).toBe(true);
});

test('PROJECT label defers to 2xl when an app link crowds the row', () => {
  for (const width of [1280, 1366, 1440]) {
    expect(getHeaderLayout(width, {}).showProjectLabel, `bare ${width}`).toBe(true);
    expect(getHeaderLayout(width, { hasAppLink: true }).showProjectLabel, `crowded ${width}`).toBe(
      false,
    );
  }
  expect(getHeaderLayout(1536, { hasAppLink: true }).showProjectLabel).toBe(true);
  expect(getHeaderLayout(1024, {}).showProjectLabel).toBe(false);
});

test('breakpoint constants pin the Tailwind thresholds used in Header.jsx', () => {
  expect(HEADER_BREAKPOINTS.SM).toBe(640);
  expect(HEADER_BREAKPOINTS.MD).toBe(768);
  expect(HEADER_BREAKPOINTS.XL).toBe(1280);
  expect(HEADER_BREAKPOINTS.XXL).toBe(1536);
  expect(Object.isFrozen(HEADER_BREAKPOINTS)).toBe(true);
});

test('invalid widths fail safe to the stacked layout instead of throwing', () => {
  for (const width of [undefined, null, NaN, -1, -640, Infinity, 'abc', '', {}, []]) {
    const layout = getHeaderLayout(width, { hasAppLink: true, hasUpstreamRepo: true });
    expect(layout.stacked, `width ${String(width)}`).toBe(true);
    expect(layout.showLabels).toBe(false);
    expect(layout.showGitRemoteIcon).toBe(false);
    expect(layout.showGitRemoteLabel).toBe(false);
    expect(layout.showBuildBadge).toBe(false);
    expect(layout.showProjectLabel).toBe(false);
  }
});

test('numeric-string widths coerce instead of degrading', () => {
  expect(getHeaderLayout('375', {}).stacked).toBe(true);
  expect(getHeaderLayout('1280', {}).showLabels).toBe(true);
});

test('null and non-object features degrade to bare instead of throwing', () => {
  for (const features of [null, 'app', 42, true]) {
    expect(() => getHeaderLayout(375, features)).not.toThrow();
    expect(getHeaderLayout(375, features).stacked).toBe(true);
    expect(getHeaderLayout(1280, features).showBuildBadge).toBe(true);
  }
  expect(() => getHeaderLayout(375)).not.toThrow();
});

test('app link otherwise changes nothing (Row B scrolls on phones instead of a menu)', () => {
  for (const width of [300, 320, 375, 640, 1024]) {
    expect(getHeaderLayout(width, { hasAppLink: true }).stacked).toBe(
      getHeaderLayout(width, { hasAppLink: false }).stacked,
    );
    expect(getHeaderLayout(width, { hasAppLink: true }).showLabels).toBe(
      getHeaderLayout(width, { hasAppLink: false }).showLabels,
    );
  }
});
