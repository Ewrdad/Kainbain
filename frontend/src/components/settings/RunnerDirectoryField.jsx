/***
 * MARK: RunnerDirectoryField
 * @description One labelled directory row on the System Settings › Runners
 *   screen: a text input showing the Runner's effective folder plus a Save
 *   button that stores the operator's override. The label names the
 *   Runner default (and flags when even the Runner's own folder is unknown)
 *   so an empty field is never confused with an empty path. Used twice by
 *   the Runner detail panel (master and worktree); the parent owns the
 *   draft value, validation error, and busy flag.
 * @example <RunnerDirectoryField label="Master directory:" testId="runner-masterdir-r1" value="/srv/kb" hint="/srv/kb" isDefault isUnknown={false} error={null} busy={false} onChange={() => {}} onSave={() => {}} />
 * @param {Object} props - Component props
 * @param {string} props.label - Field label text
 * @param {string} props.testId - Test id stem for the input, save button, and error
 * @param {string} props.value - Current directory value
 * @param {string} props.hint - Placeholder/hint text showing effective value
 * @param {boolean} props.isDefault - Whether value is using Runner default
 * @param {boolean} props.isUnknown - Whether effective value is unknown
 * @param {string|null} props.error - Error message to display
 * @param {boolean} props.busy - Whether save action is in progress
 * @param {Function} props.onChange - Change handler for input
 * @param {Function} props.onSave - Save handler for button click
 * @returns {JSX.Element} Directory input field component
 ***/
export function RunnerDirectoryField({
  label,
  testId,
  value,
  hint,
  isDefault,
  isUnknown,
  error,
  busy,
  onChange,
  onSave,
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold text-on-surface" htmlFor={`${testId}-input`}>
        {label}{' '}
        {isDefault && (
          <span className="font-normal text-text-muted">
            (Runner default{isUnknown ? ' (unknown)' : ''})
          </span>
        )}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`${testId}-input`}
          type="text"
          data-testid={testId}
          value={isDefault && value === hint ? hint : value}
          placeholder={hint || ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 p-2 bg-surface-deep border border-border-standard rounded-sm text-sm text-on-surface outline-none focus:border-primary transition-colors"
        />
        <button
          type="button"
          data-testid={`${testId}-save`}
          onClick={onSave}
          disabled={busy || (isDefault && value === hint)}
          className="px-3 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:opacity-60 shrink-0"
        >
          {isDefault && value === hint ? 'Saved' : 'Save'}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-error" role="alert" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
