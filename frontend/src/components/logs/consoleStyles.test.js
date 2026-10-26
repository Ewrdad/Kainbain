// @vitest-environment node
import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONSOLE_CHROME } from './consoleStyles';

/***
 * MARK: consoleStyles tests
 * @description Locks the shared terminal console chrome: every key both
 *   console surfaces need is present, values stay the monitor console's
 *   dark terminal palette, and both surfaces import from this module so a
 *   future hardcoded color cannot silently reintroduce visual drift.
 ***/

const HERE = path.dirname(fileURLToPath(import.meta.url));

function readSource(relativePath) {
  return fs.readFileSync(path.join(HERE, relativePath), 'utf8');
}

test('exports every chrome key both consoles need', () => {
  expect(Object.keys(CONSOLE_CHROME).sort()).toEqual(
    [
      'autoScrollOff',
      'autoScrollOn',
      'countBadge',
      'headerBg',
      'headerBorder',
      'headerHover',
      'headerText',
      'outerBg',
      'streamingPill',
    ].sort(),
  );
  for (const value of Object.values(CONSOLE_CHROME)) {
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  }
});

test('keeps the dark terminal palette (no surface-theme tokens)', () => {
  expect(CONSOLE_CHROME.outerBg).toBe('bg-[#05070d]');
  expect(CONSOLE_CHROME.headerBg).toBe('bg-[#0b0f1a]');
  expect(CONSOLE_CHROME.headerBorder).toBe('border-slate-800');
  expect(CONSOLE_CHROME.headerText).toBe('text-slate-400');
  expect(CONSOLE_CHROME.autoScrollOn).toContain('emerald');
  expect(CONSOLE_CHROME.autoScrollOff).toContain('slate');
});

test('chrome constants are frozen against runtime mutation', () => {
  expect(Object.isFrozen(CONSOLE_CHROME)).toBe(true);
});

test('both console surfaces import the shared chrome', () => {
  const activityConsole = readSource('../workflow/ActivityConsole.jsx');
  const liveConsole = readSource('../observability/widgets/LiveConsoleWidget.jsx');
  expect(activityConsole).toContain('logs/consoleStyles');
  expect(liveConsole).toContain('logs/consoleStyles');
  expect(activityConsole).toContain('CONSOLE_CHROME');
  expect(liveConsole).toContain('CONSOLE_CHROME');
});
