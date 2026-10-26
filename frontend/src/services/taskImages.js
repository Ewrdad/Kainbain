// Domain: The Work — task image assets (upload, list, delete) and the
// markdown image-URL resolution the inline renderer relies on.

/***
 * MARK: resolveTaskImageUrl
 * @description Turns a markdown image src into a fetchable URL. Relative task
 *   asset paths (`assets/<name>`, with optional leading `./` or `/` or a fuller
 *   task-folder prefix) are rewritten to the binary-safe task image endpoint;
 *   absolute http(s) URLs pass through untouched; protocol-blocked values
 *   (javascript:, data:, vbscript:) also pass through UNCHANGED so the
 *   viewer's sanitizeUrl stays the single place that neutralizes them.
 *   Without task context the src is returned as-is (legacy behavior).
 * @example resolveTaskImageUrl({ apiBase: 'http://localhost:3100', projectId: 'p1', taskId: 't1', src: 'assets/shot.png' })
 *   => 'http://localhost:3100/projects/p1/tasks/t1/images/shot.png'
 * @example resolveTaskImageUrl({ projectId: 'p1', taskId: 't1', src: 'https://x/y.png' }) => 'https://x/y.png'
 * @param {Object} opts
 * @param {string} [opts.apiBase] - The API origin ('' = same origin).
 * @param {string} [opts.projectId]
 * @param {string} [opts.taskId]
 * @param {string} [opts.src] - The markdown image src.
 * @returns {string}
 ***/
