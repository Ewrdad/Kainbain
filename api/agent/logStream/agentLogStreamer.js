/***
 * MARK: agentLogStreamer
 * @description A pure, harness-agnostic log streamer for agent stages. It
 *   consumes the engine's NORMALIZED agent-event vocabulary
 *   (`api/agent/sessionEvents.js`) and produces grouped, structured log
 *   entries — one entry per semantic block (assistant text block, thinking
 *   block, tool call, tool result, error, system line) instead of one fragment
 *   per streamed token.
 *
 *   The event→record conversion lives in the unified log processor
 *   (`./logProcessor.js`) — this module is a thin state machine shell that
 *   owns feed plumbing (`consumeFeed`/`snapshot`/`renderText`/`renderFeed`)
 *   and delegates every event to the processor. See the processor for the
 *   normalized event contract and grouping semantics.
 *
 *   # Feeds
 *
 *   Entries are placed on one or more dedicated feeds (`main`, `thinking`,
 *   `tools`, plus the unified lanes `telemetry` and `raw`) so each consumer
 *   can pull its own stream: the main feed is the narrative (assistant text,
 *   tool call lines, errors, system lines, permission/plan lines), the
 *   thinking feed carries full thinking blocks, the tools feed carries tool
 *   calls with full args plus tool output, the telemetry feed carries usage
 *   records, and the raw feed carries bounded unmapped wire evidence.
 *   `consumeFeed` hands each entry to exactly one consumer per feed;
 *   `snapshot` gives the full structured view.
 *
 *   # Rendering (backwards compatibility)
 *
 *   `renderText()` renders the legacy tag grammar (`[AGENT]`, `[TOOL]`,
 *   `[RESULT]`, `[ERROR]`, `[THINKING]`, `[INFO]`) as complete lines/blocks —
 *   a pure derived view over the structured entries via the shared renderer
 *   (`renderLogEntriesText` in `api/watch/processLogs.js`); nothing is stored
 *   as text. The existing line-based tag filters and severity coloring keep
 *   working against the rendered view. Thinking is collapsed to a
 *   `[THINKING] (N chars)` marker on the main feed
 *   by default (`hideThinking: false` opts into full thinking text there).
 *
 * @example
 *   const streamer = createAgentLogStreamer({ hideThinking: true });
 *   const appended = streamer.handleEvent({ type: "assistant_delta", assistantMessageEvent: { type: "text_delta", delta: "Hello" } });
 *   // appended === [] (buffering; no token fragments leak out)
 *   streamer.handleEvent({ type: "assistant_delta", assistantMessageEvent: { type: "text_end" } });
 *   // next call returns [{ kind: "assistant", feed: "main", text: "Hello", ... }]
 ***/
import { renderLogEntriesText } from "../../watch/processLogs.js";
import {
	createLogProcessor,
	DEFAULT_PROCESSOR_OPTIONS,
} from "./logProcessor.js";

/***
 * MARK: DEFAULT_STREAMER_OPTIONS
 * @description Default options for `createAgentLogStreamer`. `maxEntryBytes`
 *   is 0 (uncapped) so the streamer never truncates narrative text; task-log
 *   growth is bounded by the structured-entry cap (`config.logEntriesMaxCount`)
 *   rather than a byte cap. Consumers that need a hard per-entry bound (e.g.
 *   live push payloads) can set it explicitly. Lane budgets
 *   (`telemetryMaxCount`, `rawMaxCount`, `rawMaxBytes`) bound the unified
 *   telemetry/raw lanes inside the total cap.
 ***/
export const DEFAULT_STREAMER_OPTIONS = Object.freeze({
	feeds: Object.freeze(["main", "thinking", "tools", "telemetry", "raw"]),
	hideThinking: DEFAULT_PROCESSOR_OPTIONS.hideThinking,
	toolArgsMaxLength: DEFAULT_PROCESSOR_OPTIONS.toolArgsMaxLength,
	resultMaxLength: DEFAULT_PROCESSOR_OPTIONS.resultMaxLength,
	maxEntryBytes: DEFAULT_PROCESSOR_OPTIONS.maxEntryBytes,
	maxEntries: DEFAULT_PROCESSOR_OPTIONS.maxEntries,
	telemetryMaxCount: DEFAULT_PROCESSOR_OPTIONS.telemetryMaxCount,
	rawMaxCount: DEFAULT_PROCESSOR_OPTIONS.rawMaxCount,
	rawMaxBytes: DEFAULT_PROCESSOR_OPTIONS.rawMaxBytes,
	harnessId: DEFAULT_PROCESSOR_OPTIONS.harnessId,
	model: DEFAULT_PROCESSOR_OPTIONS.model,
	runId: DEFAULT_PROCESSOR_OPTIONS.runId,
});

const KNOWN_FEEDS = new Set(["main", "thinking", "tools", "telemetry", "raw"]);

