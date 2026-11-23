/***
 * MARK: CollapseToggleButton
 * @description Shared expand/collapse chevron for one alias card header.
 *   Single source for the toggle's test id, ARIA wiring (`aria-expanded` /
 *   `aria-controls` / `aria-label`), and chevron glyph, so the collapsed and
 *   expanded headers cannot drift apart.
 * @example <CollapseToggleButton index={0} aliasName="small" expanded onToggle={() => toggle(key)} disabled={false} />
 * @param {Object} props
 * @param {number} props.index - Positional alias index (test ids + control ids).
 * @param {string} props.aliasName - Draft alias name (accessible label fallback).
 * @param {boolean} props.expanded - True when the card body is visible.
 * @param {Function} props.onToggle - Click handler.
 * @param {boolean} [props.disabled=false] - Disables the toggle.
 ***/
export function CollapseToggleButton({ index, aliasName, expanded, onToggle, disabled = false }) {
  const label = aliasName || index + 1;
  return (
    <button
      type="button"
      data-testid={`model-alias-toggle-${index}`}
      aria-expanded={expanded}
      aria-controls={`model-alias-body-${index}`}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} alias ${label}`}
      onClick={onToggle}
      disabled={disabled}
      className="shrink-0 px-1.5 py-0.5 text-xs text-text-muted hover:text-on-surface cursor-pointer select-none font-mono"
    >
      {expanded ? '▾' : '▸'}
    </button>
  );
}

/***
 * MARK: CollapseToggleButton default
 * @description Default entry point for the shared alias collapse toggle (same component).
 * @example import CollapseToggleButton from './CollapseToggleButton';
 ***/
export default CollapseToggleButton;
