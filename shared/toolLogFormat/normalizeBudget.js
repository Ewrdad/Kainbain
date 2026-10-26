export function normalizeBudget(value, fallback) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return fallback;
	}
	return Math.floor(value);
}