/***
 * MARK: createAgentLogStreamer
 * @description Creates a grouped log streamer for one agent stage run. The
 *   streamer is pure: no harness imports, no I/O — it only transforms the
 *   normalized agent-event vocabulary into structured entries and rendered
 *   text views (via the unified log processor).
 * @example
 *   const streamer = createAgentLogStreamer({ hideThinking: true });
 *   streamer.handleEvent({ type: "run_started" });
 *   streamer.system("[AGENT] Working on git branch 'kb/1'");
 *   const entries = streamer.snapshot().entries;
 * @param {Object} [options]
 * @param {string[]} [options.feeds] - Dedicated feeds to maintain (default main/thinking/tools/telemetry/raw).
 * @param {boolean} [options.hideThinking] - Collapse thinking on the main feed to a sized marker (default true).
 * @param {number} [options.toolArgsMaxLength] - Max chars of rendered args on the [TOOL] line (default 400).
 * @param {number} [options.resultMaxLength] - Max chars of a [RESULT] excerpt (default 600).
 * @param {number} [options.maxEntryBytes] - Hard cap per entry text; 0 disables (default 0).
 * @param {number} [options.maxEntries] - Total entries retained; older ones are evicted under a marker (default 500).
 * @param {number} [options.telemetryMaxCount] - Telemetry records retained (default 100).
 * @param {number} [options.rawMaxCount] - Raw evidence records retained (default 50).
 * @param {number} [options.rawMaxBytes] - Per-record raw source cap (default 8192).
 * @param {string} [options.harnessId] - Harness identity stamped on records.
 * @param {string} [options.model] - Model ref stamped on records.
 * @param {string} [options.runId] - Run/conversation id stamped on records.
 * @returns {Object} Streamer with handleEvent/system/consumeFeed/snapshot/renderText/renderFeed.
 ***/
export function createAgentLogStreamer(options = {}) {
	const merged = { ...DEFAULT_STREAMER_OPTIONS, ...options };
	const feeds = (
		Array.isArray(merged.feeds) ? merged.feeds : DEFAULT_STREAMER_OPTIONS.feeds
	).filter((f) => KNOWN_FEEDS.has(f));
	const processor = createLogProcessor(merged);

	/** Per-feed consumption bookmarks: each feed's entries are delivered once. */
	const consumedByFeed = new Map(feeds.map((f) => [f, new Set()]));
	const entries = processor.entries;

	/***
	 * MARK: streamer.handleEvent
	 * @description Consumes one normalized agent event and returns the entries
	 *   appended by it (in order). Token deltas buffer internally and only
	 *   surface when their block completes. Unknown wire events are captured
	 *   into the bounded raw lane (never silently dropped).
	 * @example streamer.handleEvent({ type: "run_started" }) => []
	 * @param {Object|null} event - A normalized agent event (sessionEvents.js vocabulary).
	 * @returns {Array<Object>} The entries appended now.
	 ***/
	function handleEvent(event) {
		return processor.handleEvent(event);
	}

	/***
	 * MARK: streamer.system
	 * @description Appends a system/status line (runner-emitted [AGENT]/[WARN]
	 *   messages) to the main feed so it appears in the structured entries too.
	 * @example streamer.system("[AGENT] Agent reasoning with model deepseek…")
	 * @param {string} text
	 * @param {string} [kind] - Entry kind, defaults to "system".
	 * @returns {Object} The appended entry.
	 ***/
	function system(text, kind = "system") {
		return processor.system(text, kind);
	}

	/***
	 * MARK: streamer.consumeFeed
	 * @description Pull-based dedicated feed: returns the entries placed on
	 *   `feed` that this feed's consumer has not received yet, handing each
	 *   entry to exactly one consumer per feed. A second consume returns empty
	 *   until new entries arrive.
	 * @example streamer.consumeFeed("thinking") => [thinkingEntry]
	 * @param {string} feed - One of the configured feeds (main/thinking/tools/telemetry/raw).
	 * @returns {Array<Object>} The newly available entries for that feed.
	 ***/
	function consumeFeed(feed) {
		if (!consumedByFeed.has(feed)) {
			throw new Error(
				`Unknown log feed '${feed}' (configured: ${feeds.join(", ")})`,
			);
		}
		const consumed = consumedByFeed.get(feed);
		const delivered = entries.filter(
			(e) => e.feeds.includes(feed) && !consumed.has(e.id),
		);
		for (const entry of delivered) consumed.add(entry.id);
		return delivered;
	}

	/***
	 * MARK: streamer.snapshot
	 * @description Structured snapshot of everything logged so far: the flat
	 *   entry list plus each configured feed's placed entries.
	 * @example streamer.snapshot() => { entries: [...], feeds: { main: [...], thinking: [...], tools: [...] } }
	 * @returns {{entries: Array<Object>, feeds: Object<string, Array<Object>>}}
	 ***/
	function snapshot() {
		const feedsSnapshot = Object.fromEntries(
			feeds.map((feed) => [feed, entries.filter((e) => e.feeds.includes(feed))]),
		);
		return { entries: [...entries], feeds: feedsSnapshot };
	}

	/***
	 * MARK: streamer.renderText
	 * @description Renders the combined log text as a pure derived view over
	 *   the structured entries (via the shared `renderLogEntriesText`):
	 *   every main/tools entry in order, thinking collapsed to its marker.
	 *   Telemetry and raw lanes never leak into the narrative view. Legacy
	 *   tag prefixes are preserved. Nothing is stored — task log storage is
	 *   the structured entries alone.
	 * @example streamer.renderText() => "[AGENT] reasoning…\n[TOOL] bash(…)\n[RESULT] ok"
	 * @returns {string}
	 ***/
	function renderText() {
		return renderLogEntriesText(entries);
	}

	/***
	 * MARK: streamer.renderFeed
	 * @description Renders one feed's entries as text (derived view via the
	 *   shared `renderLogEntriesText`).
	 * @example streamer.renderFeed("tools") => "[TOOL] bash(…)\n[RESULT] ok"
	 * @param {string} feed
	 * @returns {string}
	 ***/
	function renderFeed(feed) {
		if (!consumedByFeed.has(feed)) {
			throw new Error(
				`Unknown log feed '${feed}' (configured: ${feeds.join(", ")})`,
			);
		}
		return renderLogEntriesText(entries, { feed });
	}

	return {
		handleEvent,
		system,
		consumeFeed,
		snapshot,
		renderText,
		renderFeed,
	};
}
