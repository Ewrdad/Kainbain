import { describe, it, expect } from 'vitest';
import { splitModelRefProvider } from './splitModelRefProvider';

/***
 * MARK: splitModelRefProvider tests
 * @description Locks the provider-badge split behind the collapsed alias chips:
 *   legacy `provider::id`, canonical `harness::provider::id`, `::reasoning`
 *   suffixes, bare ids, and fail-safe garbage handling.
 ***/

describe('splitModelRefProvider', () => {
  it('splits a legacy provider::id ref', () => {
    expect(splitModelRefProvider('google::gemini-3-pro')).toEqual({
      provider: 'google',
      modelId: 'gemini-3-pro',
    });
  });

  it('splits a canonical harness::provider::id ref (harness half not repeated)', () => {
    expect(splitModelRefProvider('pi::google::gemini-3-pro')).toEqual({
      provider: 'google',
      modelId: 'gemini-3-pro',
    });
  });

  it('strips an optional ::reasoning level (4-segment canonical) before splitting', () => {
    expect(splitModelRefProvider('pi::google::gemini-3-pro::high')).toEqual({
      provider: 'google',
      modelId: 'gemini-3-pro',
    });
  });

  it('reads a 3-segment ref as harness::provider::id per the shared grammar', () => {
    // `google::m1::low` is harness=google, provider=m1, id=low — only the
    // 4-segment form carries a reasoning level.
    expect(splitModelRefProvider('google::m1::low')).toEqual({
      provider: 'm1',
      modelId: 'low',
    });
  });

  it('keeps single-colon ids intact', () => {
    expect(splitModelRefProvider('pi::ollama-cloud::glm-5.3-flash:cloud::high')).toEqual({
      provider: 'ollama-cloud',
      modelId: 'glm-5.3-flash:cloud',
    });
  });

  it('treats a bare id as provider-less', () => {
    expect(splitModelRefProvider('gemini-3-pro')).toEqual({ provider: '', modelId: 'gemini-3-pro' });
  });

  it('fails safe on blank and garbage input', () => {
    expect(splitModelRefProvider('')).toEqual({ provider: '', modelId: '' });
    expect(splitModelRefProvider(null)).toEqual({ provider: '', modelId: '' });
    expect(splitModelRefProvider(undefined)).toEqual({ provider: '', modelId: '' });
    expect(splitModelRefProvider(42)).toEqual({ provider: '', modelId: '' });
    // 5+ segments are malformed: the raw ref is shown verbatim, no badge.
    expect(splitModelRefProvider('a::b::c::d::e')).toEqual({ provider: '', modelId: 'a::b::c::d::e' });
    // Empty segment is malformed too.
    expect(splitModelRefProvider('google::::x')).toEqual({ provider: '', modelId: 'google::::x' });
  });

  it('trims surrounding whitespace', () => {
    expect(splitModelRefProvider('  google::m1  ')).toEqual({ provider: 'google', modelId: 'm1' });
  });
});
