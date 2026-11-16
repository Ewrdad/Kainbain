// Domain: The Work — task asset reference grammar (shared single owner).
// Normalizes one markdown link/image destination to its canonical task-asset
// form. Backend prompt curation and the frontend viewer both resolve through
// this function so detection can never drift from what the viewer shows.

/***
 * MARK: normalizeAssetSrc
 * @description Normalizes one markdown image/link destination to its canonical
 *   task-asset reference (`assets/<name>`), or null when it is not a task
 *   asset. Tolerates a leading `./` or `/`, a fuller task-folder prefix
 *   (`docs/tasks/<id>/assets/<name>`), `<...>` destinations, and a trailing
 *   quoted title. Absolute http(s) URLs, protocol URLs (javascript:, data:,
 *   …), non-asset paths, and query/fragment-suffixed refs read as null (the
 *   viewer leaves those untouched for its sanitizer, and curation never
 *   warns on them).
 * @example normalizeAssetSrc('./assets/shot.png "titled"') => 'assets/shot.png'
 * @example normalizeAssetSrc('https://x/assets/shot.png') => null
 * @param {string} src - Raw destination from inside the markdown parens.
 * @returns {string|null} Canonical `assets/<name>` ref, or null.
 ***/
export function normalizeAssetSrc(src) {
	if (!src || typeof src !== "string") return null;
	const trimmed = src.trim();
	if (!trimmed) return null;
	// Absolute and protocol URLs are not task assets — the viewer's
	// sanitizer owns them, and curation must never warn on them.
	if (/^(https?:)?\/\//i.test(trimmed) || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
		return null;
	}
	// CommonMark destinations may use the `<...>` form (spaced names) and
	// may carry a trailing quoted title (`![a](assets/a.png "shot")`);
	// resolve on the bare destination. An unquoted remainder is kept whole
	// so stored paths containing spaces still resolve.
	const unwrapped = trimmed.replace(/^<|>$/g, "");
	const titled = unwrapped.match(/^(.*?)\s+["'][^"']*["']\s*$/);
	const bare = (titled ? titled[1] : unwrapped).trim();
	const assetMatch = bare.match(/(?:^|\/)(assets\/[^/?#]+)$/);
	if (!assetMatch) return null;
	return assetMatch[1];
}
