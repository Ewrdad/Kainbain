import { CollapseToggleButton } from './CollapseToggleButton';
import { DeleteAliasButton } from './DeleteAliasButton';
import { AliasTargetChip } from './AliasTargetChip';
import { aliasTargetSummary } from './aliasTargetSummary';

/***
 * MARK: AliasCollapsedRow
 * @description The whole collapsed alias row as a pure presentational
 *   component (state and handlers stay in `ModelAliasesSection`, passed down
 *   via props). Two-line layout so long provider-prefixed model refs stay
 *   readable instead of being ellipsized mid-name: line 1 is the header
 *   (toggle + alias name + reliability line, delete on the right); line 2 is
 *   a full-width wrapping row of per-target chips (`AliasTargetChip`), which
 *   on narrow screens naturally becomes its own full-width line under the
 *   alias name. A validation error renders on its own full-width line between
 *   the two (never squeezed into the header), keeping its `role="alert"`
 *   wrapper, badge test ids, and click-to-expand behaviour. All historic test
 *   ids survive: `model-alias-toggle-{i}`, `model-alias-header-{i}`,
 *   `model-alias-summary-{i}` (now the chips container), `model-alias-error-alert-{i}`
 *   / `model-alias-error-badge-{i}`.
 * @example <AliasCollapsedRow index={0} aliasName="router" targets={targets} targetHarnesses={harnesses}
 *   rowError="" disabled={false} onToggle={() => toggle(key)} onDelete={() => deleteRow(0)} reliabilityLine={node} />
 *   => header line "▸ router … ✕" plus a wrapping chips line "50% Muse [google] gemini-3-pro …"
 * @param {Object} props
 * @param {number} props.index - Positional alias index (test ids + header id).
 * @param {string} props.aliasName - Draft alias name (header text + accessible labels).
 * @param {Array<Object>} props.targets - Target sub-rows for this alias (raw draft rows).
 * @param {Array<Object>} [props.targetHarnesses=[]] - Catalogue harness view for labels/modelSelection.
 * @param {string} [props.rowError=''] - Validation message for this row; renders on its own line when non-empty.
 * @param {boolean} [props.disabled=false] - Disables toggle and delete.
 * @param {Function} props.onToggle - Expand/collapse handler (also the error badge's click-to-expand).
 * @param {Function} props.onDelete - Delete handler.
 * @param {ReactNode} [props.reliabilityLine] - Rendered reliability line for the header (optional).
 ***/
export function AliasCollapsedRow({
  index,
  aliasName,
  targets,
  targetHarnesses = [],
  rowError = '',
  disabled = false,
  onToggle,
  onDelete,
  reliabilityLine,
}) {
  const list = Array.isArray(targets) ? targets : [];
  const headerText = aliasName || `Alias ${index + 1}`;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <CollapseToggleButton
            index={index}
            aliasName={aliasName}
            expanded={false}
            onToggle={onToggle}
            disabled={disabled}
          />
          <span
            id={`model-alias-header-${index}`}
            className="text-xs font-mono font-bold text-on-surface truncate"
            title={headerText}
          >
            {headerText}
          </span>
          {reliabilityLine}
        </div>
        <DeleteAliasButton
          index={index}
          aliasName={aliasName}
          onDelete={onDelete}
          disabled={disabled}
        />
      </div>
      {rowError && (
        <span
          role="alert"
          data-testid={`model-alias-error-alert-${index}`}
          className="block w-full min-w-0"
        >
          {/* Read-only view change: intentionally not disabled — expanding a
              card to read its error mutates nothing, even while saving. */}
          <button
            type="button"
            data-testid={`model-alias-error-badge-${index}`}
            onClick={onToggle}
            title={`${rowError} (Click to expand)`}
            className="px-1.5 py-0.5 bg-error/10 border border-error/50 rounded-sm text-[10px] font-bold text-error cursor-pointer break-all text-left"
          >
            ⚠ {rowError}
          </button>
        </span>
      )}
      <div
        data-testid={`model-alias-summary-${index}`}
        className="flex flex-wrap items-baseline gap-1.5 w-full min-w-0"
      >
        <span
          data-testid={`model-alias-summary-count-${index}`}
          className="text-[10px] text-text-muted whitespace-nowrap"
        >
          {list.length === 1 ? '1 target' : `${list.length} targets`}
        </span>
        {list.map((target, targetIndex) => (
          <AliasTargetChip
            key={targetIndex}
            testId={`model-alias-summary-chip-${index}-${targetIndex}`}
            summary={aliasTargetSummary(target, targetHarnesses)}
          />
        ))}
      </div>
    </div>
  );
}

/***
 * MARK: AliasCollapsedRow default
 * @description Default entry point for the collapsed alias row (same component).
 * @example import AliasCollapsedRow from './AliasCollapsedRow';
 ***/
export default AliasCollapsedRow;
