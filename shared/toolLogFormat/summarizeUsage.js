function readUsageNumber(usage, keys) {
	if (!usage || typeof usage !== "object") return null;
	const byKey = new Map(Object.entries(usage));
	for (const key of keys) {
		if (!byKey.has(key)) continue;
		const value = byKey.get(key);
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return null;
}

export function summarizeUsage(usage) {
	if (!usage || typeof usage !== "object") return "usage unknown";
	const input = readUsageNumber(usage, ["inputTokens", "input_tokens"]);
	const output = readUsageNumber(usage, ["outputTokens", "output_tokens"]);
	const cached = readUsageNumber(usage, ["cachedTokens", "cached_tokens"]);
	const total =
		readUsageNumber(usage, ["totalTokens", "total_tokens"]) ??
		(input !== null || output !== null || cached !== null
			? (input ?? 0) + (output ?? 0) + (cached ?? 0)
			: null);
	const cost = readUsageNumber(usage, ["costUsd", "cost_usd", "cost"]);
	const contextUsed = readUsageNumber(usage, ["contextUsed", "context_used"]);
	const contextWindow = readUsageNumber(usage, [
		"contextWindow",
		"context_window",
	]);
	const fmt = (value) => (value === null ? "?" : String(value));
	let summary = `tokens=${fmt(input)}/${fmt(output)}/${fmt(total)}`;
	if (cost !== null) summary += ` cost=$${cost}`;
	if (contextUsed !== null || contextWindow !== null) {
		summary += ` context=${fmt(contextUsed)}/${fmt(contextWindow)}`;
	}
	if (summary === "tokens=?/?/?") return "usage unknown";
	return summary;
}
