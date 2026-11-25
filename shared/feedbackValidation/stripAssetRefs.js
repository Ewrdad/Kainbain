// Domain: The Work — submit-time human-feedback validation (shared single
// owner). Text-only recovery: removes exactly the named dangling refs from
// a draft (both image and plain-link spellings that resolve to them) while
// prose and healthy refs stay byte-identical.
import { normalizeAssetSrc } from "../taskAssetRefs/index.js";

/***
 * MARK: stripAssetRefs
 * @description Removes the markdown matches resolving to `refs` from a draft:
 *   image matches vanish entirely, plain-link matches keep their link text
 *   (words the human wrote). Lines emptied by a removal drop out; runs of
 *   blank lines collapse and trailing whitespace trims (the same cleanup
 *   `removeImageMarkdown` applies). Total on untrusted input.
 * @example stripAssetRefs('Fix it\n\n![a](assets/gone.png)\n', ['assets/gone.png']) => 'Fix it'
 * @example stripAssetRefs('See [shot](assets/gone.png) here', ['assets/gone.png']) => 'See shot here'
 * @param {string} markdown - Draft text to clean.
 * @param {string[]} [refs] - Canonical `assets/<name>` refs to remove.
 * @returns {string} Draft without the dangling matches.
 ***/
export function stripAssetRefs(markdown, refs) {
	if (!markdown || typeof markdown !== "string") return "";
	const targets = new Set(
		(Array.isArray(refs) ? refs : []).filter(
			(ref) => typeof ref === "string" && ref,
		),
	);
	if (targets.size === 0) return markdown;
	// Same match grammar as extractAssetRefs, so exactly the detected
	// spellings (angle destinations, titles, prefixes) strip.
	const pattern = /!?\[([^\]]*)\]\((<[^>\n]+>|[^)]+)\)/g;
	const kept = [];
	for (const line of markdown.split("\n")) {
		const stripped = line.replace(pattern, (match, linkText, dest) => {
			const ref = normalizeAssetSrc(dest);
			if (!ref || !targets.has(ref)) return match;
			return match.startsWith("!") ? "" : (linkText || "");
		});
		if (stripped === line) {
			kept.push(line);
			continue;
		}
		// A removal happened on this line: collapse the gap it leaves and
		// drop the line when nothing readable remains.
		const tidied = stripped.replace(/[ \t]{2,}/g, " ").trim();
		if (tidied) kept.push(tidied);
	}
	return kept
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/\s+$/, "");
}
