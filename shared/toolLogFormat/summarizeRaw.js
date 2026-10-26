export function summarizeRaw(record) {
	const evidence =
		record && typeof record.evidence === "object" ? record.evidence : {};
	const wireType =
		typeof evidence.wireType === "string" && evidence.wireType
			? evidence.wireType
			: "event";
	const reason =
		typeof evidence.reason === "string" && evidence.reason
			? `: ${evidence.reason}`
			: "";
	return `[RAW] ${wireType}${reason}`;
}
