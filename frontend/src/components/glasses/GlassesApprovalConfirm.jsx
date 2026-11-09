import { useEffect, useRef } from 'react';

/***
 * MARK: GlassesApprovalConfirm
 * @description Compact "Are you sure?" step for the Meta Ray-Ban review
 *   screen: approve is never one tap, the existing advance only runs after
 *   this dialog's explicit second tap. Controlled and stateless — the
 *   parent owns open state and the in-flight flag. Escape cancels without
 *   approving, tab stays inside the two large buttons, and Cancel takes
 *   initial focus so an accidental keypress can never approve.
 * @example <GlassesApprovalConfirm taskName="Fix race" onConfirm={approve} onCancel={close} isBusy={false} />
 * @param {Object} props
 * @param {string} [props.taskName] - Task name shown in the question.
 * @param {Function} [props.onConfirm] - Runs the approve after the second tap.
 * @param {Function} [props.onCancel] - Closes without approving.
 * @param {boolean} [props.isBusy=false] - True disables both buttons mid-flight.
 ***/
export function GlassesApprovalConfirm({
  taskName = '',
  onConfirm = () => {},
  onCancel = () => {},
  isBusy = false,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  // Document-level keys: Escape cancels from anywhere inside the dialog
  // and Tab cycles between the two buttons (a focus trap for a two-button
  // dialog). Listened on the document rather than the dialog div so the
  // div stays a plain non-interactive container for jsx-a11y.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!isBusy) onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) return;
      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onCancel]);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm approval"
      data-testid="glasses-approval-confirm"
    >
      <div className="w-full max-w-md rounded-lg bg-neutral-900 border border-neutral-700 p-6 space-y-5">
        <div className="space-y-2">
          <p className="text-2xl font-bold text-white">Are you sure?</p>
          {taskName ? (
            <p className="text-lg text-neutral-300 break-words">
              Approve <span className="font-semibold text-white">{taskName}</span>?
            </p>
          ) : null}
        </div>
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the safe choice takes focus so a stray keypress can never approve
            autoFocus
            className="flex-1 min-h-[56px] rounded-lg border-2 border-neutral-500 text-xl font-bold text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="flex-1 min-h-[56px] rounded-lg bg-green-600 text-xl font-bold text-white hover:bg-green-500 disabled:opacity-40"
          >
            {isBusy ? 'Approving…' : 'Yes, approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
