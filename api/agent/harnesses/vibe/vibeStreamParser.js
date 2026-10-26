/**
 * MARK: vibeStreamParser
 * @description Pure, incremental NDJSON parser for Mistral Vibe's
 *   `--output streaming` wire format (one JSON message object per line, with
 *   a `type` discriminator). Parsing and event MAPPING are deliberately
 *   separate: this module only knows raw vibe type names and hands the
 *   mapper (`vibeEventMapper.js`) well-typed rows. The parser performs no
 *   I/O, so it is unit-testable without the CLI.
 *
 *   Wire-format notes (probe-verified 2026-10-12, `vibe --help` + live
 *   `--prompt … --output streaming` runs; seeds in `fixtures/`):
 *   - Every line is a message object: `{ id, sessionId, turnId,
 *     inputEntryId, type: "message"|"effect"|"reasoning", role, content[],
 *     source, generationStatus, … }`.
 *   - `type: "message"` with `role: "user"` echoes the prompt
 *     (`source: "turn_start"`); `role: "assistant"` carries the answer
 *     text in `content[]` (`source: "harness"`).
 *   - `type: "effect"` is one executed tool call (`title`,
 *     `detail.toolName`, `detail.display`, `state.status/outputText`).
 *   - `type: "reasoning"` carries the model's private chain-of-thought
 *     (`text`/`summary`) — never surfaced to the engine.
 *   - There is NO terminal record on stdout: process exit (0 finished,
 *     1 usage/config error, 2 infrastructure failure, 3 stopped by a
 *     limit) plus `--output-dir/export.json` (`outcome`, `stop_reason`,
 *     `usage`, `cost_usd`) is the terminal signal — see `vibeHarness.js`.
 */

import {
	createJsonLinesParser,
	DEFAULT_MAX_LINE_BYTES,
} from "../shared/harnessScaffold.js";

/***
 * MARK: VIBE_ROW_TYPES
 * @description The raw vibe streaming `type` discriminators the parser
 *   accepts. These names MUST NOT leak past the vibe harness folder
 *   (enforced by api/agent/harnessBoundary.test.js — scanned via the
 *   distinctive wire markers `generationStatus`, `userDisplayContent`,
 *   `relatedEntryId`, `inputEntryId`, which appear nowhere else in the
 *   engine).
 ***/
export const VIBE_ROW_TYPES = Object.freeze(["message", "effect", "reasoning"]);

/***
 * MARK: VIBE_ASSISTANT_TEXT_KINDS
 * @description Content-block kinds inside an assistant `message` row whose
 *   `text` contributes to the visible answer. Unknown block kinds are
 *   skipped by the mapper (counted, never thrown on).
 ***/
export const VIBE_ASSISTANT_TEXT_KINDS = Object.freeze(["text"]);

const KNOWN_VIBE_ROW_TYPES = new Set(VIBE_ROW_TYPES);

/***
 * MARK: VIBE_ENVELOPE_FIELDS
 * @description Distinctive vibe envelope field names preserved verbatim on
 *   every parsed row. They carry per-message bookkeeping (completion
 *   status, entry linkage, display hints) the mapper does not interpret
 *   today but future mapping may need — and their quoted presence here is
 *   what `api/agent/harnessBoundary.test.js` scans for, so the raw vibe
 *   wire vocabulary cannot leak past the vibe folder unnoticed.
 ***/
const VIBE_ENVELOPE_FIELDS = Object.freeze([
	"generationStatus",
	"userDisplayContent",
	"relatedEntryId",
	"inputEntryId",
]);

/***
 * MARK: createVibeStreamParser
 * @description Builds an incremental NDJSON parser for a vibe stdout
 *   stream. Feed stdout chunks to `push` (returns the rows completed by
 *   that chunk); call `flush` when the stream ends to collect a final
 *   unterminated line. Chunk→line framing (tolerances, oversized-line cap,
 *   counters) is owned by the shared scaffold
 *   (`../shared/harnessScaffold.js`); this module owns ONLY the vibe wire
 *   classification (the `type` discriminator + row shape), so raw vibe
 *   names never leave the vibe folder.
 * @example const parser = createVibeStreamParser();
 * @example parser.push('{"type":"message","role":"assistant",…}\n') => [parsedRow]
 * @param {Object} [opts]
 * @param {number} [opts.maxLineBytes] - Single-line byte cap (default 1 MiB).
 * @returns {Object} The parser: { push(chunk), flush(), stats() }.
 ***/
export function createVibeStreamParser({
	maxLineBytes = DEFAULT_MAX_LINE_BYTES,
} = {}) {
	return createJsonLinesParser({ maxLineBytes, classify: classifyVibeLine });
}

/***
 * MARK: classifyVibeLine (internal)
 * @description Classifies one parsed JSON message object into a well-typed
 *   vibe row, or returns null for unknown `type` values (counted as
 *   droppedUnknown by the framing — forward tolerance, never thrown on).
 ***/
function classifyVibeLine(json) {
	const rowType = json.type;
	if (typeof rowType !== "string" || !KNOWN_VIBE_ROW_TYPES.has(rowType)) {
		return null;
	}
	const row = {
		rowType,
		id: typeof json.id === "string" ? json.id : null,
		sessionId: typeof json.sessionId === "string" ? json.sessionId : null,
		turnId: typeof json.turnId === "string" ? json.turnId : null,
		role: typeof json.role === "string" ? json.role : null,
		content: Array.isArray(json.content) ? json.content : null,
		text: typeof json.text === "string" ? json.text : null,
		title: typeof json.title === "string" ? json.title : null,
		detail:
			json.detail && typeof json.detail === "object" ? json.detail : null,
		state: json.state && typeof json.state === "object" ? json.state : null,
		source: typeof json.source === "string" ? json.source : null,
	};
	for (const field of VIBE_ENVELOPE_FIELDS) {
		// eslint-disable-next-line security/detect-object-injection -- field comes from the frozen envelope list above, never user input
		row[field] = json[field] ?? null;
	}
	return row;
}
