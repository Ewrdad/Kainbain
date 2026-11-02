/***
 * MARK: resolveMobileModelLine
 * @description Compresses the header's model details into one truncated
 *   line (`alias · Harness · Model · Provider/Source`, full text in the
 *   `title` tooltip) so the compact header stays at two rows on 360px
 *   viewports. Presentation only: the resolver semantics
 *   (`resolveMobileModelDetails`, mirroring ActiveTaskPromptWidget) are
 *   reused untouched. Null renders the idle fallback; scripted stages keep
 *   the `Automated — no model` wording. Fails safe: null details render
 *   the idle fallback, and any missing label renders as `Unknown` — a
 *   half-shaped payload can never crash the header or print `undefined`.
 * @param {Object|null} [details] - The resolved model details.
 * @returns {{line: string, title: string}|null} Single-line text plus tooltip, or null for the idle fallback.
 * @example resolveMobileModelLine({ showHarness: true, harness: 'pi', showModel: true, model: { label: 'qwen3:8b' }, modelRef: 'pi::pi::qwen3:8b' }).line // 'Harness: pi · Model: qwen3:8b'
 * @example resolveMobileModelLine(null) // null
 ***/
export function resolveMobileModelLine(details = {}) {
  if (details == null || details.isIdle) return null;
  if (details.isScripted) return { line: 'Automated — no model', title: 'Automated — no model' };
  const parts = [];
  const titleParts = [];
  if (details.showAlias) {
    const aliasName =
      details.aliasName ||
      (details.aliasMissing ? `${details.aliasMissing} (unresolved)` : 'Unknown');
    const alias = `alias: ${aliasName}`;
    parts.push(alias);
    titleParts.push(details.aliasTitle ? `${alias} (${details.aliasTitle})` : alias);
  }
  if (details.showHarness) {
    const harness = `Harness: ${details.harness || 'Unknown'}`;
    parts.push(harness);
    titleParts.push(harness);
  }
  if (details.showModel) {
    // The line truncates to the short label; the tooltip keeps the full ref
    // so a long model identifier is never lost at 360px.
    const modelLabel = details.model?.label || details.modelRef || 'Unknown';
    parts.push(`Model: ${modelLabel}`);
    titleParts.push(`Model: ${details.modelRef || modelLabel}`);
  }
  if (details.showProviderLine) {
    const provider = `Provider: ${details.provider || 'Unknown'} · Source: ${details.source || 'unknown'}`;
    parts.push(provider);
    titleParts.push(provider);
  }
  const line = parts.join(' · ') || 'Idle — no active model';
  return { line, title: titleParts.join(' · ') || line };
}

/***
 * MARK: default resolveMobileModelLine
 * @description Default-export alias for `resolveMobileModelLine` so the
 *   compact monitor model-line formatter can be imported either way.
 * @example resolveMobileModelLine({ showHarness: true, harness: 'pi' }).line // 'Harness: pi'
 ***/
export default resolveMobileModelLine;
