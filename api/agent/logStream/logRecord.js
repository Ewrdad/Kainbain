/**
 * MARK: logRecord
 * @description The canonical log record of the unified log platform: one
 *   additive superset shape for every harness log entry. Legacy entries
 *   (`{ id, ts, feed, feeds, kind, turn, text, meta }`) keep working
 *   untouched; the new optional fields carry everything the old 8-event
 *   pipeline dropped (usage telemetry, permissions, plans, raw evidence,
 *   typed tool payloads).
 *
 *   Pure module: zero dependencies, no harness imports. The log processor
 *   (`logProcessor.js`) is the single producer; routes and the UI model
 *   upgrade stored entries at read time via `normalizeRecord` (storage is
 *   never rewritten).
 *
 *   ```js
 *   {
 *     // unchanged (every existing reader keeps working)
 *     id, ts, feed, feeds, kind, turn, text, meta,
 *
 *     // ADDITIVE (absent for legacy entries until normalizeRecord runs)
 *     seq,        // monotonic within the stage run
 *     blockId,    // stable id for a semantic block (text/thinking/tool)
 *     runId,      // harness run/conversation id when available
 *     harnessId,  // "pi" | "opencode" | "vibe" | "antigravity" | "muse" | "custom" | "mock"
 *     model,      // resolved model ref
 *     fidelity,   // "exact" | "normalized" | "synthesized"
 *     evidence,   // { wireType, sourceEvent, reason? } — bounded raw lane
 *     tool,       // { callId, name, args, result, exitCode, durationMs, partials }
 *     usage,      // { inputTokens, outputTokens, cachedTokens, totalTokens, costUsd,
 *                 //   contextUsed, contextWindow, steps, tokensPerSecond, model }
 *   }
 *   ```
 *
 *   Kinds: `assistant | thinking | tool | error | system` (original) plus
 *   `telemetry | permission | plan | raw` (unified platform). Feeds:
 *   `main | thinking | tools` (original) plus `telemetry | raw`.
 */

/***
 * MARK: RECORD_LIMITS
 * @description Shared caps for the unified log platform. `logEntriesMaxCount`
 *   stays the total bound; the lane budgets below subdivide it so a flood of
 *   raw wire rows can never evict the narrative, and telemetry (tiny records)
 *   keeps a reserved budget.
 ***/
export const RECORD_LIMITS = Object.freeze({
	telemetryMaxCount: 100,
	rawMaxCount: 50,
	rawMaxBytes: 8192,
	maxEntryBytes: 0,
});

/***
 * MARK: KNOWN_RECORD_KINDS
 * @description Every entry kind the unified platform produces.
 ***/
export const KNOWN_RECORD_KINDS = Object.freeze([
	"assistant",
	"thinking",
	"tool",
	"error",
	"system",
	"telemetry",
	"permission",
	"plan",
	"raw",
]);

/***
 * MARK: KNOWN_RECORD_FEEDS
 * @description Every feed the unified platform produces.
 ***/
export const KNOWN_RECORD_FEEDS = Object.freeze([
	"main",
	"thinking",
	"tools",
	"telemetry",
	"raw",
]);

const KNOWN_KINDS = new Set(KNOWN_RECORD_KINDS);
const KNOWN_FEEDS = new Set(KNOWN_RECORD_FEEDS);

/***
 * MARK: FIDELITY_EXACT/NORMALIZED/SYNTHESIZED
 * @description Fidelity semantics for a record's text:
 *   - `exact` — text stored verbatim (assistant/thinking/tool output blocks).
 *   - `normalized` — text reshaped from a structured payload (summaries).
 *   - `synthesized` — engine-authored status/eviction lines.
 ***/
export const FIDELITY_EXACT = "exact";
export const FIDELITY_NORMALIZED = "normalized";
export const FIDELITY_SYNTHESIZED = "synthesized";

/***
 * MARK: stripAnsiText
 * @description Removes terminal color/formatting escape sequences so stored
 *   record text reads clean. Non-strings become "". (Local copy so this
 *   module stays dependency-free; mirrors `shared/toolLogFormat.js`.)
 * @example stripAnsiText('\u001b[32mok\u001b[0m') => 'ok'
 ***/
