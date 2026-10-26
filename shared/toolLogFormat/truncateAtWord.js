import { MAX_BACKTRACK_FRAGMENT } from "./constants.js";

export function truncateAtWord(text, maxLength) {
	if (typeof text !== "string") return "";
	if (maxLength === Infinity) return text;
	if (typeof maxLength !== "number" || !Number.isFinite(maxLength)) return "";
	if (maxLength <= 0) return "";
	if (text.length <= maxLength) return text;
	if (maxLength === 1) return "…";
	const budget = Math.floor(maxLength) - 1;
	const head = text.slice(0, budget);
	const next = text[budget];
	const onBoundary =
		next === undefined || /\s/.test(next) || /[\s,;:]$/.test(head);
	const fragment = head.match(/\S+$/);
	const longFragment =
		Boolean(fragment) && fragment[0].length > MAX_BACKTRACK_FRAGMENT;
	if (onBoundary || longFragment) {
		const kept = head.replace(/[\s,;:]+$/, "");
		if (!kept) return "…";
		return `${kept}…`;
	}
	const trailingRun = head.match(/\s+\S*$/);
	const cut = trailingRun ? head.length - trailingRun[0].length : head.length;
	const cutText = (cut > 0 ? head.slice(0, cut) : head).replace(/[\s,;:]+$/, "");
	if (!cutText) return "…";
	return `${cutText}…`;
}
