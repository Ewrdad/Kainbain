import { normalizeBudget } from "./normalizeBudget.js";
import { stripAnsi } from "./stripAnsi.js";
import { truncateAtWord } from "./truncateAtWord.js";
import { readArgValue } from "./readArgValue.js";
import { collapseWhitespace } from "./collapseWhitespace.js";
import { DEFAULT_RESULT_SUMMARY_LENGTH } from "./constants.js";


function firstFiniteNumber(values) {
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return null;
}

function firstNonBlankString(values) {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value;
	}
	return null;
}

function readEnvelopeCommand(parsed) {
	return readArgValue(parsed.command) || readArgValue(parsed.cmd);
}

function readEnvelopePath(parsed) {
	return (
		readArgValue(parsed.path) ||
		readArgValue(parsed.file) ||
		readArgValue(parsed.filePath) ||
		readArgValue(parsed.filename)
	);
}

function readEnvelopeExit(parsed) {
	return firstFiniteNumber([parsed.exit_code, parsed.exitCode, parsed.code]);
}

function readEnvelopeOutput(parsed) {
	return firstNonBlankString([parsed.output, parsed.stdout]);
}

function readEnvelopeError(parsed) {
	return firstNonBlankString([parsed.stderr, parsed.error]);
}

function formatDurationSeconds(seconds) {
	if (Number.isInteger(seconds)) return `${seconds}s`;
	return `${seconds.toFixed(1)}s`;
}

function readEnvelopeDuration(parsed) {
	const ms = firstFiniteNumber([parsed.duration_ms, parsed.durationMs]);
	if (ms !== null) return formatDurationSeconds(ms / 1000);
	const seconds = firstFiniteNumber([parsed.duration_seconds, parsed.durationSeconds]);
	if (seconds !== null) return formatDurationSeconds(seconds);
	const raw = parsed.duration;
	if (typeof raw === "string" && raw.trim() && raw.trim().length <= 12) {
		return raw.trim();
	}
	return null;
}

function nonEmptyLines(text) {
	return String(text || "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function lastNonEmptyLine(text) {
	const lines = nonEmptyLines(text);
	return lines.length > 0 ? lines[lines.length - 1] : "";
}

function firstNonEmptyLine(text) {
	const lines = nonEmptyLines(text);
	return lines.length > 0 ? lines[0] : "";
}

function fitHeadedSummary(head, body, budget) {
	let candidate;
	if (!body) {
		candidate = head;
	} else if (head.length + 2 + body.length <= budget) {
		candidate = `${head}: ${body}`;
	} else if (head.length + 2 < budget) {
		candidate = `${head}: ${truncateAtWord(body, budget - head.length - 2)}`;
	} else {
		candidate = head;
	}
	return truncateAtWord(candidate, budget);
}

function summarizeBashEnvelope(parsed, command, budget, failed) {
	const exit = readEnvelopeExit(parsed);
	const output = readEnvelopeOutput(parsed);
	const errorText = readEnvelopeError(parsed);
	const failedRun = failed || (exit !== null && exit !== 0);
	const body = failedRun ? errorText || output || "" : output || errorText || "";
	const tail = lastNonEmptyLine(body);
	const duration = readEnvelopeDuration(parsed);
	let head = `$ ${command}`;
	if (exit !== null) {
		head += ` (exit ${exit}${duration ? `, ${duration}` : ""})`;
	} else if (duration) {
		head += ` (${duration})`;
	}
	if (head.length > budget) {
		return {
			kind: "bash",
			summary: truncateAtWord(`$ ${command}`, budget),
			detail: body.trim() || head,
		};
	}
	return {
		kind: "bash",
		summary: fitHeadedSummary(head, tail, budget),
		detail: body.trim() || head,
	};
}

function summarizeFileEnvelope(parsed, path, budget) {
	const lines = firstFiniteNumber([parsed.linesChanged, parsed.changedLines, parsed.lines]);
	const bytes = firstFiniteNumber([parsed.bytesChanged, parsed.bytes]);
	let head = path;
	if (lines !== null) head += ` · ${lines} lines`;
	else if (bytes !== null) head += ` · ${bytes} bytes`;
	const message = firstNonBlankString([
		parsed.message,
		parsed.output,
		parsed.stdout,
		parsed.text,
	]);
	const messageHead = message ? firstNonEmptyLine(message) : "";
	return {
		kind: "file",
		summary: fitHeadedSummary(head, messageHead, budget),
		detail: (message || "").trim() || head,
	};
}

function renderPairValue(value) {
	if (typeof value === "string") return value;
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	if (value === null) return "null";
	try {
		const json = JSON.stringify(value);
		return typeof json === "string" ? json : String(value);
	} catch {
		return String(value);
	}
}

function summarizeGenericEnvelope(parsed, rawText, budget) {
	const pairs = [];
	for (const [key, value] of Object.entries(parsed)) {
		if (value === undefined || typeof value === "function" || typeof value === "symbol") {
			continue;
		}
		pairs.push(`${key}: ${renderPairValue(value)}`);
		if (pairs.length >= 12) break;
	}
	return {
		kind: "generic",
		summary: truncateAtWord(pairs.length > 0 ? pairs.join(", ") : rawText, budget),
		detail: rawText,
	};
}

function summarizeListEnvelope(items, rawText, budget) {
	const allScalar = items.every(
		(item) =>
			typeof item === "string" ||
			typeof item === "number" ||
			typeof item === "boolean" ||
			item === null,
	);
	if (!allScalar) {
		return { kind: "list", summary: truncateAtWord(rawText, budget), detail: rawText };
	}
	const joined = items
		.map((item) => (item === null ? "null" : String(item)))
		.join(", ");
	return { kind: "list", summary: truncateAtWord(joined, budget), detail: rawText };
}

export function parseEnvelopeValue(parsed, rawText, budget, failed) {
	if (Array.isArray(parsed)) return summarizeListEnvelope(parsed, rawText, budget);
	if (!parsed || typeof parsed !== "object") return null;
	const command = readEnvelopeCommand(parsed);
	if (command) return summarizeBashEnvelope(parsed, command, budget, failed);
	const path = readEnvelopePath(parsed);
	if (path) return summarizeFileEnvelope(parsed, path, budget);
	return summarizeGenericEnvelope(parsed, rawText, budget);
}

export function parseResultEnvelope(text, maxLength = DEFAULT_RESULT_SUMMARY_LENGTH) {
	const budget = normalizeBudget(maxLength, DEFAULT_RESULT_SUMMARY_LENGTH);
	if (typeof text !== "string") return null;
	const clean = stripAnsi(text.replace(/^\uFEFF/, ""));
	const trimmed = clean.trim();
	if (!trimmed) return null;
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}
	return parseEnvelopeValue(parsed, trimmed, budget, false);
}

export function parseEnvelopeValueFromText(text, budget, failed) {
	const trimmed = text.trim();
	if (!trimmed) return null;
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}
	return parseEnvelopeValue(parsed, trimmed, budget, failed);
}