export function stripAnsiText(text) {
	if (typeof text !== "string" || !text) return "";
	// ESC is written as an explicit \u001b escape (never a literal control
	// byte) so the pattern stays visible in diffs and editors.
	return text.replace(/\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

/***
 * MARK: scrubSecrets
 * @description Scrubs obvious secret shapes from text bound for the raw
 *   evidence lane (bearer tokens, api keys, long hex runs). Secrets are
 *   already redacted at the child-env seam; this is defense in depth for
 *   wire payloads echoed back by vendors.
 * @example scrubSecrets('Bearer abcdef1234567890') => 'Bearer [REDACTED]'
 ***/
export function scrubSecrets(text) {
	if (typeof text !== "string" || !text) return "";
	return text
		.replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDACTED]")
		.replace(
			/(api[_-]?key["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi,
			"$1[REDACTED]",
		)
		.replace(/sk-(live|test)-[A-Za-z0-9]{8,}/g, "sk-[REDACTED]")
		.replace(/xox[baprs]-[A-Za-z0-9-]{8,}/g, "xox-[REDACTED]");
}

/***
 * MARK: boundRawSource
 * @description Bounds + scrubs a raw wire payload for the evidence lane:
 *   JSON-encoded (when possible), secrets scrubbed, capped at `rawMaxBytes`
 *   with an ellipsis. Never throws, never returns "" for a real payload.
 ***/
export function boundRawSource(sourceEvent, maxBytes = RECORD_LIMITS.rawMaxBytes) {
	let text;
	if (typeof sourceEvent === "string") {
		text = sourceEvent;
	} else {
		try {
			text = JSON.stringify(sourceEvent);
		} catch {
			try {
				text = String(sourceEvent);
			} catch {
				text = "[unserializable wire event]";
			}
		}
	}
	const cap = maxBytes > 0 ? maxBytes : RECORD_LIMITS.rawMaxBytes;
	const scrubbed = scrubSecrets(text);
	if (scrubbed.length <= cap) return scrubbed;
	return `${scrubbed.slice(0, cap)}…`;
}

/***
 * MARK: isKnownFidelity
 * @description Whether a value is one of the three fidelity markers the
 *   platform produces. Anything else (typos, vendor strings) falls back to
 *   the kind-derived default in `makeLogRecord`.
 * @example isKnownFidelity("exact") => true
 ***/
export function isKnownFidelity(value) {
	return (
		value === FIDELITY_EXACT ||
		value === FIDELITY_NORMALIZED ||
		value === FIDELITY_SYNTHESIZED
	);
}

/***
 * MARK: fidelityForKind
 * @description Default fidelity for a legacy entry upgraded by
 *   `normalizeRecord`: verbatim text blocks are exact, summary/system lines
 *   are normalized/synthesized.
 ***/
export function fidelityForKind(kind) {
	if (kind === "assistant" || kind === "thinking") return FIDELITY_EXACT;
	if (kind === "tool") return FIDELITY_NORMALIZED;
	return FIDELITY_SYNTHESIZED;
}

/***
 * MARK: makeLogRecord
 * @description Builds one canonical record from a partial: fills defaults
 *   (timestamp, empty meta, fidelity by kind), derives `feeds` from `feed`,
 *   and passes every typed field through untouched.
 * @example makeLogRecord({ kind: "assistant", text: "hi" }) => { kind: "assistant", feed: "main", feeds: ["main"], fidelity: "exact", … }
 ***/
export function makeLogRecord(partial = {}) {
	// Fail safe: a null/non-object partial degrades to an empty system
	// record instead of throwing on property access.
	const source =
		partial && typeof partial === "object" && !Array.isArray(partial)
			? partial
			: {};
	const kind =
		typeof source.kind === "string" && KNOWN_KINDS.has(source.kind)
			? source.kind
			: "system";
	const feed =
		typeof source.feed === "string" && KNOWN_FEEDS.has(source.feed)
			? source.feed
			: "main";
	const feeds = Array.isArray(source.feeds)
		? source.feeds.filter((f) => KNOWN_FEEDS.has(f))
		: [feed];
	const turn =
		Number.isFinite(source.turn) && source.turn >= 1
			? Math.floor(source.turn)
			: 1;
	const record = {
		id: source.id ?? null,
		ts:
			typeof source.ts === "string" && source.ts
				? source.ts
				: new Date().toISOString(),
		feed,
		feeds: feeds.length > 0 ? feeds : [feed],
		kind,
		turn,
		text: typeof source.text === "string" ? source.text : "",
		// Arrays are not valid meta bags (downstream readers spread meta);
		// only plain objects pass through.
		meta:
			source.meta && typeof source.meta === "object" && !Array.isArray(source.meta)
				? source.meta
				: {},
		fidelity: isKnownFidelity(source.fidelity)
			? source.fidelity
			: fidelityForKind(kind),
	};
	// Optional typed fields: present only when the producer set them, so
	// legacy readers (and toEqual assertions on legacy shapes) see no noise.
	// Copied explicitly (not via a dynamic-key loop) so a mistyped field
	// name can never leak an undeclared property onto the record.
	if (source.seq !== undefined) record.seq = source.seq;
	if (source.blockId !== undefined) record.blockId = source.blockId;
	if (source.runId !== undefined) record.runId = source.runId;
	if (source.harnessId !== undefined) record.harnessId = source.harnessId;
	if (source.model !== undefined) record.model = source.model;
	if (source.evidence !== undefined) record.evidence = source.evidence;
	if (source.tool !== undefined) record.tool = source.tool;
	if (source.usage !== undefined) record.usage = source.usage;
	return record;
}

/***
 * MARK: normalizeRecord
 * @description Upgrades a legacy/streamer entry to the canonical shape at
 *   read time: missing `feeds` derive from `feed`, missing `fidelity`
 *   derives from `kind`, missing `meta` becomes {}. Already-canonical
 *   records pass through with their typed fields intact. Storage is never
 *   rewritten — callers use the returned record for rendering.
 * @example normalizeRecord({ kind: "assistant", feed: "main", text: "hi" }) => { feeds: ["main"], fidelity: "exact", … }
 ***/
export function normalizeRecord(entry) {
	if (!entry || typeof entry !== "object") {
		return makeLogRecord({ kind: "system", text: "" });
	}
	return makeLogRecord({
		...entry,
		feeds: Array.isArray(entry.feeds) ? entry.feeds : undefined,
		feed: entry.feed,
	});
}
