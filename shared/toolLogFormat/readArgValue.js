import { collapseWhitespace } from "./collapseWhitespace.js";

export function readArgValue(value) {
	if (typeof value === "string") {
		const collapsed = collapseWhitespace(value);
		return collapsed || null;
	}
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
		const collapsed = collapseWhitespace(value.join(" "));
		return collapsed || null;
	}
	return null;
}
