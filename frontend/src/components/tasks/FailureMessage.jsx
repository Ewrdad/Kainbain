import { useCallback, useState } from 'react';
import { truncateFailureMessage } from './failureReason';
import { API_BASE } from '../../services/apiBase';
import { extractImageRefs, resolveTaskImageUrl } from '../../services/taskImages';
import { FailureMessageImage } from './FailureMessageImage';

/***
 * MARK: FailureMessage
 * @description Renders a failure message with Show more/less truncation plus
 * thumbnails for task-asset image references when project/task context is set.
 * @example <FailureMessage message="boom" projectId="p1" taskId="t1" />
 ***/
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
              <FailureMessageImage key={url} url={url} alt={ref.alt || name} name={name} />
            );
          })}
        </div>
      )}
    </div>
  );
}
