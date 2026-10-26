export function summarizePermission(record) {
	const event = record && typeof record === "object" ? record : {};
	const method =
		typeof event.method === "string" && event.method ? event.method : "unknown";
	const target =
		typeof event.target === "string" && event.target ? ` ${event.target}` : "";
	const decision =
		typeof event.decision === "string" && event.decision ? event.decision : null;
	return decision ? `[PERM] ${decision}: ${method}${target}` : `[PERM] request ${method}${target}`;
}
