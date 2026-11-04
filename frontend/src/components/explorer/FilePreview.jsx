import React, { useState } from 'react';
import { MarkdownViewer } from '../common/MarkdownViewer';
import { IMAGE_PREVIEW_MAX_BYTES, formatFileSize, getFileKind } from './fileKind';
import { useImageRetry } from '../../services/imageRetry';

/***
 * MARK: checkerboardBackdrop
 * @description Neutral checkerboard behind image previews so transparency
 *   stays visible on any theme. Functional texture, not decoration.
 * @example checkerboardBackdrop.backgroundSize => '20px 20px'
 ***/
const checkerboardBackdrop = {
  backgroundImage:
    'conic-gradient(#333333 0.25turn, #2b2b2b 0.25turn 0.5turn, #333333 0.5turn 0.75turn, #2b2b2b 0.75turn)',
  backgroundSize: '20px 20px',
};

/***
 * MARK: DownloadFileLink
 * @description Anchor that downloads the raw file bytes (same-origin raw
 *   endpoint) instead of navigating. Used by the image and binary previews.
 * @example <DownloadFileLink rawUrl="/projects/p/files/raw?path=a.png" fileName="a.png" />
 ***/
function DownloadFileLink({ rawUrl, fileName }) {
  return (
    <a
      href={rawUrl}
      download={fileName}
      aria-label={`Download ${fileName}`}
      className="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded-sm text-[10px] font-mono text-on-surface transition-colors cursor-pointer flex items-center gap-1"
    >
      <span aria-hidden="true">⬇️</span>
      <span>Download</span>
    </a>
  );
}

/***
 * MARK: UnavailablePreview
 * @description Fallback pane when a file cannot render inline (unsupported
 *   binary type or over the preview cap): states the reason, the size, and
 *   offers the raw bytes as a download. Image load failures additionally get
 *   a Retry control (transient misses must not strand the pane).
 * @example <UnavailablePreview title="..." message="..." fileSize={12} rawUrl="..." fileName="a.zip" />
 ***/
function UnavailablePreview({ icon, title, message, fileSize, rawUrl, fileName, onRetry }) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-surface rounded-sm border border-border-standard shadow-sm p-4 flex flex-col items-center text-center gap-2 w-full">
        <span className="text-3xl" aria-hidden="true">
          {icon}
        </span>
        <h4 className="text-xs font-bold text-on-surface font-mono">{title}</h4>
        <p className="text-[11px] font-mono text-text-muted max-w-full">{message}</p>
        <p className="text-[10px] font-mono text-text-muted">{formatFileSize(fileSize)}</p>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              aria-label={`Retry loading ${fileName}`}
              className="px-2.5 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded-sm text-[10px] font-mono text-on-surface transition-colors cursor-pointer"
            >
              Retry
            </button>
          )}
          {rawUrl && <DownloadFileLink rawUrl={rawUrl} fileName={fileName} />}
        </div>
      </div>
    </div>
  );
}

/***
 * MARK: ImagePreview
 * @description Renders one image file from the raw-bytes endpoint with a
 *   loading state, a broken-image state, a natural-dimension readout, and a
 *   download fallback. Oversized images never fetch: they show the download
 *   state directly. Load failures auto-recover through the shared retry seam
 *   and offer a manual Retry once the budget is spent.
 * @example <ImagePreview fileName="logo.png" fileSize={512} rawUrl="..." />
 ***/
