import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api, API_BASE } from '../../services/api';
import {
  ATTACHMENT_EXTENSIONS,
  attachmentKindFor,
  isAttachmentFile,
  isImageFile,
  resolveTaskAttachmentUrl,
  resolveTaskImageUrl,
} from '../../services/taskImages';
import { useImageRetry } from '../../services/imageRetry';

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
 * MARK: fetchTaskFiles
 * @description Reads a task's non-image attachments from the API (the
 *   generalized listing minus the viewable images, which keep their own
 *   thumbnail strip). Throws on request failure so callers decide how to
 *   surface it.
 * @example await fetchTaskFiles('p1', 't1') => [{ name: 'out.log', path: 'assets/out.log' }]
 * @param {string} projectId
 * @param {string} taskId
 * @returns {Promise<Array<{name: string, path: string, size: number, mtime: string, kind: string}>>}
 ***/
async function fetchTaskFiles(projectId, taskId) {
  const result = await api.listTaskAttachments(projectId, taskId);
  const entries = Array.isArray(result?.attachments) ? result.attachments : [];
  return entries.filter((entry) => entry?.kind !== 'image');
}

/***
 * MARK: attachmentAccept
 * @description The file picker's `accept` value: the viewable image MIME types
 *   plus every generalized attachment extension, so the OS dialog offers all
 *   attachable files while the upload path still re-checks each pick.
 * @example attachmentAccept() => 'image/png,image/jpeg,...,.txt,.log,...'
 * @returns {string}
 ***/
