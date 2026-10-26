import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, API_BASE } from '../../services/api';
import { isImageFile, resolveTaskImageUrl } from '../../services/taskImages';

/***
 * MARK: fetchTaskImages
 * @description Reads a task's image assets from the API. Throws on request failure so callers decide how to surface it.
 * @example await fetchTaskImages('p1', 't1') => [{ name: 'a.png', path: 'assets/a.png' }]
 * @param {string} projectId
 * @param {string} taskId
 * @returns {Promise<Array<{name: string, path: string, size: number, mtime: string}>>}
 ***/
async function fetchTaskImages(projectId, taskId) {
  const result = await api.listTaskImages(projectId, taskId);
  return Array.isArray(result?.images) ? result.images : [];
}

/***
 * MARK: buildSkippedMessage
 * @description Explains why picked files were not uploaded. Names HEIC/HEIF
 *   explicitly (common iPhone output outside the png/jpg/gif/webp allowlist)
 *   so mobile users learn the format — not the picker — is the blocker.
 * @example buildSkippedMessage([{ name: 'a.heic' }]) => 'Skipped 1 non-image file ...'
 * @param {Array} skipped - Picked files rejected by `isImageFile`.
 * @returns {string} Inline notice for the alert area.
 ***/
function buildSkippedMessage(skipped) {
  const names = (skipped || []).map((file) => file?.name || 'image');
  const heic = names.filter((name) => /\.(heic|heif)$/i.test(name));
  const detail =
    heic.length > 0
      ? `HEIC/HEIF is not supported (${heic.slice(0, 3).join(', ')}${heic.length > 3 ? ', …' : ''}); use PNG/JPG/GIF/WebP`
      : `only PNG/JPG/GIF/WebP can be attached (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''})`;
  return `Skipped ${names.length} non-image file${names.length === 1 ? '' : 's'} — ${detail}.`;
}

/***
 * MARK: TaskImageAttach
 * @description The task-image upload affordance: a file picker (plus paste-to-upload
 *   on the goal textarea), the task's existing image assets as removable thumbnails,
 *   and upload/error feedback. On a successful upload it reports the stored asset to
 *   the parent, which appends the markdown reference (`![name](assets/name)`) at
 *   the end of the goal text on a new line. Images live server-side in the task's `assets/`
 *   folder; nothing lands in the goal markdown but a relative reference.
 * @param {Object} props
 * @param {string} props.projectId - Owning project id.
 * @param {string} props.taskId - Owning task id (assets live in docs/tasks/<taskId>/assets/).
 * @param {React.RefObject} [props.textareaRef] - The goal textarea; paste-to-upload listens here.
 * @param {Function} [props.onUploaded] - Called with `{ name, path }` after each successful upload.
 *   A listener that throws is logged and ignored; the upload still counts as
 *   a success and stays in the batch report.
 * @param {Function} [props.onUploadedBatch] - Called once per gesture with all
 *   successfully stored assets (`[{ name, path }]`, in selection order) so
 *   parents can append every reference in a single text update. Preferred over
 *   folding per-file `onUploaded` calls, which can lose all but the last
 *   reference when the parent closes over a stale draft value. A listener
 *   that throws is logged and ignored; the picker still resets and later
 *   uploads still proceed.
 * @param {Function} [props.onRemoved] - Called with the removed image name.
 * @param {Function} [props.onUploadingChange] - Called with `true`/`false` as uploads start/finish (lets modal parents disable submit mid-upload).
 * @example <TaskImageAttach projectId="p1" taskId="t1" textareaRef={ref} onUploaded={insertImageMarkdown} onUploadedBatch={insertImagesMarkdown} />
 ***/
