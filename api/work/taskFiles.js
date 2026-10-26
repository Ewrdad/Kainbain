// Domain: The Work — reading task markdown and its recorded fields.
import { _sanitizeTaskTitle } from "./taskIdentity.js";
/***
 * MARK: safeParseJsonArray
 * @description Parses a JSON array string defensively, returning an empty array
 *   on any parse failure instead of throwing.
 * @example safeParseJsonArray("[\"a\",\"b\"]") => ["a", "b"]
 * @param {string} str
 * @returns {string[]}
 ***/
export function safeParseJsonArray(str) {
	try {
		const parsed = JSON.parse(str || "[]");
		return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
	} catch {
		return [];
	}
}

/***
 * MARK: parseStoredRecords
 * @description Reads optional structured records without accepting malformed or scalar values.
 * @example parseStoredRecords('[{"duration":12}]') => [{ duration: 12 }]
 ***/
export function parseStoredRecords(str) {
	try {
		const records = JSON.parse(str || "[]");
		return Array.isArray(records)
			? records.filter(
					(record) => record && typeof record === "object" && !Array.isArray(record),
				)
			: [];
	} catch {
		return [];
	}
}

/***
 * MARK: _formatFrontmatterValue
 * @description Safely serializes a value for YAML frontmatter.
 * @example _formatFrontmatterValue("Task 'A'") => '"Task \'A\'"'
 * @param {*} val
 * @returns {string}
 ***/
export function _formatFrontmatterValue(val) {
	if (val === null || val === undefined) return '""';
	if (typeof val === "number" || typeof val === "boolean") return String(val);
	const str = String(val).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	return `"${str}"`;
}

/***
 * MARK: _parseFrontmatter
 * @description Extracts YAML frontmatter key-value pairs and markdown body.
 * @example _parseFrontmatter("---\nid: 1\n---\n# Body") => { data: { id: "1" }, content: "# Body" }
 * @param {string} text
 * @returns {{ data: Object, content: string }}
 ***/
export function _parseFrontmatter(text) {
	const data = {};
	if (!text || typeof text !== "string") return { data, content: "" };
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { data, content: text };
	}
	const rawYaml = match[1];
	const content = match[2] || "";
	const lines = rawYaml.split(/\r?\n/);
	/* eslint-disable security/detect-object-injection */
	for (const line of lines) {
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;
		const key = line.slice(0, colonIdx).trim();
		let val = line.slice(colonIdx + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
		}
		if (key === "title") {
			val = _sanitizeTaskTitle(val);
		}
		data[key] = val;
	}
	/* eslint-enable security/detect-object-injection */
	return { data, content };
}
