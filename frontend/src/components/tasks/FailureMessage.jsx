import { useState } from 'react';
import { truncateFailureMessage } from './failureReason';
import { FailureMessageImage } from './FailureMessageImage';
import { API_BASE } from '../../services/apiBase';
import {
  extractFileRefs,
  extractImageRefs,
  resolveTaskAttachmentUrl,
  resolveTaskImageUrl,
} from '../../services/taskImages';

/**
 * MARK: FailureMessage
 * @description Shows a task-view failure message capped to a short preview
 * with an inline "Show more" toggle that reveals the full text (and "Show
 * less" to collapse it again). Short messages render exactly as passed, with
 * no toggle. Shared by the full-page task view and the overlay details tab
 * so both Stage Execution Failed banners stay capped in the same way.
 *
 * When task context is provided, `assets/...` image references inside the
 * message (e.g. screenshots attached to a rejection) also render as a
 * thumbnail strip below the text, resolved through the binary-safe image
 * endpoint, and `assets/...` file references (e.g. logs attached to a
 * failure) render as download chips through the header-safe attachment
 * endpoint. Without task context the text degrades to the readable
 * `![name](assets/name)` / `[name](assets/name)` reference, as before.
 *
 * @param {string} message - Full failure message, may be multi-line.
 * @param {string} [className] - Box styling passed through from the banner.
 * @param {string} [buttonClassName] - Styling for the Show more/less toggle.
 * @param {string} [projectId] - Owning project id (enables thumbnails and file chips).
 * @param {string} [taskId] - Owning task id (enables thumbnails and file chips).
 * @example <FailureMessage message={task.failureReason} className="..." />
 */
export function FailureMessage({
  message,
  className = '',
  buttonClassName = 'text-primary underline font-mono text-[11px] cursor-pointer hover:brightness-110 ml-1',
  projectId,
  taskId,
}) {
  const [expanded, setExpanded] = useState(false);
  // Collapse again when a different message arrives: the overlay reuses this
  // instance when switching tasks, so a stale expanded state would leak.
  const [seenMessage, setSeenMessage] = useState(message);
  if (message !== seenMessage) {
    setSeenMessage(message);
    setExpanded(false);
  }
  const { preview, truncated } = truncateFailureMessage(message);
  // Thumbnails only for task-asset refs with full context; external URLs and
  // context-less renders keep the plain-text reference. De-duplicated by src
  // so a twice-pasted screenshot renders one thumbnail with a stable key.
  const imageRefs =
    projectId && taskId
      ? extractImageRefs(message)
          .filter((ref) => /(^|\/)assets\//.test(ref.src))
          .filter((ref, index, all) => all.findIndex((other) => other.src === ref.src) === index)
      : [];
  // Download chips for the non-image side: plain `[label](assets/...)` links
  // (image refs are excluded by the extractor, so the strips never overlap).
  const fileRefs =
    projectId && taskId
      ? extractFileRefs(message)
          .filter((ref) => /(^|\/)assets\//.test(ref.src))
          .filter((ref, index, all) => all.findIndex((other) => other.src === ref.src) === index)
      : [];

  return (
    <div className={className}>
      {truncated && !expanded ? preview : (message ?? preview)}
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className={buttonClassName}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      {imageRefs.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 pt-2"
          data-testid="failure-message-images"
          aria-label="Images attached to this failure"
        >
          {imageRefs.map((ref) => {
            const url = resolveTaskImageUrl({
              apiBase: API_BASE,
              projectId,
              taskId,
              src: ref.src,
            });
            const name = ref.src.split('/').pop() || ref.alt || 'image';
            return (
              <FailureMessageImage key={url} url={url} alt={ref.alt || name} name={name} />
            );
          })}
        </div>
      )}
      {fileRefs.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 pt-2"
          data-testid="failure-message-files"
          aria-label="Files attached to this failure"
        >
          {fileRefs.map((ref) => {
            const url = resolveTaskAttachmentUrl({
              apiBase: API_BASE,
              projectId,
              taskId,
              src: ref.src,
            });
            const name = ref.src.split('/').pop() || ref.label || 'file';
            return (
              <a
                key={url}
                href={url}
                download={name}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Download ${name}`}
                title={`Download ${name}`}
                className="inline-flex items-center gap-1 border border-border-standard rounded bg-surface-deep px-1.5 py-0.5 font-mono text-[10px] text-text-muted hover:text-on-surface transition-colors"
              >
                <span role="img" aria-label={name}>
                  📎
                </span>
                {name}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