export function TaskImageAttach({
  projectId,
  taskId,
  textareaRef,
  onUploaded,
  onUploadedBatch,
  onRemoved,
  onUploadingChange,
}) {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Initial asset listing: subscribe-on-mount pattern — setState happens in
  // the fetch callbacks (never synchronously in the effect body).
  useEffect(() => {
    if (!projectId || !taskId) return undefined;
    let cancelled = false;
    fetchTaskImages(projectId, taskId)
      .then((list) => {
        if (!cancelled) setImages(list);
      })
      .catch((err) => {
        // Listing failures leave the strip empty; upload errors surface separately.
        console.error('[TaskImageAttach] listing task images failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  // In-flight counter, not a boolean: paste-to-upload and the file picker
  // can both fire while an earlier batch is still uploading (the picker
  // button disables, but the paste path has no such guard). Counting
  // overlapping batches keeps `uploading` and `onUploadingChange` accurate
  // and prevents interleaved thumbnail refreshes from clobbering each other.
  const inflightRef = useRef(0);

  const uploadFiles = useCallback(
    async (fileList) => {
      const picked = Array.from(fileList || []);
      const skipped = picked.filter((file) => !isImageFile(file));
      const files = picked.filter(isImageFile);
      if (!projectId || !taskId) {
        // No task context: nothing can be stored. Say so instead of dropping
        // the gesture silently, so a miswired parent is visible immediately.
        setError('Select a task before attaching images.');
        return;
      }
      if (files.length === 0) {
        // Nothing uploadable: say so inline instead of succeeding silently,
        // so mobile users learn why no reference appeared.
        if (skipped.length > 0) setError(buildSkippedMessage(skipped));
        return;
      }
      // Re-entrancy guard: drop a gesture that arrives while another batch
      // is still uploading. The picker button is disabled during upload, but
      // the paste path is not — silently queueing would interleave two
      // batches' `onUploadedBatch` callbacks and confuse the parent's text
      // accumulation. The user can retry after the current batch finishes.
      if (inflightRef.current > 0) {
        setError('An upload is already in progress — please wait for it to finish.');
        return;
      }
      inflightRef.current += 1;
      setUploading(true);
      onUploadingChange?.(true);
      setError(null);
      try {
        // Per-file try/catch: one oversized/rejected file must not drop the
        // rest of the batch — successes stay linked and listed.
        const storedBatch = [];
        const failures = [];
        for (const file of files) {
          let stored;
          try {
            stored = await api.uploadTaskImage(projectId, taskId, file);
          } catch (err) {
            failures.push(`${file?.name || 'image'}: ${err?.message || 'upload failed'}`);
            continue;
          }
          const asset = { name: stored?.name, path: stored?.path };
          storedBatch.push(asset);
          // Legacy per-file report, isolated: a parent listener that throws
          // must not reclassify an upload that already succeeded as failed.
          try {
            onUploaded?.(asset);
          } catch (err) {
            console.error('[TaskImageAttach] onUploaded listener failed', err);
          }
        }
        if (storedBatch.length > 0) {
          // Refresh before notifying: a throwing parent batch listener must
          // not skip the thumbnail update for uploads that already succeeded.
          try {
            setImages(await fetchTaskImages(projectId, taskId));
          } catch (err) {
            console.error('[TaskImageAttach] listing task images failed', err);
          }
          try {
            onUploadedBatch?.(storedBatch);
          } catch (err) {
            console.error('[TaskImageAttach] onUploadedBatch listener failed', err);
          }
        }
        const notices = [];
        if (skipped.length > 0) notices.push(buildSkippedMessage(skipped));
        if (failures.length > 0)
          notices.push(`Failed to upload ${failures.length} image(s): ${failures.join('; ')}`);
        setError(notices.length > 0 ? notices.join(' ') : null);
      } finally {
        // Always release: a throwing parent listener or any unexpected error
        // must never leave the picker disabled or block later uploads.
        inflightRef.current -= 1;
        setUploading(false);
        onUploadingChange?.(false);
      }
    },
    [projectId, taskId, onUploaded, onUploadedBatch, onUploadingChange],
  );

  // Ref indirection so the long-lived paste listener never sees a stale
  // upload closure. The sync happens in an effect, never during render.
  const uploadFilesRef = useRef(uploadFiles);
  useEffect(() => {
    uploadFilesRef.current = uploadFiles;
  }, [uploadFiles]);

  // Paste-to-upload: images pasted into the goal textarea upload as assets.
  useEffect(() => {
    const el = textareaRef?.current;
    if (!el || typeof el.addEventListener !== 'function') return undefined;
    const handlePaste = (event) => {
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        event.preventDefault();
        uploadFilesRef.current(files);
      }
    };
    el.addEventListener('paste', handlePaste);
    return () => el.removeEventListener('paste', handlePaste);
  }, [textareaRef]);

  const handleRemove = async (name) => {
    if (!projectId || !taskId) {
      setError('Select a task before attaching images.');
      return;
    }
    try {
      await api.deleteTaskImage(projectId, taskId, name);
    } catch (err) {
      setError(err?.message || 'Image removal failed');
      return;
    }
    // A listener or listing failure after a confirmed delete must not report
    // the removal itself as failed (the parent draft already dropped it).
    try {
      onRemoved?.(name);
    } catch (err) {
      console.error('[TaskImageAttach] onRemoved listener failed', err);
    }
    try {
      setImages(await fetchTaskImages(projectId, taskId));
    } catch (err) {
      console.error('[TaskImageAttach] listing task images failed', err);
    }
  };

  return (
    <div data-testid="task-image-attach" className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="task-image-upload-button"
          className="px-2 py-1 rounded border border-border-standard bg-surface-deep text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Upload images into this task's assets folder and reference each in markdown on its own line"
        >
          {uploading ? 'Uploading…' : '🖼 Attach image'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          data-testid="task-image-input"
          onChange={(e) => {
            uploadFilesRef.current(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="text-[9px] font-mono text-text-muted">
          PNG/JPG/GIF/WebP · select multiple allowed — each image is added on its own line
        </span>
      </div>

      {error && (
        <div role="alert" className="text-[10px] font-mono text-error">
          {error}
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="task-image-thumbnails">
          {images.map((image) => (
            <span
              key={image.name}
              className="inline-flex items-center gap-1 border border-border-standard rounded bg-surface-deep px-1 py-0.5"
            >
              <img
                src={resolveTaskImageUrl({
                  apiBase: API_BASE,
                  projectId,
                  taskId,
                  src: `assets/${image.name}`,
                })}
                alt={image.name}
                loading="lazy"
                className="w-8 h-8 object-cover rounded-sm border border-border-standard/60"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
              <span className="font-mono text-[9px] text-text-muted max-w-[110px] truncate">
                {image.name}
              </span>
              <button
                type="button"
                aria-label={`Remove image ${image.name}`}
                data-testid={`task-image-remove-${image.name}`}
                onClick={() => handleRemove(image.name)}
                className="text-[9px] font-mono text-text-muted hover:text-error cursor-pointer px-0.5"
                title="Delete this image asset"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default TaskImageAttach;
