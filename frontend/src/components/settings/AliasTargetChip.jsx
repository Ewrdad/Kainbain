/***
 * MARK: AliasTargetChip
 * @description One target chip in a collapsed alias row's summary line: the
 *   percent share, the harness label, the provider as a small separate badge,
 *   and the bare model id as wrapping mono text (`break-all`, `min-w-0
 *   flex-1`) so a long provider-prefixed ref wraps onto extra lines instead of
 *   being ellipsized mid-name. The complete stored ref
 *   (`harness::provider::id[::level]`) is never shortened in the DOM: it rides
 *   on the chip's `title` AND an sr-only span inside the chip, so screen
 *   readers get the full ref without the visual noise of the harness half
 *   (already shown by the harness label). Input is the structured
 *   `aliasTargetSummary` result; a `none`-selection harness or blank model
 *   renders just percent + harness label, exactly like the text summary.
 * @example <AliasTargetChip summary={aliasTargetSummary(t, harnesses)} testId="model-alias-summary-chip-0-0" />
 *   => a chip reading "50% Muse [google] gemini-3-pro-preview" with the full ref on title + sr-only
 * @param {Object} props
 * @param {Object} props.summary - Structured chip summary from `aliasTargetSummary`.
 * @param {string} [props.testId] - Test id for the chip root.
 ***/
export function AliasTargetChip({ summary, testId }) {
  const {
    percentText,
    harnessLabel,
    modelRef,
    showModel,
    provider,
    modelId,
    reasoning,
  } = summary;
  // The tooltip always carries the complete stored ref (plus its share and
  // harness context) — hover must never be the only place the full ref lives,
  // because the sr-only span below covers the accessibility tree.
  const chipTitle = `${percentText ? `${percentText} ` : ''}${harnessLabel}${
    showModel && modelRef ? ` (${modelRef})` : ''
  }`;
  return (
    <span
      data-testid={testId}
      title={chipTitle}
      className="inline-flex flex-wrap items-baseline gap-x-1.5 min-w-0 max-w-full px-1.5 py-0.5 bg-surface-deep border border-border-standard rounded-sm text-[10px] text-text-muted font-mono"
    >
      {percentText && <span className="font-bold text-on-surface">{percentText}</span>}
      <span className="whitespace-nowrap">{harnessLabel}</span>
      {showModel && modelRef && (
        <>
          {provider && (
            <span className="px-1 rounded-sm bg-surface-subtle border border-border-standard/60 text-[9px] font-bold uppercase text-primary whitespace-nowrap">
              {provider}
            </span>
          )}
          <span className="min-w-0 flex-1 break-all text-on-surface">
            {modelId}
            {reasoning && <span className="text-text-muted">::{reasoning}</span>}
          </span>
          {/* The complete stored ref stays in the accessibility tree — a hover
              tooltip alone is not enough (WCAG 2.2). */}
          <span className="sr-only">{modelRef}</span>
        </>
      )}
    </span>
  );
}

/***
 * MARK: AliasTargetChip default
 * @description Default entry point for the alias target chip (same component).
 * @example import AliasTargetChip from './AliasTargetChip';
 ***/
export default AliasTargetChip;
