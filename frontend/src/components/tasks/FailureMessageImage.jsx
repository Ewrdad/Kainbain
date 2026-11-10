import { useImageRetry } from '../../services/imageRetry';

/***
 * MARK: FailureMessageImage
 * @description One linked failure thumbnail with the same graceful fallback
 *   as the markdown renderer: a failed load surfaces the filename plus a
 *   retry control instead of an invisible hole, and a new URL (or an
 *   explicit retry) always gets a fresh load attempt. Transient misses
 *   self-recover through the shared retry seam.
 * @example <FailureMessageImage url="/img/shot.png" alt="shot" name="shot.png" />
 * @param {Object} props
 * @param {string} props.url - Resolved thumbnail URL.
 * @param {string} [props.alt] - Accessible label.
 * @param {string} [props.name] - File name shown on fallback.
 ***/
export function FailureMessageImage({ url, alt, name }) {
  const { failed, retryKey, markFailed, retry } = useImageRetry({
    src: url,
    component: 'failure-message-image',
    // The parent only renders the strip with full task context.
    hasTaskContext: true,
  });

  // No link around the fallback: the URL just failed, so the chip stands
  // alone (a button inside an anchor would also be invalid nesting).
  if (failed) {
    return (
      <span
        data-task-image-state="unavailable"
        className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[9px] text-text-muted border border-border-standard rounded-sm"
      >
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
        onError={markFailed}
      />
    </a>
  );
}
