import { splitReasoning } from '../../services/modelKeys';
import { splitModelRefProvider } from './splitModelRefProvider';

/***
 * MARK: aliasTargetSummary
 * @description Builds the structured summary of ONE alias target for the
 *   collapsed row's target chips — the single source both the chip renderer
 *   (`AliasTargetChip`) and the plain-text fallback (`formatAliasSummary`)
 *   are built on, so the two can never drift apart. Mirrors the historic
 *   `formatAliasSummary` semantics exactly: the harness label falls back to
 *   the raw harness id, then to `unassigned`; the percent renders as `N%`
 *   only when it is a real number; and the model ref is only "shown" when the
 *   harness is list-based (`modelSelection !== 'none'`) and the stored model
 *   is non-blank (a self-managed `none` harness ignores its stored model).
 *   The model ref is additionally split into `provider` badge + `modelId`
 *   (and carries the optional `reasoning` level) so the chip can render the
 *   provider as a separate badge while the complete stored ref stays intact
 *   in `modelRef`. Never throws on malformed input (blank/unassigned/`none`
 *   rows all produce a renderable summary).
 * @example aliasTargetSummary({ harness: 'pi', model: 'google::m1', percent: 100 }, [{ id: 'pi', label: 'pi', modelSelection: 'list' }])
 *   => { percent: 100, percentText: '100%', harnessId: 'pi', harnessLabel: 'pi', modelRef: 'google::m1', showModel: true, provider: 'google', modelId: 'm1', reasoning: null }
 * @example aliasTargetSummary({ harness: 'custom', model: 'ignored', percent: 50 }, [{ id: 'custom', label: 'Custom', modelSelection: 'none' }])
 *   => { percent: 50, percentText: '50%', harnessId: 'custom', harnessLabel: 'Custom', modelRef: 'ignored', showModel: false, provider: '', modelId: 'ignored', reasoning: null }
 * @example aliasTargetSummary({}, []) => { percent: null, percentText: '', harnessId: '', harnessLabel: 'unassigned', modelRef: '', showModel: false, provider: '', modelId: '', reasoning: null }
 * @param {Object} target - One target sub-row (`{ harness, model, percent }`); may be blank or malformed.
 * @param {Array<Object>} [targetHarnesses=[]] - Catalogue harness view (labels + modelSelection).
 * @returns {{percent: number|null, percentText: string, harnessId: string, harnessLabel: string, modelRef: string, showModel: boolean, provider: string, modelId: string, reasoning: string|null}} Structured chip summary.
 ***/
export function aliasTargetSummary(target, targetHarnesses = []) {
  const harnessId = typeof target?.harness === 'string' ? target.harness.trim() : '';
  const catalogue = Array.isArray(targetHarnesses) ? targetHarnesses : [];
  const entry = catalogue.find((h) => h?.id === harnessId);
  const harnessLabel = entry?.label || harnessId || 'unassigned';
  const rawPercent = target?.percent;
  const percent =
    typeof rawPercent === 'number' && !Number.isNaN(rawPercent) ? rawPercent : null;
  const percentText = percent === null ? '' : `${percent}%`;
  const modelRef = typeof target?.model === 'string' ? target.model.trim() : '';
  const showModel = entry?.modelSelection !== 'none' && modelRef !== '';
  const { provider, modelId } = splitModelRefProvider(modelRef);
  const { reasoning } = splitReasoning(modelRef);
  return {
    percent,
    percentText,
    harnessId,
    harnessLabel,
    modelRef,
    showModel,
    provider,
    modelId,
    reasoning,
  };
}
