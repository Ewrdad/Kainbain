/**
 * MARK: museStreamParser
 * @description Pure, incremental NDJSON parser for the Muse Code CLI's
 *   `muse exec --json` wire format (one JSON envelope per line, with a
 *   `payload_type` discriminator). Parsing and event MAPPING are deliberately
 *   separate: this module only knows raw muse payload_type names and hands
 *   the mapper (`museEventMapper.js`) well-typed rows. The parser performs
 *   no I/O, so it is unit-testable without the CLI.
 *
 *   Wire-format notes (probe-verified, AUDIT.md section 4.2):
 *   - Every line is an envelope: { schema_version, id, stream, sequence,
 *     record_type, durability, payload_type, payload }.
 *   - `run.output.delta` (the assistant text stream) arrives as
 *     record_type "status" / durability "ephemeral" — so the parser keys on
 *     `payload_type`, NEVER on `record_type === "event"` (F-02).
 *   - `task.lifecycle.*` fires many times per run and even
 *     `task.lifecycle.failed` appears in successful runs — the parser keeps
 *     them as rows; the MAPPER ignores them by design (F-01).
 */

/***
 * MARK: MUSE_PAYLOAD_TYPES
 * @description The raw muse exec-stream payload_type discriminators the
 *   parser accepts. These names MUST NOT leak past the muse harness folder
 *   (enforced by api/agent/harnessBoundary.test.js).
 ***/
export const MUSE_PAYLOAD_TYPES = Object.freeze([
	"runtime.command.accepted",
	"session.run.linked",
	"turn.input.user",
	"run.lifecycle.started",
	"run.model.configured",
	"run.output.delta",
	"run.terminal.completed",
	"run.terminal.failed",
	"tool.result",
	"task.lifecycle.output",
	"task.lifecycle.tool_output_ref",
	"task.stream.linked",
	"task.lifecycle.proposed",
	"task.lifecycle.accepted",
	"task.lifecycle.scheduled",
	"task.lifecycle.side_effect_intent",
	"task.lifecycle.started",
	"task.lifecycle.completed",
	"task.lifecycle.failed",
	"task.lifecycle.cancelled",
	"task.lifecycle.status",
]);

import {
	createJsonLinesParser,
	DEFAULT_MAX_LINE_BYTES,
} from "../shared/harnessScaffold.js";

const KNOWN_MUSE_PAYLOAD_TYPES = new Set(MUSE_PAYLOAD_TYPES);

/***
 * MARK: createMuseStreamParser
 * @description Builds an incremental NDJSON parser for a muse stdout stream.
 *   Feed stdout chunks to `push` (returns the rows completed by that chunk);
 *   call `flush` when the stream ends to collect a final unterminated line.
 *   Chunk→line framing (tolerances, oversized-line cap, counters) is owned by
 *   the shared scaffold (`../shared/harnessScaffold.js`); this module owns
 *   ONLY the muse wire classification (the `payload_type` discriminator + row
 *   shape), so raw muse names never leave the muse folder.
 * @example const parser = createMuseStreamParser();
 * @example parser.push('{"payload_type":"run.output.delta", ...}\n') => [parsedRow]
 * @param {Object} [opts]
 * @param {number} [opts.maxLineBytes] - Single-line byte cap (default 1 MiB).
 * @returns {Object} The parser: { push(chunk), flush(), stats() }.
 ***/
export function createMuseStreamParser({
	maxLineBytes = DEFAULT_MAX_LINE_BYTES,
} = {}) {
	return createJsonLinesParser({ maxLineBytes, classify: classifyMuseLine });
}

/***
 * MARK: classifyMuseLine (internal)
 * @description Classifies one parsed JSON envelope into a well-typed muse
 *   row, or returns null for unknown payload_types (counted as
 *   droppedUnknown by the framing — forward tolerance, never thrown on).
 ***/
function classifyMuseLine(json) {
	const payloadType = json.payload_type;
	if (typeof payloadType !== "string" || !KNOWN_MUSE_PAYLOAD_TYPES.has(payloadType)) {
		return null;
	}
	return {
		payloadType,
		recordType: typeof json.record_type === "string" ? json.record_type : null,
		durability: typeof json.durability === "string" ? json.durability : null,
		sequence: typeof json.sequence === "number" ? json.sequence : null,
		payload:
			json.payload && typeof json.payload === "object" ? json.payload : {},
	};
}
