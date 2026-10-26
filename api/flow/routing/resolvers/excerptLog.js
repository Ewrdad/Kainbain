import { failureLogExcerptLimit } from "../tables/failureLogExcerptLimit.js";

/***
 * MARK: excerptLog
 * @description Keeps the actionable frame of a long failure log: the head
 *   (exception type plus the first stack frames, where the root cause
 *   lives) and the tail (the final diagnostic message), replacing the
 *   repetitive middle with one marker line carrying the omitted counts.
 *   Short logs pass through unchanged. The result never exceeds `max`
 *   characters, marker included.
 *
 *   Budget guarantee: the final line is the diagnostic message, so it is
 *   reserved FIRST — the head and any earlier tail lines only get the room
 *   left over, and the marker is budgeted at its maximum possible width
 *   (counts taken from the whole log) so a grown marker can never push the
 *   result past `max`. When even the final line plus a marker cannot fit
 *   (a pathologically long final line), the message's tail is kept up to
 *   the room left after the marker, so the omission stays explicit; only a
 *   single line longer than the whole budget falls back to the legacy tail
 *   slice. Cuts land on line boundaries; a single opening line longer than
 *   the head budget is cut mid-line rather than dropped.
 * @example excerptLog("a\nb", 10) => "a\nb"
 * @param {string} [text] - Raw log output, may be empty.
 * @param {number} [max] - Maximum characters to keep, marker included.
 * @returns {string} Head+tail excerpt, or an empty string when blank.
 ***/
export function excerptLog(text, max = failureLogExcerptLimit) {
	if (typeof text !== "string") return "";
	const trimmed = text.trim();
	if (!trimmed) return "";
	const limit =
		Number.isFinite(Number(max)) && Number(max) > 0
			? Math.floor(Number(max))
			: failureLogExcerptLimit;
	if (trimmed.length <= limit) return trimmed;
	// Tiny budgets cannot hold head + marker + tail: keep the tail, as before.
	if (limit < 128) return trimmed.slice(-limit);

	const lines = trimmed.split("\n");
	const lastLine = lines.at(-1);
	const markerFor = (chars, omittedLines) =>
		`\n… [${Math.max(0, chars)} chars / ${Math.max(0, omittedLines)} lines omitted] …\n`;
	// Reserve the marker at its WIDEST possible width (omitted counts taken
	// from the whole log). The real counts are always <= these, so the real
	// marker is always <= this reservation and the budget cannot be blown.
	const markerUpper = markerFor(trimmed.length, lines.length);
	// The final line is the diagnostic message: it is non-negotiable. When
	// even it cannot fit beside a marker, keep the tail (the message's most
	// specific end) truncated to the room left after the marker, so the
	// omission is still explicit rather than silently dropping content.
	if (lastLine.length + markerUpper.length > limit) {
		const room = limit - markerUpper.length;
		if (room <= 0) return trimmed.slice(-limit);
		const tail = trimmed.slice(-room);
		const marker = markerFor(
			trimmed.length - tail.length,
			lines.length - tail.split("\n").length,
		);
		const result = marker + tail;
		return result.length <= limit ? result : trimmed.slice(-limit);
	}
	const spare = limit - lastLine.length - markerUpper.length;

	// Head: whole lines from the top, at most half the spare so the tail
	// keeps room. An over-long opening line is cut mid-line rather than
	// dropped: its first frames carry the root cause.
	const headBudget = Math.floor(spare / 2);
	const headLines = [];
	let headLength = 0;
	for (let i = 0; i < lines.length - 1; i += 1) {
		/* eslint-disable-next-line security/detect-object-injection -- i is a bounded loop index into a local array */
		const line = lines[i];
		const cost = (headLines.length > 0 ? 1 : 0) + line.length;
		if (headLength + cost > headBudget) break;
		headLines.push(line);
		headLength += cost;
	}
	let head;
	let headConsumedLines;
	if (headLines.length > 0) {
		head = headLines.join("\n");
		headConsumedLines = headLines.length;
	} else if (lines.length > 1) {
		head = lines[0].slice(0, headBudget);
		headConsumedLines = head ? 1 : 0;
	} else {
		head = "";
		headConsumedLines = 0;
	}

	// Tail: the reserved final line plus whole preceding lines while they
	// fit. Never reach back into the head's lines — that would duplicate
	// content and lie about the omitted counts.
	const tailBudget = spare - head.length;
	const tailLines = [lastLine];
	let tailLength = lastLine.length;
	for (let i = lines.length - 2; i >= headConsumedLines; i -= 1) {
		/* eslint-disable-next-line security/detect-object-injection -- i is a bounded loop index into a local array */
		const line = lines[i];
		const cost = 1 + line.length;
		if (tailLength + cost > tailBudget) break;
		tailLines.unshift(line);
		tailLength += cost;
	}
	const tail = tailLines.join("\n");

	const marker = markerFor(
		trimmed.length - head.length - tail.length,
		lines.length - headConsumedLines - tailLines.length,
	);
	return head + marker + tail;
}
