import { toolFamily, COMMAND_ARG_KEYS, PATH_ARG_KEYS } from "./toolFamilies.js";
import { readArgValue } from "./readArgValue.js";

export function pickPrimaryArg(toolName, args) {
	if (!args || typeof args !== "object" || Array.isArray(args)) return null;
	const family = toolFamily(toolName);
	const wanted =
		family === "bash"
			? [...COMMAND_ARG_KEYS, ...PATH_ARG_KEYS]
			: family === "file"
				? [...PATH_ARG_KEYS, ...COMMAND_ARG_KEYS]
				: [];
	if (wanted.length === 0) return null;
	const byKey = new Map(Object.entries(args));
	for (const key of wanted) {
		if (!byKey.has(key)) continue;
		const value = readArgValue(byKey.get(key));
		if (value) return value;
	}
	return null;
}
