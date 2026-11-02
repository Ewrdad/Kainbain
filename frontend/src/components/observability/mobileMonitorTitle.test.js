// Run in the lighter node environment: pure format function, no DOM needs.
// @vitest-environment node
import { expect, test, describe } from 'vitest';
import { formatMobileMonitorTitle, resolveMobileModelLine } from './MobileMonitorView';
import { resolveMobileModelDetails } from './mobileModelDetails';

describe('formatMobileMonitorTitle', () => {
  test('prefers the task title when running', () => {
    expect(
      formatMobileMonitorTitle(
        { title: 'Build user auth' },
        { status: 'running', activeStageName: 'Code Generation' },
        true,
      ),
    ).toBe('Build user auth');
  });

  test('falls back to the goal first line with markdown heading stripped', () => {
    expect(
      formatMobileMonitorTitle(
        { goal: '# Ship the widget\nSecond line' },
        { status: 'running', activeStageName: 'Build' },
        true,
      ),
    ).toBe('Ship the widget');
  });

  test('running without a resolved task shows a no-task label, not the stage', () => {
    expect(
      formatMobileMonitorTitle(
        null,
        { status: 'running', activeStageName: 'Code Generation' },
        true,
      ),
    ).toBe('No active task');
  });

  test('idle with no task keeps the legacy stage/empty text', () => {
    expect(formatMobileMonitorTitle(null, {}, false)).toBe('No active stage');
    expect(
      formatMobileMonitorTitle(null, { activeStageName: 'Review' }, false),
    ).toBe('Review');
  });

  test('handles null task and empty engineState without crashing', () => {
    expect(formatMobileMonitorTitle(null, {}, true)).toBe('No active task');
    expect(formatMobileMonitorTitle()).toBe('No active stage');
  });
});

describe('resolveMobileModelLine', () => {
  test('compresses alias, harness, model, and provider onto one line', () => {
    const line = resolveMobileModelLine(
      resolveMobileModelDetails(
        {
          model: 'pi::ollama-cloud::gemma4:31b-cloud',
          harness: 'pi',
          modelDetails: { key: 'pi::ollama-cloud::gemma4:31b-cloud', provider: 'ollama-cloud', source: 'stage-override' },
          alias: { name: 'fast', targetIndex: 0 },
        },
        {},
      ),
    );
    expect(line.line).toBe(
      'alias: fast · Harness: pi · Model: gemma4:31b-cloud · Provider: ollama-cloud · Source: stage-override',
    );
    // The tooltip keeps the full model ref so nothing is lost to truncation.
    expect(line.title).toContain('Model: pi::ollama-cloud::gemma4:31b-cloud');
    expect(line.title).toContain('alias: fast');
  });

  test('scripted stages keep the automated wording', () => {
    const line = resolveMobileModelLine(
      resolveMobileModelDetails({ stageType: 'ci' }, {}),
    );
    expect(line.line).toBe('Automated — no model');
  });

  test('idle resolves to null so the view renders its fallback', () => {
    expect(resolveMobileModelLine(resolveMobileModelDetails(null, {}))).toBeNull();
  });

  test("harness-managed stages ('none') hide only the model", () => {
    const line = resolveMobileModelLine(
      resolveMobileModelDetails({ harness: 'muse', modelSelection: 'none' }, {}),
    );
    expect(line.line).toContain('Harness: muse');
    expect(line.line).not.toContain('Model:');
  });
});