function ImagePreview({ fileName, fileSize, rawUrl }) {
  // Loading state resets per file: the parent keys this component by rawUrl.
  const [view, setView] = useState({ status: 'loading', width: 0, height: 0 });
  const { failed, retryKey, markFailed, retry } = useImageRetry({
    src: rawUrl || '',
    component: 'file-preview',
    hasTaskContext: false,
  });

  const tooLarge = typeof fileSize === 'number' && fileSize > IMAGE_PREVIEW_MAX_BYTES;
  if (tooLarge) {
    return (
      <UnavailablePreview
        icon="🖼️"
        title="Image too large to preview"
        message={`This image is over the ${formatFileSize(IMAGE_PREVIEW_MAX_BYTES)} inline preview limit. Download it to view the full file.`}
        fileSize={fileSize}
        rawUrl={rawUrl}
        fileName={fileName}
      />
    );
  }

  const handleError = () => {
    setView({ status: 'error', width: 0, height: 0 });
    markFailed();
  };

  const dimensions = view.status === 'loaded' ? `${view.width}×${view.height}` : '…';

  // The hook owns the failed flag (auto-retries flip it back while the view
  // still reads 'error', which is exactly what re-renders the <img> below).
  if ((view.status === 'error' && failed) || !rawUrl) {
    return (
      <div data-task-image-state="unavailable">
        <UnavailablePreview
          icon="🖼️"
          title="Could not load this image"
          message="It may have been moved or use an encoding the browser cannot decode. Download it to open it locally."
          fileSize={fileSize}
          rawUrl={rawUrl}
          fileName={fileName}
          onRetry={rawUrl ? retry : undefined}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-surface rounded-sm border border-border-standard overflow-hidden shadow-sm">
        <div className="px-4 py-2 border-b border-border-standard bg-surface-container flex items-center justify-between gap-2 flex-wrap w-full">
          <span className="text-[10px] font-mono text-text-muted">
            {formatFileSize(fileSize)} • {dimensions}
          </span>
          <DownloadFileLink rawUrl={rawUrl} fileName={fileName} />
        </div>
        <div className="p-6 flex justify-center" style={checkerboardBackdrop}>
          {view.status === 'loading' && (
            <div
              role="status"
              aria-label="Loading image preview"
              className="p-8 text-center text-xs text-text-muted flex items-center justify-center gap-2"
            >
              <span className="animate-spin text-primary">⏳</span>
              <span>Loading image preview...</span>
            </div>
          )}
          <img
            key={retryKey}
            src={rawUrl}
            alt={fileName}
            onLoad={(e) =>
              setView({
                status: 'loaded',
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            onError={handleError}
            className="max-w-full object-contain rounded-sm"
            style={{ maxHeight: '70vh', display: view.status === 'loading' ? 'none' : undefined }}
          />
        </div>
      </div>
    </div>
  );
}

/***
 * MARK: FilePreview
 * @description Preview body for the explorer Document Viewer: dispatches on
 *   file kind to the image pane, the markdown pane (rendered/raw), the
 *   line-numbered code pane, or the binary download fallback. When the
 *   previewed file lives inside a task folder, `projectId`/`taskId` are passed
 *   through so relative `assets/<name>` image references in task markdown
 *   (task.md, stage reports) resolve to the task image endpoint.
 * @example <FilePreview fileContent={...} selectedFile={...} previewMode="rendered" lines={[...]} rawUrl="..." projectId="p1" taskId="t1" />
 ***/
export function FilePreview({ fileContent, selectedFile, previewMode, lines, rawUrl, projectId = null, taskId = null }) {
  const kind = getFileKind(fileContent ?? selectedFile ?? {});
  const fileName = fileContent?.name || selectedFile?.name || 'file';
  const fileSize = fileContent?.size ?? selectedFile?.size ?? 0;

  if (kind === 'image') {
    return (
      <ImagePreview
        key={rawUrl || fileName}
        fileName={fileName}
        fileSize={fileSize}
        rawUrl={rawUrl}
      />
    );
  }

  if (kind === 'unsupported-binary') {
    return (
      <UnavailablePreview
        icon="📦"
        title="Preview unavailable for this file type"
        message="This file cannot be shown as text or as an image. Download it to open it locally."
        fileSize={fileSize}
        rawUrl={rawUrl}
        fileName={fileName}
      />
    );
  }

  const isMarkdown = fileContent?.extension === '.md' || fileContent?.extension === '.markdown';

  if (isMarkdown && previewMode === 'rendered') {
    return (
      <div className="max-w-5xl mx-auto">
        <article className="prose prose-invert max-w-none text-xs font-sans leading-relaxed space-y-4 bg-surface p-6 rounded-sm border border-border-standard shadow-sm">
          <MarkdownViewer content={fileContent.content} projectId={projectId} taskId={taskId} />
        </article>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-surface rounded-sm border border-border-standard overflow-hidden shadow-sm flex font-mono text-xs text-on-surface">
        {/* Line Numbers Gutter */}
        <div className="bg-surface-container-low border-r border-border-standard py-4 px-2 select-none text-right text-text-muted font-mono text-[11px] leading-5 shrink-0">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code Content */}
        <pre className="p-4 overflow-x-auto custom-scrollbar whitespace-pre leading-5 flex-1 font-mono text-xs text-on-surface">
          <code>{fileContent.content}</code>
        </pre>
      </div>
    </div>
  );
}