function attachmentAccept() {
  const nonImage = ATTACHMENT_EXTENSIONS.filter(
    (ext) => !['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext),
  );
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    .concat(nonImage.map((ext) => `.${ext}`))
    .join(',');
}

/***
 * MARK: buildSkippedMessage
 * @description Explains why picked files were not uploaded. Names HEIC/HEIF
 *   explicitly (common iPhone output outside the attachment allowlist)
 *   so mobile users learn the format — not the picker — is the blocker.
 * @example buildSkippedMessage([{ name: 'a.heic' }]) => 'Skipped 1 unsupported file ...'
 * @param {Array} skipped - Picked files rejected by `isAttachmentFile`.
 * @returns {string} Inline notice for the alert area.
 ***/
function buildSkippedMessage(skipped) {
  const names = (skipped || []).map((file) => file?.name || 'file');
  const heic = names.filter((name) => /\.(heic|heif)$/i.test(name));
  const detail =
    heic.length > 0
      ? `HEIC/HEIF is not supported (${heic.slice(0, 3).join(', ')}${heic.length > 3 ? ', …' : ''}); use PNG/JPG/GIF/WebP`
      : `only image, text, document, archive, and media files can be attached (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''})`;
  return `Skipped ${names.length} unsupported file${names.length === 1 ? '' : 's'} — ${detail}.`;
}

/***
 * MARK: TaskImageThumb
 * @description One listed image asset: a lazy thumbnail plus name and remove
 *   control. A load failure surfaces the same unavailable chip + retry used
 *   by the markdown renderer (never an invisible hole), keeping the filename
 *   visible so the gap is actionable instead of silently empty. Transient
 *   misses self-recover through the shared retry seam.
 * @example <TaskImageThumb projectId="p1" taskId="t1" image={{ name: 'a.png' }} onRemove={remove} />
 * @param {Object} props
 * @param {string} props.projectId - Owning project id.
 * @param {string} props.taskId - Owning task id.
 * @param {Object} props.image - Listed asset (`{ name }`).
 * @param {Function} [props.onRemove] - Called with the image name.
 ***/
export function TaskImageThumb({ projectId, taskId, image, onRemove }) {
  const src = resolveTaskImageUrl({
    apiBase: API_BASE,
    projectId,
    taskId,
    src: `assets/${image.name}`,
  });
  const { failed, retryKey, markFailed, retry } = useImageRetry({
    src,
    component: 'task-image-thumb',
    hasTaskContext: Boolean(projectId && taskId),
  });

  return (
    <span className="inline-flex items-center gap-1 border border-border-standard rounded bg-surface-deep px-1 py-0.5">
      {failed ? (
        <span
          data-task-image-state="unavailable"
          className="inline-flex items-center gap-1 font-mono text-[9px] text-text-muted"
        >
          <span role="img" aria-label={image.name}>
            🖼️ {image.name} (image unavailable)
          </span>
          <button
            type="button"
            onClick={retry}
            aria-label={`Retry loading ${image.name}`}
            className="underline underline-offset-2 hover:text-on-surface transition-colors cursor-pointer"
          >
            Retry
          </button>
        </span>
      ) : (
        <img
          key={retryKey}
          src={src}
          alt={image.name}
          loading="lazy"
          className="w-8 h-8 object-cover rounded-sm border border-border-standard/60"
          onError={markFailed}
        />
      )}
      <span className="font-mono text-[9px] text-text-muted max-w-[110px] truncate">
        {image.name}
      </span>
      <button
        type="button"
        aria-label={`Remove image ${image.name}`}
        data-testid={`task-image-remove-${image.name}`}
        onClick={() => onRemove?.(image.name)}
        className="text-[9px] font-mono text-text-muted hover:text-error cursor-pointer px-0.5"
        title="Delete this image asset"
      >
        ✕
      </button>
    </span>
  );
}

/***
 * MARK: TaskFileChip
 * @description One listed non-image attachment: a download link plus name and
 *   remove control. The sibling of `TaskImageThumb` for the generalized
 *   listing — files resolve through the header-safe attachment endpoint and
 *   carry the `download` hint so the browser saves rather than navigates.
 * @example <TaskFileChip projectId="p1" taskId="t1" file={{ name: 'out.log' }} onRemove={remove} />
 * @param {Object} props
 * @param {string} props.projectId - Owning project id.
 * @param {string} props.taskId - Owning task id.
 * @param {Object} props.file - Listed attachment (`{ name }`).
 * @param {Function} [props.onRemove] - Called with the file name.
 ***/
export function TaskFileChip({ projectId, taskId, file, onRemove }) {
  const href = resolveTaskAttachmentUrl({
    apiBase: API_BASE,
    projectId,
    taskId,
    src: `assets/${file.name}`,
  });

  return (
    <span className="inline-flex items-center gap-1 border border-border-standard rounded bg-surface-deep px-1 py-0.5">
      <a
        href={href}
        download={file.name}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Download ${file.name}`}
        className="font-mono text-[9px] text-text-muted hover:text-on-surface transition-colors"
        title={`Download ${file.name}`}
      >
        <span role="img" aria-label={file.name}>
          📎
        </span>
      </a>
      <span className="font-mono text-[9px] text-text-muted max-w-[110px] truncate">
        {file.name}
      </span>
      <button
        type="button"
        aria-label={`Remove file ${file.name}`}
        data-testid={`task-file-remove-${file.name}`}
        onClick={() => onRemove?.(file.name)}
        className="text-[9px] font-mono text-text-muted hover:text-error cursor-pointer px-0.5"
        title="Delete this file attachment"
      >
        ✕
      </button>
    </span>
  );
}

/***
 * MARK: TaskImageAttach
 * @description The task-attachment upload affordance: a file picker (plus paste-to-upload
 *   on the goal textarea), the task's existing attachments as removable thumbnails
 *   (images) and download chips (every other allowed file type), and upload/error
 *   feedback. Images upload through the image endpoint and everything else through
 *   the generalized attachment endpoint. On a successful upload it reports the stored
 *   asset to the parent, which appends the markdown reference (`![name](assets/name)`
 *   for images, `[name](assets/name)` for files) at the end of the goal text on a new
 *   line. Files live server-side in the task's `assets/` folder; nothing lands in the
 *   goal markdown but a relative reference.
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
 *   uploads still proceed. Skipped (with an inline notice) when the task
 *   changed mid-upload, so a batch started on task A never lands in B's draft.
 * @param {Function} [props.onRemoved] - Called with the removed attachment name.
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
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Live task scope: an upload batch lands seconds after its gesture, and the
  // user may switch tasks meanwhile. Completions compare against this ref so
  // a batch started on task A can never append its references to task B's
  // draft (refs without bytes in B, orphan bytes in A).
  const scopeRef = useRef({ projectId, taskId });
  useEffect(() => {
    scopeRef.current = { projectId, taskId };
  }, [projectId, taskId]);

  // Initial asset listing: subscribe-on-mount pattern — setState happens in
  // the fetch callbacks (never synchronously in the effect body). Images and
  // files list independently so one endpoint's failure never hides the other
  // strip.
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
    fetchTaskFiles(projectId, taskId)
      .then((list) => {
        if (!cancelled) setFiles(list);
      })
      .catch((err) => {
        console.error('[TaskImageAttach] listing task files failed', err);
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
      const skipped = picked.filter((file) => !isAttachmentFile(file));
      const uploadable = picked.filter(isAttachmentFile);
      if (!projectId || !taskId) {
        // No task context: nothing can be stored. Say so instead of dropping
        // the gesture silently, so a miswired parent is visible immediately.
        setError('Select a task before attaching files.');
        return;
      }
      if (uploadable.length === 0) {
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
      // The task this gesture belongs to: every completion below re-checks it
      // against the live scope, so a task switch mid-upload keeps the bytes
      // (they still land in the origin task) without poisoning the new draft.
      const batchScope = { projectId, taskId };
      const scopeChanged = () =>
        scopeRef.current.projectId !== batchScope.projectId ||
        scopeRef.current.taskId !== batchScope.taskId;
      try {
        // Per-file try/catch: one oversized/rejected file must not drop the
        // rest of the batch — successes stay linked and listed. Images keep
        // the image endpoint; every other attachment rides the generalized
        // endpoint. Selection order is preserved across the two.
        const storedBatch = [];
        const failures = [];
        for (const file of uploadable) {
          let stored;
          try {
            const upload = isImageFile(file) ? api.uploadTaskImage : api.uploadTaskAttachment;
            stored = await upload(batchScope.projectId, batchScope.taskId, file);
          } catch (err) {
            failures.push(`${file?.name || 'file'}: ${err?.message || 'upload failed'}`);
            continue;
          }
          const asset = { name: stored?.name, path: stored?.path };
          storedBatch.push(asset);
          if (scopeChanged()) continue;
          // Legacy per-file report, isolated: a parent listener that throws
          // must not reclassify an upload that already succeeded as failed.
          try {
            onUploaded?.(asset);
          } catch (err) {
            console.error('[TaskImageAttach] onUploaded listener failed', err);
          }
        }
        const notices = [];
        if (storedBatch.length > 0 && scopeChanged()) {
          // Switched tasks mid-upload: the bytes are safe in the origin
          // task's folder (visible in its strip on return), but no reference
          // is appended anywhere — the current draft belongs to another task.
          notices.push(
            `Upload finished after switching tasks — ${storedBatch.length} file(s) stored in task ${batchScope.taskId}; no reference was added to the current task.`,
          );
        } else if (storedBatch.length > 0) {
          // Refresh before notifying: a throwing parent batch listener must
          // not skip the strip updates for uploads that already succeeded.
          try {
            const [nextImages, nextFiles] = await Promise.all([
              fetchTaskImages(batchScope.projectId, batchScope.taskId),
              fetchTaskFiles(batchScope.projectId, batchScope.taskId),
            ]);
            setImages(nextImages);
            setFiles(nextFiles);
          } catch (err) {
            console.error('[TaskImageAttach] listing task attachments failed', err);
          }
          try {
            onUploadedBatch?.(storedBatch);
          } catch (err) {
            console.error('[TaskImageAttach] onUploadedBatch listener failed', err);
          }
        }
        if (skipped.length > 0) notices.push(buildSkippedMessage(skipped));
        if (failures.length > 0)
          notices.push(`Failed to upload ${failures.length} file(s): ${failures.join('; ')}`);
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
      setError('Select a task before attaching files.');
      return;
    }
    // Images keep the image endpoint; files ride the generalized one. The
    // name classifies (stored names are extension-bearing by construction).
    const remove =
      attachmentKindFor(name) === 'file' ? api.deleteTaskAttachment : api.deleteTaskImage;
    try {
      await remove(projectId, taskId, name);
    } catch (err) {
      setError(err?.message || 'Attachment removal failed');
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
      const [nextImages, nextFiles] = await Promise.all([
        fetchTaskImages(projectId, taskId),
        fetchTaskFiles(projectId, taskId),
      ]);
      setImages(nextImages);
      setFiles(nextFiles);
    } catch (err) {
      console.error('[TaskImageAttach] listing task attachments failed', err);
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
          title="Upload files into this task's assets folder and reference each in markdown on its own line"
        >
          {uploading ? 'Uploading…' : '📎 Attach file'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={attachmentAccept()}
          multiple
          className="hidden"
          data-testid="task-image-input"
          onChange={(e) => {
            uploadFilesRef.current(e.target.files);
            e.target.value = '';
          }}
        />
        <span className="text-[9px] font-mono text-text-muted">
          Images, logs, docs &amp; more · select multiple allowed — each file is added on its own line
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
            <TaskImageThumb
              key={`${projectId}:${taskId}:${image.name}`}
              projectId={projectId}
              taskId={taskId}
              image={image}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="task-file-list">
          {files.map((file) => (
            <TaskFileChip
              key={`${projectId}:${taskId}:${file.name}`}
              projectId={projectId}
              taskId={taskId}
              file={file}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default TaskImageAttach;