export function resolveTaskImageUrl({ apiBase = '', projectId, taskId, src }) {
  if (!src || typeof src !== 'string') return '';
  const trimmed = src.trim();
  if (!trimmed) return '';
  // Absolute and protocol URLs are not task assets — leave them for the sanitizer.
  if (/^(https?:)?\/\//i.test(trimmed) || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  if (!projectId || !taskId) return trimmed;
  const assetMatch = trimmed.match(/(?:^|\/)(assets\/[^/?#]+)$/);
  if (!assetMatch) return trimmed;
  const base = String(apiBase || '').replace(/\/+$/, '');
  return `${base}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(assetMatch[1].slice('assets/'.length))}`;
}

/***
 * MARK: taskImageRequests
 * @description Task image asset requests (upload/list/delete) using the app's
 *   existing connection and request helper.
 * @example const requests = taskImageRequests(request); await requests.upload(projectId, taskId, file)
 * @param {Function} request - The shared JSON request helper (FormData-aware).
 ***/
export function taskImageRequests(request) {
  return {
    uploadTaskImage: (projectId, taskId, file) => {
      const formData = new FormData();
      formData.append('image', file, file?.name || 'image');
      return request(`/projects/${projectId}/tasks/${taskId}/images`, {
        method: 'POST',
        body: formData,
      });
    },
    listTaskImages: (projectId, taskId) => request(`/projects/${projectId}/tasks/${taskId}/images`),
    deleteTaskImage: (projectId, taskId, name) =>
      request(`/projects/${projectId}/tasks/${taskId}/images/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
  };
}

/***
 * MARK: isImageFile
 * @description Whether a File looks like an uploadable task image (png/jpg/jpeg/gif/webp) by extension.
 * @example isImageFile(new File([], 'a.png')) => true
 * @param {File} file
 * @returns {boolean}
 ***/
export function isImageFile(file) {
  if (!file || typeof file.name !== 'string') return false;
  return /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

/***
 * MARK: appendImageMarkdown
 * @description Appends an uploaded image's markdown reference (`![name](path)`)
 *   at the end of a feedback/goal draft on its own new line, regardless of
 *   caret position. Same end-append contract the goal editor uses, shared so
 *   the reject dialogs compose identically. The path is sanitized so a
 *   hostile stored name cannot break out of the `(...)` destination (parens,
 *   quotes, and newlines are stripped) — defense in depth on top of the
 *   backend's `sanitizeImageName`.
 * @example appendImageMarkdown('Fix it', { name: 'a.png', path: 'assets/a.png' }) => 'Fix it\n\n![a.png](assets/a.png)\n'
 * @param {string} text - Current draft text.
 * @param {Object} image - Stored asset `{ name, path }`.
 * @returns {string} Draft with the reference appended.
 ***/
export function appendImageMarkdown(text, image) {
  const base = typeof text === 'string' ? text : '';
  const rawPath = typeof image?.path === 'string' ? image.path.trim() : '';
  if (!rawPath) return base;
  // Alt text must stay on one line inside brackets: strip brackets/newlines
  // so a hostile or pasted filename cannot break out of the image syntax.
  const alt = String(image?.name || 'image')
    .replace(/[\[\]\r\n]+/g, ' ')
    .trim()
    .slice(0, 120);
  // The destination must stay on one line and cannot contain parens or
  // quotes — otherwise a crafted path could close the `(...)` early and
  // inject arbitrary markdown. Stripping is lossless for real asset paths
  // (backend `sanitizeImageName` already produces flat, safe names).
  const dest = rawPath.replace(/[()"'\r\n]+/g, ' ').trim();
  if (!dest) return base;
  const snippet = `![${alt || 'image'}](${dest})`;
  if (!base) return `${snippet}\n`;
  const prefix = base.endsWith('\n\n') ? '' : base.endsWith('\n') ? '\n' : '\n\n';
  return `${base}${prefix}${snippet}\n`;
}

/***
 * MARK: appendImagesMarkdown
 * @description Folds `appendImageMarkdown` over a batch of stored assets so one
 *   multi-select/paste gesture lands as sequential `![name](path)` lines, in
 *   order, via a single text update (no stale-closure accumulation loss).
 *   Entries without a usable path are skipped.
 * @example appendImagesMarkdown('Fix it', [{ name: 'a.png', path: 'assets/a.png' }, { name: 'b.png', path: 'assets/b.png' }]) => 'Fix it\n\n![a.png](assets/a.png)\n\n![b.png](assets/b.png)\n'
 * @param {string} text - Current draft text.
 * @param {Array<Object>} images - Stored assets (`{ name, path }`), in link order.
 * @returns {string} Draft with every reference appended.
 ***/
export function appendImagesMarkdown(text, images) {
  if (!Array.isArray(images) || images.length === 0) {
    return typeof text === 'string' ? text : '';
  }
  return images.reduce((draft, image) => appendImageMarkdown(draft, image), text);
}

/***
 * MARK: firstSrcToken
 * @description Normalizes a markdown image destination to its comparable src:
 *   unwraps the `<...>` form CommonMark allows for spaced destinations, then
 *   strips a trailing quoted title (`![a](x "t")`). An unquoted remainder is
 *   kept whole so stored paths containing spaces still resolve (the image
 *   endpoint percent-encodes them downstream).
 * @example firstSrcToken('assets/a.png "shot"') => 'assets/a.png'
 * @param {string} dest - Raw destination inside the parens.
 * @returns {string} Normalized src ('' when empty).
 ***/
function firstSrcToken(dest) {
  const unwrapped = String(dest || '')
    .trim()
    .replace(/^<|>$/g, '');
  const titled = unwrapped.match(/^(.*?)\s+["'][^"']*["']\s*$/);
  return (titled ? titled[1] : unwrapped).trim();
}

/***
 * MARK: removeImageMarkdown
 * @description Strips the markdown reference line(s) for a removed image asset
 *   from a feedback draft. Matches by exact stored path first, falling back to
 *   the asset basename so hand-edited alt text still strips.
 * @example removeImageMarkdown('Fix it\n\n![a.png](assets/a.png)\n', 'a.png') => 'Fix it'
 * @param {string} text - Current draft text.
 * @param {string} name - Removed asset name (`a.png`).
 * @param {string} [path] - Removed asset path (`assets/a.png`).
 * @returns {string} Draft without that image's reference lines.
 ***/
export function removeImageMarkdown(text, name, path) {
  if (!text || typeof text !== 'string' || !name) return text || '';
  const source = text;
  const lines = source.split('\n');
  let removed = false;
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    // Tolerate an optional trailing title (`![a](x "t")`): compare on the
    // first whitespace-separated token inside the parens.
    const match = trimmed.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    if (!match) return true;
    const src = firstSrcToken(match[1]);
    const drop =
      (typeof path === 'string' && path && src === path) || src.split('/').pop() === name;
    if (drop) removed = true;
    return !drop;
  });
  if (!removed) return source;
  // Removing a line can strand double blank lines; collapse runs of three
  // or more newlines and drop trailing whitespace (submit trims anyway).
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '');
}

/***
 * MARK: extractImageRefs
 * @description Collects markdown image references (`![alt](src)`) from a text
 *   draft, in order. Used to render thumbnails for image refs inside
 *   otherwise plain-text rejection reasons.
 * @example extractImageRefs('See ![a](assets/a.png)') => [{ alt: 'a', src: 'assets/a.png' }]
 * @param {string} text - Draft text to scan.
 * @returns {Array<{alt: string, src: string}>} Image references found.
 ***/
export function extractImageRefs(text) {
  if (!text || typeof text !== 'string') return [];
  const refs = [];
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const src = firstSrcToken(match[2]);
    if (!src) continue;
    refs.push({ alt: match[1], src });
  }
  return refs;
}
