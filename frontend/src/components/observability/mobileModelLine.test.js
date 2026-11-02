// Run in the lighter node environment: pure format function, no DOM needs.
// @vitest-environment node
import { expect, test, describe } from 'vitest';
import { resolveMobileModelLine } from './mobileModelLine';
import { resolveMobileModelDetails } from './mobileModelDetails';

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

  test('matches the documented example output exactly', () => {
    const line = resolveMobileModelLine(
      resolveMobileModelDetails({ model: 'pi::pi::qwen3:8b', harness: 'pi' }, {}),
    );
    expect(line.line).toBe(
      'Harness: pi · Model: qwen3:8b · Provider: pi · Source: unknown',
    );
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

  test('null or empty details never crash and never print undefined', () => {
    expect(resolveMobileModelLine(null)).toBeNull();
    expect(resolveMobileModelLine(undefined)).toEqual({
      line: 'Idle — no active model',
      title: 'Idle — no active model',
    });
    const empty = resolveMobileModelLine({});
    expect(empty.line).toBe('Idle — no active model');
    expect(empty.title).toBe('Idle — no active model');
    expect(JSON.stringify(resolveMobileModelLine({}))).not.toContain('undefined');
  });

  test('half-shaped payloads render Unknown labels instead of crashing', () => {
    const line = resolveMobileModelLine({
      showAlias: true,
      showHarness: true,
      showModel: true,
      showProviderLine: true,
    });
    expect(line.line).toBe(
      'alias: Unknown · Harness: Unknown · Model: Unknown · Provider: Unknown · Source: unknown',
    );
    expect(line.line).not.toContain('undefined');
  });

  test('a missing model label falls back to the full ref', () => {
    const line = resolveMobileModelLine({
      showModel: true,
      model: {},
      modelRef: 'pi::ollama-cloud::gemma4:31b-cloud',
    });
    expect(line.line).toBe('Model: pi::ollama-cloud::gemma4:31b-cloud');
    expect(line.title).toBe('Model: pi::ollama-cloud::gemma4:31b-cloud');
  });
});
