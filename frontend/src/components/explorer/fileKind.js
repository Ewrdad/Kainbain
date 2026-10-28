/***
 * MARK: fileKind
 * @description Classifies explorer entries for the preview dispatch (image,
 *   markdown, text, or unsupported-binary) from a shared extension allowlist.
 *   Mirrors the server allowlist in `api/routes/fileTypes.js` — kept in sync
 *   by hand so the browser bundle never imports server code. A server-provided
 *   `kind` field on a listing entry is trusted when present (older backends
 *   omit it, so the local allowlist is the fallback).
 * @example getFileKind({ isDirectory: false, extension: '.png' }) => 'image'
 * @example isImageKind('image') => true
 ***/

/***
 * MARK: IMAGE_EXTENSIONS
 * @description Image extensions rendered in the explorer preview pane
 *   (lowercase, with the leading dot).
 * @example IMAGE_EXTENSIONS.includes('.png') => true
 ***/
export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.ico',
  '.svg',
];

/***
 * MARK: MARKDOWN_EXTENSIONS
 * @description Extensions rendered as markdown in the explorer preview pane.
 ***/
const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];

/***
 * MARK: BINARY_EXTENSIONS
 * @description Extensions never decoded as text; shown with a download
 *   affordance instead of a text preview.
 ***/
const BINARY_EXTENSIONS = [
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.db',
  '.sqlite',
  '.pdf',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wav',
  '.ogg',
  '.flac',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
];

/***
 * MARK: KNOWN_KINDS
 * @description Preview kinds the server may report on a listing entry.
 ***/
const KNOWN_KINDS = ['markdown', 'text', 'image', 'unsupported-binary'];

/***
 * MARK: IMAGE_PREVIEW_MAX_BYTES
 * @description Largest image rendered inline in the preview pane (15 MB,
 *   aligned with the server `RAW_PREVIEW_MAX_BYTES` cap). Larger images show
 *   a download affordance instead of transferring the full bytes.
 * @example IMAGE_PREVIEW_MAX_BYTES => 15728640
 ***/
export const IMAGE_PREVIEW_MAX_BYTES = 15 * 1024 * 1024;

/***
 * MARK: extensionOf
 * @description Reduces a filename, path, bare extension, or explorer entry to
 *   a lowercase dot-extension ("" when there is none).
 * @example extensionOf('PHOTO.PNG') => '.png'
 * @example extensionOf({ name: 'logo.svg' }) => '.svg'
 * @param {string|Object|null} entryOrExtension
 * @returns {string}
 ***/
export function extensionOf(entryOrExtension) {
  if (!entryOrExtension) return '';
  if (typeof entryOrExtension === 'string') {
    const trimmed = entryOrExtension.trim();
    if (!trimmed) return '';
    if (/^\.[^./\\]+$/.test(trimmed)) return trimmed.toLowerCase();
    const base = trimmed.split(/[\\/]/).pop();
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return '';
    return base.slice(dot).toLowerCase();
  }
  if (typeof entryOrExtension === 'object') {
    if (typeof entryOrExtension.extension === 'string' && entryOrExtension.extension) {
      return entryOrExtension.extension.toLowerCase();
    }
    return extensionOf(entryOrExtension.name || entryOrExtension.path || '');
  }
  return '';
}

/***
 * MARK: getFileKind
 * @description The explorer preview kind for an entry, filename, or
 *   extension: markdown, text, image, or unsupported-binary. Directories are
 *   never images (folder clicks navigate instead of previewing).
 * @example getFileKind({ isDirectory: false, extension: '.png' }) => 'image'
 * @example getFileKind({ isDirectory: true }) => 'text'
 * @param {string|Object|null} entryOrExtension
 * @returns {string}
 ***/
export function getFileKind(entryOrExtension) {
  if (
    entryOrExtension &&
    typeof entryOrExtension === 'object' &&
    typeof entryOrExtension.kind === 'string' &&
    KNOWN_KINDS.includes(entryOrExtension.kind)
  ) {
    return entryOrExtension.kind;
  }
  if (entryOrExtension && typeof entryOrExtension === 'object' && entryOrExtension.isDirectory) {
    return 'text';
  }
  const ext = extensionOf(entryOrExtension);
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (MARKDOWN_EXTENSIONS.includes(ext)) return 'markdown';
  if (BINARY_EXTENSIONS.includes(ext)) return 'unsupported-binary';
  return 'text';
}

/***
 * MARK: isImageKind
 * @description Whether an entry or kind string selects the image preview.
 * @example isImageKind({ isDirectory: false, extension: '.png' }) => true
 * @example isImageKind('text') => false
 * @param {string|Object|null} kindOrEntry
 * @returns {boolean}
 ***/
export function isImageKind(kindOrEntry) {
  if (typeof kindOrEntry === 'string' && !kindOrEntry.includes('.') && !kindOrEntry.includes('/')) {
    return kindOrEntry.toLowerCase() === 'image';
  }
  return getFileKind(kindOrEntry) === 'image';
}

/***
 * MARK: formatFileSize
 * @description Formats byte length into human-readable units (B, KB, MB).
 * @example formatFileSize(1536) => '1.5 KB'
 * @param {number} bytes
 * @returns {string}
 ***/
export function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/***
 * MARK: getFileIcon
 * @description Returns an appropriate emoji/icon symbol for a file entry based on its extension or directory status.
 * @example getFileIcon({ isDirectory: true }) => '📁'
 * @example getFileIcon({ isDirectory: false, extension: '.png' }) => '🖼️'
 * @param {Object} entry
 * @returns {string}
 ***/
export function getFileIcon(entry) {
  if (entry.isDirectory) return '📁';
  if (isImageKind(entry)) return '🖼️';
  const ext = (entry.extension || extensionOf(entry) || '').toLowerCase();
  if (ext === '.md' || ext === '.markdown') return '📝';
  if (ext === '.json') return '📦';
  if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') return '⚡';
  if (ext === '.log' || ext === '.txt') return '📋';
  if (ext === '.css' || ext === '.html') return '🎨';
  return '📄';
}
