import { normalizeBudget } from "./normalizeBudget.js";
import { stripAnsi } from "./stripAnsi.js";
import { truncateAtWord } from "./truncateAtWord.js";
import { DEFAULT_START_SUMMARY_LENGTH } from "./constants.js";
import { pickPrimaryArg } from "./pickPrimaryArg.js";

export function summarizeToolStart(toolName, args, options = {}) {
	const budget = normalizeBudget(options?.maxLength, DEFAULT_START_SUMMARY_LENGTH);
	if (args === null || args === undefined) return "";
	if (typeof args === "string") {
		const clean = stripAnsi(args);
		return clean.length <= budget ? clean : truncateAtWord(clean, budget);
	}
	let json;
	try {
		json = JSON.stringify(args);
	} catch {
		return "…";
	}
	if (!json) return "";
	if (json.length <= budget) return json;
	const primary = pickPrimaryArg(toolName, args);
	if (primary) {
		if (primary.length + 2 <= budget) return `${primary} …`;
		return truncateAtWord(primary, budget);
	}
	return truncateAtWord(json, budget);
}
