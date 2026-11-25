import { TaskImageAttach } from '../tasks/TaskImageAttach';

/***
 * MARK: FeedbackValidationDialog
 * @description Blocking recovery dialog for submit-time feedback validation:
 *   the draft references attached files that are missing, or carries images
 *   without a written description. Every missing file is named, and the
 *   reviewer leaves through a recovery exit — attach the file inline (the
 *   parent re-validates and resumes the send on upload) or send as
 *   words-only (the parent strips the dangling refs and sends) — never a
 *   dead end. Renders above the composer dialogs (z-60 over their z-50).
 * @example <FeedbackValidationDialog missing={['assets/a.png']} imageOnly={false} onStripToTextOnly={send} onClose={back} />
 * @param {Object} props
 * @param {string[]} [props.missing] - Canonical dangling refs to name.
 * @param {boolean} [props.imageOnly] - Whether a written description is missing.
 * @param {number} [props.minProseChars] - Prose bar quoted in the description request.
 * @param {string} [props.projectId] - Enables the inline attach exit (with taskId).
 * @param {string} [props.taskId] - Enables the inline attach exit (with projectId).
 * @param {Object} [props.textareaRef] - Paste-to-upload target for the inline uploader.
 * @param {Function} [props.onUploadedBatch] - Called with stored assets after an inline upload.
 * @param {Function} [props.onUploadingChange] - Called with true/false as inline uploads run.
 * @param {Function} [props.onStripToTextOnly] - Strips the dangling refs and sends words-only.
 * @param {boolean} [props.canStrip] - Whether the words-only exit is offered.
 * @param {Function} props.onClose - Back to editing.
 ***/
export function FeedbackValidationDialog({
  missing = [],
  imageOnly = false,
  minProseChars = 10,
  projectId = null,
  taskId = null,
  textareaRef = null,
  onUploadedBatch,
  onUploadingChange,
  onStripToTextOnly,
  canStrip = false,
  onClose,
}) {
  const dangling = Array.isArray(missing) ? missing.filter(Boolean) : [];
  const canAttach = Boolean(projectId && taskId);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Feedback needs attention before sending"
      data-testid="feedback-validation-dialog"
    >
      <div className="w-full max-w-md bg-surface-container border border-border-standard rounded-sm p-4 space-y-3">
        <div className="text-sm font-bold uppercase font-mono text-warning">
          {dangling.length > 0 ? 'Attached file missing' : 'Describe the pictures'}
        </div>

        {dangling.length > 0 && (
          <div className="text-xs font-mono text-on-surface space-y-1">
            <p>
              This feedback mentions{' '}
              {dangling.length === 1 ? 'a file that is' : 'files that are'} not attached
              to the task — the agent would work blind. Attach{' '}
              {dangling.length === 1 ? 'it' : 'them'} or send words-only:
            </p>
            <ul className="space-y-0.5" data-testid="feedback-validation-missing">
              {dangling.map((ref) => (
                <li key={ref}>
                  <code className="text-error break-all">{ref}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {imageOnly && (
          <p className="text-xs font-mono text-on-surface">
            This feedback is only pictures — add a short written description (at least{' '}
            {minProseChars} characters) explaining what they show, so the agent knows
            what to fix.
          </p>
        )}

        {canAttach && (
          <div className="p-2 bg-surface-deep border border-border-standard rounded-sm">
            <TaskImageAttach
              projectId={projectId}
              taskId={taskId}
              textareaRef={textareaRef}
              onUploadedBatch={onUploadedBatch}
              onUploadingChange={onUploadingChange}
            />
            <p className="text-[10px] font-mono text-text-muted mt-1">
              Upload the missing file and the send resumes automatically once the
              feedback checks out.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-[11px] font-mono uppercase text-on-surface cursor-pointer"
          >
            Back to editing
          </button>
          {canStrip && (
            <button
              type="button"
              onClick={onStripToTextOnly}
              className="px-3 py-2 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-[11px] font-mono font-bold uppercase hover:brightness-110 cursor-pointer"
            >
              Send words-only
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
