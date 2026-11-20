/***
 * MARK: DeleteAliasButton
 * @description Shared delete button for one alias card header. Single source
 *   for the accessible label and styling, so the collapsed and expanded
 *   headers cannot drift apart.
 * @example <DeleteAliasButton index={0} aliasName="small" onDelete={() => deleteRow(0)} disabled={false} />
 * @param {Object} props
 * @param {number} props.index - Positional alias index.
 * @param {string} props.aliasName - Draft alias name (accessible label fallback).
 * @param {Function} props.onDelete - Click handler.
 * @param {boolean} [props.disabled=false] - Disables the button.
 ***/
export function DeleteAliasButton({ index, aliasName, onDelete, disabled = false }) {
  return (
    <button
      type="button"
      aria-label={`Delete alias ${aliasName || index + 1}`}
      onClick={onDelete}
      disabled={disabled}
      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xs text-text-muted hover:text-error disabled:opacity-50 cursor-pointer"
    >
      ✕
    </button>
  );
}

/***
 * MARK: DeleteAliasButton default
 * @description Default entry point for the shared alias delete button (same component).
 * @example import DeleteAliasButton from './DeleteAliasButton';
 ***/
export default DeleteAliasButton;
