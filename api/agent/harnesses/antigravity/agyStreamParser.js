/**
 * MARK: agyStreamParser
 * @description Pure, incremental NDJSON parser for the agy CLI's
 *   `--output-format stream-json` wire format (one JSON object per line, with
 *   an `event` discriminator: `init`, `step_update`, `result`). Parsing and
 *   event MAPPING are deliberately separate: this module only knows raw agy
 *   event names and hands the mapper (`agyEventMapper.js`) well-typed rows.
 *   The parser performs no I/O, so it is unit-testable without the CLI.
 *
 *   Wire-format notes (verified live against agy 1.5.18 stream-json):
 *   - `init` carries top-level `conversation_id` plus its payload nested
 *     under the `init` key;
 *   - `step_update` / `result` nest EVERYTHING (framing fields AND payload)
 *     under the event-named key — older shapes carried the framing fields
 *     (`conversation_id`, `step_index`, `state`, `step_type`) flat at the
 *     top level, which this parser still accepts as a fallback.
 *   To tolerate wire-shape drift, each parsed row's payload is a merged view:
 *   the nested key (when present) wins over the flat fields — and the
 *   framing fields read nested-first with the same flat fallback.
 */

import {
	createJsonLinesParser,
	DEFAULT_MAX_LINE_BYTES,
} from "../shared/harnessScaffold.js";

/***
 * MARK: AGY_STREAM_EVENT_NAMES
 * @description The raw agy stream-JSON event discriminators the parser accepts.
 *   These names MUST NOT leak past the antigravity harness folder (enforced by
 *   api/agent/harnessBoundary.test.js).
 ***/
export const AGY_STREAM_EVENT_NAMES = Object.freeze([
	"init",
	"step_update",
	"result",
]);

const AGY_STREAM_EVENTS = new Set(AGY_STREAM_EVENT_NAMES);

/***
 * MARK: createAgyStreamParser
 * @description Builds an incremental NDJSON parser for an agy stdout stream.
 *   Feed stdout chunks to `push` (returns the events completed by that chunk);
 *   call `flush` when the stream ends to collect a final unterminated line.
 *   Chunk→line framing (tolerances, oversized-line cap, counters) is owned by
 *   the shared scaffold (`../shared/harnessScaffold.js`); this module owns
 *   ONLY the agy wire classification (the `event` discriminator + row shape),
 *   so raw agy names never leave the antigravity folder.
 * @example const parser = createAgyStreamParser();
 * @example parser.push('{"event":"init", ...}\\n') => [parsedRow]
 * @example parser.push('{"event":"resu'); parser.push('lt"}\\n') => [parsedRow]
 * @param {Object} [opts]
 * @param {number} [opts.maxLineBytes] - Single-line byte cap (default 1 MiB).
 * @returns {Object} The parser: { push(chunk), flush(), stats() }.
 ***/
export function createAgyStreamParser({
	maxLineBytes = DEFAULT_MAX_LINE_BYTES,
} = {}) {
	return createJsonLinesParser({ maxLineBytes, classify: classifyAgyLine });
}

/***
 * MARK: frameField (internal)
 * @description Reads one framing field nested-first with flat fallback: the
 *   live CLI nests framing under the event-named key, older shapes carry it
 *   flat — nested wins when well-typed, otherwise the top-level value wins.
 ***/
function frameField(frame, json, key, want) {
	// eslint-disable-next-line security/detect-object-injection -- key is a module-level framing constant below, never user input
	const fromNested = frame?.[key];
	if (typeof fromNested === want) return fromNested;
	// eslint-disable-next-line security/detect-object-injection -- key is a module-level framing constant below, never user input
	const fromTop = json[key];
	return typeof fromTop === want ? fromTop : null;
}

/***
 * MARK: classifyAgyLine (internal)
 * @description Classifies one parsed JSON object into a well-typed agy row,
 *   or returns null for unknown discriminators (counted as droppedUnknown by
 *   the framing — forward tolerance, never thrown on).
 ***/
function classifyAgyLine(json) {
	const event = json.event;
	if (typeof event !== "string" || !AGY_STREAM_EVENTS.has(event)) {
		return null;
	}
	// eslint-disable-next-line security/detect-object-injection -- event is one of AGY_STREAM_EVENT_NAMES, validated by the discriminator check above
	const nested = json[event];
	const frame =
		nested && typeof nested === "object" && !Array.isArray(nested)
			? nested
			: null;
	return {
		event,
		payload: buildPayload(json, event),
		conversationId: frameField(frame, json, "conversation_id", "string"),
		stepIndex: frameField(frame, json, "step_index", "number"),
		state: frameField(frame, json, "state", "string"),
		stepType: frameField(frame, json, "step_type", "string"),
	};
}

/***
 * MARK: buildPayload (internal)
 * @description Merges the flat line fields and the event-named payload key
 *   (when nested, e.g. `init: {...}`) into one payload object; nested wins.
 ***/
function buildPayload(json, event) {
	const { event: _discriminator, ...flat } = json;
	// eslint-disable-next-line security/detect-object-injection -- event is one of AGY_STREAM_EVENT_NAMES, validated by the discriminator check above
	const nested = json[event];
	if (nested && typeof nested === "object" && !Array.isArray(nested)) {
		return { ...flat, ...nested };
	}
	return flat;
}
