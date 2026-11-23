import { parseModelKey, splitReasoning } from '../../services/modelKeys';

/***
 * MARK: splitModelRefProvider
 * @description Splits a stored model reference into the provider badge and the
 *   bare model id shown in the collapsed alias summary chips. An optional
 *   `::reasoning` level is stripped first (via the shared `splitReasoning`
 *   grammar), then the base ref is parsed with the shared `parseModelKey`:
 *   canonical `harness::provider::id` yields `{ provider, modelId: id }` (the
 *   harness half is already shown by the chip's harness label, so it is not
 *   repeated), legacy `provider::id` yields `{ provider, modelId: id }`, and a
 *   bare id yields `{ provider: '', modelId: id }` (no badge renders). Malformed
 *   or blank input fails safe to `{ provider: '', modelId: <raw base> }` —
 *   never throws, so a garbage stored ref still renders verbatim.
 * @example splitModelRefProvider('google::gemini-3-pro') => { provider: 'google', modelId: 'gemini-3-pro' }
 * @example splitModelRefProvider('pi::google::gemini-3-pro') => { provider: 'google', modelId: 'gemini-3-pro' }
 * @example splitModelRefProvider('pi::google::gemini-3-pro::high') => { provider: 'google', modelId: 'gemini-3-pro' }
 * @example splitModelRefProvider('gemini-3-pro') => { provider: '', modelId: 'gemini-3-pro' }
 * @example splitModelRefProvider('') => { provider: '', modelId: '' }
 * @param {string} ref - Stored model reference (any grammar form).
 * @returns {{provider: string, modelId: string}} Provider badge text ('' when none) and the bare model id.
 ***/
export function splitModelRefProvider(ref) {
  const baseRef = splitReasoning(typeof ref === 'string' ? ref : '').baseRef;
  const parsed = parseModelKey(baseRef);
  if (parsed && (parsed.form === 'harness' || parsed.form === 'provider')) {
    return { provider: parsed.provider, modelId: parsed.id };
  }
  if (parsed && parsed.form === 'bare') {
    return { provider: '', modelId: parsed.id };
  }
  // Malformed (5+ segments, empty segment) or blank: show the raw base
  // verbatim with no provider badge rather than dropping or mangling it.
  return { provider: '', modelId: baseRef };
}
