import { useCallback, useState } from 'react';
import { truncateFailureMessage } from './failureReason';
import { API_BASE } from '../../services/apiBase';
import { extractImageRefs, resolveTaskImageUrl } from '../../services/taskImages';

/**
 * MARK: FailureMessageImage
 * @description One linked failure thumbnail with the same graceful fallback
 *   as the markdown renderer: a failed load surfaces the filename plus a
 *   retry control instead of an invisible hole, and a new URL (or an
 *   explicit retry) always gets a fresh load attempt.
 */
function FailureMessageImage({ url, alt, name }) {
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Fresh mounts carry fresh state (the parent keys by resolved URL), so a
  // new URL never inherits a latched failure; retries bump the key below.

  const retry = useCallback(() => {
    setFailed(false);
    setRetryKey((key) => key + 1);
  }, []);

  // No link around the fallback: the URL just failed, so the chip stands
  // alone (a button inside an anchor would also be invalid nesting).
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[9px] text-text-muted border border-border-standard rounded-sm">
        <span role="img" aria-label={alt || name}>
          🖼️ {name} (image unavailable)
        </span>
        <button
          type="button"
          onClick={retry}
          aria-label={`Retry loading ${name}`}
          className="underline underline-offset-2 hover:text-on-surface transition-colors cursor-pointer"
        >
          Retry
        </button>
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={name}
      className="inline-block border border-border-standard rounded-sm overflow-hidden hover:brightness-110 transition-all"
    >
      <img
        key={retryKey}
        src={url}
        alt={alt}
        loading="lazy"
        className="w-16 h-16 object-cover block"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

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
              <FailureMessageImage key={url} url={url} alt={ref.alt || name} name={name} />
            );
          })}
        </div>
      )}
    </div>
  );
}
