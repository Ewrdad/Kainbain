/***
 * MARK: formatPosture
 * @description Formats the Runner's `posture` string — the
 *   `tiers:harness:model` line stored in the execution history and shown
 *   in the UI. Shared verbatim by the Runner (`runner/daemon.js`) and the
 *   backend (`api/flow/runnerPosture.js`) so the wire format cannot drift.
 *
 *   The `:model` segment is appended ONLY when a real, non-blank model is
 *   served. CI / merge / integrate assignments pass `model: null` (see
 *   `servingModelFor`), so their posture is `T0:ci-harness` with NO
 *   trailing segment — never the Runner's default model and never the
 *   literal `"default"`, which used to leak into every CI stage's history.
 *   Consumers must therefore treat the model segment as optional; nothing
 *   parses posture by fixed segment count. Blank/whitespace or non-string
 *   values count as absent, and segments are joined only when present, so
 *   the string is always well-formed (`a:b:c`, `a:b`, `a`, or ``) rather
 *   than containing stray `::`, leading `:`, or `null` text. The
 *   engine-wide `"default"` sentinel (blank stage pick = harness-managed,
 *   no pinned model) also counts as absent — same rule as
 *   `servingModelFor`, the ledger ingest, and `formatModelRef`, so no
 *   caller can ever leak the fake `default` segment into a posture line.
 * @example formatPosture({ tiers: ['T0'], harness: 'pi', model: 'kimi-k3:cloud' }) => 'T0:pi:kimi-k3:cloud'
 * @example formatPosture({ tiers: ['T0', 'T1'], harness: 'pi', model: null }) => 'T0/T1:pi'
 * @example formatPosture({ tiers: ['T0'], harness: 'integration', model: '' }) => 'T0:integration'
 * @example formatPosture({ harness: 'pi', model: 'm' }) => 'pi:m'
 * @example formatPosture({ tiers: ['T0'], harness: 'pi', model: 'default' }) => 'T0:pi'
 * @param {Object} [opts]
 * @param {Array<string>|string} [opts.tiers] - Runner tiers; arrays join with `/`.
 * @param {string} [opts.harness] - Serving harness id (`integration` for merge jobs).
 * @param {string|null} [opts.model] - Served model, or `null` to omit the segment.
 * @returns {string} The posture string, model segment present only when real.
 ***/
export function formatPosture({ tiers, harness, model } = {}) {
	const tierPart = Array.isArray(tiers)
		? tiers.map((t) => String(t ?? "").trim()).filter(Boolean).join("/")
		: String(tiers ?? "").trim();
	const harnessPart = typeof harness === "string" ? harness.trim() : "";
	const trimmedModel = typeof model === "string" ? model.trim() : "";
	const cleanModel =
		trimmedModel && trimmedModel.toLowerCase() !== "default" ? trimmedModel : null;
	return [tierPart, harnessPart, cleanModel].filter(Boolean).join(":");
}
