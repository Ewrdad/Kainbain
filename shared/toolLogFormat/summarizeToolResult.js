import { normalizeBudget } from "./normalizeBudget.js";
import { stripAnsi } from "./stripAnsi.js";
import { truncateAtWord } from "./truncateAtWord.js";
import { collapseWhitespace } from "./collapseWhitespace.js";
import { DEFAULT_RESULT_SUMMARY_LENGTH } from "./constants.js";
import { parseEnvelopeValueFromText } from "./parseResultEnvelope.js";

function coerceToText(value) {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return "";
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	try {
		const json = JSON.stringify(value);
		if (typeof json === "string") return json;
	} catch {
		// Circular structure — fall through to String(value) below.
	}
	try {
		return String(value);
	} catch {
		return "";
	}
}

export function summarizeToolResult(toolName, rawOutput, options = {}) {
	const budget = normalizeBudget(options?.maxLength, DEFAULT_RESULT_SUMMARY_LENGTH);
	const failed = Boolean(options?.failed);
	const text = stripAnsi(coerceToText(rawOutput).replace(/^\uFEFF/, ""));
	if (!text) return "";
	if (text.length <= budget) return text;
	const parsed = parseEnvelopeValueFromText(text, budget, failed);
	if (parsed) return parsed.summary;
	return truncateAtWord(collapseWhitespace(text), budget);
}
