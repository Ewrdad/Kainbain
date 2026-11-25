// Domain: The Work — submit-time human-feedback validation (shared single
// owner). Client-side presence check: which `assets/*` refs in a draft have
// no matching attachment name. Mirrors `resolveAssetRef`'s two tiers
// (literal match, then sanitized-image match) so drifted-but-servable refs
// never block — the server re-validates authoritatively against disk plus
// the task branch.
import {
	extractAssetRefs,
	isAllowedImageExt,
	sanitizeImageName,
} from "../taskAssetRefs/index.js";

/***
 * MARK: findMissingRefsAgainst
 * @description The dangling `assets/*` refs in a markdown draft: canonical
 *   refs with no match in `presentNames`, in first-appearance order. A ref
 *   counts as present on a literal name match, or when its sanitized form
 *   equals a present image's sanitized form (serve parity — the same rule
 *   as `resolveAssetRef`). Pure and sync; total on untrusted input.
 * @example findMissingRefsAgainst('![a](assets/gone.png)', ['kept.png']) => ['assets/gone.png']
 * @example findMissingRefsAgainst('![a](assets/Shot.png)', ['shot.png']) => []
 * @param {string} markdown - Draft text to scan.
 * @param {string[]} [presentNames] - Attached asset names to match against.
 * @returns {string[]} Canonical missing refs (possibly empty).
 ***/
export function findMissingRefsAgainst(markdown, presentNames) {
	const refs = extractAssetRefs(markdown);
	if (refs.length === 0) return [];
	const present = (Array.isArray(presentNames) ? presentNames : []).map((name) =>
		String(name),
	);
	return refs.filter((ref) => {
		const name = ref.slice("assets/".length);
		// Tier 1 (resolveAssetRef parity): any literally present file counts,
		// even a hand-placed non-image the uploader would never store.
		if (present.includes(name)) return false;
		// Tier 2 (serve parity): only image extensions take part in the
		// canonical fallback — the serve route rejects anything else first.
		const canonical = sanitizeImageName(name);
		if (!canonical || !isAllowedImageExt(canonical)) return true;
		return !present.some(
			(entry) =>
				isAllowedImageExt(entry) && sanitizeImageName(entry) === canonical,
		);
	});
}
