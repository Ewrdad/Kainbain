import { parseModelKey } from '../../../shared/modelKeys.js';

/***
 * MARK: formatModelRef
 * @description Formats known segments, retaining malformed refs as opaque labels and missing models as Unknown.
 * @example formatModelRef('custom::provider::model').label // 'model'
 ***/
export function formatModelRef(ref) {
  const raw = typeof ref === 'string' && ref.trim() && ref !== 'default' ? ref : null;
  const parsed = parseModelKey(raw);
  return {
    harness: parsed?.harness || null,
    provider: parsed?.provider || null,
    id: parsed?.id || null,
    label: parsed?.id || raw || 'Unknown',
  };
}
