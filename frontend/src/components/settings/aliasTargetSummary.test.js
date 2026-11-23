import { describe, it, expect } from 'vitest';
import { aliasTargetSummary } from './aliasTargetSummary';

/***
 * MARK: aliasTargetSummary tests
 * @description Locks the structured per-target summary behind the collapsed
 *   alias chips AND the `formatAliasSummary` text fallback: harness label
 *   fallbacks, percent text, self-managed (`none`) harnesses hiding the model,
 *   provider/modelId split, reasoning level, and blank/malformed fail-safes.
 ***/

const HARNESSES = [
  {
    id: 'pi',
    label: 'pi',
    modelSelection: 'list',
    models: [{ id: 'm1', provider: 'google', key: 'google::m1' }],
  },
  { id: 'custom', label: 'Custom', modelSelection: 'none', models: [] },
];

describe('aliasTargetSummary', () => {
  it('summarizes a list-harness target with model', () => {
    expect(aliasTargetSummary({ harness: 'pi', model: 'google::m1', percent: 100 }, HARNESSES)).toEqual({
      percent: 100,
      percentText: '100%',
      harnessId: 'pi',
      harnessLabel: 'pi',
      modelRef: 'google::m1',
      showModel: true,
      provider: 'google',
      modelId: 'm1',
      reasoning: null,
    });
  });

  it('hides the model on a self-managed (none) harness', () => {
    const s = aliasTargetSummary({ harness: 'custom', model: 'ignored', percent: 50 }, HARNESSES);
    expect(s.harnessLabel).toBe('Custom');
    expect(s.showModel).toBe(false);
    expect(s.modelRef).toBe('ignored');
    expect(s.percentText).toBe('50%');
  });

  it('falls back to the raw harness id when the catalogue has no entry', () => {
    const s = aliasTargetSummary({ harness: 'ghost', model: 'm', percent: 10 }, HARNESSES);
    expect(s.harnessLabel).toBe('ghost');
    expect(s.showModel).toBe(true);
  });

  it('labels a blank harness unassigned', () => {
    const s = aliasTargetSummary({}, HARNESSES);
    expect(s.harnessLabel).toBe('unassigned');
    expect(s.harnessId).toBe('');
    expect(s.percentText).toBe('');
    expect(s.percent).toBeNull();
    expect(s.showModel).toBe(false);
    expect(s.modelRef).toBe('');
  });

  it('splits the provider badge off canonical refs and keeps reasoning', () => {
    const s = aliasTargetSummary({ harness: 'pi', model: 'pi::anthropic::claude-sonnet-4-5::high' }, HARNESSES);
    expect(s.provider).toBe('anthropic');
    expect(s.modelId).toBe('claude-sonnet-4-5');
    expect(s.reasoning).toBe('high');
    expect(s.modelRef).toBe('pi::anthropic::claude-sonnet-4-5::high');
  });

  it('treats non-numeric percents as absent', () => {
    expect(aliasTargetSummary({ harness: 'pi', model: 'm', percent: '' }, HARNESSES).percentText).toBe('');
    expect(aliasTargetSummary({ harness: 'pi', model: 'm', percent: NaN }, HARNESSES).percent).toBeNull();
    expect(aliasTargetSummary({ harness: 'pi', model: 'm' }, HARNESSES).percentText).toBe('');
  });

  it('never throws on malformed targets or catalogues', () => {
    expect(aliasTargetSummary(null, null).harnessLabel).toBe('unassigned');
    expect(aliasTargetSummary('nope', 'nope').harnessLabel).toBe('unassigned');
    expect(aliasTargetSummary({ harness: 5, model: 6, percent: 'x' }, HARNESSES).percentText).toBe('');
  });
});
