import { useState } from 'react';
import { truncateFailureMessage } from './failureReason';
import { API_BASE } from '../../services/apiBase';
import { extractImageRefs, resolveTaskImageUrl } from '../../services/taskImages';

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
 * endpoint. Without task context the text degrades to the readable
 * `![name](assets/name)` reference, as before.
 *
 * @param {string} message - Full failure message, may be multi-line.
 * @param {string} [className] - Box styling passed through from the banner.
 * @param {string} [buttonClassName] - Styling for the Show more/less toggle.
 * @param {string} [projectId] - Owning project id (enables image thumbnails).
 * @param {string} [taskId] - Owning task id (enables image thumbnails).
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
              <a
                key={ref.src}
                href={url}
                target="_blank"
                rel="noreferrer"
                title={name}
                className="inline-block border border-border-standard rounded-sm overflow-hidden hover:brightness-110 transition-all"
              >
                <img
                  src={url}
                  alt={ref.alt || name}
                  loading="lazy"
                  className="w-16 h-16 object-cover block"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
