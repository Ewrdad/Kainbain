// Domain: The Work — task asset reference grammar (shared single owner).
// Collects every `assets/<name>` destination from markdown text, in
// first-appearance order without duplicates.
import { normalizeAssetSrc } from "./normalizeAssetSrc.js";

/***
 * MARK: extractAssetRefs
 * @description Collects the canonical task-asset references (`assets/<name>`)
 *   from image (`![alt](…)`) and plain-link (`[text](…)`) markdown, in
 *   first-appearance order without duplicates. Each destination resolves
 *   through `normalizeAssetSrc`, so prefixes, `<...>` forms, and trailing
 *   titles are tolerated exactly like the viewer resolves them, while
 *   absolute/protocol URLs and non-asset paths are ignored. Total on
 *   untrusted input: non-strings read as no refs.
 * @example extractAssetRefs('See ![a](assets/a.png) and ![a](assets/a.png)') => ['assets/a.png']
 * @example extractAssetRefs('no refs') => []
 * @param {string} markdown - Text to scan.
 * @returns {string[]} Canonical `assets/<name>` refs found.
 ***/
export function extractAssetRefs(markdown) {
	if (!markdown || typeof markdown !== "string") return [];
	const refs = [];
	const seen = new Set();
	// The `<...>` alternative comes first so CommonMark angle destinations
	// holding parens (`![a](<assets/my (1).png>)`) capture whole: the plain
	// `[^)]+` branch would stop at the first `)` and name a truncated file.
	const pattern = /!?\[([^\]]*)\]\((<[^>\n]+>|[^)]+)\)/g;
	let match;
	while ((match = pattern.exec(markdown)) !== null) {
		const ref = normalizeAssetSrc(match[2]);
		if (!ref || seen.has(ref)) continue;
		seen.add(ref);
		refs.push(ref);
	}
	return refs;
}
