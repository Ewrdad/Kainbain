import { describe, it, expect } from 'vitest';
import {
  parseModelKey,
  splitReasoning,
  stripReasoning,
  appendReasoning,
  checkReasoningLevelText,
  validateModelRefShape,
  classifiesForeignHarness,
  normalizeModelRef,
  resolveModel,
  resolveReasoningOptions,
  stripReasoningIfUnsupported,
} from './modelKeys';

describe('frontend modelKeys service', () => {
  describe('reasoning level parsing and manipulation', () => {
    it('parses a 4-part model key with reasoning level intact', () => {
      const parsed = parseModelKey('pi::ollama-cloud::glm-5.3-flash:cloud::high');
      expect(parsed).toEqual({
        form: 'harnessReasoning',
        harness: 'pi',
        provider: 'ollama-cloud',
        id: 'glm-5.3-flash:cloud',
        reasoning: 'high',
      });
    });

    it('splits reasoning level cleanly from base reference', () => {
      expect(splitReasoning('pi::provider::id::high')).toEqual({
        baseRef: 'pi::provider::id',
        reasoning: 'high',
      });
      expect(splitReasoning({ modelRef: 'pi::provider::id::high' })).toEqual({
        baseRef: 'pi::provider::id',
        reasoning: 'high',
      });
      expect(splitReasoning('pi::provider::id')).toEqual({
        baseRef: 'pi::provider::id',
        reasoning: null,
      });
    });

    it('strips reasoning level down to 3-part canonical key', () => {
      expect(stripReasoning('pi::provider::id::high')).toBe('pi::provider::id');
      expect(stripReasoning({ modelRef: 'pi::provider::id::high' })).toBe('pi::provider::id');
      expect(stripReasoning('pi::provider::id')).toBe('pi::provider::id');
    });

    it('appends and updates reasoning level on harness-scoped references', () => {
      expect(appendReasoning('pi::provider::id', 'high')).toBe('pi::provider::id::high');
      expect(appendReasoning({ ref: 'pi::provider::id', level: 'high' })).toBe('pi::provider::id::high');
      expect(appendReasoning('pi::provider::id::low', 'high')).toBe('pi::provider::id::high');
      expect(() => appendReasoning('provider::id', 'high')).toThrow();
    });

    it('checks reasoning level text validity and reports specific errors', () => {
      expect(checkReasoningLevelText({ level: 'high' })).toBeNull();
      expect(checkReasoningLevelText({ level: ' high' })).toContain('whitespace');
      expect(checkReasoningLevelText({ level: 'a::b' })).toContain('::');
      expect(checkReasoningLevelText({ level: '' })).not.toBeNull();
      expect(checkReasoningLevelText({})).not.toBeNull();
    });

    it('validates shape including harnessReasoning', () => {
      expect(validateModelRefShape('pi::provider::id::high')).toBe('harnessReasoning');
      expect(validateModelRefShape('pi::provider::id')).toBe('harness');
      expect(validateModelRefShape('provider::id')).toBe('provider');
      expect(validateModelRefShape('bare-id')).toBe('bare');
      expect(validateModelRefShape('a::b::c::d::e')).toBeNull();
    });

    it('checks foreign harness classification with reasoning keys', () => {
      expect(classifiesForeignHarness('pi::provider::id::high', 'antigravity')).toBe(true);
      expect(classifiesForeignHarness('pi::provider::id::high', 'pi')).toBe(false);
    });

    it('normalizes references preserving reasoning keys', () => {
      expect(normalizeModelRef('pi::provider::id::high', 'pi')).toBe('pi::provider::id::high');
    });

    it('resolves reasoning options preferring the model set over the harness set (Q5)', () => {
      const harness = { id: 'pi', reasoningLevels: ['low', 'medium', 'high'] };
      // Model override wins when non-empty.
      expect(
        resolveReasoningOptions({
          harnessEntry: harness,
          selectedModel: { supportedReasoning: ['high'] },
        }),
      ).toEqual(['high']);
      // Empty model set falls back to the harness set.
      expect(
        resolveReasoningOptions({
          harnessEntry: harness,
          selectedModel: { supportedReasoning: [] },
        }),
      ).toEqual(['low', 'medium', 'high']);
      // Missing model falls back to the harness set.
      expect(resolveReasoningOptions({ harnessEntry: harness })).toEqual([
        'low',
        'medium',
        'high',
      ]);
      // A model set alone (no harness advertisement) still resolves.
      expect(
        resolveReasoningOptions({
          harnessEntry: { id: 'muse', reasoningLevels: null },
          selectedModel: { supportedReasoning: ['low'] },
        }),
      ).toEqual(['low']);
    });

    it('ignores malformed advertised sets (fail-safe: level-free, never crash)', () => {
      const harness = { id: 'pi', reasoningLevels: ['low', 'medium', 'high'] };
      // A non-array harness advertisement cannot be offered — hide the picker.
      expect(
        resolveReasoningOptions({
          harnessEntry: { id: 'pi', reasoningLevels: 'high' },
          selectedModel: null,
        }),
      ).toBeNull();
      // A non-array model advertisement falls back to the harness set.
      expect(
        resolveReasoningOptions({
          harnessEntry: harness,
          selectedModel: { supportedReasoning: 'high' },
        }),
      ).toEqual(['low', 'medium', 'high']);
      // Junk on both sides stays level-free.
      expect(
        resolveReasoningOptions({
          harnessEntry: { id: 'pi', reasoningLevels: 'high' },
          selectedModel: { supportedReasoning: 'high' },
        }),
      ).toBeNull();
    });

    it('resolves reasoning options to null when neither side advertises (level-free)', () => {
      expect(resolveReasoningOptions({})).toBeNull();
      expect(
        resolveReasoningOptions({
          harnessEntry: { id: 'muse', reasoningLevels: null },
          selectedModel: null,
        }),
      ).toBeNull();
      expect(
        resolveReasoningOptions({
          harnessEntry: { id: 'muse', reasoningLevels: [] },
          selectedModel: { supportedReasoning: [] },
        }),
      ).toBeNull();
      expect(
        resolveReasoningOptions({
          harnessEntry: { id: 'muse' },
          selectedModel: { id: 'c1' },
        }),
      ).toBeNull();
    });

    it('strips a stored level only on null-harness targets, keeping capable refs verbatim (Q2)', () => {
      // 3-part refs pass through untouched either way.
      expect(stripReasoningIfUnsupported('pi::provider::id', null)).toBe('pi::provider::id');
      expect(stripReasoningIfUnsupported('pi::provider::id', ['high'])).toBe(
        'pi::provider::id',
      );
      // 4-part on a null harness strips to the bare ref.
      expect(stripReasoningIfUnsupported('pi::provider::id::high', null)).toBe(
        'pi::provider::id',
      );
      expect(stripReasoningIfUnsupported('pi::provider::id::high', undefined)).toBe(
        'pi::provider::id',
      );
      // 4-part on a capable harness is kept verbatim — even a level the
      // catalogue no longer advertises (save-time validation flags it; load
      // never destroys data beyond the null-harness case).
      expect(stripReasoningIfUnsupported('pi::provider::id::high', ['low', 'high'])).toBe(
        'pi::provider::id::high',
      );
      expect(stripReasoningIfUnsupported('pi::provider::id::bogus', ['low', 'high'])).toBe(
        'pi::provider::id::bogus',
      );
      // Single-colon model ids survive the strip intact.
      expect(
        stripReasoningIfUnsupported('pi::ollama-cloud::glm-5.3-flash:cloud::high', null),
      ).toBe('pi::ollama-cloud::glm-5.3-flash:cloud');
      // Empty input stays empty.
      expect(stripReasoningIfUnsupported('', null)).toBe('');
      // Supports labelled options object input ({ storedRef, optionsOrNull }).
      expect(
        stripReasoningIfUnsupported({ storedRef: 'pi::provider::id::high', optionsOrNull: null }),
      ).toBe('pi::provider::id');
      expect(
        stripReasoningIfUnsupported({
          storedRef: 'pi::provider::id::high',
          optionsOrNull: ['low', 'high'],
        }),
      ).toBe('pi::provider::id::high');
    });

    it('resolves model attaching reasoning level to the matching model', () => {
      const available = [
        { key: 'pi::ollama-cloud::glm-5.3', provider: 'ollama-cloud', id: 'glm-5.3', harness: 'pi' },
      ];
      const resolved = resolveModel(available, 'pi::ollama-cloud::glm-5.3::high');
      expect(resolved).toEqual({
        key: 'pi::ollama-cloud::glm-5.3',
        provider: 'ollama-cloud',
        id: 'glm-5.3',
        harness: 'pi',
        reasoning: 'high',
      });
    });
  });
});
